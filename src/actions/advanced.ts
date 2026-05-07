import type { BrowserManager } from '../browser/index.js';
import type {
  Command,
  Response,
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
  WaitForFunctionCommand,
  ScrollIntoViewCommand,
  AddInitScriptCommand,
  KeyDownCommand,
  KeyUpCommand,
  InsertTextCommand,
  MultiSelectCommand,
  WaitForDownloadCommand,
  ResponseBodyCommand,
} from '../types.js';
import { successResponse, errorResponse } from '../protocol.js';

export async function handleVideoStart(
  command: Command & { action: 'video_start'; path: string },
  _browser: BrowserManager
): Promise<Response> {
  return successResponse(command.id, {
    note: 'Video recording must be enabled at browser launch. Use --video flag when starting.',
    path: command.path,
  });
}

export async function handleVideoStop(
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

export async function handleTraceStart(
  command: TraceStartCommand,
  browser: BrowserManager
): Promise<Response> {
  await browser.startTracing({
    screenshots: command.screenshots,
    snapshots: command.snapshots,
  });
  return successResponse(command.id, { started: true });
}

export async function handleTraceStop(
  command: TraceStopCommand,
  browser: BrowserManager
): Promise<Response> {
  await browser.stopTracing(command.path);
  return successResponse(command.id, { path: command.path });
}

export async function handleHarStart(
  command: Command & { action: 'har_start' },
  browser: BrowserManager
): Promise<Response> {
  await browser.startHarRecording();
  browser.startRequestTracking();
  return successResponse(command.id, { started: true });
}

export async function handleHarStop(
  command: HarStopCommand,
  browser: BrowserManager
): Promise<Response> {
  const requests = browser.getRequests();
  return successResponse(command.id, {
    path: command.path,
    requestCount: requests.length,
  });
}

export async function handleStateSave(
  command: StorageStateSaveCommand,
  browser: BrowserManager
): Promise<Response> {
  await browser.saveStorageState(command.path);
  return successResponse(command.id, { path: command.path });
}

export async function handleStateLoad(
  command: Command & { action: 'state_load'; path: string },
  _browser: BrowserManager
): Promise<Response> {
  return successResponse(command.id, {
    note: 'Storage state must be loaded at browser launch. Use --state flag.',
    path: command.path,
  });
}

export async function handleConsole(
  command: ConsoleCommand,
  browser: BrowserManager
): Promise<Response> {
  if (command.clear) {
    browser.clearConsoleMessages();
    return successResponse(command.id, { cleared: true });
  }

  const messages = browser.getConsoleMessages();
  return successResponse(command.id, { messages });
}

export async function handleErrors(
  command: ErrorsCommand,
  browser: BrowserManager
): Promise<Response> {
  if (command.clear) {
    browser.clearPageErrors();
    return successResponse(command.id, { cleared: true });
  }

  const errors = browser.getPageErrors();
  return successResponse(command.id, { errors });
}

export async function handleKeyboard(
  command: KeyboardCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.keyboard.press(command.keys);
  return successResponse(command.id, { pressed: command.keys });
}

export async function handleWheel(
  command: WheelCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();

  if (command.selector) {
    const element = page.locator(command.selector);
    await element.hover();
  }

  await page.mouse.wheel(command.deltaX ?? 0, command.deltaY ?? 0);
  return successResponse(command.id, { scrolled: true });
}

export async function handleTap(command: TapCommand, browser: BrowserManager): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  await locator.tap();
  return successResponse(command.id, { tapped: true });
}

