export type { StreamState, StreamStateConfig, StateChangeCallback } from './frame-processor.js';
export {
  STATE_CONFIGS,
  StreamStateManager,
  FrameRateController,
  FrameProcessor,
  cropFrameForElement,
} from './frame-processor.js';
export type { CropConfig } from './frame-processor.js';

export type { ClientState } from './client-state.js';

export { getElementBox } from './element-utils.js';

export { isAllowedOrigin, isCommandMessage } from './messages.js';
export type {
  FrameMessage,
  InputMouseMessage,
  InputKeyboardMessage,
  InputTouchMessage,
  InputTextMessage,
  KeyboardDownMessage,
  KeyboardUpMessage,
  KeyboardInsertTextMessage,
  InputFillMessage,
  InputBlurElementMessage,
  StatusMessage,
  ErrorMessage,
  TabCreatedMessage,
  TabClosedMessage,
  TabSwitchedMessage,
  NavigationMessage,
  UserActivityMessage,
  InputFocusedMessage,
  InputValueMessage,
  InputBlurMessage,
  StreamMessage,
} from './messages.js';

export { handleInputEvent } from './input-handler.js';
export type { InputMessage } from './input-handler.js';
