import * as net from 'net';
import * as fs from 'fs';
const LOG_FILE = '/tmp/standalone-diag.log';
const DEBUG_ENABLED = !!process.env.AGENT_BROWSER_DEBUG;
function logDiag(msg: string) {
  if (!DEBUG_ENABLED) return;
  fs.appendFileSync(LOG_FILE, new Date().toISOString().substring(11, 23) + ' ' + msg + '\n');
}
import * as path from 'path';
import * as http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import sharp from 'sharp';
import { getViewerHtml } from './viewer-html.js';
import { isAllowedOrigin, cropFrameForElement } from './stream/index.js';
import type { ClientState } from './stream/index.js';
import { getSocketDir } from './daemon.js';
import { openApiSpec } from './openapi.js';
import { getSwaggerUiHtml } from './swagger-ui.js';
import { getVersion } from './version.js';
import { BrowserManager } from './browser/index.js';

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
  currentUrl?: string;
  currentTitle?: string;
  viewportWidth?: number;
  viewportHeight?: number;
}

interface StreamMessage {
  type: string;
  session?: string;
  instanceId?: string;
  socketPath?: string;
  data?: string;
  selector?: string;
  elementBox?: { x: number; y: number; width: number; height: number };
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
  x?: number;
  y?: number;
  focused?: boolean;
  tag?: string;
  text?: string;
  url?: string;
  title?: string;
  rect?: { x: number; y: number; width: number; height: number };
  viewId?: string;
  views?: Array<{ id: string; label: string; rect: { x: number; y: number; width: number; height: number } }>;
}

