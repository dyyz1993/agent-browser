import type { Page, Frame } from 'playwright-core';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { BrowserManager, ScreencastFrame } from './browser.js';
import { getAppDir, getSession, getInstanceId } from './daemon.js';
import { getEnhancedSnapshot } from './snapshot.js';
import { performDiff } from './diff.js';
import { MessageBridge } from './message-bridge.js';
import {
  humanClick,
  humanType,
  humanMoveTo,
  humanWander,
  getHumanConfigFromEnv,
  type HumanConfig,
} from './human-mouse.js';
import type {
  Command,
  AnyCommand,
  Response,
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
  EvaluateCommand,
  WaitCommand,
  ScrollCommand,
  SelectCommand,
  HoverCommand,
  ContentCommand,
  TabNewCommand,
  TabSwitchCommand,
  TabCloseCommand,
  WindowNewCommand,
  CookiesSetCommand,
  StorageGetCommand,
  StorageSetCommand,
  StorageClearCommand,
  DialogCommand,
  PdfCommand,
  RouteCommand,
  RequestsCommand,
  DownloadCommand,
  GeolocationCommand,
  PermissionsCommand,
  ViewportCommand,
  DeviceCommand,
  GetAttributeCommand,
  GetTextCommand,
  IsVisibleCommand,
  IsEnabledCommand,
  IsCheckedCommand,
  CountCommand,
  BoundingBoxCommand,
  StylesCommand,
  TraceStartCommand,
  TraceStopCommand,
  HarStopCommand,
  StorageStateSaveCommand,
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
  AddScriptCommand,
  AddStyleCommand,
  EmulateMediaCommand,
  OfflineCommand,
  HeadersCommand,
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
  RecordingStartCommand,
  RecordingStopCommand,
  RecordingRestartCommand,
  RecorderStartCommand,
  RecorderStopCommand,
  RecorderStatusCommand,
  NavigateData,
  ScreenshotData,
  EvaluateData,
  ContentData,
  TabListData,
  TabNewData,
  TabSwitchData,
  TabCloseData,
  ScreencastStartData,
  ScreencastStopData,
  RecordingStartData,
  RecordingStopData,
  RecordingRestartData,
  InputEventData,
  StylesData,
  ViewerData,
  AskData,
} from './types.js';
import { successResponse, errorResponse } from './protocol.js';

// Callback for screencast frames - will be set by the daemon when streaming is active
let screencastFrameCallback: ((frame: ScreencastFrame) => void) | null = null;

/**
 * Set the callback for screencast frames
 * This is called by the daemon to set up frame streaming
 */
export function setScreencastFrameCallback(
  callback: ((frame: ScreencastFrame) => void) | null
): void {
  screencastFrameCallback = callback;
}

/**
 * Browser event callbacks for real-time broadcasting
 * Used by StreamServer to push browser events to WebSocket clients
 */
export interface BrowserEventCallbacks {
  onTabCreated?: (event: { index: number; url: string; title: string }) => void;
  onTabClosed?: (event: { index: number; remainingTabs: number }) => void;
  onTabSwitched?: (event: { fromIndex: number; toIndex: number }) => void;
  onNavigation?: (event: { url: string; title: string }) => void;
}

// Event callbacks registered by StreamServer or other listeners
let eventCallbacks: BrowserEventCallbacks = {};

/**
 * Set browser event callbacks for real-time broadcasting
 * This is called by StreamServer to register event listeners
 */
export function setEventCallbacks(callbacks: BrowserEventCallbacks): void {
  eventCallbacks = { ...eventCallbacks, ...callbacks };
}

/**
 * Get the current event callbacks
 * This is called by BrowserManager to trigger events
 */
export function getEventCallbacks(): BrowserEventCallbacks {
  return eventCallbacks;
}

// Snapshot response type
interface SnapshotData {
  snapshot: string;
  refs?: Record<string, { role: string; name?: string }>;
}

/**
 * Convert Playwright errors to AI-friendly messages
 * @internal Exported for testing
 */
export function toAIFriendlyError(error: unknown, selector: string): Error {
  const message = error instanceof Error ? error.message : String(error);

  // Handle strict mode violation (multiple elements match)
  if (message.includes('strict mode violation')) {
    // Extract count if available
    const countMatch = message.match(/resolved to (\d+) elements/);
    const count = countMatch ? countMatch[1] : 'multiple';

    return new Error(
      `Selector "${selector}" matched ${count} elements. ` +
        `Run 'snapshot' to get updated refs, or use a more specific CSS selector.`
    );
  }

  // Handle element not interactable (must be checked BEFORE timeout case)
  // This includes cases where an overlay/modal blocks the element
  if (message.includes('intercepts pointer events')) {
    return new Error(
      `Element "${selector}" is blocked by another element (likely a modal or overlay). ` +
        `Try dismissing any modals/cookie banners first.`
    );
  }

  // Handle element not visible
  if (message.includes('not visible') && !message.includes('Timeout')) {
    return new Error(
      `Element "${selector}" is not visible. ` +
        `Try scrolling it into view or check if it's hidden.`
    );
  }

  // Handle general timeout (element exists but action couldn't complete)
  if (message.includes('Timeout') && message.includes('exceeded')) {
    return new Error(
      `Action on "${selector}" timed out. The element may be blocked, still loading, or not interactable. ` +
        `Run 'snapshot' to check the current page state.`
    );
  }

  // Handle element not found (timeout waiting for element)
  if (
    message.includes('waiting for') &&
    (message.includes('to be visible') || message.includes('Timeout'))
  ) {
    return new Error(
      `Element "${selector}" not found or not visible. ` +
        `Run 'snapshot' to see current page elements.`
    );
  }

  // Return original error for unknown cases
  return error instanceof Error ? error : new Error(message);
}

/**
 * Execute a command and return a response
 */
