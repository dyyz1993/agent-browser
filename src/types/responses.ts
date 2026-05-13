export interface SuccessResponse<T = unknown> {
  id: string;
  success: true;
  data: T;
  tips?: string | string[];
}

export interface ErrorResponse {
  id: string;
  success: false;
  error: string;
}

export type Response<T = unknown> = SuccessResponse<T> | ErrorResponse;

export function isSuccessResponse<T>(response: Response): response is SuccessResponse<T> {
  return response.success === true;
}

export interface NavigateData {
  url: string;
  title: string;
  ssr?: {
    framework: string;
    globals: string[];
  };
}

export interface ScreenshotData {
  path?: string;
  base64?: string;
}

export interface SnapshotData {
  snapshot: string;
}

export interface EvaluateData {
  result: unknown;
}

export interface ContentData {
  html: string;
}

export interface TabInfo {
  index: number;
  url: string;
  title: string;
  active: boolean;
}

export interface TabListData {
  tabs: TabInfo[];
  active: number;
}

export interface TabNewData {
  index: number;
  total: number;
}

export interface TabSwitchData {
  index: number;
  url: string;
  title: string;
}

export interface TabCloseData {
  closed: number;
  remaining: number;
}

export interface ScreencastStartData {
  started: boolean;
  format: string;
  quality: number;
}

export interface ScreencastStopData {
  stopped: boolean;
}

export interface RecordingStartData {
  started: boolean;
  path: string;
}

export interface RecordingStopData {
  path: string;
  frames: number;
  error?: string;
}

export interface RecordingRestartData {
  started: boolean;
  path: string;
  previousPath?: string;
  stopped: boolean;
}

export interface RecorderStartData {
  started: boolean;
  sessionId: string;
}

export interface RecorderStopData {
  yaml: string;
  steps: number;
}

export interface RecorderStatusData {
  isRecording: boolean;
  steps: number;
  sessionId?: string;
}

export interface InputEventData {
  injected: boolean;
}

export interface ElementStyleInfo {
  tag: string;
  text: string | null;
  box: { x: number; y: number; width: number; height: number };
  styles: {
    fontSize: string;
    fontWeight: string;
    fontFamily: string;
    color: string;
    backgroundColor: string;
    borderRadius: string;
    border: string | null;
    boxShadow: string | null;
    padding: string;
  };
}

export interface StylesData {
  elements: ElementStyleInfo[];
}

export interface TextData {
  text: string;
}

export interface ValueData {
  value: string;
}

export interface VisibleData {
  visible: boolean;
}

export interface CheckedData {
  checked: boolean;
}

export interface CountData {
  count: number;
}

export interface DiffActionData {
  diff?: string;
  diffScope?: string;
}
