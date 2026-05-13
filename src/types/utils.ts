import type {
  LaunchCommand,
  NavigateCommand,
  ClickCommand,
  TypeCommand,
  FillCommand,
  CheckCommand,
  UncheckCommand,
  UploadCommand,
  DoubleClickCommand,
  FocusCommand,
  DragCommand,
  GetByRoleCommand,
  GetByTextCommand,
  GetByLabelCommand,
  GetByPlaceholderCommand,
  PressCommand,
  ScreenshotCommand,
  SnapshotCommand,
  EvaluateCommand,
  WaitCommand,
  ScrollCommand,
  SelectCommand,
  HoverCommand,
  ContentCommand,
  CloseCommand,
  TabNewCommand,
  TabListCommand,
  FramesCommand,
  TabSwitchCommand,
  TabCloseCommand,
  WindowNewCommand,
  CookiesGetCommand,
  CookiesSetCommand,
  CookiesClearCommand,
  StorageGetCommand,
  StorageSetCommand,
  StorageClearCommand,
  DialogCommand,
  PdfCommand,
  RouteCommand,
  UnrouteCommand,
  RequestsCommand,
  WebSocketsCommand,
  DownloadCommand,
  GeolocationCommand,
  PermissionsCommand,
  ViewportCommand,
  UserAgentCommand,
  DeviceCommand,
  BackCommand,
  ForwardCommand,
  ReloadCommand,
  UrlCommand,
  TitleCommand,
  GetAttributeCommand,
  GetTextCommand,
  IsVisibleCommand,
  IsEnabledCommand,
  IsCheckedCommand,
  CountCommand,
  BoundingBoxCommand,
  StylesCommand,
  VideoStartCommand,
  VideoStopCommand,
  RecordingStartCommand,
  RecordingStopCommand,
  RecordingRestartCommand,
  RecorderStartCommand,
  RecorderStopCommand,
  RecorderStatusCommand,
  RecorderReplayCommand,
  TraceStartCommand,
  TraceStopCommand,
  HarStartCommand,
  HarStopCommand,
  StorageStateSaveCommand,
  StorageStateLoadCommand,
  ConsoleCommand,
  ErrorsCommand,
  KeyboardCommand,
  WheelCommand,
  TapCommand,
  ClipboardCommand,
  HighlightCommand,
  ClearCommand,
  SelectAllCommand,
  InnerTextCommand,
  InnerHtmlCommand,
  InputValueCommand,
  SetValueCommand,
  DispatchEventCommand,
  EvaluateHandleCommand,
  ExposeFunctionCommand,
  AddScriptCommand,
  AddStyleCommand,
  EmulateMediaCommand,
  OfflineCommand,
  HeadersCommand,
  PauseCommand,
  GetByAltTextCommand,
  GetByTitleCommand,
  GetByTestIdCommand,
  NthCommand,
  WaitForUrlCommand,
  WaitForLoadStateCommand,
  SetContentCommand,
  TimezoneCommand,
  LocaleCommand,
  HttpCredentialsCommand,
  MouseMoveCommand,
  MouseDownCommand,
  MouseUpCommand,
  WanderCommand,
  MouseTrajectoryCommand,
  BringToFrontCommand,
  WaitForFunctionCommand,
  ScrollIntoViewCommand,
  AddInitScriptCommand,
  KeyDownCommand,
  KeyUpCommand,
  InsertTextCommand,
  MultiSelectCommand,
  WaitForDownloadCommand,
  ResponseBodyCommand,
  ScreencastStartCommand,
  ScreencastStopCommand,
  InputMouseCommand,
  InputKeyboardCommand,
  InputTouchCommand,
  ViewerCommand,
  AskCommand,
  ConfigCommand,
  InjectFocusListenerCommand,
  HistoryCommand,
  SelectorForCommand,
  SelectorsOfCommand,
  ValidateCommand,
} from './commands.js';
import type {
  PluginInstallCommand,
  PluginUninstallCommand,
  PluginUpdateCommand,
  PluginListCommand,
  PluginInfoCommand,
  PluginSearchCommand,
  PluginRunCommand,
  PluginCreateCommand,
} from './plugins.js';
import type { ScrapeCommand, SearchCommand, CrawlCommand, MapCommand } from './crawl.js';
import type { InteractCommand } from './interact.js';