export async function executeCommand(
  command: AnyCommand,
  browser: BrowserManager
): Promise<Response> {
  try {
    const cmd = command as Command;
    switch (cmd.action) {
      case 'launch':
        return await handleLaunch(cmd, browser);
      case 'navigate':
        return await handleNavigate(cmd, browser);
      case 'click':
        return await handleClick(cmd, browser);
      case 'type':
        return await handleType(cmd, browser);
      case 'fill':
        return await handleFill(cmd, browser);
      case 'check':
        return await handleCheck(cmd, browser);
      case 'uncheck':
        return await handleUncheck(cmd, browser);
      case 'upload':
        return await handleUpload(cmd, browser);
      case 'dblclick':
        return await handleDoubleClick(cmd, browser);
      case 'focus':
        return await handleFocus(cmd, browser);
      case 'drag':
        return await handleDrag(cmd, browser);
      case 'getbyrole':
        return await handleGetByRole(cmd, browser);
      case 'getbytext':
        return await handleGetByText(cmd, browser);
      case 'getbylabel':
        return await handleGetByLabel(cmd, browser);
      case 'getbyplaceholder':
        return await handleGetByPlaceholder(cmd, browser);
      case 'press':
        return await handlePress(cmd, browser);
      case 'screenshot':
        return await handleScreenshot(cmd, browser);
      case 'snapshot':
        return await handleSnapshot(cmd, browser);
      case 'evaluate':
        return await handleEvaluate(cmd, browser);
      case 'wait':
        return await handleWait(cmd, browser);
      case 'scroll':
        return await handleScroll(cmd, browser);
      case 'select':
        return await handleSelect(cmd, browser);
      case 'hover':
        return await handleHover(cmd, browser);
      case 'content':
        return await handleContent(cmd, browser);
      case 'close':
        return await handleClose(cmd, browser);
      case 'tab_new':
        return await handleTabNew(cmd, browser);
      case 'tab_list':
        return await handleTabList(cmd, browser);
      case 'tab_switch':
        return await handleTabSwitch(cmd, browser);
      case 'tab_close':
        return await handleTabClose(cmd, browser);
      case 'window_new':
        return await handleWindowNew(cmd, browser);
      case 'cookies_get':
        return await handleCookiesGet(cmd, browser);
      case 'cookies_set':
        return await handleCookiesSet(cmd, browser);
      case 'cookies_clear':
        return await handleCookiesClear(cmd, browser);
      case 'storage_get':
        return await handleStorageGet(cmd, browser);
      case 'storage_set':
        return await handleStorageSet(cmd, browser);
      case 'storage_clear':
        return await handleStorageClear(cmd, browser);
      case 'dialog':
        return await handleDialog(cmd, browser);
      case 'pdf':
        return await handlePdf(cmd, browser);
      case 'route':
        return await handleRoute(cmd, browser);
      case 'unroute':
        return await handleUnroute(cmd, browser);
      case 'requests':
        return await handleRequests(cmd, browser);
      case 'download':
        return await handleDownload(cmd, browser);
      case 'geolocation':
        return await handleGeolocation(cmd, browser);
      case 'permissions':
        return await handlePermissions(cmd, browser);
      case 'viewport':
        return await handleViewport(cmd, browser);
      case 'useragent':
        return await handleUserAgent(cmd, browser);
      case 'device':
        return await handleDevice(cmd, browser);
      case 'back':
        return await handleBack(cmd, browser);
      case 'forward':
        return await handleForward(cmd, browser);
      case 'reload':
        return await handleReload(cmd, browser);
      case 'url':
        return await handleUrl(cmd, browser);
      case 'title':
        return await handleTitle(cmd, browser);
      case 'getattribute':
        return await handleGetAttribute(cmd, browser);
      case 'gettext':
        return await handleGetText(cmd, browser);
      case 'isvisible':
        return await handleIsVisible(cmd, browser);
      case 'isenabled':
        return await handleIsEnabled(cmd, browser);
      case 'ischecked':
        return await handleIsChecked(cmd, browser);
      case 'count':
        return await handleCount(cmd, browser);
      case 'boundingbox':
        return await handleBoundingBox(cmd, browser);
      case 'styles':
        return await handleStyles(cmd, browser);
      case 'video_start':
        return await handleVideoStart(cmd, browser);
      case 'video_stop':
        return await handleVideoStop(cmd, browser);
      case 'trace_start':
        return await handleTraceStart(cmd, browser);
      case 'trace_stop':
        return await handleTraceStop(cmd, browser);
      case 'har_start':
        return await handleHarStart(cmd, browser);
      case 'har_stop':
        return await handleHarStop(cmd, browser);
      case 'state_save':
        return await handleStateSave(cmd, browser);
      case 'state_load':
        return await handleStateLoad(cmd, browser);
      case 'console':
        return await handleConsole(cmd, browser);
      case 'errors':
        return await handleErrors(cmd, browser);
      case 'keyboard':
        return await handleKeyboard(cmd, browser);
      case 'wheel':
        return await handleWheel(cmd, browser);
      case 'tap':
        return await handleTap(cmd, browser);
      case 'clipboard':
        return await handleClipboard(cmd, browser);
      case 'highlight':
        return await handleHighlight(cmd, browser);
      case 'clear':
        return await handleClear(cmd, browser);
      case 'selectall':
        return await handleSelectAll(cmd, browser);
      case 'innertext':
        return await handleInnerText(cmd, browser);
      case 'innerhtml':
        return await handleInnerHtml(cmd, browser);
      case 'inputvalue':
        return await handleInputValue(cmd, browser);
      case 'setvalue':
        return await handleSetValue(cmd, browser);
      case 'dispatch':
        return await handleDispatch(cmd, browser);
      case 'evalhandle':
        return await handleEvalHandle(cmd, browser);
      case 'expose':
        return await handleExpose(cmd, browser);
      case 'addscript':
        return await handleAddScript(cmd, browser);
      case 'addstyle':
        return await handleAddStyle(cmd, browser);
      case 'emulatemedia':
        return await handleEmulateMedia(cmd, browser);
      case 'offline':
        return await handleOffline(cmd, browser);
      case 'headers':
        return await handleHeaders(cmd, browser);
      case 'pause':
        return await handlePause(cmd, browser);
      case 'getbyalttext':
        return await handleGetByAltText(cmd, browser);
      case 'getbytitle':
        return await handleGetByTitle(cmd, browser);
      case 'getbytestid':
        return await handleGetByTestId(cmd, browser);
      case 'nth':
        return await handleNth(cmd, browser);
      case 'waitforurl':
        return await handleWaitForUrl(cmd, browser);
      case 'waitforloadstate':
        return await handleWaitForLoadState(cmd, browser);
      case 'setcontent':
        return await handleSetContent(cmd, browser);
      case 'timezone':
        return await handleTimezone(cmd, browser);
      case 'locale':
        return await handleLocale(cmd, browser);
      case 'credentials':
        return await handleCredentials(cmd, browser);
      case 'mousemove':
        return await handleMouseMove(cmd, browser);
      case 'mousedown':
        return await handleMouseDown(cmd, browser);
      case 'mouseup':
        return await handleMouseUp(cmd, browser);
      case 'wander':
        return await handleWander(cmd, browser);
      case 'bringtofront':
        return await handleBringToFront(cmd, browser);
      case 'waitforfunction':
        return await handleWaitForFunction(cmd, browser);
      case 'scrollintoview':
        return await handleScrollIntoView(cmd, browser);
      case 'addinitscript':
        return await handleAddInitScript(cmd, browser);
      case 'keydown':
        return await handleKeyDown(cmd, browser);
      case 'keyup':
        return await handleKeyUp(cmd, browser);
      case 'inserttext':
        return await handleInsertText(cmd, browser);
      case 'multiselect':
        return await handleMultiSelect(cmd, browser);
      case 'waitfordownload':
        return await handleWaitForDownload(cmd, browser);
      case 'responsebody':
        return await handleResponseBody(cmd, browser);
      case 'screencast_start':
        return await handleScreencastStart(cmd, browser);
      case 'screencast_stop':
        return await handleScreencastStop(cmd, browser);
      case 'input_mouse':
        return await handleInputMouse(cmd, browser);
      case 'input_keyboard':
        return await handleInputKeyboard(cmd, browser);
      case 'input_touch':
        return await handleInputTouch(cmd, browser);
      case 'recording_start':
        return await handleRecordingStart(cmd, browser);
      case 'recording_stop':
        return await handleRecordingStop(cmd, browser);
      case 'recording_restart':
        return await handleRecordingRestart(cmd, browser);
      case 'recorder_start':
        return await handleRecorderStart(cmd, browser);
      case 'recorder_stop':
        return await handleRecorderStop(cmd, browser);
      case 'recorder_status':
        return await handleRecorderStatus(cmd, browser);
      case 'viewer':
        return await handleViewer(cmd, browser);
      case 'ask':
        return await handleAsk(cmd, browser);
      case 'config':
        return handleConfig(cmd);
      default: {
        const unknownCommand = cmd as { id: string; action: string };
        return errorResponse(unknownCommand.id, `Unknown action: ${unknownCommand.action}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(command.id, message);
  }
}

async function handleLaunch(
  command: Command & { action: 'launch' },
  browser: BrowserManager
): Promise<Response> {
  await browser.launch(command);
  const instanceId = getInstanceId();
  return successResponse(command.id, {
    launched: true,
    instanceId,
    viewerUrl: `http://localhost:5005/view?instanceId=${instanceId}`,
  });
}

async function handleNavigate(
  command: NavigateCommand,
  browser: BrowserManager
): Promise<Response<NavigateData>> {
  const page = browser.getPage();

  if (command.headers && Object.keys(command.headers).length > 0) {
    await browser.setScopedHeaders(command.url, command.headers);
  }

  await page.goto(command.url, {
    waitUntil: command.waitUntil ?? 'load',
  });

  return successResponse(command.id, {
    url: page.url(),
    title: await page.title(),
  });
}

async function handleClick(command: ClickCommand, browser: BrowserManager): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);

  if (command.human?.enabled) {
    const diffResult = await performDiff(locator, command.diffScope, async () => {
      try {
        const page = browser.getPage();
        const box = await locator.boundingBox();
        if (!box) {
          throw new Error(`Element not visible: ${command.selector}`);
        }
        const targetX = box.x + box.width / 2;
        const targetY = box.y + box.height / 2;

        await humanClick(page, targetX, targetY, command.human as HumanConfig, {
          button: command.button,
          clickCount: command.clickCount,
        });
      } catch (error) {
        throw toAIFriendlyError(error, command.selector);
      }
    });

    const result: Record<string, unknown> = { clicked: true, human: true };
    if (diffResult) {
      result.diff = diffResult.output;
      result.diffScope = diffResult.diff.scope;
    }
    return successResponse(command.id, result);
  }

  const diffResult = await performDiff(locator, command.diffScope, async () => {
    try {
      await locator.click({
        button: command.button,
        clickCount: command.clickCount,
        delay: command.delay,
      });
    } catch (error) {
      throw toAIFriendlyError(error, command.selector);
    }
  });

  const result: Record<string, unknown> = { clicked: true };
  if (diffResult) {
    result.diff = diffResult.output;
    result.diffScope = diffResult.diff.scope;
  }

  return successResponse(command.id, result);
}

