import path from 'path';
import { fileURLToPath } from 'url';
import { BrowserManager } from '../../../browser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getChromiumExecutablePath(): string | undefined {
  if (process.env.AGENT_BROWSER_EXECUTABLE_PATH) {
    return process.env.AGENT_BROWSER_EXECUTABLE_PATH;
  }
  try {
    const { chromium } = require('playwright-core') as typeof import('playwright-core');
    const p = chromium.executablePath();
    if (p) return p;
  } catch {}
  return undefined;
}

export function getFixturePath(filename: string): string {
  return `file://${path.join(__dirname, '../fixtures', filename)}`;
}

export async function createBrowser(headless: boolean = true): Promise<BrowserManager> {
  const browser = new BrowserManager();
  await browser.launch({
    action: 'launch',
    id: 'test-browser',
    headless,
  });
  return browser;
}

export async function closeBrowser(browser: BrowserManager | null): Promise<void> {
  if (browser) {
    await browser.close();
  }
}
