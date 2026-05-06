import type { BrowserManager } from '../browser.js';
import type {
  Command,
  Response,
  CookiesSetCommand,
  StorageGetCommand,
  StorageSetCommand,
  StorageClearCommand,
} from '../types.js';
import { successResponse } from '../protocol.js';

export async function handleCookiesGet(
  command: Command & { action: 'cookies_get'; urls?: string[] },
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const context = page.context();
  const cookies = await context.cookies(command.urls);
  return successResponse(command.id, { cookies });
}

export async function handleCookiesSet(
  command: CookiesSetCommand,
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const context = page.context();
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

export async function handleCookiesClear(
  command: Command & { action: 'cookies_clear' },
  browser: BrowserManager
): Promise<Response> {
  const page = browser.getPage();
  const context = page.context();
  await context.clearCookies();
  return successResponse(command.id, { cleared: true });
}

export async function handleStorageGet(
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

export async function handleStorageSet(
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

export async function handleStorageClear(
  command: StorageClearCommand,
  browser: BrowserManager
): Promise<Response> {
  const frame = browser.getFrame();
  const storageType = command.type === 'local' ? 'localStorage' : 'sessionStorage';

  await frame.evaluate(`${storageType}.clear()`);
  return successResponse(command.id, { cleared: true });
}