async function handleType(command: TypeCommand, browser: BrowserManager): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);

  if (command.human?.enabled) {
    const diffResult = await performDiff(locator, command.diffScope, async () => {
      try {
        const page = browser.getPage();
        const box = await locator.boundingBox();
        if (!box) {
          throw new Error(`Element not visible: ${command.selector}`);
        }
        const targetX = box.x + box.width / 2;
        const targetY = box.y + box.height / 2;

        await humanClick(page, targetX, targetY, command.human as HumanConfig);
        await locator.focus();
        await humanType(page, command.text, command.human as HumanConfig);
      } catch (error) {
        throw toAIFriendlyError(error, command.selector);
      }
    });

    const result: Record<string, unknown> = { typed: true, human: true };
    if (diffResult) {
      result.diff = diffResult.output;
      result.diffScope = diffResult.diff.scope;
    }
    return successResponse(command.id, result);
  }

  const diffResult = await performDiff(locator, command.diffScope, async () => {
    try {
      if (command.clear) {
        await locator.fill('');
      }

      await locator.pressSequentially(command.text, {
        delay: command.delay,
      });

      await locator.evaluate((el) => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    } catch (error) {
      throw toAIFriendlyError(error, command.selector);
    }
  });

  const result: Record<string, unknown> = { typed: true };
  if (diffResult) {
    result.diff = diffResult.output;
    result.diffScope = diffResult.diff.scope;
  }

  return successResponse(command.id, result);
}

async function handlePress(command: PressCommand, browser: BrowserManager): Promise<Response> {
  const page = browser.getPage();
  let locator = page.locator('body');

  if (command.inFrame && command.selector) {
    const frameLocator = browser.getFrame(command.inFrame);
    locator = frameLocator.locator(command.selector);
  } else if (command.selector) {
    locator = page.locator(command.selector);
  }

  // Record keyboard action if recording
  const key = command.key;
  const parts = key.split('+');
  const mainKey = parts[parts.length - 1];
  const hasCtrl = parts.includes('Control') || parts.includes('Ctrl');
  const hasMeta = parts.includes('Meta') || parts.includes('Command') || parts.includes('Cmd');
  const hasAlt = parts.includes('Alt');
  const hasShift = parts.includes('Shift');

  browser.recordStep({
    action: 'keyboard',
    key: mainKey,
    code: mainKey,
    ctrlKey: hasCtrl,
    metaKey: hasMeta,
    altKey: hasAlt,
    shiftKey: hasShift,
    selector: command.selector,
  });

  const diffResult = await performDiff(locator, command.diffScope, async () => {
    if (command.inFrame && command.selector) {
      const frameLocator = browser.getFrame(command.inFrame);
      await frameLocator.locator(command.selector).press(command.key);
    } else {
      if (command.selector) {
        await page.press(command.selector, command.key);
      } else {
        await page.keyboard.press(command.key);
      }
    }
  });

  const result: Record<string, unknown> = { pressed: true };
  if (diffResult) {
    result.diff = diffResult.output;
    result.diffScope = diffResult.diff.scope;
  }

  return successResponse(command.id, result);
}

async function handleScreenshot(
  command: ScreenshotCommand,
  browser: BrowserManager
): Promise<Response<ScreenshotData>> {
  const page = browser.getPage();

  const options: Parameters<Page['screenshot']>[0] = {
    fullPage: command.fullPage,
    type: command.format ?? 'png',
  };

  if (command.format === 'jpeg' && command.quality !== undefined) {
    options.quality = command.quality;
  }

  let target: Page | ReturnType<Page['locator']> = page;
  if (command.inFrame) {
    const frameLocator = browser.getFrame(command.inFrame);
    if (command.selector) {
      target = frameLocator.locator(command.selector);
    } else {
      // For full frame screenshot, use locator(':root') on the frame locator
      target = frameLocator.locator(':root');
    }
  } else if (command.selector) {
    target = browser.getLocator(command.selector);
  }

  try {
    let savePath = command.path;
    if (!savePath) {
      const ext = command.format === 'jpeg' ? 'jpg' : 'png';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const random = Math.random().toString(36).substring(2, 8);
      const filename = `screenshot-${timestamp}-${random}.${ext}`;
      const screenshotDir = path.join(getAppDir(), 'tmp', 'screenshots');
      mkdirSync(screenshotDir, { recursive: true });
      savePath = path.join(screenshotDir, filename);
    }

    await target.screenshot({ ...options, path: savePath });
    return successResponse(command.id, { path: savePath });
  } catch (error) {
    if (command.selector) {
      throw toAIFriendlyError(error, command.selector);
    }
    throw error;
  }
}

async function handleSnapshot(
  command: Command & {
    action: 'snapshot';
    interactive?: boolean;
    cursor?: boolean;
    maxDepth?: number;
    compact?: boolean;
    selector?: string;
    inFrame?: string;
    path?: boolean;
    attrs?: boolean;
  },
  browser: BrowserManager
): Promise<Response<SnapshotData>> {
  const snapshot = await browser.getSnapshot({
    interactive: command.interactive,
    cursor: command.cursor,
    maxDepth: command.maxDepth,
    compact: command.compact,
    selector: command.selector,
    framePath: command.inFrame,
    path: command.path,
    attrs: command.attrs,
  });

  const simpleRefs: Record<
    string,
    {
      role: string;
      name?: string;
      xpath?: string;
      cssPath?: string;
      attributes?: Record<string, string>;
    }
  > = {};
  const refs = snapshot.refs || {};
  for (const [ref, data] of Object.entries(refs)) {
    simpleRefs[ref] = {
      role: data.role,
      name: data.name,
      ...(data.xpath && { xpath: data.xpath }),
      ...(data.cssPath && { cssPath: data.cssPath }),
      ...(data.attributes && { attributes: data.attributes }),
    };
  }

  return successResponse(command.id, {
    snapshot: snapshot.tree || 'Empty page',
    refs: Object.keys(simpleRefs).length > 0 ? simpleRefs : undefined,
  });
}

async function handleEvaluate(
  command: EvaluateCommand,
  browser: BrowserManager
): Promise<Response> {
  try {
    let script: string;
    if (command.file) {
      if (!existsSync(command.file)) {
        throw new Error(`Script file not found: ${command.file}`);
      }
      script = readFileSync(command.file, 'utf-8');
    } else if (command.script) {
      script = command.script;
    } else {
      throw new Error('Either script or file must be provided for evaluate command');
    }

    let result;
    if (command.inFrame) {
      const frameLocator = browser.getFrame(command.inFrame);
      result = await frameLocator.locator(':root').evaluate(script);
    } else {
      const page = browser.getPage();
      result = await page.evaluate(script);
    }

    return successResponse(command.id, { result });
  } catch (error) {
    console.error('Error in handleEvaluate:', error);
    return errorResponse(command.id, error instanceof Error ? error.message : String(error));
  }
}

async function handleWait(command: WaitCommand, browser: BrowserManager): Promise<Response> {
  const humanConfig = getHumanConfigFromEnv();
  const page = browser.getPage();

  // If human mode is enabled and waiting for a duration, do mouse wander
  if (humanConfig.enabled && command.timeout && !command.selector) {
    await humanWander(page, humanConfig, { duration: command.timeout });
    return successResponse(command.id, { waited: true, wandered: true });
  }

  if (command.inFrame) {
    const frame = browser.getFrame(command.inFrame);
    if (command.selector) {
      await frame.waitForSelector(command.selector, {
        state: command.state ?? 'visible',
        timeout: command.timeout,
      });
    } else if (command.timeout) {
      await frame.waitForTimeout(command.timeout);
    } else {
      await frame.waitForLoadState('load');
    }
  } else {
    const frame = browser.getFrame();
    if (command.selector) {
      await frame.waitForSelector(command.selector, {
        state: command.state ?? 'visible',
        timeout: command.timeout,
      });
    } else if (command.timeout) {
      await frame.waitForTimeout(command.timeout);
    } else {
      await frame.waitForLoadState('load');
    }
  }

  return successResponse(command.id, { waited: true });
}

