import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RECONNECT_DELAY_MS = 2000;

export interface ViewerConfig {
  wsProtocol: string;
  hostname: string;
  port: number;
  instanceId: string | null;
  session: string;
}

export interface ViewerElements {
  screen: HTMLImageElement;
  statusDot: HTMLDivElement;
  statusText: HTMLSpanElement;
  urlDisplay: HTMLInputElement;
  qualityBadge: HTMLDivElement;
  connecting: HTMLDivElement;
  hiddenInput: HTMLInputElement;
}

export interface ViewerState {
  ws: WebSocket | null;
  metadata: {
    deviceWidth: number;
    deviceHeight: number;
    pageScaleFactor: number;
    format: string;
    element?: {
      selector: string;
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
  userActivityTimeout: ReturnType<typeof setTimeout> | null;
  pendingBinary: boolean;
  modifiers: number;
  clickCount: number;
  clickTimer: ReturnType<typeof setTimeout> | null;
  isComposing: boolean;
  lastInputValue: string;
  fixedSize: boolean;
}

interface ViewInfo {
  id: string;
  label: string;
  rect: { x: number; y: number; width: number; height: number };
}

export function createInitialState(): ViewerState {
  return {
    ws: null,
    metadata: { deviceWidth: 1280, deviceHeight: 720, pageScaleFactor: 1, format: 'jpeg' },
    userActivityTimeout: null,
    pendingBinary: false,
    modifiers: 0,
    clickCount: 0,
    clickTimer: null,
    isComposing: false,
    lastInputValue: '',
    fixedSize: false,
  };
}

export function buildWebSocketUrl(config: ViewerConfig): string {
  const wsParam = config.instanceId
    ? 'instanceId=' + config.instanceId
    : 'session=' + config.session;
  return config.wsProtocol + '//' + config.hostname + ':' + config.port + '?' + wsParam;
}

export function parseConfigFromLocation(): ViewerConfig {
  const wsProtocol =
    typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss:' : 'ws:';
  const defaultPort = 5005;
  const port = (typeof location !== 'undefined' && parseInt(location.port, 10)) || defaultPort;
  let instanceId: string | null = null;
  let session = 'default';

  if (typeof URLSearchParams !== 'undefined' && typeof location !== 'undefined') {
    const urlParams = new URLSearchParams(location.search);
    instanceId = urlParams.get('instanceId');
    session = urlParams.get('session') || 'default';
  }

  return {
    wsProtocol,
    hostname: typeof location !== 'undefined' ? location.hostname : 'localhost',
    port,
    instanceId,
    session,
  };
}

export function safeSend(ws: WebSocket | null, data: string): void {
  if (ws && ws.readyState === 1) {
    ws.send(data);
  }
}

export function sendUserActivity(
  state: ViewerState,
  qualityBadge: HTMLElement,
  ws: WebSocket | null
): void {
  safeSend(ws, JSON.stringify({ type: 'user_activity' }));

  if (state.userActivityTimeout !== null) {
    clearTimeout(state.userActivityTimeout);
  }
  state.userActivityTimeout = setTimeout(() => {
    qualityBadge.textContent = 'static';
  }, RECONNECT_DELAY_MS);

  qualityBadge.textContent = 'interacting';
}

export interface ScreenToPageRect {
  width: number;
  height: number;
  left: number;
  top: number;
}

export interface ElementBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function screenToPage(
  screenX: number,
  screenY: number,
  rect: ScreenToPageRect,
  deviceWidth: number,
  deviceHeight: number,
  element?: ElementBox | null
): { x: number; y: number } {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };

  const scaleX = deviceWidth / rect.width;
  const scaleY = deviceHeight / rect.height;
  let pageX = Math.round((screenX - rect.left) * scaleX);
  let pageY = Math.round((screenY - rect.top) * scaleY);

  if (element) {
    pageX += element.x;
    pageY += element.y;
  }
  return { x: pageX, y: pageY };
}

export function updateModifiers(e: MouseEvent | KeyboardEvent): number {
  let modifiers = 0;
  if (e.altKey) modifiers |= 1;
  if (e.ctrlKey) modifiers |= 2;
  if (e.metaKey) modifiers |= 4;
  if (e.shiftKey) modifiers |= 8;
  return modifiers;
}

export function shouldSendText(
  key: string,
  ctrlKey: boolean,
  metaKey: boolean,
  altKey: boolean
): boolean {
  return key.length === 1 && !ctrlKey && !metaKey && !altKey;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function buildViewerScript(): string {
  const viewerDir = path.join(__dirname, 'viewer');
  return fs.readFileSync(path.join(viewerDir, 'app.js'), 'utf-8');
}
