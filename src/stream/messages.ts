import type { StreamState } from './frame-processor.js';
import type { Command } from '../types.js';

function isPrivateIP(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && parts.every((p) => !isNaN(p))) {
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 0) return true;
  }

  const lower = hostname.toLowerCase();
  if (lower === '::1' || lower === '[::1]' || lower === '::' || lower === 'localhost') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true;
  if (hostname === 'localhost') return true;

  return false;
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
    if (isPrivateIP(url.hostname)) {
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

export interface InputFillMessage {
  type: 'input_fill';
  selector?: string;
  text?: string;
}

export interface InputBlurElementMessage {
  type: 'input_blur_element';
  selector?: string;
}

export interface StatusMessage {
  type: 'status';
  connected: boolean;
  screencasting: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
  fps?: number;
  state?: StreamState;
  element?: {
    selector: string;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  degraded?: boolean;
  version?: string;
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

export interface InputFocusedMessage {
  type: 'input_focused';
  tag: string;
  inputType: string;
  value: string;
  placeholder: string;
  id: string;
}

export interface InputValueMessage {
  type: 'input_value';
  text: string;
}

export interface InputBlurMessage {
  type: 'input_blur';
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
  | InputFocusedMessage
  | InputValueMessage
  | InputBlurMessage
  | InputFillMessage
  | InputBlurElementMessage
  | StatusMessage
  | ErrorMessage
  | TabCreatedMessage
  | TabClosedMessage
  | TabSwitchedMessage
  | NavigationMessage
  | UserActivityMessage
  | Command;

export function isCommandMessage(msg: StreamMessage): msg is Command {
  return 'id' in msg && 'action' in msg && !('type' in msg);
}
