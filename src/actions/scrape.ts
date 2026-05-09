import fs from 'fs';
import type { BrowserManager } from '../browser/index.js';
import type { ScrapeCommand, Response } from '../types.js';
import { successResponse } from '../protocol.js';
import { extractContentFromPage, waitForSPAContent } from './utils.js';

export interface ScrapeMetadata {
  description?: string;
  keywords?: string;
  author?: string;
  robots?: string;
  canonical?: string;
  favicon?: string;
  lang?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  ogSiteName?: string;
  publishedTime?: string;
  modifiedTime?: string;
  articleTag?: string;
  articleSection?: string;
}

export interface ScrapeResult {
  url: string;
  title: string;
  content: string;
  format: 'text' | 'html' | 'markdown';
  metadata?: ScrapeMetadata;
}

export async function handleScrape(
  command: ScrapeCommand,
  browser: BrowserManager
): Promise<Response<ScrapeResult>> {
  let page = browser.getPage();
  if (!page) {
    return {
      id: command.id,
      success: false,
      error: 'Browser page not initialized',
    };
  }

  const timeout = (command.timeout ?? 15) * 1000;

  try {
    if (command.javaScriptEnabled === false) {
      const browserInstance = browser.getBrowser();
      if (browserInstance) {
        page = await browserInstance.newPage({ javaScriptEnabled: false });
      }
    }

    if (command.cookies && command.cookies.length > 0) {
      await page.context().addCookies(command.cookies);
    }

    await page.goto(command.url, {
      timeout,
      waitUntil: 'domcontentloaded',
    });

    await Promise.race([
      page.waitForLoadState('networkidle', { timeout: Math.min(timeout, 5000) }).catch(() => {}),
      page.waitForTimeout(3000),
    ]);

    await waitForSPAContent(page, 3000);

    if (command.waitForSelector) {
      await page
        .locator(command.waitForSelector)
        .first()
        .waitFor({
          state: 'visible',
          timeout: Math.min(timeout, 10000),
        });
    }

    const format = command.format ?? 'markdown';
    const content = await extractContentFromPage(page, format, command.selector);

    let metadata: ScrapeMetadata | undefined;
    if (command.includeMetadata) {
      metadata = await page.evaluate(() => {
        const getMeta = (name: string) =>
          document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ||
          document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ||
          '';

        const getLink = (rel: string) =>
          document.querySelector(`link[rel="${rel}"]`)?.getAttribute('href') ||
          document.querySelector(`link[rel*="${rel}"]`)?.getAttribute('href') ||
          '';

        const favicon = getLink('icon') || getLink('shortcut icon') || '/favicon.ico';
        const resolvedFavicon =
          favicon && !favicon.startsWith('http')
            ? new URL(favicon, window.location.href).href
            : favicon;

        return {
          title: document.title || '',
          description: getMeta('description'),
          keywords: getMeta('keywords'),
          author: getMeta('author'),
          robots: getMeta('robots'),
          canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
          favicon: resolvedFavicon,
          lang: document.documentElement.lang || '',
          ogTitle: getMeta('og:title'),
          ogDescription: getMeta('og:description'),
          ogImage: getMeta('og:image'),
          ogUrl: getMeta('og:url'),
          ogSiteName: getMeta('og:site_name'),
          publishedTime: getMeta('article:published_time'),
          modifiedTime: getMeta('article:modified_time'),
          articleTag: getMeta('article:tag'),
          articleSection: getMeta('article:section'),
        };
      });
    }

    const result: ScrapeResult = {
      url: page.url(),
      title: await page.title(),
      content,
      format,
      ...(metadata ? { metadata } : {}),
    };

    if (command.outputFile) {
      const output = format === 'html' ? result.content : JSON.stringify(result, null, 2);
      fs.writeFileSync(command.outputFile, output, 'utf-8');
      return successResponse(command.id, {
        ...result,
        savedTo: command.outputFile,
      });
    }

    return successResponse(command.id, result);
  } catch (error) {
    return {
      id: command.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
