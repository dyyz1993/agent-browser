import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import sharp from 'sharp';
import type { BrowserManager, ScreencastFrame } from './browser.js';
import { setScreencastFrameCallback, setEventCallbacks } from './actions.js';
import type { Command, Response } from './types.js';
import { executeCommand } from './actions.js';
import { errorResponse, serializeResponse } from './protocol.js';
import { getSocketDir, getSession, getInstanceId } from './daemon.js';

export type StreamState = 'user_interacting' | 'screen_moving' | 'static';

export interface StreamStateConfig {
  format: 'jpeg' | 'webp';
  quality: number;
  maxFps: number;
  scale: number;
}

export const STATE_CONFIGS: Record<StreamState, StreamStateConfig> = {
  user_interacting: { format: 'jpeg', quality: 80, maxFps: 60, scale: 0.4 },
  screen_moving: { format: 'webp', quality: 50, maxFps: 1, scale: 0.6 },
  static: { format: 'webp', quality: 80, maxFps: 0.5, scale: 1 },
};

export type StateChangeCallback = (newState: StreamState, previousState: StreamState) => void;

export class StreamStateManager {
  private currentState: StreamState = 'static';
  private isUserInteracting: boolean = false;
  private userInteractionTimer: ReturnType<typeof setTimeout> | null = null;
  private lastFrameTime: number = 0;
  private frameInterval: number = Infinity;
  private onStateChange: StateChangeCallback | null = null;
  private staticTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly USER_INTERACTION_TIMEOUT_MS = 1000;
  private readonly SCREEN_MOVING_THRESHOLD_MS = 1000;
  private readonly STATIC_TIMEOUT_MS = 1500;

  setStateChangeCallback(callback: StateChangeCallback | null): void {
    this.onStateChange = callback;
  }

  private setState(newState: StreamState): void {
    if (newState !== this.currentState) {
      const previousState = this.currentState;
      this.currentState = newState;
      this.onStateChange?.(newState, previousState);
    }
  }

  private resetStaticTimer(): void {
    if (this.staticTimer) {
      clearTimeout(this.staticTimer);
    }
    this.staticTimer = setTimeout(() => {
      if (!this.isUserInteracting) {
        this.setState('static');
      }
    }, this.STATIC_TIMEOUT_MS);
  }

  onUserInteraction(): void {
    this.setState('user_interacting');
    this.isUserInteracting = true;
    this.resetUserInteractionTimeout();
    this.resetStaticTimer();
  }

  private resetUserInteractionTimeout(): void {
    if (this.userInteractionTimer) {
      clearTimeout(this.userInteractionTimer);
    }
    this.userInteractionTimer = setTimeout(() => {
      this.isUserInteracting = false;
      const newState =
        this.frameInterval < this.SCREEN_MOVING_THRESHOLD_MS ? 'screen_moving' : 'static';
      this.setState(newState);
    }, this.USER_INTERACTION_TIMEOUT_MS);
  }

  onFrameReceived(): void {
    const now = Date.now();
    this.frameInterval = now - this.lastFrameTime;
    this.lastFrameTime = now;

    if (!this.isUserInteracting) {
      const newState =
        this.frameInterval < this.SCREEN_MOVING_THRESHOLD_MS ? 'screen_moving' : 'static';
      this.setState(newState);
    }

    this.resetStaticTimer();
  }

  getConfig(): StreamStateConfig {
    return STATE_CONFIGS[this.currentState];
  }

  getState(): StreamState {
    return this.currentState;
  }

  getFrameInterval(): number {
    return this.frameInterval;
  }

  getIsUserInteracting(): boolean {
    return this.isUserInteracting;
  }
}

export class FrameRateController {
  private lastSentTime: number = 0;
  private fpsFrameCount: number = 0;
  private fpsLastTime: number = Date.now();
  private currentFps: number = 0;

  private readonly FPS_CALCULATION_INTERVAL_MS = 1000;

