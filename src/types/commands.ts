import type { HumanConfig, DiffScope, BaseCommand } from './base.js';

export interface LaunchCommand extends BaseCommand {
  action: 'launch';
  headless?: boolean;
  viewport?: { width: number; height: number };
  device?: string;
  browser?: 'chromium' | 'firefox' | 'webkit';
  headers?: Record<string, string>;
  executablePath?: string;
  cdpPort?: number;
  cdpUrl?: string;
  extensions?: string[];
  profile?: string;
  storageState?: string;
  proxy?: {
    server: string;
    bypass?: string;
    username?: string;
    password?: string;
  };
  args?: string[];
  userAgent?: string;
  provider?: string;
  ignoreHTTPSErrors?: boolean;
  allowFileAccess?: boolean;
}

export interface NavigateCommand extends BaseCommand {
  action: 'navigate';
  url: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
  headers?: Record<string, string>;
  timeout?: number;
}

export interface ClickCommand extends BaseCommand {
  action: 'click';
  selector: string;
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
  delay?: number;
  timeout?: number;
  inFrame?: string;
  diffScope?: DiffScope;
  human?: HumanConfig;
}

export interface TypeCommand extends BaseCommand {
  action: 'type';
  selector: string;
  text: string;
  delay?: number;
  clear?: boolean;
  inFrame?: string;
  diffScope?: DiffScope;
  human?: HumanConfig;
}

export interface FillCommand extends BaseCommand {
  action: 'fill';
  selector: string;
  value: string;
  inFrame?: string;
  diffScope?: DiffScope;
  human?: HumanConfig;
}

export interface CheckCommand extends BaseCommand {
  action: 'check';
  selector: string;
  inFrame?: string;
  diffScope?: DiffScope;
}

export interface UncheckCommand extends BaseCommand {
  action: 'uncheck';
  selector: string;
  inFrame?: string;
  diffScope?: DiffScope;
}

export interface UploadCommand extends BaseCommand {
  action: 'upload';
  selector: string;
  files: string | string[];
  inFrame?: string;
}

export interface DoubleClickCommand extends BaseCommand {
  action: 'dblclick';
  selector: string;
  inFrame?: string;
  diffScope?: DiffScope;
  human?: HumanConfig;
}

export interface FocusCommand extends BaseCommand {
  action: 'focus';
  selector: string;
  inFrame?: string;
  diffScope?: DiffScope;
}

export interface DragCommand extends BaseCommand {
  action: 'drag';
  source: string;
  target: string;
  inFrame?: string;
}

export interface GetByRoleCommand extends BaseCommand {
  action: 'getbyrole';
  role: string;
  name?: string;
  exact?: boolean;
  subaction: 'click' | 'fill' | 'check' | 'hover';
  value?: string;
  inFrame?: string;
}

export interface GetByTextCommand extends BaseCommand {
  action: 'getbytext';
  text: string;
  exact?: boolean;
  subaction: 'click' | 'hover';
  inFrame?: string;
}

export interface GetByLabelCommand extends BaseCommand {
  action: 'getbylabel';
  label: string;
  exact?: boolean;
  subaction: 'click' | 'fill' | 'check';
  value?: string;
  inFrame?: string;
}

export interface GetByPlaceholderCommand extends BaseCommand {
  action: 'getbyplaceholder';
  placeholder: string;
  exact?: boolean;
  subaction: 'click' | 'fill';
  value?: string;
  inFrame?: string;
}

export interface CookiesGetCommand extends BaseCommand {
  action: 'cookies_get';
  urls?: string[];
}

export interface CookiesSetCommand extends BaseCommand {
  action: 'cookies_set';
  cookies: Array<{
    name: string;
    value: string;
    url?: string;
    domain?: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  }>;
}

export interface CookiesClearCommand extends BaseCommand {
  action: 'cookies_clear';
}

export interface StorageGetCommand extends BaseCommand {
  action: 'storage_get';
  key?: string;
  type: 'local' | 'session';
}