class StreamServerStandalone {
  private wss: WebSocketServer | null = null;
  private httpServer: http.Server | null = null;
  private ipcServer: net.Server | null = null;
  private port: number;
  private sessions: Map<string, SessionInfo> = new Map();
  private clients: Map<string, Set<WebSocket>> = new Map();
  private daemonSockets: Map<string, net.Socket> = new Map();
  private outboundSockets: Map<string, net.Socket> = new Map();
  private frameBuffers: Map<string, { header: string; data: Buffer }[]> = new Map();
  private instanceIdToSession: Map<string, string> = new Map();
  private latestFrames: Map<string, { header: string; data: Buffer }> = new Map();
  private clientStates: Map<WebSocket, ClientState> = new Map();
  private lastViewsPerSession: Map<string, unknown[]> = new Map();
  browser?: BrowserManager;

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
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.end(getViewerHtml());
          return;
        }

        if (req.url === '/sessions' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ sessions: Array.from(this.sessions.keys()) }));
          return;
        }

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

        if (req.url?.startsWith('/api/') && req.method === 'GET') {
          (async () => {
            const parsed = new URL(req.url!, `http://${req.headers.host}`);

            const cdp = parsed.searchParams.get('cdp');
            const session = parsed.searchParams.get('session') || undefined;

            if (cdp) {
              const cdpPort = parseInt(cdp);
              if (isNaN(cdpPort)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Invalid cdp port' }));
                return;
              }
              const launchCmd = JSON.stringify({
                id: `cdp-connect-${Date.now()}`,
                action: 'launch',
                cdpPort,
                ...(session ? { session } : {}),
              });
              try {
                await this.sendCommandToDaemon(launchCmd);
              } catch (err) {
                const error = err instanceof Error ? err.message : String(err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(
                  JSON.stringify({ success: false, error: `CDP connection failed: ${error}` })
                );
                return;
              }
            }

            const pathMatch = parsed.pathname.match(/^\/api\/([^/]+)\/([^/?]+)$/);
            if (pathMatch) {
              const pluginName = pathMatch[1];
              const commandName = pathMatch[2];
              const url = parsed.searchParams.get('url') || parsed.searchParams.get('q') || '';
              const limit = parsed.searchParams.get('limit') || '';
              const prompt = parsed.searchParams.get('prompt') || '';

              if (!url && !commandName.match(/^(list|search|login)$/)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Missing ?url= parameter' }));
                return;
              }

              const args = url ? [url] : [];
              const flags: Record<string, string> = {};
              if (limit) flags.limit = limit;
              if (prompt) flags.prompt = prompt;

              const cmd = JSON.stringify({
                id: `get-${Date.now()}`,
                action: 'plugin_run',
                pluginName,
                commandName,
                args,
                flags,
                ...(session ? { session } : {}),
              });

              try {
                const response = await this.sendCommandToDaemon(cmd);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(response);
              } catch (err) {
                const error = err instanceof Error ? err.message : String(err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ id: 'unknown', success: false, error }));
              }
              return;
            }

            if (parsed.pathname === '/api/scrape') {
              const targetUrl = parsed.searchParams.get('url');
              if (!targetUrl) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Missing ?url= parameter' }));
                return;
              }
              const selector = parsed.searchParams.get('selector') || '';
              const navCmd = JSON.stringify({
                id: `scrape-${Date.now()}`,
                action: 'navigate',
                url: targetUrl,
                ...(session ? { session } : {}),
              });
              try {
                const navResult = await this.sendCommandToDaemon(navCmd);
                const navData = JSON.parse(navResult);

                if (selector) {
                  const evalCmd = JSON.stringify({
                    id: `scrape-e-${Date.now()}`,
                    action: 'evaluate',
                    script: `JSON.stringify(Array.from(document.querySelectorAll('${selector}')).map(el => el.innerText))`,
                    ...(session ? { session } : {}),
                  });
                  const result = await this.sendCommandToDaemon(evalCmd);
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(result);
                } else {
                  const evalCmd = JSON.stringify({
                    id: `scrape-e-${Date.now()}`,
                    action: 'evaluate',
                    script: 'document.body.innerText',
                    ...(session ? { session } : {}),
                  });
                  const result = await this.sendCommandToDaemon(evalCmd);
                  const evalData = JSON.parse(result);
                  const out: Record<string, unknown> = {
                    url: navData.data?.url,
                    title: navData.data?.title,
                    content: evalData.data?.result || '',
                  };
                  if (navData.data?.ssr) {
                    out.ssr_hint = {
                      framework: navData.data.ssr.framework,
                      globals: navData.data.ssr.globals,
                    };
                  }
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ id: evalData.id, success: true, data: out }));
                }
              } catch (err) {
                const error = err instanceof Error ? err.message : String(err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ id: 'unknown', success: false, error }));
              }
              return;
            }

            if (parsed.pathname === '/api/evaluate') {
              const script = parsed.searchParams.get('script');
              if (!script) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Missing ?script= parameter' }));
                return;
              }
              const cmd = JSON.stringify({
                id: `eval-${Date.now()}`,
                action: 'evaluate',
                script,
                ...(session ? { session } : {}),
              });
              try {
                const response = await this.sendCommandToDaemon(cmd);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(response);
              } catch (err) {
                const error = err instanceof Error ? err.message : String(err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ id: 'unknown', success: false, error }));
              }
              return;
            }
          })().catch(() => {});
          return;
        }

        if (req.url === '/api/openapi.json' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(openApiSpec));
          return;
        }

        if (req.url === '/api/docs' && req.method === 'GET') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(getSwaggerUiHtml());
          return;
        }

        if (req.url === '/api/help' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              title: 'agent-browser HTTP API',
              version: getVersion(),
              endpoints: {
                'POST /api/command': {
                  description: 'Execute a browser command',
                  example: { id: '1', action: 'navigate', url: 'https://example.com' },
                },
                'GET /api/help': { description: 'Show this help message' },
                'GET /api/openapi.json': { description: 'OpenAPI 3.0 specification' },
                'GET /api/docs': { description: 'Swagger UI documentation' },
                'GET /health': { description: 'Health check' },
                'GET /sessions': { description: 'List active sessions' },
              },
              availableActions: [
                { action: 'launch', description: 'Launch browser', required: [] },
                { action: 'navigate', description: 'Navigate to URL', required: ['url'] },
                { action: 'click', description: 'Click element', required: ['selector'] },
                { action: 'fill', description: 'Fill form field', required: ['selector', 'value'] },
                { action: 'type', description: 'Type text', required: ['selector', 'text'] },
                { action: 'snapshot', description: 'Get page snapshot', required: [] },
                { action: 'screenshot', description: 'Take screenshot', required: [] },
                { action: 'evaluate', description: 'Execute JavaScript', required: ['script'] },
                { action: 'wait', description: 'Wait for element/condition', required: [] },
                { action: 'scroll', description: 'Scroll page', required: [] },
                { action: 'hover', description: 'Hover element', required: ['selector'] },
                { action: 'press', description: 'Press key', required: ['key'] },
                {
                  action: 'select',
                  description: 'Select dropdown option',
                  required: ['selector', 'values'],
                },
                { action: 'back', description: 'Go back', required: [] },
                { action: 'forward', description: 'Go forward', required: [] },
                { action: 'reload', description: 'Reload page', required: [] },
                { action: 'close', description: 'Close browser', required: [] },
                { action: 'url', description: 'Get current URL', required: [] },
                { action: 'title', description: 'Get page title', required: [] },
                { action: 'cookies_get', description: 'Get cookies', required: [] },
                { action: 'cookies_set', description: 'Set cookie', required: ['cookies'] },
                { action: 'state_save', description: 'Save browser state', required: ['path'] },
                { action: 'state_load', description: 'Load browser state', required: ['path'] },
              ],
              docs: 'See http://localhost:5005/api/docs for interactive documentation',
            })
          );
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
          return isAllowedOrigin(info.origin);
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
    const rawSelector = url.searchParams.get('selector');

    const clientState: ClientState = {};
    if (rawSelector) {
      clientState.selector = decodeURIComponent(rawSelector);
    }

    let session: string;
    if (instanceIdParam) {
      const foundSession = this.instanceIdToSession.get(instanceIdParam);
      if (foundSession) {
        session = foundSession;
      } else {
        session = sessionParam;
      }
    } else {
      session = sessionParam;
    }

    if (!this.clients.has(session)) {
      this.clients.set(session, new Set());
    }
    const clientSet = this.clients.get(session);
    if (!clientSet) return;
    const wasEmpty = clientSet.size === 0;
    clientSet.add(ws);
    this.clientStates.set(ws, clientState);

    if (clientState.selector) {
      this.requestElementBox(session, clientState.selector);

      clientState.elementCheckTimer = setInterval(() => {
        if (!clientState.selector) return;
        this.requestElementBox(session, clientState.selector);
      }, 2500);
    }

    this.sendStatus(ws, session, clientState);

    const latestFrame = this.latestFrames.get(session);
    if (latestFrame) {
      this.sendCroppedFrame(ws, latestFrame, clientState);
    }

    const cachedViews = this.lastViewsPerSession.get(session);
    if (cachedViews && cachedViews.length > 0) {
      try {
        ws.send(JSON.stringify({ type: 'views_update', views: cachedViews }));
      } catch {}
    }

    logDiag(
      '[WSCONN] viewer session=' +
        session +
        ' instanceId=' +
        instanceIdParam +
        ' sessions.has=' +
        this.sessions.has(session) +
        ' daemonSockets.has=' +
        this.daemonSockets.has(session) +
        ' clients before=' +
        wasEmpty
    );

    if (wasEmpty && this.daemonSockets.has(session)) {
      this.daemonSockets
        .get(session)
        ?.write(JSON.stringify({ type: 'client_connected', session }) + '\n');
    }

    if (this.sessions.has(session)) {
      this.connectToDaemon(session);
    }

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as StreamMessage;
        if (message.type === 'status') {
          this.sendStatus(ws, session, clientState);
          if (clientState.selector) {
            this.requestElementBox(session, clientState.selector);
          }
        } else {
          this.handleClientMessage(ws, session, message);
        }
      } catch (error) {
        console.error('[StreamServer] Failed to parse client message:', error);
      }
    });

    ws.on('close', () => {
      if (clientState.elementCheckTimer) {
        clearInterval(clientState.elementCheckTimer);
        clientState.elementCheckTimer = undefined;
      }
      this.clients.get(session)?.delete(ws);
      this.clientStates.delete(ws);
      if (this.clients.get(session)?.size === 0) {
        this.clients.delete(session);
        if (this.daemonSockets.has(session)) {
          this.daemonSockets
            .get(session)
            ?.write(JSON.stringify({ type: 'client_disconnected', session }) + '\n');
        }
      }
    });

    ws.on('error', (_error) => {
      if (clientState.elementCheckTimer) {
        clearInterval(clientState.elementCheckTimer);
        clientState.elementCheckTimer = undefined;
      }
      this.clients.get(session)?.delete(ws);
      this.clientStates.delete(ws);
    });
  }

  private handleClientMessage(
    ws: WebSocket,
    session: string,
    message: StreamMessage
  ): void {
    const msgType = message.type;

    if (msgType === 'select_view') {
      const clientState = this.clientStates.get(ws);
      if (clientState) {
        if (message.rect) {
          clientState.viewId = message.viewId as string | undefined;
          clientState.viewRect = message.rect as { x: number; y: number; width: number; height: number };
          clientState.selector = undefined;
          clientState.elementBox = undefined;
          clientState.degraded = false;
        } else {
          clientState.viewId = undefined;
          clientState.viewRect = undefined;
        }
        if (ws.readyState === WebSocket.OPEN) {
          this.sendStatus(ws, session, clientState);
        }
        const latestFrame = this.latestFrames.get(session);
        if (latestFrame) {
          this.sendCroppedFrame(ws, latestFrame, clientState);
        }
      }
      return;
    }

    if (msgType === 'input_fill') {
      logDiag(
        '[CM] input_fill SESSION=' +
          session +
          ' socket_exists=' +
          !!this.daemonSockets.get(session) +
          ' text=' +
          (message.text || '')
      );
    }

    const daemonSocket = this.daemonSockets.get(session);
    if (!daemonSocket) {
      logDiag('[CM] NO DAEMON SOCKET for session=' + session);
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
      'input_focused',
      'input_value',
      'input_blur',
      'input_fill',
      'input_blur_element',
    ];

    if (forwardableTypes.includes(message.type)) {
      try {
        daemonSocket.write(JSON.stringify(message) + '\n');
        if (msgType === 'input_fill') {
          logDiag('[CM] input_fill WRITTEN TO SOCKET');
        }
      } catch (error) {
        console.error(
          `[StreamServer] Failed to send message to daemon for session ${session}:`,
          error
        );
      }
    }
  }

  private requestElementBox(session: string, selector: string): void {
    if (!this.daemonSockets.has(session)) {
      console.log(`[StreamServer] requestElementBox: no daemon socket for session ${session}`);
      return;
    }
    const daemonSocket = this.daemonSockets.get(session);
    if (daemonSocket) {
      console.log(`[StreamServer] requestElementBox: session=${session} selector=${selector}`);
      daemonSocket.write(
        JSON.stringify({
          type: 'request_element_box',
          session,
          selector,
        }) + '\n'
      );
    }
  }

  private async sendCroppedFrame(
    ws: WebSocket,
    frame: { header: string; data: Buffer },
    clientState: ClientState
  ): Promise<void> {
    const cropBox = clientState.viewRect || (clientState.selector ? clientState.elementBox : undefined);

    if (cropBox && ws.readyState === WebSocket.OPEN) {
      try {
        const header = JSON.parse(frame.header);
        const meta = header.metadata;

        const buf = await cropFrameForElement(frame.data, cropBox, meta);

        if (ws.readyState !== WebSocket.OPEN) return;

        if (buf === frame.data) {
          ws.send(frame.header);
          ws.send(frame.data);
          return;
        }

        const croppedHeader = {
          ...header,
          metadata: {
            ...header.metadata,
            deviceWidth: cropBox.width,
            deviceHeight: cropBox.height,
            element: {
              selector: clientState.selector || clientState.viewId || 'view',
              x: cropBox.x,
              y: cropBox.y,
              width: cropBox.width,
              height: cropBox.height,
            },
          },
        };
        ws.send(JSON.stringify(croppedHeader));
        ws.send(buf);
      } catch {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(frame.header);
        ws.send(frame.data);
      }
    } else {
      ws.send(frame.header);
      ws.send(frame.data);
    }
  }

  private async startIpcServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ipcPath = this.getIpcPath();

      if (fs.existsSync(ipcPath)) {
        try {
          fs.unlinkSync(ipcPath);
        } catch {
          /* empty */
        }
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
          this.broadcastStatus(session, false);
          break;
        }
      }
    });
  }

  private async handleIpcMessage(socket: net.Socket, message: StreamMessage): Promise<void> {
    switch (message.type) {
      case 'register':
        if (message.session && message.socketPath && message.instanceId) {
          logDiag('[REGISTER] session=' + message.session + ' instanceId=' + message.instanceId);
          this.sessions.set(message.session, {
            socketPath: message.socketPath,
            lastSeen: Date.now(),
            instanceId: message.instanceId,
            currentUrl: typeof message.url === 'string' ? message.url : undefined,
            currentTitle: typeof message.title === 'string' ? message.title : undefined,
          });
          this.instanceIdToSession.set(message.instanceId, message.session);
          this.daemonSockets.set(message.session, socket);
          this.broadcastStatus(message.session, true);

          const existingClients = this.clients.get(message.session);
          if (existingClients && existingClients.size > 0) {
            logDiag('[LATE-JOIN] daemon registered with ' + existingClients.size + ' existing viewers, sending client_connected');
            socket.write(JSON.stringify({ type: 'client_connected', session: message.session }) + '\n');
          }
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
          const sess = this.sessions.get(message.session);
          if (sess) sess.lastSeen = Date.now();
          await this.broadcastFrame(message);
        }
        break;

      case 'selector_element':
        if (message.session && message.selector) {
          console.log(
            `[StreamServer] Received selector_element: session=${message.session} selector=${
              message.selector
            } box=${message.elementBox ? JSON.stringify(message.elementBox) : 'null'}`
          );
          const clients = this.clients.get(message.session);
          if (clients) {
            for (const client of clients) {
              const state = this.clientStates.get(client);
              if (state?.selector === message.selector) {
                if (message.elementBox) {
                  state.elementBox = message.elementBox;
                  state.degraded = false;
                  const latestFrameForElem = this.latestFrames.get(message.session);
                  if (latestFrameForElem) {
                    this.sendCroppedFrame(client, latestFrameForElem, state);
                  }
                } else if (!state.degraded) {
                  state.elementBox = undefined;
                  state.degraded = true;
                }
                this.sendStatus(client, message.session, state);
              } else {
                console.log(
                  `[StreamServer] selector_element mismatch: state.selector="${state?.selector}" vs message.selector="${message.selector}"`
                );
              }
            }
          }
        }
        break;

      case 'input_focused':
      case 'input_value':
      case 'input_blur':
      case 'views_update':
        logDiag('[IPC] ' + String(message.type) + ' clients=' + this.clients.size);
        if (message.type === 'views_update' && message.session) {
          this.lastViewsPerSession.set(message.session, (message as { views: unknown[] }).views || []);
        }
        for (const [, clients] of this.clients) {
          for (const client of clients) {
            if (client.readyState === WebSocket.OPEN) {
              try {
                client.send(JSON.stringify(message));
              } catch {
                /* empty */
              }
            }
          }
        }
        break;

      case 'navigation':
        if (message.session) {
          const sess = this.sessions.get(message.session);
          const navData = typeof message.data === 'string' ? JSON.parse(message.data) : (message.data || message);
          if (sess) {
            sess.lastSeen = Date.now();
            if (navData.url) sess.currentUrl = navData.url;
            if (navData.title) sess.currentTitle = navData.title;
          }
          const navClients = this.clients.get(message.session);
          if (navClients) {
            const payload = JSON.stringify({ type: 'navigation', data: navData });
            for (const client of navClients) {
              if (client.readyState === WebSocket.OPEN) {
                try {
                  client.send(payload);
                } catch {
                  /* empty */
                }
              }
            }
          }
        }
        break;
    }
  }

  private connectToDaemon(session: string): void {
    if (this.outboundSockets.has(session)) return;

    const sessionInfo = this.sessions.get(session);
    if (!sessionInfo) return;

    const socketPath = sessionInfo.socketPath;

    const socket = net.createConnection({ path: socketPath }, async () => {
      console.log(`[StreamServer] Connected to daemon for session: ${session}`);

      const sessionClients = this.clients.get(session);
      if (sessionClients) {
        for (const client of sessionClients) {
          const state = this.clientStates.get(client);
          if (state?.selector) {
            this.requestElementBox(session, state.selector);
          }
        }
      }
    });
    socket.on('error', (error) => {
      console.error(`[StreamServer] Failed to connect to daemon for session ${session}:`, error);
      this.outboundSockets.delete(session);
    });

    socket.on('close', () => {
      logDiag('[CTD] socket close session=' + session);
      this.outboundSockets.delete(session);
    });

    this.outboundSockets.set(session, socket);

    logDiag('[CTD] sending inject_focus_listener to daemon for session=' + session);
    try {
      socket.write(
        JSON.stringify({ id: 'inject-fl-' + Date.now(), action: 'inject_focus_listener' }) + '\n'
      );
    } catch (e) {
      console.error('[StreamServer] Failed to send inject_focus_listener:', e);
    }

    socket.on('data', (data: Buffer) => {
      const raw = data.toString();
      logDiag(
        '[CTD DATA] session=' +
          session +
          ' rawLen=' +
          raw.length +
          ' firstLine=' +
          raw.substring(0, 100).replace(/\n/g, '|')
      );
      const lines = raw.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);

          if (msg.id && String(msg.id).startsWith('inject-fl-')) {
            if (msg.success === false) {
              const errMsg = msg.error || 'unknown error';
              logDiag('[CTD] inject_focus_listener failed: ' + errMsg + ' — retrying in 2s');
              setTimeout(() => {
                try {
                  socket.write(
                    JSON.stringify({
                      id: 'inject-fl-retry-' + Date.now(),
                      action: 'inject_focus_listener',
                    }) + '\n'
                  );
                } catch {
                  /* empty */
                }
              }, 2000);
            }
            continue;
          }

          if (
            msg.type === 'input_focused' ||
            msg.type === 'input_value' ||
            msg.type === 'input_blur'
          ) {
            const clients = this.clients.get(session);
            logDiag(
              '[CTD DATA] broadcasting ' +
                msg.type +
                ' to ' +
                (clients?.size || 0) +
                ' viewer clients'
            );
            if (clients) {
              for (const client of clients) {
                if (client.readyState === WebSocket.OPEN) {
                  try {
                    client.send(JSON.stringify(msg));
                  } catch {
                    /* empty */
                  }
                }
              }
            }
          }
        } catch {
          // Ignore parse errors (might be partial data or non-JSON responses)
        }
      }
    });
  }

  private frameScale = 0.5;
  private frameQuality = 60;

  private async compressFrame(
    frameData: Buffer,
    metadata: Record<string, unknown> | undefined
  ): Promise<Buffer> {
    const dw = metadata?.deviceWidth as number | undefined;
    const dh = metadata?.deviceHeight as number | undefined;
    if (!dw || !dh) return frameData;

    const targetW = Math.round(dw * this.frameScale);
    const targetH = Math.round(dh * this.frameScale);

    try {
      return await sharp(frameData)
        .resize(targetW, targetH)
        .jpeg({ quality: this.frameQuality })
        .toBuffer();
    } catch {
      return frameData;
    }
  }

  private async broadcastFrame(message: StreamMessage): Promise<void> {
    const session = message.session;
    if (!session) return;
    const clients = this.clients.get(session);

    if (!clients || clients.size === 0) return;

    let frameData: Buffer | null = message.data ? Buffer.from(message.data, 'base64') : null;

    if (frameData) {
      const compressed = await this.compressFrame(
        frameData,
        message.metadata as Record<string, unknown> | undefined
      );
      frameData = compressed as Buffer;
    }

    for (const client of clients) {
      if (client.readyState !== WebSocket.OPEN) continue;

      const clientState = this.clientStates.get(client);
      let metadata: Record<string, unknown> | undefined = message.metadata as
        | Record<string, unknown>
        | undefined;
      let dataToSend: Buffer | null = frameData;

      const cropBox = clientState?.viewRect || (clientState?.selector ? clientState.elementBox : undefined);
      const hasFrame = !!frameData;

      if (cropBox && hasFrame) {
        try {
          const cropped = await cropFrameForElement(frameData!, cropBox, message.metadata);

          if (cropped !== frameData) {
            dataToSend = cropped;
            if (metadata) {
              metadata = {
                ...metadata,
                deviceWidth: cropBox.width,
                deviceHeight: cropBox.height,
                element: {
                  selector: clientState?.selector || clientState?.viewId || 'view',
                  x: cropBox.x,
                  y: cropBox.y,
                  width: cropBox.width,
                  height: cropBox.height,
                },
              };
            }
          }
        } catch {
          dataToSend = frameData;
        }
      }

      const headerMessage = {
        type: 'frame',
        metadata,
        format: message.format,
        fps: message.fps,
        state: message.state,
      };

      client.send(JSON.stringify(headerMessage));
      if (dataToSend) {
        client.send(dataToSend);
      }
    }

    if (frameData) {
      this.latestFrames.set(session, {
        header: JSON.stringify({
          type: 'frame',
          metadata: message.metadata,
          format: message.format,
          fps: message.fps,
          state: message.state,
        }),
        data: frameData,
      });
    }

    if (frameData) {
      const sess = this.sessions.get(session);
      if (sess && message.metadata) {
        const mw = message.metadata.deviceWidth as number | undefined;
        const mh = message.metadata.deviceHeight as number | undefined;
        if (mw && mh) {
          sess.viewportWidth = mw;
          sess.viewportHeight = mh;
        }
      }
    }
  }

  private broadcastStatus(session: string, connected: boolean): void {
    const clients = this.clients.get(session);
    if (!clients) return;

    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        const state = this.clientStates.get(client);
        const msg: Record<string, unknown> = {
          type: 'status',
          connected,
          screencasting: connected,
          session,
          version: getVersion(),
        };
        if (state?.selector && state.elementBox) {
          msg.element = {
            selector: state.selector,
            x: state.elementBox.x,
            y: state.elementBox.y,
            width: state.elementBox.width,
            height: state.elementBox.height,
          };
          msg.viewportWidth = state.elementBox.width;
          msg.viewportHeight = state.elementBox.height;
        }
        if (state?.degraded) {
          msg.degraded = true;
        }
        client.send(JSON.stringify(msg));
      }
    }
  }

  private sendStatus(ws: WebSocket, session: string, clientState?: ClientState): void {
    const connected = this.sessions.has(session);
    const sessionInfo = this.sessions.get(session);
    const message: Record<string, unknown> = {
      type: 'status',
      connected,
      screencasting: connected,
      session,
      version: getVersion(),
    };

    if (sessionInfo?.currentUrl) {
      message.url = sessionInfo.currentUrl;
    }
    if (sessionInfo?.currentTitle) {
      message.title = sessionInfo.currentTitle;
    }

    const cropBox = clientState?.viewRect || (clientState?.selector ? clientState.elementBox : undefined);
    if (cropBox) {
      message.element = {
        selector: clientState?.selector || clientState?.viewId || 'view',
        x: cropBox.x,
        y: cropBox.y,
        width: cropBox.width,
        height: cropBox.height,
      };
      message.viewportWidth = cropBox.width;
      message.viewportHeight = cropBox.height;
    } else if (sessionInfo?.viewportWidth && sessionInfo?.viewportHeight) {
      message.viewportWidth = sessionInfo.viewportWidth;
      message.viewportHeight = sessionInfo.viewportHeight;
    }

    if (clientState?.degraded) {
      message.degraded = true;
    }

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

  private async sendCommandToDaemon(commandJson: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let targetSession: string | undefined;
      let requestedTimeout: number | undefined;
      try {
        const parsed = JSON.parse(commandJson);
        targetSession = parsed.session;
        if (typeof parsed.timeout === 'number' && parsed.timeout > 0) {
          requestedTimeout = Math.min(parsed.timeout, 600000); // cap at 10 minutes
        }
      } catch {
        /* ignored */
      }

      let socketPath: string | undefined;

      if (targetSession && this.sessions.has(targetSession)) {
        socketPath = this.sessions.get(targetSession)!.socketPath;
      } else if (this.sessions.has('default')) {
        socketPath = this.sessions.get('default')!.socketPath;
      } else {
        for (const [, info] of this.sessions) {
          socketPath = info.socketPath;
          break;
        }
      }

      if (!socketPath) {
        socketPath = path.join(getSocketDir(), 'default.sock');
      }

      let singleLineJson: string;
      try {
        singleLineJson = JSON.stringify(JSON.parse(commandJson));
      } catch {
        singleLineJson = commandJson.replace(/\s+/g, ' ').trim();
      }

      const socket = net.createConnection({ path: socketPath }, () => {
        socket.write(singleLineJson + '\n');
      });

      let buffer = '';
      let resolved = false;
      const COMMAND_TIMEOUT_MS = requestedTimeout ?? 180000; // default 3min, max 10min via timeout field
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          reject(new Error(`Command timeout (${COMMAND_TIMEOUT_MS}ms)`));
        }
      }, COMMAND_TIMEOUT_MS);

      socket.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              resolve(JSON.stringify(parsed));
              socket.end();
              return;
            }
          } catch {
            /* ignored */
          }
        }
      });

      socket.on('end', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          if (buffer.trim()) {
            resolve(buffer.trim());
          } else {
            reject(new Error('Daemon closed connection without response'));
          }
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
    } catch {
      /* empty */
    }
  }

  private removeIpcFile(): void {
    const ipcPath = this.getIpcPath();
    try {
      if (fs.existsSync(ipcPath)) {
        fs.unlinkSync(ipcPath);
      }
    } catch {
      /* empty */
    }
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
    const promises: Promise<void>[] = [];

    if (this.wss) {
      promises.push(
        new Promise<void>((resolve) => {
          this.wss?.close(() => resolve());
        })
      );
    }

    if (this.httpServer) {
      promises.push(
        new Promise<void>((resolve) => {
          this.httpServer?.close(() => resolve());
        })
      );
    }

    if (this.ipcServer) {
      promises.push(
        new Promise<void>((resolve) => {
          this.ipcServer?.close(() => resolve());
        })
      );
    }

    await Promise.all(promises);
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