export type Command =
  | PluginInstallCommand
  | PluginUninstallCommand
  | PluginUpdateCommand
  | PluginListCommand
  | PluginInfoCommand
  | PluginSearchCommand
  | PluginRunCommand
  | PluginCreateCommand
  | LaunchCommand
  | NavigateCommand
  | ClickCommand
  | TypeCommand
  | FillCommand
  | CheckCommand
  | UncheckCommand
  | UploadCommand
  | DoubleClickCommand
  | FocusCommand
  | DragCommand
  | GetByRoleCommand
  | GetByTextCommand
  | GetByLabelCommand
  | GetByPlaceholderCommand
  | PressCommand
  | ScreenshotCommand
  | SnapshotCommand
  | EvaluateCommand
  | WaitCommand
  | ScrollCommand
  | SelectCommand
  | HoverCommand
  | ContentCommand
  | CloseCommand
  | TabNewCommand
  | TabListCommand
  | FramesCommand
  | TabSwitchCommand
  | TabCloseCommand
  | WindowNewCommand
  | CookiesGetCommand
  | CookiesSetCommand
  | CookiesClearCommand
  | StorageGetCommand
  | StorageSetCommand
  | StorageClearCommand
  | DialogCommand
  | PdfCommand
  | RouteCommand
  | UnrouteCommand
  | RequestsCommand
  | WebSocketsCommand
  | DownloadCommand
  | GeolocationCommand
  | PermissionsCommand
  | ViewportCommand
  | UserAgentCommand
  | DeviceCommand
  | BackCommand
  | ForwardCommand
  | ReloadCommand
  | UrlCommand
  | TitleCommand
  | GetAttributeCommand
  | GetTextCommand
  | IsVisibleCommand
  | IsEnabledCommand
  | IsCheckedCommand
  | CountCommand
  | BoundingBoxCommand
  | StylesCommand
  | VideoStartCommand
  | VideoStopCommand
  | RecordingStartCommand
  | RecordingStopCommand
  | RecordingRestartCommand
  | RecorderStartCommand
  | RecorderStopCommand
  | RecorderStatusCommand
  | RecorderReplayCommand
  | TraceStartCommand
  | TraceStopCommand
  | HarStartCommand
  | HarStopCommand
  | StorageStateSaveCommand
  | StorageStateLoadCommand
  | ConsoleCommand
  | ErrorsCommand
  | KeyboardCommand
  | WheelCommand
  | TapCommand
  | ClipboardCommand
  | HighlightCommand
  | ClearCommand
  | SelectAllCommand
  | InnerTextCommand
  | InnerHtmlCommand
  | InputValueCommand
  | SetValueCommand
  | DispatchEventCommand
  | EvaluateHandleCommand
  | ExposeFunctionCommand
  | AddScriptCommand
  | AddStyleCommand
  | EmulateMediaCommand
  | OfflineCommand
  | HeadersCommand
  | PauseCommand
  | GetByAltTextCommand
  | GetByTitleCommand
  | GetByTestIdCommand
  | NthCommand
  | WaitForUrlCommand
  | WaitForLoadStateCommand
  | SetContentCommand
  | TimezoneCommand
  | LocaleCommand
  | HttpCredentialsCommand
  | MouseMoveCommand
  | MouseDownCommand
  | MouseUpCommand
  | WanderCommand
  | MouseTrajectoryCommand
  | BringToFrontCommand
  | WaitForFunctionCommand
  | ScrollIntoViewCommand
  | AddInitScriptCommand
  | KeyDownCommand
  | KeyUpCommand
  | InsertTextCommand
  | MultiSelectCommand
  | WaitForDownloadCommand
  | ResponseBodyCommand
  | ScreencastStartCommand
  | ScreencastStopCommand
  | InputMouseCommand
  | InputKeyboardCommand
  | InputTouchCommand
  | ViewerCommand
  | AskCommand
  | ConfigCommand
  | InjectFocusListenerCommand
  | HistoryCommand
  | SelectorForCommand
  | SelectorsOfCommand
  | ValidateCommand
  | ScrapeCommand
  | SearchCommand
  | InteractCommand
  | CrawlCommand
  | MapCommand;

export interface LooseCommand {
  id: string;
  action: string;
  [key: string]: unknown;
}

export type AnyCommand = Command | LooseCommand;
