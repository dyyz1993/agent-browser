import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { getViewerHtml } from './viewer-html.js';
import { getSocketDir, getAppDir } from './daemon.js';
import { openApiSpec } from './openapi.js';
import { getSwaggerUiHtml } from './swagger-ui.js';

const DEFAULT_STREAM_PORT = parseInt(process.env.AGENT_BROWSER_STREAM_PORT || '5005', 10);
const STREAM_SERVER_PID_FILE = 'stream-server.pid';
const STREAM_SERVER_IPC_FILE = 'stream-server.ipc';

export function getStreamPort(): number {
  return parseInt(process.env.AGENT_BROWSER_STREAM_PORT || '5005', 10);
}

interface SessionInfo {
  socketPath: string;
  lastSeen: number;
  instanceId: string;
}

interface StreamMessage {
  type: string;
  session?: string;
  instanceId?: string;
  socketPath?: string;
  data?: string;
  metadata?: {
    offsetTop: number;
    pageScaleFactor: number;
    deviceWidth: number;
    deviceHeight: number;
    scrollOffsetX: number;
    scrollOffsetY: number;
    timestamp?: number;
  };
  format?: 'jpeg' | 'webp';
  fps?: number;
  state?: string;
}

class StreamServerStandalone {
  private wss: WebSocketServer | null = null;
  private httpServer: http.Server | null = null;
  private ipcServer: net.Server | null = null;
  private port: number;
  private sessions: Map<string, SessionInfo> = new Map();
  private clients: Map<string, Set<WebSocket>> = new Map();
  private daemonSockets: Map<string, net.Socket> = new Map();
  private frameBuffers: Map<string, { header: string; data: Buffer }[]> = new Map();
  private instanceIdToSession: Map<string, string> = new Map();
  private latestFrames: Map<string, { header: string; data: Buffer }> = new Map();

  constructor(port: number = DEFAULT_STREAM_PORT) {
    this.port = port;
  }

  private async checkPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      let resolved = false;
      const check = (host: string) => {
        const server = net.createServer();
        server.once('error', () => {
          if (!resolved) {
            resolved = true;
            resolve(false);
          }
        });
        server.once('listening', () => {
          server.close();
        });
        server.listen(port, host);
      };