async function handleScroll(command: ScrollCommand, browser: BrowserManager): Promise<Response> {
  const page = browser.getPage();

  if (command.selector) {
    const element = page.locator(command.selector);
    await element.scrollIntoViewIfNeeded();

    if (command.x !== undefined || command.y !== undefined) {
      await element.evaluate(
        (el, { x, y }) => {
          if ('scrollBy' in el) {
            (el as HTMLElement).scrollBy(x ?? 0, y ?? 0);
          }
        },
        { x: command.x, y: command.y }
      );
    }
  } else {
    // Scroll the page
    let deltaX = command.x ?? 0;
    let deltaY = command.y ?? 0;

    if (command.direction) {
      const amount = command.amount ?? 100;
      switch (command.direction) {
        case 'up':
          deltaY = -amount;
          break;
        case 'down':
          deltaY = amount;
          break;
        case 'left':
          deltaX = -amount;
          break;
        case 'right':
          deltaX = amount;
          break;
      }
    }

    await page.evaluate(`window.scrollBy(${deltaX}, ${deltaY})`);
  }

  return successResponse(command.id, { scrolled: true });
}

async function handleSelect(command: SelectCommand, browser: BrowserManager): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const values = Array.isArray(command.values) ? command.values : [command.values];

  const diffResult = await performDiff(locator, command.diffScope, async () => {
    try {
      await locator.selectOption(values);
      await locator.evaluate((el) => {
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    } catch (error) {
      throw toAIFriendlyError(error, command.selector);
    }
  });

  const result: Record<string, unknown> = { selected: values };
  if (diffResult) {
    result.diff = diffResult.output;
    result.diffScope = diffResult.diff.scope;
  }

  return successResponse(command.id, result);
}

async function handleHover(command: HoverCommand, browser: BrowserManager): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);

  if (command.human?.enabled) {
    const diffResult = await performDiff(locator, command.diffScope, async () => {
      try {
        const page = browser.getPage();
        const box = await locator.boundingBox();
        if (!box) {
          throw new Error(`Element not visible: ${command.selector}`);
        }
        const targetX = box.x + box.width / 2;
        const targetY = box.y + box.height / 2;

        await humanMoveTo(page, { x: targetX, y: targetY }, command.human as HumanConfig);
      } catch (error) {
        throw toAIFriendlyError(error, command.selector);
      }
    });

    const result: Record<string, unknown> = { hovered: true, human: true };
    if (diffResult) {
      result.diff = diffResult.output;
      result.diffScope = diffResult.diff.scope;
    }
    return successResponse(command.id, result);
  }

  const diffResult = await performDiff(locator, command.diffScope, async () => {
    try {
      await locator.hover();
    } catch (error) {
      throw toAIFriendlyError(error, command.selector);
    }
  });

  const result: Record<string, unknown> = { hovered: true };
  if (diffResult) {
    result.diff = diffResult.output;
    result.diffScope = diffResult.diff.scope;
  }

  return successResponse(command.id, result);
}

async function handleContent(
  command: ContentCommand,
  browser: BrowserManager
): Promise<Response<ContentData>> {
  const page = browser.getPage();

  let html: string;
  if (command.selector) {
    html = await page.locator(command.selector).innerHTML();
  } else {
    html = await page.content();
  }

  return successResponse(command.id, { html });
}

async function handleClose(
  command: Command & { action: 'close' },
  browser: BrowserManager
): Promise<Response> {
  await browser.close();
  return successResponse(command.id, { closed: true });
}

async function handleTabNew(
  command: TabNewCommand,
  browser: BrowserManager
): Promise<Response<TabNewData>> {
  const result = await browser.newTab();

  // Navigate to URL if provided (same pattern as handleNavigate)
  if (command.url) {
    const page = browser.getPage();
    await page.goto(command.url, { waitUntil: 'domcontentloaded' });
  }

  return successResponse(command.id, result);
}

async function handleTabList(
  command: Command & { action: 'tab_list' },
  browser: BrowserManager
): Promise<Response<TabListData>> {
  const tabs = await browser.listTabs();
  return successResponse(command.id, {
    tabs,
    active: browser.getActiveIndex(),
  });
}

async function handleTabSwitch(
  command: TabSwitchCommand,
  browser: BrowserManager
): Promise<Response<TabSwitchData>> {
  const result = await browser.switchTo(command.index);
  const page = browser.getPage();
  return successResponse(command.id, {
    ...result,
    title: await page.title(),
  });
}

async function handleTabClose(
  command: TabCloseCommand,
  browser: BrowserManager
): Promise<Response<TabCloseData>> {
  const result = await browser.closeTab(command.index);
  return successResponse(command.id, result);
}

async function handleWindowNew(
  command: WindowNewCommand,
  browser: BrowserManager
): Promise<Response<TabNewData>> {
  const result = await browser.newWindow(command.viewport);
  return successResponse(command.id, result);
}

// New handlers for enhanced Playwright parity

async function handleFill(command: FillCommand, browser: BrowserManager): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);

  if (command.human?.enabled) {
    const diffResult = await performDiff(locator, command.diffScope, async () => {
      try {
        const page = browser.getPage();
        const box = await locator.boundingBox();
        if (!box) {
          throw new Error(`Element not visible: ${command.selector}`);
        }
        const targetX = box.x + box.width / 2;
        const targetY = box.y + box.height / 2;

        await humanClick(page, targetX, targetY, command.human as HumanConfig);
        await locator.focus();
        await humanType(page, command.value, command.human as HumanConfig);
      } catch (error) {
        throw toAIFriendlyError(error, command.selector);
      }
    });

    const result: Record<string, unknown> = { filled: true, human: true };
    if (diffResult) {
      result.diff = diffResult.output;
      result.diffScope = diffResult.diff.scope;
    }
    return successResponse(command.id, result);
  }

  const diffResult = await performDiff(locator, command.diffScope, async () => {
    try {
      await locator.fill(command.value);
      // Trigger input event for recorder
      await locator.evaluate((el) => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    } catch (error) {
      throw toAIFriendlyError(error, command.selector);
    }
  });

  const result: Record<string, unknown> = { filled: true };
  if (diffResult) {
    result.diff = diffResult.output;
    result.diffScope = diffResult.diff.scope;
  }
  return successResponse(command.id, result);
}

async function handleCheck(command: CheckCommand, browser: BrowserManager): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);

  const diffResult = await performDiff(locator, command.diffScope, async () => {
    try {
      await locator.check();
      await locator.evaluate((el) => {
        el.dispatchEvent(new Event('click', { bubbles: true }));
      });
    } catch (error) {
      throw toAIFriendlyError(error, command.selector);
    }
  });

  const result: Record<string, unknown> = { checked: true };
  if (diffResult) {
    result.diff = diffResult.output;
    result.diffScope = diffResult.diff.scope;
  }
  return successResponse(command.id, result);
}

async function handleUncheck(command: UncheckCommand, browser: BrowserManager): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);

  const diffResult = await performDiff(locator, command.diffScope, async () => {
    try {
      await locator.uncheck();
      await locator.evaluate((el) => {
        el.dispatchEvent(new Event('click', { bubbles: true }));
      });
    } catch (error) {
      throw toAIFriendlyError(error, command.selector);
    }
  });

  const result: Record<string, unknown> = { unchecked: true };
  if (diffResult) {
    result.diff = diffResult.output;
    result.diffScope = diffResult.diff.scope;
  }
  return successResponse(command.id, result);
}

async function handleUpload(command: UploadCommand, browser: BrowserManager): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const files = Array.isArray(command.files) ? command.files : [command.files];
  try {
    await locator.setInputFiles(files);
  } catch (error) {
    throw toAIFriendlyError(error, command.selector);
  }
  return successResponse(command.id, { uploaded: files });
}

async function handleDoubleClick(
  command: DoubleClickCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);

  if (command.human?.enabled) {
    const diffResult = await performDiff(locator, command.diffScope, async () => {
      try {
        const page = browser.getPage();
        const box = await locator.boundingBox();
        if (!box) {
          throw new Error(`Element not visible: ${command.selector}`);
        }
        const targetX = box.x + box.width / 2;
        const targetY = box.y + box.height / 2;

        await humanClick(page, targetX, targetY, command.human as HumanConfig, {
          clickCount: 2,
        });
      } catch (error) {
        throw toAIFriendlyError(error, command.selector);
      }
    });

    const result: Record<string, unknown> = { clicked: true, human: true };
    if (diffResult) {
      result.diff = diffResult.output;
      result.diffScope = diffResult.diff.scope;
    }
    return successResponse(command.id, result);
  }

  const diffResult = await performDiff(locator, command.diffScope, async () => {
    try {
      await locator.dblclick();
    } catch (error) {
      throw toAIFriendlyError(error, command.selector);
    }
  });

  const result: Record<string, unknown> = { clicked: true };
  if (diffResult) {
    result.diff = diffResult.output;
    result.diffScope = diffResult.diff.scope;
  }
  return successResponse(command.id, result);
}

