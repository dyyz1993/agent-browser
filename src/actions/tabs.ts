import type { BrowserManager } from '../browser/index.js';
import type {
  Command,
  Response,
  TabNewCommand,
  TabNewData,
  TabListData,
  TabSwitchCommand,
  TabSwitchData,
  TabCloseCommand,
  TabCloseData,
  WindowNewCommand,
} from '../types.js';
import { successResponse } from '../protocol.js';

export async function handleClose(
  command: Command & { action: 'close' },
  browser: BrowserManager
): Promise<Response> {
  await browser.close();
  return successResponse(command.id, { closed: true });
}

export async function handleTabNew(
  command: TabNewCommand,
  browser: BrowserManager
): Promise<Response<TabNewData>> {
  const result = await browser.newTab();

  if (command.url) {
    const page = browser.getPage();
    await page.goto(command.url, { waitUntil: 'domcontentloaded' });
  }

  return successResponse(command.id, result);
}

export async function handleTabList(
  command: Command & { action: 'tab_list' },
  browser: BrowserManager
): Promise<Response<TabListData>> {
  const tabs = await browser.listTabs();
  return successResponse(command.id, {
    tabs,
    active: browser.getActiveIndex(),
  });
}

export async function handleFrames(
  command: Command & { action: 'frames' },
  browser: BrowserManager
): Promise<Response> {
  const frames = browser.listFrames();
  if (frames.length === 0) {
    return successResponse(command.id, {
      frames: [],
      tip: 'No iframes found on this page.',
    });
  }
  return successResponse(command.id, { frames });
}

export async function handleTabSwitch(
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

export async function handleTabClose(
  command: TabCloseCommand,
  browser: BrowserManager
): Promise<Response<TabCloseData>> {
  const result = await browser.closeTab(command.index);
  return successResponse(command.id, result);
}

export async function handleWindowNew(
  command: WindowNewCommand,
  browser: BrowserManager
): Promise<Response<TabNewData>> {
  const result = await browser.newWindow(command.viewport);
  return successResponse(command.id, result);
}