export interface StorageSetCommand extends BaseCommand {
  action: 'storage_set';
  key: string;
  value: string;
  type: 'local' | 'session';
}

export interface StorageClearCommand extends BaseCommand {
  action: 'storage_clear';
  type: 'local' | 'session';
}

export interface DialogCommand extends BaseCommand {
  action: 'dialog';
  response: 'accept' | 'dismiss';
  promptText?: string;
}

export interface PdfCommand extends BaseCommand {
  action: 'pdf';
  path: string;
  format?:
    | 'Letter'
    | 'Legal'
    | 'Tabloid'
    | 'Ledger'
    | 'A0'
    | 'A1'
    | 'A2'
    | 'A3'
    | 'A4'
    | 'A5'
    | 'A6';
}

export interface RouteCommand extends BaseCommand {
  action: 'route';
  url: string;
  response?: {
    status?: number;
    body?: string;
    contentType?: string;
    headers?: Record<string, string>;
  };
  abort?: boolean;
}

export interface UnrouteCommand extends BaseCommand {
  action: 'unroute';
  url?: string;
}

export interface RequestsCommand extends BaseCommand {
  action: 'requests';
  filter?: string;
  clear?: boolean;
  captureResponse?: boolean;
  type?: 'json';
  output?: string;
}

export interface WebSocketsCommand extends BaseCommand {
  action: 'websockets';
  filter?: string;
  clear?: boolean;
}

export interface DownloadCommand extends BaseCommand {
  action: 'download';
  selector: string;
  path: string;
  inFrame?: string;
}