async function handleFocus(command: FocusCommand, browser: BrowserManager): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);

  const diffResult = await performDiff(locator, command.diffScope, async () => {
    try {
      await locator.focus({ timeout: 5000 });
    } catch (error) {
      throw toAIFriendlyError(error, command.selector);
    }
  });

  const result: Record<string, unknown> = { focused: true };
  if (diffResult) {
    result.diff = diffResult.output;
    result.diffScope = diffResult.diff.scope;
  }
  return successResponse(command.id, result);
}

async function handleDrag(command: DragCommand, browser: BrowserManager): Promise<Response> {
  const sourceLocator = browser.getLocator(command.source, command.inFrame);
  const targetLocator = browser.getLocator(command.target, command.inFrame);
  await sourceLocator.dragTo(targetLocator);
  return successResponse(command.id, { dragged: true });
}

async function handleGetByRole(
  command: GetByRoleCommand,
  browser: BrowserManager
): Promise<Response> {
  const frame = browser.getFrame(command.inFrame);
  const locator = frame.getByRole(command.role as any, {
    name: command.name,
    exact: command.exact,
  });

  switch (command.subaction) {
    case 'click':
      await locator.click();
      return successResponse(command.id, { clicked: true });
    case 'fill':
      await locator.fill(command.value ?? '');
      return successResponse(command.id, { filled: true });
    case 'check':
      await locator.check();
      return successResponse(command.id, { checked: true });
    case 'hover':
      await locator.hover();
      return successResponse(command.id, { hovered: true });
  }
}

async function handleGetByText(
  command: GetByTextCommand,
  browser: BrowserManager
): Promise<Response> {
  const frame = browser.getFrame(command.inFrame);
  const locator = frame.getByText(command.text, { exact: command.exact });

  switch (command.subaction) {
    case 'click':
      await locator.click();
      return successResponse(command.id, { clicked: true });
    case 'hover':
      await locator.hover();
      return successResponse(command.id, { hovered: true });
  }
}

async function handleGetByLabel(
  command: GetByLabelCommand,
  browser: BrowserManager
): Promise<Response> {
  const frame = browser.getFrame(command.inFrame);
  const locator = frame.getByLabel(command.label, { exact: command.exact });

  switch (command.subaction) {
    case 'click':
      await locator.click();
      return successResponse(command.id, { clicked: true });
    case 'fill':
      await locator.fill(command.value ?? '');
      return successResponse(command.id, { filled: true });
    case 'check':
      await locator.check();
      return successResponse(command.id, { checked: true });
  }
}

async function handleGetByPlaceholder(
  command: GetByPlaceholderCommand,
  browser: BrowserManager
): Promise<Response> {
  const frame = browser.getFrame(command.inFrame);
  const locator = frame.getByPlaceholder(command.placeholder, { exact: command.exact });

  switch (command.subaction) {
    case 'click':
      await locator.click();
      return successResponse(command.id, { clicked: true });
    case 'fill':
      await locator.fill(command.value ?? '');
      return successResponse(command.id, { filled: true });
  }
}

async function handleCookiesGet(
  command: Command & { action: 'cookies_get'; urls?: string[] },
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const context = page.context();
  const cookies = await context.cookies(command.urls);
  return successResponse(command.id, { cookies });
}

async function handleCookiesSet(
  command: CookiesSetCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const context = page.context();
  // Auto-fill URL for cookies that don't have domain/path/url set
  const pageUrl = page.url();
  const cookies = command.cookies.map((cookie) => {
    if (!cookie.url && !cookie.domain && !cookie.path) {
      return { ...cookie, url: pageUrl };
    }
    return cookie;
  });
  await context.addCookies(cookies);
  return successResponse(command.id, { set: true });
}

async function handleCookiesClear(
  command: Command & { action: 'cookies_clear' },
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const context = page.context();
  await context.clearCookies();
  return successResponse(command.id, { cleared: true });
}

async function handleStorageGet(
  command: StorageGetCommand,
  browser: BrowserManager
): Promise<Response> {
  const frame = browser.getFrame();
  const storageType = command.type === 'local' ? 'localStorage' : 'sessionStorage';

  if (command.key) {
    const value = await frame.evaluate(`
      ${storageType}.getItem(${JSON.stringify(command.key)})
    `);
    return successResponse(command.id, { key: command.key, value });
  } else {
    const data = await frame.evaluate(`
      (() => {
        const storage = ${storageType};
        const result = {};
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key) result[key] = storage.getItem(key);
        }
        return result;
      })()
    `);
    return successResponse(command.id, { data });
  }
}

async function handleStorageSet(
  command: StorageSetCommand,
  browser: BrowserManager
): Promise<Response> {
  const frame = browser.getFrame();
  const storageType = command.type === 'local' ? 'localStorage' : 'sessionStorage';

  await frame.evaluate(
    `${storageType}.setItem(${JSON.stringify(command.key)}, ${JSON.stringify(command.value)})`
  );
  return successResponse(command.id, { set: true });
}

async function handleStorageClear(
  command: StorageClearCommand,
  browser: BrowserManager
): Promise<Response> {
  const frame = browser.getFrame();
  const storageType = command.type === 'local' ? 'localStorage' : 'sessionStorage';

  await frame.evaluate(`${storageType}.clear()`);
  return successResponse(command.id, { cleared: true });
}

async function handleDialog(command: DialogCommand, browser: BrowserManager): Promise<Response> {
  browser.setDialogHandler(command.response, command.promptText);
  return successResponse(command.id, { handler: 'set', response: command.response });
}

async function handlePdf(command: PdfCommand, browser: BrowserManager): Promise<Response> {
  const page = browser.getPage();
  await page.pdf({
    path: command.path,
    format: command.format ?? 'Letter',
  });
  return successResponse(command.id, { path: command.path });
}

// Network & Request handlers

async function handleRoute(command: RouteCommand, browser: BrowserManager): Promise<Response> {
  await browser.addRoute(command.url, {
    response: command.response,
    abort: command.abort,
  });
  return successResponse(command.id, { routed: command.url });
}

async function handleUnroute(
  command: Command & { action: 'unroute'; url?: string },
  browser: BrowserManager
): Promise<Response> {
  await browser.removeRoute(command.url);
  return successResponse(command.id, { unrouted: command.url ?? 'all' });
}

async function handleRequests(
  command: RequestsCommand,
  browser: BrowserManager
): Promise<Response> {
  if (command.clear) {
    browser.clearRequests();
    return successResponse(command.id, { cleared: true });
  }

  // Start tracking if not already
  browser.startRequestTracking();

  const requests = browser.getRequests(command.filter);
  return successResponse(command.id, { requests });
}

async function handleDownload(
  command: DownloadCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const locator = browser.getLocator(command.selector, command.inFrame);

  const [download] = await Promise.all([page.waitForEvent('download'), locator.click()]);

  await download.saveAs(command.path);
  return successResponse(command.id, {
    path: command.path,
    suggestedFilename: download.suggestedFilename(),
  });
}

async function handleGeolocation(
  command: GeolocationCommand,
  browser: BrowserManager
): Promise<Response> {
  await browser.setGeolocation(command.latitude, command.longitude, command.accuracy);
  return successResponse(command.id, {
    latitude: command.latitude,
    longitude: command.longitude,
  });
}

async function handlePermissions(
  command: PermissionsCommand,
  browser: BrowserManager
): Promise<Response> {
  await browser.setPermissions(command.permissions, command.grant);
  return successResponse(command.id, {
    permissions: command.permissions,
    granted: command.grant,
  });
}

async function handleViewport(
  command: ViewportCommand,
  browser: BrowserManager
): Promise<Response> {
  await browser.setViewport(command.width, command.height);
  return successResponse(command.id, {
    width: command.width,
    height: command.height,
  });
}

async function handleUserAgent(
  command: Command & { action: 'useragent'; userAgent: string },
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const context = page.context();
  // Note: Can't change user agent after context is created, but we can for new pages
  return successResponse(command.id, {
    note: 'User agent can only be set at launch time. Use device command instead.',
  });
}

async function handleDevice(command: DeviceCommand, browser: BrowserManager): Promise<Response> {
  const device = browser.getDevice(command.device);
  if (!device) {
    const available = browser.listDevices().slice(0, 10).join(', ');
    throw new Error(`Unknown device: ${command.device}. Available: ${available}...`);
  }

  // Apply device viewport
  await browser.setViewport(device.viewport.width, device.viewport.height);

  // Apply or clear device scale factor
  if (device.deviceScaleFactor && device.deviceScaleFactor !== 1) {
    // Apply device scale factor for HiDPI/retina displays
    await browser.setDeviceScaleFactor(
      device.deviceScaleFactor,
      device.viewport.width,
      device.viewport.height,
      device.isMobile ?? false
    );
  } else {
    // Clear device scale factor override to restore default (1x)
    try {
      await browser.clearDeviceMetricsOverride();
    } catch {
      // Ignore error if override was never set
    }
  }

  return successResponse(command.id, {
    device: command.device,
    viewport: device.viewport,
    userAgent: device.userAgent,
    deviceScaleFactor: device.deviceScaleFactor,
  });
}

