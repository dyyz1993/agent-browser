import type { Page } from 'playwright-core';
import type { BrowserManager } from '../browser/index.js';
import type { SearchCommand, Response, SearchResponse, SearchResult } from '../types.js';
import { successResponse } from '../protocol.js';

const ENGINE_URLS = {
  google: 'https://www.google.com/search',
  bing: 'https://www.bing.com/search',
  duckduckgo: 'https://duckduckgo.com/',
};

const SELECTORS = {
  google: {
    result: 'div.g, div[data-hveid]',
    title: 'h3',
    link: 'a[href]',
    snippet: 'div[data-sncf-ied="cf"] span, div.VwiC3b, div.st',
  },
  bing: {
    result: 'li.b_algo',
    title: 'h2',
    link: 'a[href]',
    snippet: 'p, div.b_caption p',
  },
  duckduckgo: {
    result: 'li[data-layout="organic"], div.result',
    title: 'h2, a.result__a',
    link: 'a[href]',
    snippet: 'a.result__snippet, p.result__snippet',
  },
};

async function parseGoogleResults(page: Page, limit: number): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const elements = await page.locator(SELECTORS.google.result).all();

  for (const el of elements.slice(0, limit)) {
    try {
      const title = await el.locator(SELECTORS.google.title).textContent();
      const linkEl = el.locator(SELECTORS.google.link).first();
      const url = await linkEl.getAttribute('href');
      const snippet = await el.locator(SELECTORS.google.snippet).textContent();

      if (title && url && url.startsWith('http')) {
        results.push({ title: title.trim(), url, snippet: snippet?.trim() });
      }
    } catch {}
  }

  return results;
}

async function parseBingResults(page: Page, limit: number): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const elements = await page.locator(SELECTORS.bing.result).all();

  for (const el of elements.slice(0, limit)) {
    try {
      const title = await el.locator(SELECTORS.bing.title).textContent();
      const linkEl = el.locator(SELECTORS.bing.link).first();
      const url = await linkEl.getAttribute('href');
      const snippet = await el.locator(SELECTORS.bing.snippet).textContent();

      if (title && url) {
        results.push({ title: title.trim(), url, snippet: snippet?.trim() });
      }
    } catch {}
  }

  return results;
}

async function parseDuckDuckGoResults(page: Page, limit: number): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const elements = await page.locator(SELECTORS.duckduckgo.result).all();

  for (const el of elements.slice(0, limit)) {
    try {
      const title = await el.locator(SELECTORS.duckduckgo.title).textContent();
      const linkEl = el.locator(SELECTORS.duckduckgo.link).first();
      const url = await linkEl.getAttribute('href');
      const snippet = await el.locator(SELECTORS.duckduckgo.snippet).textContent();

      if (title && url && url.startsWith('http')) {
        results.push({ title: title.trim(), url, snippet: snippet?.trim() });
      }
    } catch {}
  }

  return results;
}

export async function handleSearch(
  command: SearchCommand,
  browser: BrowserManager
): Promise<Response<SearchResponse>> {
  if (!browser.isLaunched()) {
    await browser.launch({
      id: 'auto',
      action: 'launch',
      headless: command.headless ?? true,
    });
  }

  const page = browser.getPage();
  const engine = command.engine ?? 'google';
  const limit = command.limit ?? 10;
  const timeout = (command.timeout ?? 15) * 1000;

  try {
    const searchUrl = `${ENGINE_URLS[engine]}?q=${encodeURIComponent(command.query)}`;

    await page.goto(searchUrl, {
      timeout,
      waitUntil: 'domcontentloaded',
    });

    await Promise.race([
      page.waitForLoadState('networkidle', { timeout: Math.min(timeout, 5000) }).catch(() => {}),
      page.waitForTimeout(3000),
    ]);

    let results: SearchResult[];

    switch (engine) {
      case 'google':
        results = await parseGoogleResults(page, limit);
        break;
      case 'bing':
        results = await parseBingResults(page, limit);
        break;
      case 'duckduckgo':
        results = await parseDuckDuckGoResults(page, limit);
        break;
      default:
        results = [];
    }

    return successResponse(command.id, {
      query: command.query,
      engine,
      results,
      total: results.length,
    });
  } catch (error) {
    return {
      id: command.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
