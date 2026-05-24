export interface ScreencastFrame {
  data: string;
  metadata: {
    offsetTop: number;
    pageScaleFactor: number;
    deviceWidth: number;
    deviceHeight: number;
    scrollOffsetX: number;
    scrollOffsetY: number;
    timestamp?: number;
  };
  sessionId: number;
}

export interface ScreencastOptions {
  format?: 'jpeg' | 'png';
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  everyNthFrame?: number;
}

export interface TrackedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  timestamp: number;
  resourceType: string;
  status?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string | object;
  contentType?: string;
}

export interface ConsoleMessage {
  type: string;
  text: string;
  timestamp: number;
}

export interface PageError {
  message: string;
  timestamp: number;
}

export interface TrackedWebSocket {
  id: string;
  url: string;
  openedAt: number;
  closedAt?: number;
  closeCode?: number;
  closeReason?: string;
  error?: string;
  frames: TrackedWSFrame[];
}

export interface TrackedWSFrame {
  direction: 'send' | 'recv';
  data: string;
  timestamp: number;
  opcode?: number;
}

export interface RecorderStep {
  id?: string;
  timestamp?: number;
  action?: string;
  index?: number;
  key?: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  selector?: string;
  value?: string;
  text?: string;
  xpath?: string;
  x?: number;
  y?: number;
  from?: string | { width: number; height: number };
  to?: string | { width: number; height: number };
  points?: Array<Record<string, number>>;
  scrollX?: number;
  scrollY?: number;
  viewport?: { width: number; height: number };
  targetSelector?: string;
  url?: string;
  annotation?: {
    type?: string;
    label?: string;
    selector?: string;
    itemSelector?: string;
    nextSelector?: string;
    fields?: string[];
    waitTimeout?: number;
    customNote?: string;
  };
}

export interface RecorderPage {
  url: string;
  title: string;
  firstVisitTime: number;
}