async function handleBack(
  command: Command & { action: 'back' },
  browser: BrowserManager
): Promise<Response> {
  browser.recordStep({ action: 'back' });
  const page = browser.getPage();
  await page.goBack();
  return successResponse(command.id, { url: page.url() });
}

async function handleForward(
  command: Command & { action: 'forward' },
  browser: BrowserManager
): Promise<Response> {
  browser.recordStep({ action: 'forward' });
  const page = browser.getPage();
  await page.goForward();
  return successResponse(command.id, { url: page.url() });
}

async function handleReload(
  command: Command & { action: 'reload' },
  browser: BrowserManager
): Promise<Response> {
  browser.recordStep({ action: 'reload' });
  const page = browser.getPage();
  await page.reload();
  return successResponse(command.id, { url: page.url() });
}

async function handleUrl(
  command: Command & { action: 'url' },
  browser: BrowserManager
): Promise<Response> {
  if (command.inFrame) {
    const frameLocator = browser.getFrame(command.inFrame);
    // Get URL from frame by evaluating JavaScript on root locator
    const url = await frameLocator.locator(':root').evaluate(() => window.location.href);
    return successResponse(command.id, { url });
  } else {
    const page = browser.getPage();
    return successResponse(command.id, { url: page.url() });
  }
}

async function handleTitle(
  command: Command & { action: 'title' },
  browser: BrowserManager
): Promise<Response> {
  if (command.inFrame) {
    const frameLocator = browser.getFrame(command.inFrame);
    // Get title from frame by evaluating JavaScript on root locator
    const title = await frameLocator.locator(':root').evaluate(() => document.title);
    return successResponse(command.id, { title });
  } else {
    const page = browser.getPage();
    const title = await page.title();
    return successResponse(command.id, { title });
  }
}

async function handleGetAttribute(
  command: GetAttributeCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const value = await locator.getAttribute(command.attribute);
  return successResponse(command.id, { attribute: command.attribute, value });
}

async function handleGetText(command: GetTextCommand, browser: BrowserManager): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const text = await locator.textContent();
  return successResponse(command.id, { text });
}

async function handleIsVisible(
  command: IsVisibleCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const visible = await locator.isVisible({ timeout: 5000 });
  return successResponse(command.id, { visible });
}

async function handleIsEnabled(
  command: IsEnabledCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const enabled = await locator.isEnabled({ timeout: 5000 });
  return successResponse(command.id, { enabled });
}

async function handleIsChecked(
  command: IsCheckedCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const checked = await locator.isChecked({ timeout: 5000 });
  return successResponse(command.id, { checked });
}

async function handleCount(command: CountCommand, browser: BrowserManager): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const count = await locator.count();
  return successResponse(command.id, { count });
}

async function handleBoundingBox(
  command: BoundingBoxCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const box = await locator.boundingBox();
  return successResponse(command.id, { box });
}

async function handleStyles(
  command: StylesCommand,
  browser: BrowserManager
): Promise<Response<StylesData>> {
  const frame = browser.getFrame(command.inFrame);

  // Shared extraction logic as a string to be eval'd in browser context
  const extractStylesScript = `(function(el) {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      text: el.innerText?.trim().slice(0, 80) || null,
      box: {
        x: Math.round(r.x),
        y: Math.round(r.y),
        width: Math.round(r.width),
        height: Math.round(r.height),
      },
      styles: {
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        fontFamily: s.fontFamily.split(',')[0].trim().replace(/"/g, ''),
        color: s.color,
        backgroundColor: s.backgroundColor,
        borderRadius: s.borderRadius,
        border: s.border !== 'none' && s.borderWidth !== '0px' ? s.border : null,
        boxShadow: s.boxShadow !== 'none' ? s.boxShadow : null,
        padding: s.padding,
      },
    };
  })`;

  // Check if it's a ref - single element
  if (browser.isRef(command.selector)) {
    const locator = browser.getLocator(command.selector);
    const element = (await locator.evaluate((el, script) => {
      const fn = eval(script);
      return fn(el);
    }, extractStylesScript)) as StylesData['elements'][0];
    return successResponse(command.id, { elements: [element] });
  }

  // CSS selector - can match multiple elements
  const elements = (await frame.locator(command.selector).evaluateAll((els, script) => {
    const fn = eval(script);
    return els.map((el) => fn(el));
  }, extractStylesScript)) as StylesData['elements'];

  return successResponse(command.id, { elements });
}

// Advanced handlers

async function handleVideoStart(
  command: Command & { action: 'video_start'; path: string },
  browser: BrowserManager
): Promise<Response> {
  // Video recording requires context-level setup at launch
  // For now, return a note about this limitation
  return successResponse(command.id, {
    note: 'Video recording must be enabled at browser launch. Use --video flag when starting.',
    path: command.path,
  });
}

async function handleVideoStop(
  command: Command & { action: 'video_stop' },
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const video = page.video();
  if (video) {
    const path = await video.path();
    return successResponse(command.id, { path });
  }
  return successResponse(command.id, { note: 'No video recording active' });
}

async function handleTraceStart(
  command: TraceStartCommand,
  browser: BrowserManager
): Promise<Response> {
  await browser.startTracing({
    screenshots: command.screenshots,
    snapshots: command.snapshots,
  });
  return successResponse(command.id, { started: true });
}

async function handleTraceStop(
  command: TraceStopCommand,
  browser: BrowserManager
): Promise<Response> {
  await browser.stopTracing(command.path);
  return successResponse(command.id, { path: command.path });
}

async function handleHarStart(
  command: Command & { action: 'har_start' },
  browser: BrowserManager
): Promise<Response> {
  await browser.startHarRecording();
  browser.startRequestTracking();
  return successResponse(command.id, { started: true });
}

async function handleHarStop(command: HarStopCommand, browser: BrowserManager): Promise<Response> {
  // HAR recording is handled at context level
  // For now, we save tracked requests as a simplified HAR-like format
  const requests = browser.getRequests();
  return successResponse(command.id, {
    path: command.path,
    requestCount: requests.length,
  });
}

async function handleStateSave(
  command: StorageStateSaveCommand,
  browser: BrowserManager
): Promise<Response> {
  await browser.saveStorageState(command.path);
  return successResponse(command.id, { path: command.path });
}

async function handleStateLoad(
  command: Command & { action: 'state_load'; path: string },
  browser: BrowserManager
): Promise<Response> {
  // Storage state is loaded at context creation
  return successResponse(command.id, {
    note: 'Storage state must be loaded at browser launch. Use --state flag.',
    path: command.path,
  });
}

async function handleConsole(command: ConsoleCommand, browser: BrowserManager): Promise<Response> {
  if (command.clear) {
    browser.clearConsoleMessages();
    return successResponse(command.id, { cleared: true });
  }

  const messages = browser.getConsoleMessages();
  return successResponse(command.id, { messages });
}

async function handleErrors(command: ErrorsCommand, browser: BrowserManager): Promise<Response> {
  if (command.clear) {
    browser.clearPageErrors();
    return successResponse(command.id, { cleared: true });
  }

  const errors = browser.getPageErrors();
  return successResponse(command.id, { errors });
}

async function handleKeyboard(
  command: KeyboardCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.keyboard.press(command.keys);
  return successResponse(command.id, { pressed: command.keys });
}

async function handleWheel(command: WheelCommand, browser: BrowserManager): Promise<Response> {
  const page = browser.getPage();

  if (command.selector) {
    const element = page.locator(command.selector);
    await element.hover();
  }

  await page.mouse.wheel(command.deltaX ?? 0, command.deltaY ?? 0);
  return successResponse(command.id, { scrolled: true });
}

async function handleTap(command: TapCommand, browser: BrowserManager): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  await locator.tap();
  return successResponse(command.id, { tapped: true });
}

async function handleClipboard(
  command: ClipboardCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();

  switch (command.operation) {
    case 'copy':
      await page.keyboard.press('Control+c');
      return successResponse(command.id, { copied: true });
    case 'paste':
      await page.keyboard.press('Control+v');
      return successResponse(command.id, { pasted: true });
    case 'read':
      const text = await page.evaluate('navigator.clipboard.readText()');
      return successResponse(command.id, { text });
    default:
      return errorResponse(command.id, 'Unknown clipboard operation');
  }
}

