import type { BrowserManager, ScreencastFrame } from '../browser/index.js';
import type {
  Command,
  Response,
  ScreencastStartCommand,
  ScreencastStartData,
  ScreencastStopCommand,
  ScreencastStopData,
  InputMouseCommand,
  InputKeyboardCommand,
  InputTouchCommand,
  InputEventData,
} from '../types.js';
import { successResponse } from '../protocol.js';
import { getScreencastFrameCallback } from '../browser-events.js';

export async function handleScreencastStart(
  command: ScreencastStartCommand,
  browser: BrowserManager
): Promise<Response<ScreencastStartData>> {
  const screencastFrameCallback = getScreencastFrameCallback();
  if (!screencastFrameCallback) {
    throw new Error('Screencast frame callback not set. Start the streaming server first.');
  }

  await browser.startScreencast(screencastFrameCallback, {
    format: command.format,
    quality: command.quality,
    maxWidth: command.maxWidth,
    maxHeight: command.maxHeight,
    everyNthFrame: command.everyNthFrame,
  });

  return successResponse(command.id, {
    started: true,
    format: command.format ?? 'jpeg',
    quality: command.quality ?? 80,
  });
}

export async function handleScreencastStop(
  command: ScreencastStopCommand,
  browser: BrowserManager
): Promise<Response<ScreencastStopData>> {
  await browser.stopScreencast();
  return successResponse(command.id, { stopped: true });
}

export async function handleInputMouse(
  command: InputMouseCommand,
  browser: BrowserManager
): Promise<Response<InputEventData>> {
  await browser.injectMouseEvent({
    type: command.type,
    x: command.x,
    y: command.y,
    button: command.button,
    clickCount: command.clickCount,
    deltaX: command.deltaX,
    deltaY: command.deltaY,
    modifiers: command.modifiers,
  });
  return successResponse(command.id, { injected: true });
}

export async function handleInputKeyboard(
  command: InputKeyboardCommand,
  browser: BrowserManager
): Promise<Response<InputEventData>> {
  await browser.injectKeyboardEvent({
    type: command.type,
    key: command.key,
    code: command.code,
    text: command.text,
    modifiers: command.modifiers,
  });
  return successResponse(command.id, { injected: true });
}

export async function handleInputTouch(
  command: InputTouchCommand,
  browser: BrowserManager
): Promise<Response<InputEventData>> {
  await browser.injectTouchEvent({
    type: command.type,
    touchPoints: command.touchPoints,
    modifiers: command.modifiers,
  });
  return successResponse(command.id, { injected: true });
}
