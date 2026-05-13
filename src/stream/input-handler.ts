import type { BrowserManager } from '../browser/index.js';
import type { StreamStateManager } from './frame-processor.js';
import type {
  InputMouseMessage,
  InputKeyboardMessage,
  InputTouchMessage,
  InputTextMessage,
  KeyboardDownMessage,
  KeyboardUpMessage,
  KeyboardInsertTextMessage,
  InputFillMessage,
  InputBlurElementMessage,
  UserActivityMessage,
} from './messages.js';

export type InputMessage =
  | InputMouseMessage
  | InputKeyboardMessage
  | InputTouchMessage
  | InputTextMessage
  | KeyboardDownMessage
  | KeyboardUpMessage
  | KeyboardInsertTextMessage
  | InputFillMessage
  | InputBlurElementMessage
  | UserActivityMessage;

export async function handleInputEvent(
  message: InputMessage,
  browser: BrowserManager,
  stateManager: StreamStateManager,
  inputFillDebounceMap?: Map<
    string,
    { timer: ReturnType<typeof setTimeout>; text: string; selector: string }
  >,
  inputFillDebounceMs?: number
): Promise<void> {
  switch (message.type) {
    case 'input_mouse':
      stateManager.onUserInteraction();
      await browser.injectMouseEvent({
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
      stateManager.onUserInteraction();
      await browser.injectKeyboardEvent({
        type: message.eventType,
        key: message.key,
        code: message.code,
        text: message.text,
        modifiers: message.modifiers,
      });
      break;

    case 'input_touch':
      stateManager.onUserInteraction();
      await browser.injectTouchEvent({
        type: message.eventType,
        touchPoints: message.touchPoints,
        modifiers: message.modifiers,
      });
      break;

    case 'input_text':
      stateManager.onUserInteraction();
      await browser.insertText(message.text);
      break;

    case 'keyboard_down':
      stateManager.onUserInteraction();
      await browser.getPage().keyboard.down(message.key);
      break;

    case 'keyboard_up':
      await browser.getPage().keyboard.up(message.key);
      break;

    case 'keyboard_insert_text':
      stateManager.onUserInteraction();
      await browser.getPage().keyboard.insertText(message.text);
      break;

    case 'input_fill': {
      const sel = (message as InputFillMessage).selector || '';
      const txt = (message as InputFillMessage).text || '';
      if (inputFillDebounceMap && inputFillDebounceMs) {
        const key = sel || '__global__';
        const prev = inputFillDebounceMap.get(key);
        if (prev) clearTimeout(prev.timer);
        const timer = setTimeout(async () => {
          inputFillDebounceMap.delete(key);
          try {
            await browser.fillValue(sel, txt);
          } catch (e) {
            console.error('[StreamServer] input_fill debounce error:', (e as Error).message);
          }
        }, inputFillDebounceMs);
        inputFillDebounceMap.set(key, { timer, text: txt, selector: sel });
      } else {
        await browser.fillValue(sel, txt);
      }
      break;
    }

    case 'input_blur_element':
      await browser.blurElement((message as InputBlurElementMessage).selector || '');
      break;

    case 'user_activity':
      stateManager.onUserInteraction();
      break;
  }
}