async function handleHighlight(
  command: HighlightCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  await locator.highlight();
  return successResponse(command.id, { highlighted: true });
}

async function handleClear(command: ClearCommand, browser: BrowserManager): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  await locator.clear();
  return successResponse(command.id, { cleared: true });
}

async function handleSelectAll(
  command: SelectAllCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  await locator.selectText();
  return successResponse(command.id, { selected: true });
}

async function handleInnerText(
  command: InnerTextCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const text = await locator.innerText();
  return successResponse(command.id, { text });
}

async function handleInnerHtml(
  command: InnerHtmlCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const html = await locator.innerHTML();
  return successResponse(command.id, { html });
}

async function handleInputValue(
  command: InputValueCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const value = await locator.inputValue();
  return successResponse(command.id, { value });
}

async function handleSetValue(
  command: SetValueCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.locator(command.selector).fill(command.value);
  return successResponse(command.id, { set: true });
}

async function handleDispatch(
  command: DispatchEventCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.locator(command.selector).dispatchEvent(command.event, command.eventInit);
  return successResponse(command.id, { dispatched: command.event });
}

async function handleEvalHandle(
  command: Command & { action: 'evalhandle'; script: string },
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const handle = await page.evaluateHandle(command.script);
  const result = await handle.jsonValue().catch(() => 'Handle (non-serializable)');
  return successResponse(command.id, { result });
}

async function handleExpose(
  command: Command & { action: 'expose'; name: string },
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.exposeFunction(command.name, () => {
    // Exposed function - can be extended
    return `Function ${command.name} called`;
  });
  return successResponse(command.id, { exposed: command.name });
}

async function handleAddScript(
  command: AddScriptCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();

  if (command.content) {
    await page.addScriptTag({ content: command.content });
  } else if (command.url) {
    await page.addScriptTag({ url: command.url });
  }

  return successResponse(command.id, { added: true });
}

async function handleAddStyle(
  command: AddStyleCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();

  if (command.content) {
    await page.addStyleTag({ content: command.content });
  } else if (command.url) {
    await page.addStyleTag({ url: command.url });
  }

  return successResponse(command.id, { added: true });
}

async function handleEmulateMedia(
  command: EmulateMediaCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.emulateMedia({
    media: command.media,
    colorScheme: command.colorScheme,
    reducedMotion: command.reducedMotion,
    forcedColors: command.forcedColors,
  });
  return successResponse(command.id, { emulated: true });
}

async function handleOffline(command: OfflineCommand, browser: BrowserManager): Promise<Response> {
  await browser.setOffline(command.offline);
  return successResponse(command.id, { offline: command.offline });
}

async function handleHeaders(command: HeadersCommand, browser: BrowserManager): Promise<Response> {
  await browser.setExtraHeaders(command.headers);
  return successResponse(command.id, { set: true });
}

async function handlePause(
  command: Command & { action: 'pause' },
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.pause();
  return successResponse(command.id, { paused: true });
}

async function handleGetByAltText(
  command: GetByAltTextCommand,
  browser: BrowserManager
): Promise<Response> {
  const frame = browser.getFrame(command.inFrame);
  const locator = frame.getByAltText(command.text, { exact: command.exact });

  switch (command.subaction) {
    case 'click':
      await locator.click();
      return successResponse(command.id, { clicked: true });
    case 'hover':
      await locator.hover();
      return successResponse(command.id, { hovered: true });
  }
}

async function handleGetByTitle(
  command: GetByTitleCommand,
  browser: BrowserManager
): Promise<Response> {
  const frame = browser.getFrame(command.inFrame);
  const locator = frame.getByTitle(command.text, { exact: command.exact });

  switch (command.subaction) {
    case 'click':
      await locator.click();
      return successResponse(command.id, { clicked: true });
    case 'hover':
      await locator.hover();
      return successResponse(command.id, { hovered: true });
  }
}

async function handleGetByTestId(
  command: GetByTestIdCommand,
  browser: BrowserManager
): Promise<Response> {
  const frame = browser.getFrame(command.inFrame);
  const locator = frame.getByTestId(command.testId);

  switch (command.subaction) {
    case 'click':
      await locator.click();
      return successResponse(command.id, { clicked: true });
    case 'fill':
      await locator.fill(command.value ?? '');
      return successResponse(command.id, { filled: true });
    case 'check':
      await locator.check();
      return successResponse(command.id, { checked: true });
    case 'hover':
      await locator.hover();
      return successResponse(command.id, { hovered: true });
  }
}

async function handleNth(command: NthCommand, browser: BrowserManager): Promise<Response> {
  const refLocator = browser.getLocatorFromRef(command.selector, command.inFrame);
  let locator;
  if (refLocator) {
    locator = refLocator;
  } else {
    const frame = browser.getFrame(command.inFrame);
    const base = frame.locator(command.selector);
    locator = command.index === -1 ? base.last() : base.nth(command.index);
  }

  switch (command.subaction) {
    case 'click':
      await locator.click();
      return successResponse(command.id, { clicked: true });
    case 'fill':
      await locator.fill(command.value ?? '');
      return successResponse(command.id, { filled: true });
    case 'check':
      await locator.check();
      return successResponse(command.id, { checked: true });
    case 'hover':
      await locator.hover();
      return successResponse(command.id, { hovered: true });
    case 'text':
      const text = await locator.textContent();
      return successResponse(command.id, { text });
  }
}

async function handleWaitForUrl(
  command: WaitForUrlCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.waitForURL(command.url, { timeout: command.timeout });
  return successResponse(command.id, { url: page.url() });
}

async function handleWaitForLoadState(
  command: WaitForLoadStateCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.waitForLoadState(command.state, { timeout: command.timeout });
  return successResponse(command.id, { state: command.state });
}

async function handleSetContent(
  command: SetContentCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.setContent(command.html);
  return successResponse(command.id, { set: true });
}

async function handleTimezone(
  command: TimezoneCommand,
  browser: BrowserManager
): Promise<Response> {
  // Timezone must be set at context level before navigation
  // This is a limitation - it sets for the current context
  const page = browser.getPage();
  await page.context().setGeolocation({ latitude: 0, longitude: 0 }); // Trigger context awareness
  return successResponse(command.id, {
    note: 'Timezone must be set at browser launch. Use --timezone flag.',
    timezone: command.timezone,
  });
}

async function handleLocale(command: LocaleCommand, browser: BrowserManager): Promise<Response> {
  // Locale must be set at context creation
  return successResponse(command.id, {
    note: 'Locale must be set at browser launch. Use --locale flag.',
    locale: command.locale,
  });
}

async function handleCredentials(
  command: HttpCredentialsCommand,
  browser: BrowserManager
): Promise<Response> {
  const context = browser.getPage().context();
  await context.setHTTPCredentials({
    username: command.username,
    password: command.password,
  });
  return successResponse(command.id, { set: true });
}

async function handleMouseMove(
  command: MouseMoveCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.mouse.move(command.x, command.y);
  return successResponse(command.id, { moved: true, x: command.x, y: command.y });
}

async function handleMouseDown(
  command: MouseDownCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.mouse.down({ button: command.button ?? 'left' });
  return successResponse(command.id, { down: true });
}

async function handleMouseUp(command: MouseUpCommand, browser: BrowserManager): Promise<Response> {
  const page = browser.getPage();
  await page.mouse.up({ button: command.button ?? 'left' });
  return successResponse(command.id, { up: true });
}

async function handleWander(command: WanderCommand, browser: BrowserManager): Promise<Response> {
  const page = browser.getPage();
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };

  const config = command.human ?? { enabled: true, pathType: 'bezier' };

  await humanWander(page, config, {
    duration: command.duration ?? 2000,
    area: viewport,
  });

  return successResponse(command.id, { wandered: true, duration: command.duration ?? 2000 });
}

async function handleBringToFront(
  command: Command & { action: 'bringtofront' },
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.bringToFront();
  return successResponse(command.id, { focused: true });
}

async function handleWaitForFunction(
  command: WaitForFunctionCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.waitForFunction(command.expression, { timeout: command.timeout });
  return successResponse(command.id, { waited: true });
}

async function handleScrollIntoView(
  command: ScrollIntoViewCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.locator(command.selector).scrollIntoViewIfNeeded();
  return successResponse(command.id, { scrolled: true });
}

