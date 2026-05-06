import type { ScreencastFrame } from './browser.js';

let screencastFrameCallback: ((frame: ScreencastFrame) => void) | null = null;

export function setScreencastFrameCallback(
  callback: ((frame: ScreencastFrame) => void) | null
): void {
  screencastFrameCallback = callback;
}

export function getScreencastFrameCallback(): ((frame: ScreencastFrame) => void) | null {
  return screencastFrameCallback;
}

export interface BrowserEventCallbacks {
  onTabCreated?: (event: { index: number; url: string; title: string }) => void;
  onTabClosed?: (event: { index: number; remainingTabs: number }) => void;
  onTabSwitched?: (event: { fromIndex: number; toIndex: number }) => void;
  onNavigation?: (event: { url: string; title: string }) => void;
}

let eventCallbacks: BrowserEventCallbacks = {};

export function setEventCallbacks(callbacks: BrowserEventCallbacks): void {
  eventCallbacks = { ...eventCallbacks, ...callbacks };
}

export function getEventCallbacks(): BrowserEventCallbacks {
  return eventCallbacks;
}