  shouldSendFrame(maxFps: number): boolean {
    const now = Date.now();
    const minInterval = 1000 / maxFps;

    if (now - this.lastSentTime >= minInterval) {
      this.lastSentTime = now;
      this.fpsFrameCount++;
      this.calculateFps();
      return true;
    }
    return false;
  }

  private calculateFps(): void {
    const now = Date.now();
    const elapsed = now - this.fpsLastTime;

    if (elapsed >= this.FPS_CALCULATION_INTERVAL_MS) {
      this.currentFps = Math.round((this.fpsFrameCount * 1000) / elapsed);
      this.fpsFrameCount = 0;
      this.fpsLastTime = now;
    }
  }

  getCurrentFps(): number {
    return this.currentFps;
  }

  reset(): void {
    this.lastSentTime = 0;
    this.fpsFrameCount = 0;
    this.fpsLastTime = Date.now();
    this.currentFps = 0;
  }
}

export class FrameProcessor {
  async process(
    data: string,
    config: StreamStateConfig,
    viewportWidth?: number,
    viewportHeight?: number
  ): Promise<Buffer> {
    const buffer = Buffer.from(data, 'base64');

    let processed: sharp.Sharp = sharp(buffer);

    if (config.scale < 1 && viewportWidth && viewportHeight) {
      const newWidth = Math.round(viewportWidth * config.scale);
      const newHeight = Math.round(viewportHeight * config.scale);
      processed = processed.resize(newWidth, newHeight);
    }

    if (config.format === 'jpeg') {
      processed = processed.jpeg({ quality: config.quality });
    } else {
      processed = processed.webp({ quality: config.quality });
    }

    return processed.toBuffer();
  }
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }
  if (origin.startsWith('file://')) {
    return true;
  }
  try {
    const url = new URL(origin);
    const host = url.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') {
      return true;
    }
  } catch {
    // Invalid origin URL - reject
  }
  return false;
}

export interface FrameMessage {
  type: 'frame';
  metadata: {
    offsetTop: number;
    pageScaleFactor: number;
    deviceWidth: number;
    deviceHeight: number;
    scrollOffsetX: number;
    scrollOffsetY: number;
    timestamp?: number;
  };
  format: 'jpeg' | 'webp';
  fps: number;
  state: StreamState;
}

export interface InputMouseMessage {
  type: 'input_mouse';
  eventType: 'mousePressed' | 'mouseReleased' | 'mouseMoved' | 'mouseWheel';
  x: number;
  y: number;
  button?: 'left' | 'right' | 'middle' | 'none';
  clickCount?: number;
  deltaX?: number;
  deltaY?: number;
  modifiers?: number;
}

export interface InputKeyboardMessage {
  type: 'input_keyboard';
  eventType: 'keyDown' | 'keyUp' | 'rawKeyDown' | 'char';
  key?: string;
  code?: string;
  text?: string;
  modifiers?: number;
}

export interface InputTouchMessage {
  type: 'input_touch';
  eventType: 'touchStart' | 'touchEnd' | 'touchMove' | 'touchCancel';
  touchPoints: Array<{ x: number; y: number; id?: number }>;
  modifiers?: number;
}

export interface InputTextMessage {
  type: 'input_text';
  text: string;
}

export interface KeyboardDownMessage {
  type: 'keyboard_down';
  key: string;
}

export interface KeyboardUpMessage {
  type: 'keyboard_up';
  key: string;
}

export interface KeyboardInsertTextMessage {
  type: 'keyboard_insert_text';
  text: string;
}

