import { handlePluginCommand } from './plugins.js';
import { scanForInterruptions, formatInterruptionTip } from '../browser/interruption-detector.js';
import { handleCollectStart, handleCollectStop } from './collector.js';

import type { BrowserManager } from '../browser/index.js';
import type {
  Command,
  AnyCommand,
  Response,
  SelectorForCommand,
  SelectorsOfCommand,
  ValidateCommand,
} from '../types.js';
import type { SuccessResponse } from '../types/responses.js';
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
  handleDevices,
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
import { handleTouch } from './touch.js';
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

type ActionHandler = (cmd: Command, browser: BrowserManager) => Promise<Response> | Response;

const PLUGIN_ACTIONS = new Set([
  'plugin_install',
  'plugin_uninstall',
  'plugin_update',
  'plugin_list',
  'plugin_info',
  'plugin_search',
  'plugin_create',
  'plugin_run',
  'plugin_browse',
  'plugin_publish',
]);

const actionHandlers = new Map<string, ActionHandler>([
  ['launch', handleLaunch],
  ['navigate', handleNavigate],
  ['click', handleClick],
  ['type', handleType],
  ['fill', handleFill],
  ['check', handleCheck],
  ['uncheck', handleUncheck],
  ['upload', handleUpload],
  ['dblclick', handleDoubleClick],
  ['focus', handleFocus],
  ['drag', handleDrag],
  ['getbyrole', handleGetByRole],
  ['getbytext', handleGetByText],
  ['getbylabel', handleGetByLabel],
  ['getbyplaceholder', handleGetByPlaceholder],
  ['press', handlePress],
  ['screenshot', handleScreenshot],
  ['snapshot', handleSnapshot],
  ['evaluate', handleEvaluate],
  ['wait', handleWait],
  ['scroll', handleScroll],
  ['select', handleSelect],
  ['hover', handleHover],
  ['content', handleContent],
  ['close', handleClose],
  ['tab_new', handleTabNew],
  ['tab_list', handleTabList],
  ['frames', handleFrames],
  ['tab_switch', handleTabSwitch],
  ['tab_close', handleTabClose],
  ['window_new', handleWindowNew],
  ['cookies_get', handleCookiesGet],
  ['cookies_set', handleCookiesSet],
  ['cookies_clear', handleCookiesClear],
  ['storage_get', handleStorageGet],
  ['storage_set', handleStorageSet],
  ['storage_clear', handleStorageClear],
  ['dialog', handleDialog],
  ['pdf', handlePdf],
  ['route', handleRoute],
  ['unroute', handleUnroute],
  ['requests', handleRequests],
  ['websockets', handleWebSockets],
  ['download', handleDownload],
  ['geolocation', handleGeolocation],
  ['permissions', handlePermissions],
  ['viewport', handleViewport],
  ['useragent', handleUserAgent],
  ['device', handleDevice],
  ['devices', handleDevices],
  ['back', handleBack],
  ['forward', handleForward],
  ['reload', handleReload],
  ['url', handleUrl],
  ['title', handleTitle],
  ['getattribute', handleGetAttribute],
  ['gettext', handleGetText],
  ['isvisible', handleIsVisible],
  ['isenabled', handleIsEnabled],
  ['ischecked', handleIsChecked],
  ['count', handleCount],
  ['boundingbox', handleBoundingBox],
  ['styles', handleStyles],
  ['video_start', handleVideoStart],
  ['video_stop', handleVideoStop],
  ['trace_start', handleTraceStart],
  ['trace_stop', handleTraceStop],
  ['har_start', handleHarStart],
  ['har_stop', handleHarStop],
  ['state_save', handleStateSave],
  ['state_load', handleStateLoad],
  ['console', handleConsole],
  ['errors', handleErrors],
  ['keyboard', handleKeyboard],
  ['wheel', handleWheel],
  ['tap', handleTap],
  ['clipboard', handleClipboard],
  ['highlight', handleHighlight],
  ['clear', handleClear],
  ['selectall', handleSelectAll],
  ['innertext', handleInnerText],
  ['innerhtml', handleInnerHtml],
  ['inputvalue', handleInputValue],
  ['setvalue', handleSetValue],
  ['dispatch', handleDispatch],
  ['evalhandle', handleEvalHandle],
  ['expose', handleExpose],
  ['addscript', handleAddScript],
  ['addstyle', handleAddStyle],
  ['emulatemedia', handleEmulateMedia],
  ['offline', handleOffline],
  ['headers', handleHeaders],
  ['pause', handlePause],
  ['getbyalttext', handleGetByAltText],
  ['getbytitle', handleGetByTitle],
  ['getbytestid', handleGetByTestId],
  ['nth', handleNth],
  ['waitforurl', handleWaitForUrl],
  ['waitforloadstate', handleWaitForLoadState],
  ['setcontent', handleSetContent],
  ['timezone', handleTimezone],
  ['locale', handleLocale],
  ['credentials', handleCredentials],
  ['mousemove', handleMouseMove],
  ['mousedown', handleMouseDown],
  ['mouseup', handleMouseUp],
  ['wander', handleWander],
  ['mousetrajectory', handleMouseTrajectory],
  ['bringtofront', handleBringToFront],
  ['waitforfunction', handleWaitForFunction],
  ['scrollintoview', handleScrollIntoView],
  ['addinitscript', handleAddInitScript],
  ['keydown', handleKeyDown],
  ['keyup', handleKeyUp],
  ['inserttext', handleInsertText],
  ['multiselect', handleMultiSelect],
  ['waitfordownload', handleWaitForDownload],
  ['responsebody', handleResponseBody],
  ['screencast_start', handleScreencastStart],
  ['screencast_stop', handleScreencastStop],
  ['input_mouse', handleInputMouse],
  ['input_keyboard', handleInputKeyboard],
  ['input_touch', handleInputTouch],
  ['touch', handleTouch],
  ['recording_start', handleRecordingStart],
  ['recording_stop', handleRecordingStop],
  ['recording_restart', handleRecordingRestart],
  ['recorder_start', handleRecorderStart],
  ['recorder_stop', handleRecorderStop],
  ['recorder_status', handleRecorderStatus],
  ['recorder_replay', handleRecorderReplay],
  ['scrape', handleScrape],
  ['crawl', handleCrawl],
  ['map', handleMap],
  ['search', handleSearch],
  ['interact', handleInteract],
  ['viewer', handleViewer],
  ['ask', handleAsk],
  ['config', (cmd) => handleConfig(cmd as never)],
  ['history', handleHistory],
  ['selector-for', (cmd, br) => handleSelectorFor(cmd as SelectorForCommand, br)],
  ['selectors-of', (cmd, br) => handleSelectorsOf(cmd as SelectorsOfCommand, br)],
  ['validate', (cmd, br) => handleValidate(cmd as ValidateCommand, br)],
  ['collect_start', handleCollectStart],
  ['collect_stop', handleCollectStop],
] as readonly [string, ActionHandler][]);

