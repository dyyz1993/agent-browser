import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import type { BrowserManager, ScreencastFrame } from './browser/index.js';
import { setScreencastFrameCallback, setEventCallbacks } from './browser-events.js';
import { executeCommand } from './actions/index.js';
import { errorResponse, serializeResponse } from './protocol.js';
import { getSocketDir, getSession, getInstanceId } from './daemon.js';
import { getVersion } from './version.js';
import {
  StreamStateManager,
  FrameRateController,
  FrameProcessor,
  STATE_CONFIGS,
  isCommandMessage,
  isAllowedOrigin,
  getElementBox,
  handleInputEvent,
  cropFrameForElement,
} from './stream/index.js';
import type {
  ClientState,
  StreamState,
  StreamStateConfig,
  FrameMessage,
  StatusMessage,
  ErrorMessage,
  TabCreatedMessage,
  TabClosedMessage,
  TabSwitchedMessage,
  NavigationMessage,
  StreamMessage,
  InputMessage,
} from './stream/index.js';

export type StreamStateType = StreamState;
export type { StreamStateConfig, ClientState };
export { StreamStateManager, FrameRateController, FrameProcessor, STATE_CONFIGS, isAllowedOrigin };

const STREAM_SERVER_IPC_FILE = 'stream-server.ipc';

export function getStreamServerIpcPath(): string {
  return path.join(getSocketDir(), STREAM_SERVER_IPC_FILE);
}