      check('127.0.0.1');
      check('::1');

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(true);
        }
      }, 100);
    });
  }

  async start(): Promise<void> {
    const portAvailable = await this.checkPortAvailable(this.port);

    if (!portAvailable) {
      console.error(`[StreamServer] Port ${this.port} already in use, exiting`);
      process.exit(1);
    }

    this.writePidFile();

    try {
      await this.startServer();
      await this.startIpcServer();
      this.setupShutdownHandlers();
      console.log(`[StreamServer] Started on port ${this.port} (HTTP + WebSocket)`);
    } catch (error) {
      console.error('[StreamServer] Failed to start:', error);
      this.removePidFile();
      process.exit(1);
    }
  }

  private async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        if (req.url === '/health' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              status: 'ok',
              sessions: Array.from(this.sessions.keys()),
              clients: this.getTotalClientCount(),
            })
          );
          return;
        }

        if (req.url?.startsWith('/view') && req.method === 'GET') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(getViewerHtml());
          return;
        }

        if (req.url === '/sessions' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ sessions: Array.from(this.sessions.keys()) }));
          return;
        }

        // HTTP API: Execute command
        if (req.url === '/api/command' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => (body += chunk));
          req.on('end', async () => {
            try {
              const response = await this.sendCommandToDaemon(body);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(response);
            } catch (err) {
              const error = err instanceof Error ? err.message : String(err);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ id: 'unknown', success: false, error }));
            }
          });
          return;
        }

        // HTTP API: OpenAPI specification
        if (req.url === '/api/openapi.json' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(openApiSpec));
          return;
        }

        // HTTP API: Swagger UI
        if (req.url === '/api/docs' && req.method === 'GET') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(getSwaggerUiHtml());
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      });

      this.wss = new WebSocketServer({
        server: this.httpServer,
        verifyClient: (info: {
          origin: string;
          secure: boolean;
          req: import('http').IncomingMessage;
        }) => {
          const origin = info.origin;
          if (!origin) return true;
          if (origin.startsWith('file://')) return true;
          try {
            const url = new URL(origin);
            const host = url.hostname;
            if (
              host === 'localhost' ||
              host === '127.0.0.1' ||
              host === '::1' ||
              host === '[::1]'
            ) {
              return true;
            }
          } catch {}
          return false;
        },
      });

      this.wss.on('connection', (ws, req) => {
        this.handleWebSocketConnection(ws, req);
      });

      this.wss.on('error', reject);

      this.httpServer.listen(this.port, '0.0.0.0', () => {
        console.log(`[StreamServer] Server listening on port ${this.port} (HTTP API enabled)`);
        resolve();
      });

      this.httpServer.on('error', reject);
    });
  }

  private handleWebSocketConnection(ws: WebSocket, req: http.IncomingMessage): void {
    const url = new URL(req.url || '/', `http://localhost:${this.port}`);
    const sessionParam = url.searchParams.get('session') || 'default';
    const instanceIdParam = url.searchParams.get('instanceId');

    // 优先使用 instanceId 查找 session
    let session: string;
    if (instanceIdParam) {
      const foundSession = this.instanceIdToSession.get(instanceIdParam);
      if (foundSession) {
        session = foundSession;
      } else {
        // instanceId 不存在，返回错误
        console.log(`[StreamServer] Invalid instanceId: ${instanceIdParam}`);
        ws.send(JSON.stringify({ type: 'status', connected: false, error: 'Invalid instanceId' }));
        ws.close();
        return;
      }
    } else {
      session = sessionParam;
    }

    console.log(`[StreamServer] WebSocket client connected for session: ${session}`);

    if (!this.clients.has(session)) {
      this.clients.set(session, new Set());
    }
    const wasEmpty = this.clients.get(session)!.size === 0;
    this.clients.get(session)!.add(ws);

    this.sendStatus(ws, session);

    // 如果有最新帧，立即发送给新客户端
    const latestFrame = this.latestFrames.get(session);
    if (latestFrame) {
      ws.send(latestFrame.header);
      ws.send(latestFrame.data);
    }

    // 如果这是该 session 的第一个客户端，通知 daemon 启动 screencast
    if (wasEmpty && this.daemonSockets.has(session)) {
      this.daemonSockets
        .get(session)
        ?.write(JSON.stringify({ type: 'client_connected', session }) + '\n');
    }

    if (this.sessions.has(session) && !this.daemonSockets.has(session)) {
      this.connectToDaemon(session);
    }

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as StreamMessage;
        this.handleClientMessage(session, message);
      } catch (error) {
        console.error('[StreamServer] Failed to parse client message:', error);
      }
    });

    ws.on('close', () => {
      console.log(`[StreamServer] WebSocket client disconnected for session: ${session}`);
      this.clients.get(session)?.delete(ws);
      if (this.clients.get(session)?.size === 0) {
        this.clients.delete(session);
        // 如果该 session 没有客户端了，通知 daemon 停止 screencast
        if (this.daemonSockets.has(session)) {
          this.daemonSockets
            .get(session)
            ?.write(JSON.stringify({ type: 'client_disconnected', session }) + '\n');
        }
      }
    });

    ws.on('error', (error) => {
      console.error(`[StreamServer] WebSocket error for session ${session}:`, error);
      this.clients.get(session)?.delete(ws);
    });
  }

  private handleClientMessage(session: string, message: StreamMessage): void {
    const daemonSocket = this.daemonSockets.get(session);
    if (!daemonSocket) {
      return;
    }

    const forwardableTypes = [
      'input_mouse',
      'input_keyboard',
      'input_touch',
      'input_text',
      'user_activity',
      'keyboard_down',
      'keyboard_up',
      'keyboard_insert_text',
    ];

    if (forwardableTypes.includes(message.type)) {
      try {
        daemonSocket.write(JSON.stringify(message) + '\n');
      } catch (error) {
        console.error(
          `[StreamServer] Failed to send message to daemon for session ${session}:`,
          error
        );
      }
    }
  }

  private async startIpcServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ipcPath = this.getIpcPath();

      if (fs.existsSync(ipcPath)) {
        try {
          fs.unlinkSync(ipcPath);
        } catch {}
      }

      this.ipcServer = net.createServer((socket) => {
        this.handleIpcConnection(socket);
      });

      this.ipcServer.on('error', reject);

      this.ipcServer.listen(ipcPath, () => {
        console.log(`[StreamServer] IPC server listening on ${ipcPath}`);
        resolve();
      });
    });
  }

  private handleIpcConnection(socket: net.Socket): void {
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();

      while (buffer.includes('\n')) {
        const newlineIdx = buffer.indexOf('\n');
        const line = buffer.substring(0, newlineIdx);
        buffer = buffer.substring(newlineIdx + 1);

        if (!line.trim()) continue;

        try {
          const message = JSON.parse(line) as StreamMessage;
          this.handleIpcMessage(socket, message);
        } catch (error) {
          console.error('[StreamServer] Failed to parse IPC message:', error);
        }
      }
    });

    socket.on('error', (error) => {
      console.error('[StreamServer] IPC connection error:', error);
    });

    socket.on('close', () => {
      for (const [session, s] of this.daemonSockets) {
        if (s === socket) {
          console.log(`[StreamServer] Daemon disconnected for session: ${session}`);
          this.daemonSockets.delete(session);
          this.sessions.delete(session);
          this.broadcastStatus(session, false);
          break;
        }
      }
    });
  }

  private handleIpcMessage(socket: net.Socket, message: StreamMessage): void {
    switch (message.type) {
      case 'register':
        if (message.session && message.socketPath && message.instanceId) {
          console.log(
            `[StreamServer] Session registered: ${message.session}, instanceId: ${message.instanceId}`
          );
          this.sessions.set(message.session, {
            socketPath: message.socketPath,
            lastSeen: Date.now(),
            instanceId: message.instanceId,
          });
          this.instanceIdToSession.set(message.instanceId, message.session);
          this.daemonSockets.set(message.session, socket);
          this.broadcastStatus(message.session, true);
        }
        break;

      case 'unregister':
        if (message.session) {
          console.log(`[StreamServer] Session unregistered: ${message.session}`);
          const sessionInfo = this.sessions.get(message.session);
          if (sessionInfo) {
            this.instanceIdToSession.delete(sessionInfo.instanceId);
          }
          this.sessions.delete(message.session);
          this.daemonSockets.delete(message.session);
          this.frameBuffers.delete(message.session);
          this.latestFrames.delete(message.session);
          const clients = this.clients.get(message.session);
          if (clients) {
            for (const client of clients) {
              client.close();
            }
            this.clients.delete(message.session);
          }
          this.broadcastStatus(message.session, false);
        }
        break;

      case 'frame':
        if (message.session) {
          this.sessions.get(message.session)!.lastSeen = Date.now();
          this.broadcastFrame(message);
        }
        break;
    }
  }

  private connectToDaemon(session: string): void {
    const sessionInfo = this.sessions.get(session);
    if (!sessionInfo) return;

    const socketPath = sessionInfo.socketPath;

    const socket = net.createConnection({ path: socketPath }, () => {
      console.log(`[StreamServer] Connected to daemon for session: ${session}`);
      this.daemonSockets.set(session, socket);
    });

    socket.on('error', (error) => {
      console.error(`[StreamServer] Failed to connect to daemon for session ${session}:`, error);
    });

    socket.on('close', () => {
      this.daemonSockets.delete(session);
    });
  }

  private broadcastFrame(message: StreamMessage): void {
    const session = message.session!;
    const clients = this.clients.get(session);

    if (!clients || clients.size === 0) return;

    const headerMessage = {
      type: 'frame',
      metadata: message.metadata,
      format: message.format,
      fps: message.fps,
      state: message.state,
    };

    // 保存最新帧
    if (message.data) {
      this.latestFrames.set(session, {
        header: JSON.stringify(headerMessage),
        data: Buffer.from(message.data, 'base64'),
      });
    }

    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(headerMessage));
        if (message.data) {
          client.send(Buffer.from(message.data, 'base64'));
        }
      }
    }
  }

  private broadcastStatus(session: string, connected: boolean): void {
    const clients = this.clients.get(session);
    if (!clients) return;

    const message = {
      type: 'status',
      connected,
      screencasting: connected,
    };

    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    }
  }

  private sendStatus(ws: WebSocket, session: string): void {
    const connected = this.sessions.has(session);
    const message = {
      type: 'status',
      connected,
      screencasting: connected,
      session,
    };

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private getTotalClientCount(): number {
    let total = 0;
    for (const clients of this.clients.values()) {
      total += clients.size;
    }
    return total;
  }

  /**
   * Send a command to the daemon via Unix socket and return the response
   */
  private async sendCommandToDaemon(commandJson: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Get the daemon socket path from the first available session
      // or use the default socket path
      let socketPath: string | undefined;

      // Try to find an active session's socket path
      for (const [session, info] of this.sessions) {
        socketPath = info.socketPath;
        break;
      }

      if (!socketPath) {
        // Fallback to default socket path
        socketPath = path.join(getSocketDir(), 'default.sock');
      }

      const socket = net.createConnection({ path: socketPath }, () => {
        socket.write(commandJson + '\n');
      });

      let response = '';
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          reject(new Error('Command timeout'));
        }
      }, 30000); // 30 second timeout

      socket.on('data', (data) => {
        response += data.toString();
        // Check if we have a complete JSON response
        try {
          JSON.parse(response);
          // If we can parse it, we have the complete response
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve(response);
            socket.end();
          }
        } catch {
          // Not complete yet, keep reading
        }
      });

      socket.on('end', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(response);
        }
      });

      socket.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(err);
        }
      });
    });
  }

  private getPidFile(): string {
    return path.join(getSocketDir(), STREAM_SERVER_PID_FILE);
  }

  private getIpcPath(): string {
    return path.join(getSocketDir(), STREAM_SERVER_IPC_FILE);
  }

  private writePidFile(): void {
    const pidFile = this.getPidFile();
    fs.writeFileSync(pidFile, process.pid.toString());
  }

  private removePidFile(): void {
    const pidFile = this.getPidFile();
    try {
      if (fs.existsSync(pidFile)) {
        fs.unlinkSync(pidFile);
      }
    } catch {}
  }

  private removeIpcFile(): void {
    const ipcPath = this.getIpcPath();
    try {
      if (fs.existsSync(ipcPath)) {
        fs.unlinkSync(ipcPath);
      }
    } catch {}
  }

  private setupShutdownHandlers(): void {
    const shutdown = () => {
      console.log('[StreamServer] Shutting down...');

      for (const clients of this.clients.values()) {
        for (const client of clients) {
          client.close();
        }
      }
      this.clients.clear();

      if (this.wss) {
        this.wss.close();
      }

      if (this.httpServer) {
        this.httpServer.close();
      }

      if (this.ipcServer) {
        this.ipcServer.close();
      }

      for (const socket of this.daemonSockets.values()) {
        socket.destroy();
      }
      this.daemonSockets.clear();

      this.removePidFile();
      this.removeIpcFile();

      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('SIGHUP', shutdown);
  }

  async stop(): Promise<void> {
    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss!.close(() => resolve());
      });
    }

    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
    }

    if (this.ipcServer) {
      await new Promise<void>((resolve) => {
        this.ipcServer!.close(() => resolve());
      });
    }

    this.removePidFile();
    this.removeIpcFile();
  }
}

export function getStreamServerPidFile(): string {
  return path.join(getSocketDir(), STREAM_SERVER_PID_FILE);
}

export function getStreamServerIpcPath(): string {
  return path.join(getSocketDir(), STREAM_SERVER_IPC_FILE);
}

export { StreamServerStandalone };

if (
  process.argv[1]?.endsWith('stream-server-standalone.js') ||
  process.env.AGENT_BROWSER_STREAM_SERVER === '1'
) {
  const server = new StreamServerStandalone();
  server.start().catch((err) => {
    console.error('[StreamServer] Failed to start:', err);
    process.exit(1);
  });
}