export interface GeolocationCommand extends BaseCommand {
  action: 'geolocation';
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface PermissionsCommand extends BaseCommand {
  action: 'permissions';
  permissions: string[];
  grant: boolean;
}

export interface ViewportCommand extends BaseCommand {
  action: 'viewport';
  width: number;
  height: number;
}

export interface UserAgentCommand extends BaseCommand {
  action: 'useragent';
  userAgent: string;
}

export interface DeviceCommand extends BaseCommand {
  action: 'device';
  device: string;
}

export interface DevicesCommand extends BaseCommand {
  action: 'devices';
  filter?: string;
}

export interface BackCommand extends BaseCommand {
  action: 'back';
}

export interface ForwardCommand extends BaseCommand {
  action: 'forward';
}

export interface ReloadCommand extends BaseCommand {
  action: 'reload';
}

export interface UrlCommand extends BaseCommand {
  action: 'url';
  inFrame?: string;
}

export interface TitleCommand extends BaseCommand {
  action: 'title';
  inFrame?: string;
}

export interface GetAttributeCommand extends BaseCommand {
  action: 'getattribute';
  selector: string;
  attribute: string;
  inFrame?: string;
}

export interface GetTextCommand extends BaseCommand {
  action: 'gettext';
  selector: string;
  inFrame?: string;
}

export interface IsVisibleCommand extends BaseCommand {
  action: 'isvisible';
  selector: string;
  inFrame?: string;
}

export interface IsEnabledCommand extends BaseCommand {
  action: 'isenabled';
  selector: string;
  inFrame?: string;
}

export interface IsCheckedCommand extends BaseCommand {
  action: 'ischecked';
  selector: string;
  inFrame?: string;
}

export interface CountCommand extends BaseCommand {
  action: 'count';
  selector: string;
  inFrame?: string;
}

export interface BoundingBoxCommand extends BaseCommand {
  action: 'boundingbox';
  selector: string;
  inFrame?: string;
}

export interface StylesCommand extends BaseCommand {
  action: 'styles';
  selector: string;
  inFrame?: string;
}

export interface GetByAltTextCommand extends BaseCommand {
  action: 'getbyalttext';
  text: string;
  exact?: boolean;
  subaction: 'click' | 'hover';
  inFrame?: string;
}

export interface GetByTitleCommand extends BaseCommand {
  action: 'getbytitle';
  text: string;
  exact?: boolean;
  subaction: 'click' | 'hover';
  inFrame?: string;
}

export interface GetByTestIdCommand extends BaseCommand {
  action: 'getbytestid';
  testId: string;
  subaction: 'click' | 'fill' | 'check' | 'hover';
  value?: string;
  inFrame?: string;
}

export interface NthCommand extends BaseCommand {
  action: 'nth';
  selector: string;
  index: number;
  subaction: 'click' | 'fill' | 'check' | 'hover' | 'text';
  value?: string;
  inFrame?: string;
}

export interface WaitForUrlCommand extends BaseCommand {
  action: 'waitforurl';
  url: string;
  timeout?: number;
}

export interface WaitForLoadStateCommand extends BaseCommand {
  action: 'waitforloadstate';
  state: 'load' | 'domcontentloaded' | 'networkidle';
  timeout?: number;
}

export interface SetContentCommand extends BaseCommand {
  action: 'setcontent';
  html: string;
}

export interface TimezoneCommand extends BaseCommand {
  action: 'timezone';
  timezone: string;
}

export interface LocaleCommand extends BaseCommand {
  action: 'locale';
  locale: string;
}

export interface HttpCredentialsCommand extends BaseCommand {
  action: 'credentials';
  username: string;
  password: string;
}

export interface MouseMoveCommand extends BaseCommand {
  action: 'mousemove';
  x: number;
  y: number;
}

export interface MouseDownCommand extends BaseCommand {
  action: 'mousedown';
  button?: 'left' | 'right' | 'middle';
}

export interface MouseUpCommand extends BaseCommand {
  action: 'mouseup';
  button?: 'left' | 'right' | 'middle';
}

export interface WanderCommand extends BaseCommand {
  action: 'wander';
  duration?: number;
  human?: HumanConfig;
}

export interface MouseTrajectoryCommand extends BaseCommand {
  action: 'mousetrajectory';
  data: string;
  human?: HumanConfig;
}

export interface BringToFrontCommand extends BaseCommand {
  action: 'bringtofront';
}

export interface WaitForFunctionCommand extends BaseCommand {
  action: 'waitforfunction';
  expression: string;
  timeout?: number;
}

export interface ScrollIntoViewCommand extends BaseCommand {
  action: 'scrollintoview';
  selector: string;
  inFrame?: string;
}

export interface AddInitScriptCommand extends BaseCommand {
  action: 'addinitscript';
  script: string;
}

export interface KeyDownCommand extends BaseCommand {
  action: 'keydown';
  key: string;
}

export interface KeyUpCommand extends BaseCommand {
  action: 'keyup';
  key: string;
}

export interface InsertTextCommand extends BaseCommand {
  action: 'inserttext';
  text: string;
}

export interface MultiSelectCommand extends BaseCommand {
  action: 'multiselect';
  selector: string;
  values: string[];
}

export interface WaitForDownloadCommand extends BaseCommand {
  action: 'waitfordownload';
  path?: string;
  timeout?: number;
}

export interface ResponseBodyCommand extends BaseCommand {
  action: 'responsebody';
  url: string;
  timeout?: number;
}

export interface ScreencastStartCommand extends BaseCommand {
  action: 'screencast_start';
  format?: 'jpeg' | 'png';
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  everyNthFrame?: number;
}

export interface ScreencastStopCommand extends BaseCommand {
  action: 'screencast_stop';
}

export interface InputMouseCommand extends BaseCommand {
  action: 'input_mouse';
  type: 'mousePressed' | 'mouseReleased' | 'mouseMoved' | 'mouseWheel';
  x: number;
  y: number;
  button?: 'left' | 'right' | 'middle' | 'none';
  clickCount?: number;
  deltaX?: number;
  deltaY?: number;
  modifiers?: number;
}

export interface InputKeyboardCommand extends BaseCommand {
  action: 'input_keyboard';
  type: 'keyDown' | 'keyUp' | 'char';
  key?: string;
  code?: string;
  text?: string;
  modifiers?: number;
}

export interface InputTouchCommand extends BaseCommand {
  action: 'input_touch';
  type: 'touchStart' | 'touchEnd' | 'touchMove' | 'touchCancel';
  touchPoints: Array<{ x: number; y: number; id?: number }>;
  modifiers?: number;
}

export interface ViewerCommand extends BaseCommand {
  action: 'viewer';
}

export interface AskCommand extends BaseCommand {
  action: 'ask';
  question: string;
}

export interface ConfigCommand extends BaseCommand {
  action: 'config';
  json?: boolean;
}

export interface InjectFocusListenerCommand extends BaseCommand {
  action: 'inject_focus_listener';
}

export interface ViewerData {
  url: string;
  wsUrl: string;
  streamPort: number;
}

export interface AskData {
  answer: string;
}

export interface VideoStartCommand extends BaseCommand {
  action: 'video_start';
  path: string;
}

export interface VideoStopCommand extends BaseCommand {
  action: 'video_stop';
}

export interface RecordingStartCommand extends BaseCommand {
  action: 'recording_start';
  path: string;
  url?: string;
}

export interface RecordingStopCommand extends BaseCommand {
  action: 'recording_stop';
}

export interface RecordingRestartCommand extends BaseCommand {
  action: 'recording_restart';
  path: string;
  url?: string;
}

export interface RecorderStartCommand extends BaseCommand {
  action: 'recorder_start';
  url?: string;
  hide?: boolean;
}

export interface RecorderStopCommand extends BaseCommand {
  action: 'recorder_stop';
  output?: string;
}

export interface RecorderStatusCommand extends BaseCommand {
  action: 'recorder_status';
}

export interface RecorderReplayCommand extends BaseCommand {
  action: 'recorder_replay';
  path?: string;
}

export interface TraceStartCommand extends BaseCommand {
  action: 'trace_start';
  screenshots?: boolean;
  snapshots?: boolean;
}

export interface TraceStopCommand extends BaseCommand {
  action: 'trace_stop';
  path: string;
}

export interface HarStartCommand extends BaseCommand {
  action: 'har_start';
}

export interface HarStopCommand extends BaseCommand {
  action: 'har_stop';
  path: string;
}

export interface StorageStateSaveCommand extends BaseCommand {
  action: 'state_save';
  path: string;
}

export interface StorageStateLoadCommand extends BaseCommand {
  action: 'state_load';
  path: string;
}

export interface ConsoleCommand extends BaseCommand {
  action: 'console';
  clear?: boolean;
}

export interface ErrorsCommand extends BaseCommand {
  action: 'errors';
  clear?: boolean;
}

export interface KeyboardCommand extends BaseCommand {
  action: 'keyboard';
  keys: string;
}

export interface WheelCommand extends BaseCommand {
  action: 'wheel';
  deltaX?: number;
  deltaY?: number;
  selector?: string;
}

export interface TapCommand extends BaseCommand {
  action: 'tap';
  selector: string;
  inFrame?: string;
}

export interface ClipboardCommand extends BaseCommand {
  action: 'clipboard';
  operation: 'copy' | 'paste' | 'read';
  text?: string;
}

export interface HighlightCommand extends BaseCommand {
  action: 'highlight';
  selector: string;
  inFrame?: string;
}

export interface ClearCommand extends BaseCommand {
  action: 'clear';
  selector: string;
  inFrame?: string;
}

export interface SelectAllCommand extends BaseCommand {
  action: 'selectall';
  selector: string;
  inFrame?: string;
}

export interface InnerTextCommand extends BaseCommand {
  action: 'innertext';
  selector: string;
  inFrame?: string;
}

export interface InnerHtmlCommand extends BaseCommand {
  action: 'innerhtml';
  selector: string;
  inFrame?: string;
}

export interface InputValueCommand extends BaseCommand {
  action: 'inputvalue';
  selector: string;
  inFrame?: string;
}

export interface SetValueCommand extends BaseCommand {
  action: 'setvalue';
  selector: string;
  value: string;
  inFrame?: string;
}

export interface DispatchEventCommand extends BaseCommand {
  action: 'dispatch';
  selector: string;
  event: string;
  eventInit?: Record<string, unknown>;
  inFrame?: string;
}

export interface EvaluateHandleCommand extends BaseCommand {
  action: 'evalhandle';
  script: string;
}

export interface ExposeFunctionCommand extends BaseCommand {
  action: 'expose';
  name: string;
}

export interface AddScriptCommand extends BaseCommand {
  action: 'addscript';
  content?: string;
  url?: string;
}

export interface AddStyleCommand extends BaseCommand {
  action: 'addstyle';
  content?: string;
  url?: string;
}

export interface EmulateMediaCommand extends BaseCommand {
  action: 'emulatemedia';
  media?: 'screen' | 'print' | null;
  colorScheme?: 'light' | 'dark' | 'no-preference' | null;
  reducedMotion?: 'reduce' | 'no-preference' | null;
  forcedColors?: 'active' | 'none' | null;
}

export interface OfflineCommand extends BaseCommand {
  action: 'offline';
  offline: boolean;
}

export interface HeadersCommand extends BaseCommand {
  action: 'headers';
  headers: Record<string, string>;
}

export interface PauseCommand extends BaseCommand {
  action: 'pause';
}

export interface PressCommand extends BaseCommand {
  action: 'press';
  key: string;
  selector?: string;
  inFrame?: string;
  diffScope?: DiffScope;
}

export interface ScreenshotCommand extends BaseCommand {
  action: 'screenshot';
  path?: string;
  fullPage?: boolean;
  selector?: string;
  format?: 'png' | 'jpeg';
  quality?: number;
  inFrame?: string;
}

export interface SnapshotCommand extends BaseCommand {
  action: 'snapshot';
  inFrame?: string;
  interactive?: boolean;
  compact?: boolean;
  maxDepth?: number;
  selector?: string;
  path?: boolean;
  attrs?: boolean;
  selectors?: boolean;
  all?: boolean;
}

export interface HistoryCommand extends BaseCommand {
  action: 'history';
  clear?: boolean;
  filter?: string;
}

export interface EvaluateCommand extends BaseCommand {
  action: 'evaluate';
  script?: string;
  file?: string;
  args?: unknown[];
  inFrame?: string;
}

export interface WaitCommand extends BaseCommand {
  action: 'wait';
  selector?: string;
  timeout?: number;
  state?: 'attached' | 'detached' | 'visible' | 'hidden';
  inFrame?: string;
}

export interface ScrollCommand extends BaseCommand {
  action: 'scroll';
  selector?: string;
  x?: number;
  y?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  inFrame?: string;
}

export interface SelectCommand extends BaseCommand {
  action: 'select';
  selector: string;
  values: string | string[];
  inFrame?: string;
  diffScope?: DiffScope;
}

export interface HoverCommand extends BaseCommand {
  action: 'hover';
  selector: string;
  inFrame?: string;
  diffScope?: DiffScope;
  human?: HumanConfig;
}

export interface ContentCommand extends BaseCommand {
  action: 'content';
  selector?: string;
  inFrame?: string;
}

export interface CloseCommand extends BaseCommand {
  action: 'close';
}

export interface TabNewCommand extends BaseCommand {
  action: 'tab_new';
  url?: string;
}

export interface TabListCommand extends BaseCommand {
  action: 'tab_list';
}

export interface FramesCommand extends BaseCommand {
  action: 'frames';
}

export interface TabSwitchCommand extends BaseCommand {
  action: 'tab_switch';
  index: number;
}

export interface TabCloseCommand extends BaseCommand {
  action: 'tab_close';
  index?: number;
}

export interface WindowNewCommand extends BaseCommand {
  action: 'window_new';
  viewport?: { width: number; height: number };
}

export interface SelectorForCommand extends BaseCommand {
  action: 'selector-for';
  target: string;
}

export interface SelectorsOfCommand extends BaseCommand {
  action: 'selectors-of';
  target: string;
}

export interface ValidateCommand extends BaseCommand {
  action: 'validate';
  target: string;
}