async function handleAddInitScript(
  command: AddInitScriptCommand,
  browser: BrowserManager
): Promise<Response> {
  const context = browser.getPage().context();
  await context.addInitScript(command.script);
  return successResponse(command.id, { added: true });
}

async function handleKeyDown(command: KeyDownCommand, browser: BrowserManager): Promise<Response> {
  const page = browser.getPage();
  await page.keyboard.down(command.key);
  return successResponse(command.id, { down: true, key: command.key });
}

async function handleKeyUp(command: KeyUpCommand, browser: BrowserManager): Promise<Response> {
  const page = browser.getPage();
  await page.keyboard.up(command.key);
  return successResponse(command.id, { up: true, key: command.key });
}

async function handleInsertText(
  command: InsertTextCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.keyboard.insertText(command.text);
  return successResponse(command.id, { inserted: true });
}

async function handleMultiSelect(
  command: MultiSelectCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const selected = await page.locator(command.selector).selectOption(command.values);
  return successResponse(command.id, { selected });
}

async function handleWaitForDownload(
  command: WaitForDownloadCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const download = await page.waitForEvent('download', { timeout: command.timeout });

  let filePath: string;
  if (command.path) {
    filePath = command.path;
    await download.saveAs(filePath);
  } else {
    filePath = (await download.path()) || download.suggestedFilename();
  }

  return successResponse(command.id, {
    path: filePath,
    filename: download.suggestedFilename(),
    url: download.url(),
  });
}

async function handleResponseBody(
  command: ResponseBodyCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const response = await page.waitForResponse((resp) => resp.url().includes(command.url), {
    timeout: command.timeout,
  });

  const body = await response.text();
  let parsed: unknown = body;

  try {
    parsed = JSON.parse(body);
  } catch {
    // Keep as string if not JSON
  }

  return successResponse(command.id, {
    url: response.url(),
    status: response.status(),
    body: parsed,
  });
}

// Screencast and input injection handlers

async function handleScreencastStart(
  command: ScreencastStartCommand,
  browser: BrowserManager
): Promise<Response<ScreencastStartData>> {
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

async function handleScreencastStop(
  command: ScreencastStopCommand,
  browser: BrowserManager
): Promise<Response<ScreencastStopData>> {
  await browser.stopScreencast();
  return successResponse(command.id, { stopped: true });
}

async function handleInputMouse(
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

async function handleInputKeyboard(
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

async function handleInputTouch(
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

// Recording handlers (Playwright native video recording)

async function handleRecordingStart(
  command: RecordingStartCommand,
  browser: BrowserManager
): Promise<Response<RecordingStartData>> {
  await browser.startRecording(command.path, command.url);
  return successResponse(command.id, {
    started: true,
    path: command.path,
  });
}

async function handleRecordingStop(
  command: RecordingStopCommand,
  browser: BrowserManager
): Promise<Response<RecordingStopData>> {
  const result = await browser.stopRecording();
  return successResponse(command.id, result);
}

async function handleRecordingRestart(
  command: RecordingRestartCommand,
  browser: BrowserManager
): Promise<Response<RecordingRestartData>> {
  const result = await browser.restartRecording(command.path, command.url);
  return successResponse(command.id, {
    started: true,
    path: command.path,
    previousPath: result.previousPath,
    stopped: result.stopped,
  });
}

async function handleRecorderStart(
  command: RecorderStartCommand,
  browser: BrowserManager
): Promise<Response<{ started: boolean; sessionId: string }>> {
  const result = await browser.startRecorder(command.url);
  return successResponse(command.id, result);
}

async function handleRecorderStop(
  command: RecorderStopCommand,
  browser: BrowserManager
): Promise<Response<{ yaml?: string; steps: number; path?: string }>> {
  const result = await browser.stopRecorder();

  if (command.output) {
    const fs = await import('node:fs');
    const outputPath = path.resolve(command.output);
    fs.writeFileSync(outputPath, result.yaml, 'utf-8');
    return successResponse(command.id, { steps: result.steps, path: outputPath });
  }

  return successResponse(command.id, { yaml: result.yaml, steps: result.steps });
}

async function handleRecorderStatus(
  command: RecorderStatusCommand,
  browser: BrowserManager
): Promise<Response<{ isRecording: boolean; steps: number; sessionId?: string }>> {
  const result = browser.getRecorderStatus();
  return successResponse(command.id, result);
}

async function handleViewer(
  command: Command & { action: 'viewer' },
  _browser: BrowserManager
): Promise<Response<ViewerData>> {
  const instanceId = getInstanceId();
  const port = parseInt(process.env.AGENT_BROWSER_STREAM_PORT || '5005', 10);

  return successResponse(command.id, {
    url: `http://localhost:${port}/view?instanceId=${instanceId}`,
    wsUrl: `ws://localhost:${port}?instanceId=${instanceId}`,
    streamPort: port,
  });
}

async function handleAsk(
  command: Command & { action: 'ask'; question: string },
  _browser: BrowserManager
): Promise<Response<AskData>> {
  const session = getSession();
  const bridge = new MessageBridge();

  try {
    const answer = await bridge.ask(command.question, session);
    return successResponse(command.id, { answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(command.id, `Failed to ask question: ${message}`) as Response<AskData>;
  }
}

// Config command types
interface ConfigData {
  config: {
    session: string;
    executablePath: string | null;
    extensions: string | null;
    profile: string | null;
    state: string | null;
    proxy: string | null;
    proxyBypass: string | null;
    args: string | null;
    userAgent: string | null;
    provider: string | null;
    allowFileAccess: boolean;
    iosDevice: string | null;
    streamPort: string | null;
    headed: boolean;
    human: HumanConfig;
  };
  output?: string;
}

function handleConfig(
  command: Command & { action: 'config'; json?: boolean }
): Response<ConfigData> {
  const humanConfig = getHumanConfigFromEnv();

  const config = {
    session: process.env.AGENT_BROWSER_SESSION || 'default',
    executablePath: process.env.AGENT_BROWSER_EXECUTABLE_PATH || null,
    extensions: process.env.AGENT_BROWSER_EXTENSIONS || null,
    profile: process.env.AGENT_BROWSER_PROFILE || null,
    state: process.env.AGENT_BROWSER_STATE || null,
    proxy: process.env.AGENT_BROWSER_PROXY || null,
    proxyBypass: process.env.AGENT_BROWSER_PROXY_BYPASS || null,
    args: process.env.AGENT_BROWSER_ARGS || null,
    userAgent: process.env.AGENT_BROWSER_USER_AGENT || null,
    provider: process.env.AGENT_BROWSER_PROVIDER || null,
    allowFileAccess: process.env.AGENT_BROWSER_ALLOW_FILE_ACCESS === '1',
    iosDevice: process.env.AGENT_BROWSER_IOS_DEVICE || null,
    streamPort: process.env.AGENT_BROWSER_STREAM_PORT || null,
    headed: process.env.AGENT_BROWSER_HEADED === '1',
    human: humanConfig,
  };

  if (command.json) {
    return successResponse(command.id, { config });
  }

  // Format human-readable output
  const lines: string[] = [
    'Agent Browser Configuration',
    '===========================',
    '',
    'Session & Browser:',
    `  AGENT_BROWSER_SESSION          ${config.session}`,
    `  AGENT_BROWSER_EXECUTABLE_PATH  ${config.executablePath || '(not set)'}`,
    `  AGENT_BROWSER_PROVIDER         ${config.provider || '(not set)'}`,
    `  AGENT_BROWSER_HEADED           ${config.headed ? 'true' : 'false (default)'}`,
    '',
    'Browser Options:',
    `  AGENT_BROWSER_PROFILE          ${config.profile || '(not set)'}`,
    `  AGENT_BROWSER_EXTENSIONS       ${config.extensions || '(not set)'}`,
    `  AGENT_BROWSER_ARGS             ${config.args || '(not set)'}`,
    `  AGENT_BROWSER_USER_AGENT       ${config.userAgent || '(not set)'}`,
    `  AGENT_BROWSER_PROXY            ${config.proxy || '(not set)'}`,
    `  AGENT_BROWSER_ALLOW_FILE_ACCESS ${config.allowFileAccess ? 'true' : 'false (default)'}`,
    '',
    'Human Mode (runtime):',
    `  AGENT_BROWSER_HUMAN            ${humanConfig.enabled ? humanConfig.pathType + ' ✓' : '(disabled)'}`,
    '',
    'Note: Most settings only take effect at browser startup.',
    'Use "export AGENT_BROWSER_XXX=value" before starting.',
  ];

  return successResponse(command.id, { config, output: lines.join('\n') });
}
