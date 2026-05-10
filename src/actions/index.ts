import { handlePluginCommand } from './plugins.js';

import type { BrowserManager } from '../browser/index.js';
import type {
  Command,
  AnyCommand,
  Response,
  SelectorForCommand,
  SelectorsOfCommand,
  ValidateCommand,
} from '../types.js';
import { errorResponse } from '../protocol.js';

export {
  setEventCallbacks,
  getEventCallbacks,
  setScreencastFrameCallback,
} from '../browser-events.js';
export { toAIFriendlyError } from './utils.js';
export { handleAddInitScript } from './advanced.js';

import {
  handleLaunch,
  handleNavigate,
  handleClick,
  handleType,
  handlePress,
  handleScreenshot,
  handleSnapshot,
  handleEvaluate,
  handleWait,
  handleScroll,
  handleSelect,
  handleHover,
  handleContent,
} from './interaction.js';
import {
  handleFill,
  handleCheck,
  handleUncheck,
  handleUpload,
  handleDoubleClick,
  handleFocus,
  handleDrag,
  handleGetByRole,
  handleGetByText,
  handleGetByLabel,
  handleGetByPlaceholder,
} from './locators.js';
import { handleFlowAction } from './flow.js';
import { handleScrape } from './scrape.js';
import { handleSearch } from './search.js';
import { handleInteract } from './interact.js';
import { handleCrawl } from './crawl.js';
import { handleMap } from './map.js';
import {
  handleClose,
  handleTabNew,
  handleTabList,
  handleFrames,
  handleTabSwitch,
  handleTabClose,
  handleWindowNew,
} from './tabs.js';
import {
  handleCookiesGet,
  handleCookiesSet,
  handleCookiesClear,
  handleStorageGet,
  handleStorageSet,
  handleStorageClear,
} from './storage.js';
import {
  handleDialog,
  handlePdf,
  handleRoute,
  handleUnroute,
  handleRequests,
  handleWebSockets,
  handleDownload,
  handleGeolocation,
  handlePermissions,
  handleViewport,
  handleUserAgent,
  handleDevice,
  handleBack,
  handleForward,
  handleReload,
  handleUrl,
  handleTitle,
} from './context.js';
import {
  handleGetAttribute,
  handleGetText,
  handleIsVisible,
  handleIsEnabled,
  handleIsChecked,
  handleCount,
  handleBoundingBox,
  handleStyles,
} from './elements.js';
import {
  handleVideoStart,
  handleVideoStop,
  handleTraceStart,
  handleTraceStop,
  handleHarStart,
  handleHarStop,
  handleStateSave,
  handleStateLoad,
  handleConsole,
  handleErrors,
  handleKeyboard,
  handleWheel,
  handleTap,
  handleClipboard,
  handleHighlight,
  handleClear,
  handleSelectAll,
  handleInnerText,
  handleInnerHtml,
  handleInputValue,
  handleSetValue,
  handleDispatch,
  handleEvalHandle,
  handleExpose,
  handleAddScript,
  handleAddStyle,
  handleEmulateMedia,
  handleOffline,
  handleHeaders,
  handlePause,
  handleGetByAltText,
  handleGetByTitle,
  handleGetByTestId,
  handleNth,
  handleWaitForUrl,
  handleWaitForLoadState,
  handleSetContent,
  handleTimezone,
  handleLocale,
  handleCredentials,
  handleBringToFront,
  handleWaitForFunction,
  handleScrollIntoView,
  handleAddInitScript,
  handleKeyDown,
  handleKeyUp,
  handleInsertText,
  handleMultiSelect,
  handleWaitForDownload,
  handleResponseBody,
} from './advanced.js';
import {
  handleMouseMove,
  handleMouseDown,
  handleMouseUp,
  handleWander,
  handleMouseTrajectory,
} from './mouse.js';
import {
  handleScreencastStart,
  handleScreencastStop,
  handleInputMouse,
  handleInputKeyboard,
  handleInputTouch,
} from './screencast.js';
import { handleRecordingStart, handleRecordingStop, handleRecordingRestart } from './recording.js';
import {
  handleRecorderStart,
  handleRecorderStop,
  handleRecorderStatus,
  handleRecorderReplay,
} from './recorder.js';
import {
  handleSelectorFor,
  handleSelectorsOf,
  handleValidate,
  handleViewer,
  handleAsk,
  handleConfig,
  handleHistory,
} from './meta.js';

export async function executeCommand(
  command: AnyCommand,
  browser: BrowserManager
): Promise<Response> {
  try {
    if (command.action === 'flow') {
      return await handleFlowAction(command, browser);
    }
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
      case 'frames':
        return await handleFrames(cmd, browser);
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
      case 'websockets':
        return await handleWebSockets(cmd, browser);
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
      case 'mousetrajectory':
        return await handleMouseTrajectory(cmd, browser);
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
      case 'recorder_replay':
        return await handleRecorderReplay(cmd, browser);
      case 'scrape':
        return await handleScrape(cmd, browser);
      case 'crawl':
        return await handleCrawl(cmd, browser);
      case 'map':
        return await handleMap(cmd, browser);
      case 'search':
        return await handleSearch(cmd, browser);
      case 'interact':
        return await handleInteract(cmd, browser);
      case 'viewer':
        return await handleViewer(cmd, browser);
      case 'ask':
        return await handleAsk(cmd, browser);
      case 'config':
        return handleConfig(cmd);
      case 'history':
        return await handleHistory(cmd, browser);
      case 'selector-for':
        return await handleSelectorFor(cmd as SelectorForCommand, browser);
      case 'selectors-of':
        return await handleSelectorsOf(cmd as SelectorsOfCommand, browser);
      case 'validate':
        return await handleValidate(cmd as ValidateCommand, browser);
      case 'plugin_install':
      case 'plugin_uninstall':
      case 'plugin_update':
      case 'plugin_list':
      case 'plugin_info':
      case 'plugin_search':
      case 'plugin_create':
      case 'plugin_run':
        return await handlePluginCommand(command, browser);
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