export async function handleClipboard(
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

export async function handleHighlight(
  command: HighlightCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  await locator.highlight();
  return successResponse(command.id, { highlighted: true });
}

export async function handleClear(
  command: ClearCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  await locator.clear();
  return successResponse(command.id, { cleared: true });
}

export async function handleSelectAll(
  command: SelectAllCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  await locator.selectText();
  return successResponse(command.id, { selected: true });
}

export async function handleInnerText(
  command: InnerTextCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const text = await locator.innerText();
  return successResponse(command.id, { text });
}

export async function handleInnerHtml(
  command: InnerHtmlCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const html = await locator.innerHTML();
  return successResponse(command.id, { html });
}

export async function handleInputValue(
  command: InputValueCommand,
  browser: BrowserManager
): Promise<Response> {
  const locator = browser.getLocator(command.selector, command.inFrame);
  const value = await locator.inputValue();
  return successResponse(command.id, { value });
}

export async function handleSetValue(
  command: SetValueCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.locator(command.selector).fill(command.value);
  return successResponse(command.id, { set: true });
}

export async function handleDispatch(
  command: DispatchEventCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.locator(command.selector).dispatchEvent(command.event, command.eventInit);
  return successResponse(command.id, { dispatched: command.event });
}

export async function handleEvalHandle(
  command: Command & { action: 'evalhandle'; script: string },
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const handle = await page.evaluateHandle(command.script);
  const result = await handle.jsonValue().catch(() => 'Handle (non-serializable)');
  return successResponse(command.id, { result });
}

export async function handleExpose(
  command: Command & { action: 'expose'; name: string },
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.exposeFunction(command.name, () => {
    return `Function ${command.name} called`;
  });
  return successResponse(command.id, { exposed: command.name });
}

export async function handleAddScript(
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

export async function handleAddStyle(
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

export async function handleEmulateMedia(
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

export async function handleOffline(
  command: OfflineCommand,
  browser: BrowserManager
): Promise<Response> {
  await browser.setOffline(command.offline);
  return successResponse(command.id, { offline: command.offline });
}

export async function handleHeaders(
  command: HeadersCommand,
  browser: BrowserManager
): Promise<Response> {
  await browser.setExtraHeaders(command.headers);
  return successResponse(command.id, { set: true });
}

export async function handlePause(
  command: Command & { action: 'pause' },
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.pause();
  return successResponse(command.id, { paused: true });
}

export async function handleGetByAltText(
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

export async function handleGetByTitle(
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

export async function handleGetByTestId(
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

export async function handleNth(command: NthCommand, browser: BrowserManager): Promise<Response> {
  const refLocator = browser.getLocatorFromRef(command.selector, command.inFrame);
  let locator;
  if (refLocator) {
    locator = command.index === -1 ? refLocator.last() : refLocator.nth(command.index);
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

export async function handleWaitForUrl(
  command: WaitForUrlCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.waitForURL(command.url, { timeout: command.timeout });
  return successResponse(command.id, { url: page.url() });
}

export async function handleWaitForLoadState(
  command: WaitForLoadStateCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.waitForLoadState(command.state, { timeout: command.timeout });
  return successResponse(command.id, { state: command.state });
}

export async function handleSetContent(
  command: SetContentCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.setContent(command.html);
  return successResponse(command.id, { set: true });
}

export async function handleTimezone(
  command: TimezoneCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.context().setGeolocation({ latitude: 0, longitude: 0 });
  return successResponse(command.id, {
    note: 'Timezone must be set at browser launch. Use --timezone flag.',
    timezone: command.timezone,
  });
}

export async function handleLocale(
  command: LocaleCommand,
  _browser: BrowserManager
): Promise<Response> {
  return successResponse(command.id, {
    note: 'Locale must be set at browser launch. Use --locale flag.',
    locale: command.locale,
  });
}

export async function handleCredentials(
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

export async function handleBringToFront(
  command: Command & { action: 'bringtofront' },
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.bringToFront();
  return successResponse(command.id, { focused: true });
}

export async function handleWaitForFunction(
  command: WaitForFunctionCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.waitForFunction(command.expression, { timeout: command.timeout });
  return successResponse(command.id, { waited: true });
}

export async function handleScrollIntoView(
  command: ScrollIntoViewCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.locator(command.selector).scrollIntoViewIfNeeded();
  return successResponse(command.id, { scrolled: true });
}

export async function handleAddInitScript(
  command: AddInitScriptCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const context = page.context();
  await context.addInitScript(command.script);

  const tips: string[] = [];
  try {
    await page.evaluate(command.script);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    tips.push(`Init script error on current page: ${msg}. Script will work on next navigation.`);
  }

  return successResponse(command.id, { added: true }, tips.length ? tips : undefined);
}

export async function handleKeyDown(
  command: KeyDownCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.keyboard.down(command.key);
  return successResponse(command.id, { down: true, key: command.key });
}

export async function handleKeyUp(
  command: KeyUpCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.keyboard.up(command.key);
  return successResponse(command.id, { up: true, key: command.key });
}

export async function handleInsertText(
  command: InsertTextCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  await page.keyboard.insertText(command.text);
  return successResponse(command.id, { inserted: true });
}

export async function handleMultiSelect(
  command: MultiSelectCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const selected = await page.locator(command.selector).selectOption(command.values);
  return successResponse(command.id, { selected });
}

export async function handleWaitForDownload(
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

export async function handleResponseBody(
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