export interface StatusMessage {
  type: 'status';
  connected: boolean;
  screencasting: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
  fps?: number;
  state?: StreamState;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export interface TabCreatedMessage {
  type: 'tab_created';
  data: { index: number; url: string; title: string };
}

export interface TabClosedMessage {
  type: 'tab_closed';
  data: { index: number; remainingTabs: number };
}

export interface TabSwitchedMessage {
  type: 'tab_switched';
  data: { fromIndex: number; toIndex: number };
}

export interface NavigationMessage {
  type: 'navigation';
  data: { url: string; title: string };
}

export interface UserActivityMessage {
  type: 'user_activity';
}

export type StreamMessage =
  | FrameMessage
  | InputMouseMessage
  | InputKeyboardMessage
  | InputTouchMessage
  | InputTextMessage
  | KeyboardDownMessage
  | KeyboardUpMessage
  | KeyboardInsertTextMessage
  | StatusMessage
  | ErrorMessage
  | TabCreatedMessage
  | TabClosedMessage
  | TabSwitchedMessage
  | NavigationMessage
  | UserActivityMessage
  | Command;

function isCommandMessage(msg: StreamMessage): msg is Command {
  return 'id' in msg && 'action' in msg && !('type' in msg);
}

export class StreamServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
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

  private async onStateChange(newState: StreamState, previousState: StreamState): Promise<void> {
    if (this.lastFrameData && this.lastFrameMetadata) {
      const config = STATE_CONFIGS[newState];
      try {
        const processedBuffer = await this.frameProcessor.process(
          this.lastFrameData,
          config,
          this.lastFrameMetadata.deviceWidth,
          this.lastFrameMetadata.deviceHeight
        );
        const headerMessage: FrameMessage = {
          type: 'frame',
          metadata: this.lastFrameMetadata,
          format: config.format,
          fps: this.frameRateController.getCurrentFps(),
          state: newState,
        };

        for (const client of this.clients) {
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

        this.wss.on('connection', (ws) => {
          this.handleConnection(ws);
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

    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();

    if (this.wss) {
      return new Promise((resolve) => {
        this.wss!.close(() => {
          this.wss = null;
          resolve();
        });
      });
    }
  }

  private handleConnection(ws: WebSocket): void {
    console.log('[StreamServer] Client connected');
    this.clients.add(ws);

    this.sendStatus(ws);

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
      console.log('[StreamServer] Client disconnected');
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
          this.stateManager.onUserInteraction();
          await this.browser.injectMouseEvent({
            type: message.eventType,
            x: message.x,
            y: message.y,
            button: message.button,
            clickCount: message.clickCount,
            deltaX: message.deltaX,
            deltaY: message.deltaY,
            modifiers: message.modifiers,
          });
          break;

        case 'input_keyboard':
          this.stateManager.onUserInteraction();
          await this.browser.injectKeyboardEvent({
            type: message.eventType,
            key: message.key,
            code: message.code,
            text: message.text,
            modifiers: message.modifiers,
          });
          break;

        case 'input_touch':
          this.stateManager.onUserInteraction();
          await this.browser.injectTouchEvent({
            type: message.eventType,
            touchPoints: message.touchPoints,
            modifiers: message.modifiers,
          });
          break;

        case 'input_text':
          this.stateManager.onUserInteraction();
          await this.browser.insertText(message.text);
          break;

        case 'keyboard_down':
          this.stateManager.onUserInteraction();
          await this.browser.getPage().keyboard.down(message.key);
          break;

        case 'keyboard_up':
          await this.browser.getPage().keyboard.up(message.key);
          break;

        case 'keyboard_insert_text':
          this.stateManager.onUserInteraction();
          await this.browser.getPage().keyboard.insertText(message.text);
          break;

        case 'user_activity':
          this.stateManager.onUserInteraction();
          break;

        case 'status':
          this.sendStatus(ws);
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

    const headerMessage: FrameMessage = {
      type: 'frame',
      metadata: frame.metadata,
      format: config.format,
      fps: this.frameRateController.getCurrentFps(),
      state: this.stateManager.getState(),
    };

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(headerMessage));
        client.send(processedBuffer);
      }
    }
  }

  private broadcastEvent(
    message: TabCreatedMessage | TabClosedMessage | TabSwitchedMessage | NavigationMessage
  ): void {
    const payload = JSON.stringify(message);

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  private sendStatus(ws: WebSocket): void {
    let viewportWidth: number | undefined;
    let viewportHeight: number | undefined;

    try {
      const page = this.browser.getPage();
      const viewport = page.viewportSize();
      viewportWidth = viewport?.width;
      viewportHeight = viewport?.height;
    } catch {
      // Browser not launched yet
    }

    const message: StatusMessage = {
      type: 'status',
      connected: true,
      screencasting: this.isScreencasting,
      viewportWidth,
      viewportHeight,
      fps: this.frameRateController.getCurrentFps(),
      state: this.stateManager.getState(),
    };

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

      await this.browser.startScreencast((frame) => this.broadcastFrame(frame), {
        format: 'jpeg',
        quality: 80,
        maxWidth: 1280,
        maxHeight: 720,
        everyNthFrame: 1,
      });

      for (const client of this.clients) {
        this.sendStatus(client);
      }
    } catch (error) {
      this.isScreencasting = false;
      throw error;
    }
  }

  private async stopScreencast(): Promise<void> {
    if (!this.isScreencasting) return;

    await this.browser.stopScreencast();
    this.isScreencasting = false;

    for (const client of this.clients) {
      this.sendStatus(client);
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

const STREAM_SERVER_IPC_FILE = 'stream-server.ipc';

export function getStreamServerIpcPath(): string {
  return path.join(getSocketDir(), STREAM_SERVER_IPC_FILE);
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

  constructor(browser: BrowserManager) {
    this.browser = browser;
    this.ipcPath = getStreamServerIpcPath();
    this.session = getSession();

    this.stateManager.setStateChangeCallback((newState, previousState) => {
      this.onStateChange(newState, previousState);
    });
  }

  private async onStateChange(newState: StreamState, previousState: StreamState): Promise<void> {
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

        this.send({
          type: 'register',
          session: this.session,
          instanceId: getInstanceId(),
          socketPath: this.getDaemonSocketPath(),
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
            this.handleMessage(line);
          }
        }
      });
    });
  }

  private handleMessage(line: string): void {
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
        case 'user_activity':
          this.handleInputMessage(message as unknown as InputMouseMessage);
          break;
        case 'client_connected':
          this.handleClientConnected(message.session as string);
          break;
        case 'client_disconnected':
          this.handleClientDisconnected(message.session as string);
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

  private async handleInputMessage(
    message:
      | InputMouseMessage
      | InputKeyboardMessage
      | InputTouchMessage
      | InputTextMessage
      | KeyboardDownMessage
      | KeyboardUpMessage
      | KeyboardInsertTextMessage
      | UserActivityMessage
  ): Promise<void> {
    try {
      switch (message.type) {
        case 'input_mouse':
          this.stateManager.onUserInteraction();
          await this.browser.injectMouseEvent({
            type: message.eventType,
            x: message.x,
            y: message.y,
            button: message.button,
            clickCount: message.clickCount,
            deltaX: message.deltaX,
            deltaY: message.deltaY,
            modifiers: message.modifiers,
          });
          break;

        case 'input_keyboard':
          this.stateManager.onUserInteraction();
          await this.browser.injectKeyboardEvent({
            type: message.eventType,
            key: message.key,
            code: message.code,
            text: message.text,
            modifiers: message.modifiers,
          });
          break;

        case 'input_touch':
          this.stateManager.onUserInteraction();
          await this.browser.injectTouchEvent({
            type: message.eventType,
            touchPoints: message.touchPoints,
            modifiers: message.modifiers,
          });
          break;

        case 'input_text':
          this.stateManager.onUserInteraction();
          await this.browser.insertText(message.text);
          break;

        case 'keyboard_down':
          this.stateManager.onUserInteraction();
          await this.browser.getPage().keyboard.down(message.key);
          break;

        case 'keyboard_up':
          await this.browser.getPage().keyboard.up(message.key);
          break;

        case 'keyboard_insert_text':
          this.stateManager.onUserInteraction();
          await this.browser.getPage().keyboard.insertText(message.text);
          break;

        case 'user_activity':
          this.stateManager.onUserInteraction();
          break;
      }
    } catch (error) {
      console.error('[StreamServerProxy] Failed to handle input:', error);
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