export class StreamServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, ClientState> = new Map();
  private browser: BrowserManager;
  private port: number;
  private isScreencasting: boolean = false;

  private stateManager: StreamStateManager = new StreamStateManager();
  private frameRateController: FrameRateController = new FrameRateController();
  private frameProcessor: FrameProcessor = new FrameProcessor();
  private lastFrameData: string | null = null;
  private lastFrameMetadata: ScreencastFrame['metadata'] | null = null;

  constructor(
    browser: BrowserManager,
    port: number = parseInt(process.env.AGENT_BROWSER_STREAM_PORT || '5005', 10)
  ) {
    this.browser = browser;
    this.port = port;

    this.stateManager.setStateChangeCallback((newState, previousState) => {
      this.onStateChange(newState, previousState);
    });
  }

  private async onStateChange(newState: StreamState, _previousState: StreamState): Promise<void> {
    if (this.lastFrameData && this.lastFrameMetadata) {
      const config = STATE_CONFIGS[newState];
      try {
        const processedBuffer = await this.frameProcessor.process(
          this.lastFrameData,
          config,
          this.lastFrameMetadata.deviceWidth,
          this.lastFrameMetadata.deviceHeight
        );

        const headerMessage = {
          type: 'frame',
          header: {
            metadata: {
              deviceWidth: this.lastFrameMetadata.deviceWidth,
              deviceHeight: this.lastFrameMetadata.deviceHeight,
              format: config.format,
              fps: this.frameRateController.getCurrentFps(),
              state: newState,
            },
          },
        };

        for (const [client] of this.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(headerMessage));
            client.send(processedBuffer);
          }
        }
      } catch {
        // Ignore errors when reprocessing frame
      }
    }
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({
          port: this.port,
          verifyClient: (info: {
            origin: string;
            secure: boolean;
            req: import('http').IncomingMessage;
          }) => {
            if (isAllowedOrigin(info.origin)) {
              return true;
            }
            console.log(`[StreamServer] Rejected connection from origin: ${info.origin}`);
            return false;
          },
        });

        this.wss.on('connection', (ws, req) => {
          this.handleConnection(ws as WebSocket, req as import('http').IncomingMessage);
        });

        this.wss.on('error', (error) => {
          console.error('[StreamServer] WebSocket error:', error);
          reject(error);
        });

        this.wss.on('listening', () => {
          console.log(`[StreamServer] Listening on port ${this.port}`);

          setScreencastFrameCallback((frame) => {
            this.broadcastFrame(frame).catch((err) => {
              console.error('[StreamServer] Failed to broadcast frame:', err);
            });
          });

          setEventCallbacks({
            onTabCreated: (event) => {
              this.broadcastEvent({ type: 'tab_created', data: event });
            },
            onTabClosed: (event) => {
              this.broadcastEvent({ type: 'tab_closed', data: event });
            },
            onTabSwitched: (event) => {
              this.broadcastEvent({ type: 'tab_switched', data: event });
            },
            onNavigation: (event) => {
              this.broadcastEvent({ type: 'navigation', data: event });
            },
          });

          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    if (this.isScreencasting) {
      await this.stopScreencast();
    }

    setScreencastFrameCallback(null);
    setEventCallbacks({});

    for (const [client] of this.clients) {
      client.close();
    }
    this.clients.clear();

    if (this.wss) {
      return new Promise((resolve) => {
        this.wss?.close(() => {
          this.wss = null;
          resolve();
        });
      });
    }
  }

  private handleConnection(ws: WebSocket, req: import('http').IncomingMessage): void {
    const clientState: ClientState = {};
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const rawSelector = url.searchParams.get('selector');
      if (rawSelector) {
        clientState.selector = decodeURIComponent(rawSelector);
      }
    } catch {
      // Invalid URL, ignore
    }

    this.clients.set(ws, clientState);

    if (clientState.selector) {
      clientState.elementCheckTimer = setInterval(() => {
        if (!clientState.selector) return;
        getElementBox(this.browser, clientState.selector)
          .then((newBox) => {
            if (!newBox) {
              if (clientState.elementBox || !clientState.degraded) {
                clientState.elementBox = undefined;
                clientState.degraded = true;
                const statusMsg: StatusMessage = {
                  type: 'status',
                  connected: true,
                  screencasting: this.isScreencasting,
                  degraded: true,
                };
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify(statusMsg));
                }
              }
            } else {
              clientState.elementBox = newBox;
              clientState.degraded = false;
            }
          })
          .catch(() => {
            // Element box check failed, non-fatal
          });
      }, 2500);
    }

    this.sendStatus(ws, clientState);

    this.refreshElementBox(ws, clientState)
      .then(async () => {
        this.sendStatus(ws, clientState);
        if (this.isScreencasting && this.lastFrameData && this.lastFrameMetadata) {
          await new Promise((r) => setTimeout(r, 100));
          this.replayLastFrame(ws, clientState);
        }
      })
      .catch((err) => {
        console.error('[StreamServer] Failed to refresh element box:', err);
      });

    if (this.clients.size === 1 && !this.isScreencasting) {
      this.startScreencast().catch((error) => {
        console.error('[StreamServer] Failed to start screencast:', error);
        this.sendError(ws, error.message);
      });
    }

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as StreamMessage;
        this.handleMessage(message, ws);
      } catch (error) {
        console.error('[StreamServer] Failed to parse message:', error);
      }
    });

    ws.on('close', () => {
      if (clientState.elementCheckTimer) {
        clearInterval(clientState.elementCheckTimer);
        clientState.elementCheckTimer = undefined;
      }
      this.clients.delete(ws);

      if (this.clients.size === 0 && this.isScreencasting) {
        this.stopScreencast().catch((error) => {
          console.error('[StreamServer] Failed to stop screencast:', error);
        });
      }
    });

    ws.on('error', (error) => {
      console.error('[StreamServer] Client error:', error);
      this.clients.delete(ws);
    });
  }

  private async handleMessage(message: StreamMessage, ws: WebSocket): Promise<void> {
    if (isCommandMessage(message)) {
      try {
        const response = await executeCommand(message, this.browser);
        ws.send(serializeResponse(response));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        ws.send(serializeResponse(errorResponse(message.id, errorMessage)));
      }
      return;
    }

    try {
      switch (message.type) {
        case 'input_mouse':
        case 'input_keyboard':
        case 'input_touch':
        case 'input_text':
        case 'keyboard_down':
        case 'keyboard_up':
        case 'keyboard_insert_text':
        case 'input_fill':
        case 'input_blur_element':
        case 'user_activity':
          await handleInputEvent(message as InputMessage, this.browser, this.stateManager);
          break;

        case 'input_focused':
        case 'input_value':
        case 'input_blur':
          for (const [ws] of this.clients.entries()) {
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(JSON.stringify(message));
              } catch {
                // WebSocket send failed, non-fatal
              }
            }
          }
          break;

        case 'status':
          const cs = this.clients.get(ws);
          if (cs?.selector) {
            this.sendStatus(ws, cs);
            this.refreshElementBox(ws, cs).catch(() => {
              // Element box refresh failed, non-fatal
            });
          } else if (cs) {
            this.sendStatus(ws, cs);
          } else {
            this.sendStatus(ws);
          }
          break;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.sendError(ws, errorMessage);
    }
  }

  private async broadcastFrame(frame: ScreencastFrame): Promise<void> {
    this.lastFrameData = frame.data;
    this.lastFrameMetadata = frame.metadata;

    this.stateManager.onFrameReceived();
    const config = this.stateManager.getConfig();

    if (!this.frameRateController.shouldSendFrame(config.maxFps)) {
      return;
    }

    for (const [client, clientState] of this.clients) {
      if (client.readyState !== WebSocket.OPEN) {
        continue;
      }

      try {
        let processedBuffer: Buffer;
        const metadata = { ...frame.metadata };

        if (clientState.selector && clientState.elementBox) {
          processedBuffer = await this.frameProcessor.process(
            frame.data,
            config,
            clientState.elementBox.width,
            clientState.elementBox.height,
            clientState.elementBox
          );
          metadata.deviceWidth = clientState.elementBox.width;
          metadata.deviceHeight = clientState.elementBox.height;
        } else {
          processedBuffer = await this.frameProcessor.process(
            frame.data,
            config,
            frame.metadata.deviceWidth,
            frame.metadata.deviceHeight
          );
        }

        const headerMessage: FrameMessage = {
          type: 'frame',
          metadata,
          format: config.format,
          fps: this.frameRateController.getCurrentFps(),
          state: this.stateManager.getState(),
        };

        client.send(JSON.stringify(headerMessage));
        client.send(processedBuffer);
      } catch (err) {
        console.error('[StreamServer] Failed to process frame for client:', err);
      }
    }
  }

  private async replayLastFrame(ws: WebSocket, clientState: ClientState): Promise<void> {
    if (!this.lastFrameData || !this.lastFrameMetadata) return;
    if (ws.readyState !== WebSocket.OPEN) return;

    try {
      const config = this.stateManager.getConfig();
      let processedBuffer: Buffer;
      const metadata = { ...this.lastFrameMetadata };

      if (clientState.selector && clientState.elementBox) {
        processedBuffer = await this.frameProcessor.process(
          this.lastFrameData,
          config,
          clientState.elementBox.width,
          clientState.elementBox.height,
          clientState.elementBox
        );
        metadata.deviceWidth = clientState.elementBox.width;
        metadata.deviceHeight = clientState.elementBox.height;
      } else {
        processedBuffer = await this.frameProcessor.process(
          this.lastFrameData,
          config,
          this.lastFrameMetadata.deviceWidth,
          this.lastFrameMetadata.deviceHeight
        );
      }

      const headerMessage: FrameMessage = {
        type: 'frame',
        metadata,
        format: config.format,
        fps: this.frameRateController.getCurrentFps(),
        state: this.stateManager.getState(),
      };

      ws.send(JSON.stringify(headerMessage));
      ws.send(processedBuffer);
    } catch (err) {
      console.error('[StreamServer] Failed to replay last frame:', err);
    }
  }

  private broadcastEvent(
    message: TabCreatedMessage | TabClosedMessage | TabSwitchedMessage | NavigationMessage
  ): void {
    const payload = JSON.stringify(message);

    for (const [client] of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  private async refreshElementBox(ws: WebSocket, clientState: ClientState): Promise<void> {
    if (!clientState.selector) return;
    const box = await getElementBox(this.browser, clientState.selector);
    if (box) {
      clientState.elementBox = box;
      clientState.degraded = false;
    } else if (!clientState.degraded) {
      clientState.elementBox = undefined;
      clientState.degraded = true;
      const message: StatusMessage = {
        type: 'status',
        connected: true,
        screencasting: this.isScreencasting,
        degraded: true,
      };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    }
  }

  private sendStatus(ws: WebSocket, clientState?: ClientState): void {
    let viewportWidth: number | undefined;
    let viewportHeight: number | undefined;

    try {
      const page = this.browser.getPage();
      const viewport = page.viewportSize();
      viewportWidth = viewport?.width;
      viewportHeight = viewport?.height;
    } catch {
      // Intentionally ignored: browser page not available during status check
    }

    const message: StatusMessage = {
      type: 'status',
      connected: true,
      screencasting: this.isScreencasting,
      viewportWidth,
      viewportHeight,
      fps: this.frameRateController.getCurrentFps(),
      state: this.stateManager.getState(),
      version: getVersion(),
    };

    if (clientState?.elementBox) {
      message.element = {
        selector: clientState.selector ?? '',
        x: clientState.elementBox.x,
        y: clientState.elementBox.y,
        width: clientState.elementBox.width,
        height: clientState.elementBox.height,
      };
      message.viewportWidth = clientState.elementBox.width;
      message.viewportHeight = clientState.elementBox.height;
    }

    if (clientState?.degraded) {
      message.degraded = true;
    }

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, errorMessage: string): void {
    const message: ErrorMessage = {
      type: 'error',
      message: errorMessage,
    };

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private async startScreencast(): Promise<void> {
    if (this.isScreencasting) return;
    this.isScreencasting = true;

    try {
      if (!this.browser.isLaunched()) {
        throw new Error('Browser not launched');
      }

      try {
        await this.browser.startScreencast((frame) => this.broadcastFrame(frame), {
          format: 'jpeg',
          quality: 80,
          maxWidth: 1280,
          maxHeight: 720,
          everyNthFrame: 1,
        });
      } catch (startError) {
        if (startError instanceof Error && startError.message === 'Screencast already active') {
          await this.browser.stopScreencast();
          await this.browser.startScreencast((frame) => this.broadcastFrame(frame), {
            format: 'jpeg',
            quality: 80,
            maxWidth: 1280,
            maxHeight: 720,
            everyNthFrame: 1,
          });
        } else {
          throw startError;
        }
      }

      for (const [client, state] of this.clients) {
        this.sendStatus(client, state);
      }

      try {
        await this.browser.injectFocusListener((data) => {
          for (const [ws] of this.clients.entries()) {
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(JSON.stringify(data));
              } catch {
                // WebSocket send failed, non-fatal
              }
            }
          }
        });
      } catch (e) {
        console.error('[StreamServer] Failed to inject focus listener:', e);
      }

      try {
        const page = this.browser.getPage();
        await page.evaluate(() => {
          document.body.style.opacity = '0.999';
          requestAnimationFrame(() => {
            document.body.style.opacity = '';
          });
        });
      } catch {
        // Intentionally ignored: force re-render eval failed
      }
    } catch (error) {
      this.isScreencasting = false;
      throw error;
    }
  }

  private async stopScreencast(): Promise<void> {
    if (!this.isScreencasting) return;
    this.isScreencasting = false;

    await this.browser.stopScreencast();

    for (const [client, state] of this.clients) {
      this.sendStatus(client, state);
    }
  }

  getPort(): number {
    return this.port;
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getStateManager(): StreamStateManager {
    return this.stateManager;
  }

  getFrameRateController(): FrameRateController {
    return this.frameRateController;
  }
}

export class StreamServerProxy {
  private browser: BrowserManager;
  private ipcSocket: net.Socket | null = null;
  private ipcPath: string;
  private session: string;
  private isScreencasting: boolean = false;
  private stateManager: StreamStateManager = new StreamStateManager();
  private frameRateController: FrameRateController = new FrameRateController();
  private frameProcessor: FrameProcessor = new FrameProcessor();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastFrameData: string | null = null;
  private lastFrameMetadata: ScreencastFrame['metadata'] | null = null;
  private inputFillDebounceMap = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; text: string; selector: string }
  >();
  private static readonly INPUT_FILL_DEBOUNCE_MS = 60;

  constructor(browser: BrowserManager) {
    this.browser = browser;
    this.ipcPath = getStreamServerIpcPath();
    this.session = getSession();

    this.stateManager.setStateChangeCallback((newState, previousState) => {
      this.onStateChange(newState, previousState);
    });
  }

  private async onStateChange(newState: StreamState, _previousState: StreamState): Promise<void> {
    if (this.lastFrameData && this.lastFrameMetadata) {
      const config = STATE_CONFIGS[newState];
      try {
        const processedBuffer = await this.frameProcessor.process(
          this.lastFrameData,
          config,
          this.lastFrameMetadata.deviceWidth,
          this.lastFrameMetadata.deviceHeight
        );
        this.send({
          type: 'frame',
          session: this.session,
          metadata: this.lastFrameMetadata,
          format: config.format,
          fps: this.frameRateController.getCurrentFps(),
          state: newState,
          data: processedBuffer.toString('base64'),
        });
      } catch {
        // Ignore errors when reprocessing frame
      }
    }
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(this.ipcPath)) {
        reject(new Error(`Stream Server IPC not found at ${this.ipcPath}`));
        return;
      }

      this.ipcSocket = net.createConnection({ path: this.ipcPath }, () => {
        console.log(`[StreamServerProxy] Connected to Stream Server for session: ${this.session}`);

        let currentUrl = '';
        let currentTitle = '';
        try {
          const page = this.browser.getPage();
          if (page) {
            currentUrl = page.url() || '';
          }
        } catch {}

        this.send({
          type: 'register',
          session: this.session,
          instanceId: getInstanceId(),
          socketPath: this.getDaemonSocketPath(),
          url: currentUrl,
          title: currentTitle,
        });

        this.setupFrameCallback();
        resolve();
      });

      this.ipcSocket.on('error', (err) => {
        console.error('[StreamServerProxy] IPC error:', err);
        this.scheduleReconnect();
        reject(err);
      });

      this.ipcSocket.on('close', () => {
        console.log('[StreamServerProxy] IPC connection closed');
        this.ipcSocket = null;
        this.scheduleReconnect();
      });

      let buffer = '';
      this.ipcSocket.on('data', (data) => {
        buffer += data.toString();
        while (buffer.includes('\n')) {
          const newlineIdx = buffer.indexOf('\n');
          const line = buffer.substring(0, newlineIdx);
          buffer = buffer.substring(newlineIdx + 1);
          if (line.trim()) {
            this.handleIpcMessage(line);
          }
        }
      });
    });
  }

  private async handleIpcMessage(line: string): Promise<void> {
    try {
      const message = JSON.parse(line) as Record<string, unknown>;

      switch (message.type) {
        case 'input_mouse':
        case 'input_keyboard':
        case 'input_touch':
        case 'input_text':
        case 'keyboard_down':
        case 'keyboard_up':
        case 'keyboard_insert_text':
        case 'input_fill':
        case 'input_blur_element':
        case 'user_activity':
          await handleInputEvent(
            message as unknown as InputMessage,
            this.browser,
            this.stateManager,
            this.inputFillDebounceMap,
            StreamServerProxy.INPUT_FILL_DEBOUNCE_MS
          );
          break;
        case 'client_connected':
          this.handleClientConnected(message.session as string);
          break;
        case 'client_disconnected':
          this.handleClientDisconnected(message.session as string);
          break;
        case 'request_element_box':
          (async () => {
            const box = await getElementBox(this.browser, message.selector as string);
            const response: Record<string, unknown> = {
              type: 'selector_element',
              session: message.session ?? this.session,
              selector: message.selector as string,
            };
            if (box) {
              response.elementBox = box;
            }
            this.send(response);
          })();
          break;
        case 'input_focused':
        case 'input_value':
        case 'input_blur':
          this.send(message);
          break;
      }
    } catch (error) {
      console.error('[StreamServerProxy] Failed to parse message:', error);
    }
  }

  private async handleClientConnected(session: string): Promise<void> {
    if (session !== this.session) return;
    console.log(`[StreamServerProxy] Client connected for session ${session}, starting screencast`);
    try {
      await this.startScreencast();
    } catch (error) {
      console.error('[StreamServerProxy] Failed to start screencast on client connected:', error);
    }
  }

  private async handleClientDisconnected(session: string): Promise<void> {
    if (session !== this.session) return;
    console.log(
      `[StreamServerProxy] Client disconnected for session ${session}, stopping screencast`
    );
    try {
      await this.stopScreencast();
    } catch (error) {
      console.error('[StreamServerProxy] Failed to stop screencast on client disconnected:', error);
    }
  }

  private setupFrameCallback(): void {
    setScreencastFrameCallback((frame) => {
      this.sendFrame(frame).catch((err) => {
        console.error('[StreamServerProxy] Failed to send frame:', err);
      });
    });

    setEventCallbacks({
      onTabCreated: (event) => {
        this.send({ type: 'tab_created', session: this.session, data: event });
      },
      onTabClosed: (event) => {
        this.send({ type: 'tab_closed', session: this.session, data: event });
      },
      onTabSwitched: (event) => {
        this.send({ type: 'tab_switched', session: this.session, data: event });
      },
      onNavigation: (event) => {
        this.send({ type: 'navigation', session: this.session, data: event });
      },
    });
  }

  private async sendFrame(frame: ScreencastFrame): Promise<void> {
    this.lastFrameData = frame.data;
    this.lastFrameMetadata = frame.metadata;

    this.stateManager.onFrameReceived();
    const config = this.stateManager.getConfig();

    if (!this.frameRateController.shouldSendFrame(config.maxFps)) {
      return;
    }

    let processedBuffer: Buffer;
    try {
      processedBuffer = await this.frameProcessor.process(
        frame.data,
        config,
        frame.metadata.deviceWidth,
        frame.metadata.deviceHeight
      );
    } catch {
      processedBuffer = Buffer.from(frame.data, 'base64');
    }

    this.send({
      type: 'frame',
      session: this.session,
      metadata: frame.metadata,
      format: config.format,
      fps: this.frameRateController.getCurrentFps(),
      state: this.stateManager.getState(),
      data: processedBuffer.toString('base64'),
    });
  }

  private send(message: object): void {
    if (this.ipcSocket && !this.ipcSocket.destroyed) {
      this.ipcSocket.write(JSON.stringify(message) + '\n');
    }
  }

  broadcastEvent(event: { type: string; data: unknown }): void {
    this.send({ ...event, session: this.session });
  }

  sendSelectorElement(
    selector: string,
    elementBox: { x: number; y: number; width: number; height: number }
  ): void {
    this.send({
      type: 'selector_element',
      session: this.session,
      selector,
      elementBox,
    });
  }

  private getDaemonSocketPath(): string {
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      return `tcp://127.0.0.1:${this.getDaemonPort()}`;
    }
    return path.join(getSocketDir(), `${this.session}.sock`);
  }

  private getDaemonPort(): number {
    let hash = 0;
    for (let i = 0; i < this.session.length; i++) {
      hash = (hash << 5) - hash + this.session.charCodeAt(i);
      hash |= 0;
    }
    return 49152 + (Math.abs(hash) % 16383);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((err) => {
        console.error('[StreamServerProxy] Reconnect failed:', err);
      });
    }, 2000);
  }

  async startScreencast(): Promise<void> {
    if (this.isScreencasting) return;
    this.isScreencasting = true;

    try {
      if (!this.browser.isLaunched()) {
        throw new Error('Browser not launched');
      }

      await this.browser.startScreencast((frame) => this.sendFrame(frame), {
        format: 'jpeg',
        quality: 80,
        maxWidth: 1280,
        maxHeight: 720,
        everyNthFrame: 1,
      });
    } catch (error) {
      this.isScreencasting = false;
      throw error;
    }
  }

  async stopScreencast(): Promise<void> {
    if (!this.isScreencasting) return;

    await this.browser.stopScreencast();
    this.isScreencasting = false;
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.send({
      type: 'unregister',
      session: this.session,
    });

    setScreencastFrameCallback(null);
    setEventCallbacks({});

    if (this.isScreencasting) {
      await this.stopScreencast();
    }

    if (this.ipcSocket) {
      this.ipcSocket.destroy();
      this.ipcSocket = null;
    }
  }

  isConnected(): boolean {
    return this.ipcSocket !== null && !this.ipcSocket.destroyed;
  }
}
