import type { BrowserManager } from '../browser/index.js';
import type { ScrapeCommand, Response } from '../types.js';
import { successResponse } from '../protocol.js';
import { extractContentFromPage, waitForSPAContent } from './utils.js';

export interface ScrapeResult {
  url: string;
  title: string;
  content: string;
  format: 'text' | 'html' | 'markdown';
}

export async function handleScrape(
  command: ScrapeCommand,
  browser: BrowserManager
): Promise<Response<ScrapeResult>> {
  const page = browser.getPage();
  if (!page) {
    return {
      id: command.id,
      success: false,
      error: 'Browser page not initialized',
    };
  }

  const timeout = (command.timeout ?? 15) * 1000;

  try {
    await page.goto(command.url, {
      timeout,
      waitUntil: 'domcontentloaded',
    });

    await Promise.race([
      page.waitForLoadState('networkidle', { timeout: Math.min(timeout, 5000) }).catch(() => {}),
      page.waitForTimeout(3000),
    ]);

    await waitForSPAContent(page, 3000);

    const format = command.format ?? 'markdown';
    const content = await extractContentFromPage(page, format, command.selector);

    return successResponse(command.id, {
      url: page.url(),
      title: await page.title(),
      content,
      format,
    });
  } catch (error) {
    return {
      id: command.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
