import path from 'path';
import { fileURLToPath } from 'url';
import { BrowserManager } from '../../../browser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getFixturePath(filename: string): string {
  return `file://${path.join(__dirname, '../fixtures', filename)}`;
}

export async function createBrowser(headless: boolean = true): Promise<BrowserManager> {
  const browser = new BrowserManager();
  await browser.launch({ 
    action: 'launch', 
    id: 'test-browser', 
    headless 
  });
  return browser;
}

export async function closeBrowser(browser: BrowserManager | null): Promise<void> {
  if (browser) {
    await browser.close();
  }
}