export async function executeCommand(
  command: AnyCommand,
  browser: BrowserManager
): Promise<Response> {
  try {
    if (command.action === 'flow') {
      return await handleFlowAction(command, browser);
    }
    const cmd = command as Command;
    if (PLUGIN_ACTIONS.has(cmd.action)) {
      return await handlePluginCommand(command, browser);
    }
    const handler = actionHandlers.get(cmd.action);
    if (handler) {
      const response = await handler(cmd, browser);
      if (response.success && cmd.action !== 'close') {
        const tips: string[] = [];
        const selectors: string[] = [];
        if ('selector' in cmd && typeof cmd.selector === 'string') {
          selectors.push(cmd.selector);
        }
        const cmdObj = cmd as unknown as Record<string, unknown>;
        if ('source' in cmd && typeof cmdObj.source === 'string') {
          selectors.push(cmdObj.source);
        }
        if ('target' in cmd && typeof cmdObj.target === 'string') {
          selectors.push(cmdObj.target);
        }
        for (const sel of selectors) {
          const refTip = await browser.getRefSelectorTip(sel);
          if (refTip) tips.push(refTip);
        }
        if (tips.length > 0) {
          const resp = response as SuccessResponse;
          const existing = resp.tips;
          resp.tips = existing
            ? Array.isArray(existing)
              ? [...existing, ...tips]
              : [existing, ...tips]
            : tips.length === 1
              ? tips[0]
              : tips;
        }
        const NAVIGATION_ACTIONS = new Set([
          'navigate',
          'click',
          'dblclick',
          'tap',
          'back',
          'forward',
          'reload',
          'submit',
          'frame',
          'mainframe',
        ]);
        if (!process.env.AGENT_BROWSER_NO_INTERRUPT && NAVIGATION_ACTIONS.has(cmd.action)) {
          const interruptions = await scanForInterruptions(browser.getPage());
          if (interruptions.length > 0) {
            const resp = response as SuccessResponse;
            const intTips = interruptions.map(formatInterruptionTip);
            resp.tips = resp.tips
              ? Array.isArray(resp.tips)
                ? [...resp.tips, ...intTips]
                : [resp.tips as string, ...intTips]
              : intTips.length === 1
                ? intTips[0]
                : intTips;
          }
        }
      }
      return response;
    }
    return errorResponse(cmd.id, `Unknown action: ${cmd.action}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(command.id, message);
  }
}
