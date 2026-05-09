import fs from 'fs';
import type { Page } from 'playwright-core';
import type { BrowserManager } from '../browser/index.js';
import type { SearchCommand, Response, SearchResponse, SearchResult } from '../types.js';
import { successResponse } from '../protocol.js';

const STEALTH_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

async function applyStealth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  await page.addInitScript(() => {
    (window as any).chrome = { runtime: {} };
  });

  await page.addInitScript(() => {
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters: any) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
        : originalQuery(parameters);
  });

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
  });

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  });
}

function buildSearchUrl(engine: string, query: string): string {
  const encoded = encodeURIComponent(query);
  switch (engine) {
    case 'google':
      return `https://www.google.com/search?q=${encoded}&udm=14`;
    case 'bing':
      return `https://www.bing.com/search?q=${encoded}`;
    case 'duckduckgo':
      return `https://html.duckduckgo.com/html/?q=${encoded}`;
    default:
      return `https://www.google.com/search?q=${encoded}&udm=14`;
  }
}

const SELECTORS = {
  google: {
    result: 'div.g, div[data-hveid]',
    title: 'h3',
    link: 'a[href]',
    snippet: 'div[data-sncf-ied="cf"] span, div.VwiC3b, div.st, span[style]',
  },
  bing: {
    result: 'li.b_algo',
    title: 'h2',
    link: 'a[href]',
    snippet: 'p, div.b_caption p',
  },
  duckduckgo: {
    result: 'div.result',
    title: 'a.result__a',
    link: 'a.result__a',
    snippet: 'a.result__snippet, td.result__snippet',
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
      const titleEl = el.locator(SELECTORS.duckduckgo.title);
      const title = await titleEl.textContent();
      const url = await titleEl.getAttribute('href');
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
  const useStealth = command.stealth !== false;
  const engine = command.engine ?? 'google';

  if (!browser.isLaunched()) {
    await browser.launch({
      id: 'auto',
      action: 'launch',
      headless: command.headless ?? true,
    });
  }

  const page = browser.getPage();
  const limit = command.limit ?? 10;
  const timeout = (command.timeout ?? 15) * 1000;

  try {
    if (useStealth && engine !== 'bing') {
      await applyStealth(page);
      try {
        await page.context().setExtraHTTPHeaders({
          'User-Agent': STEALTH_USER_AGENT,
        });
      } catch {}
      try {
        await page.setViewportSize({ width: 1920, height: 1080 });
      } catch {}
    }

    const searchUrl = buildSearchUrl(engine, command.query);

    await page.goto(searchUrl, {
      timeout,
      waitUntil: 'domcontentloaded',
    });

    if (engine === 'duckduckgo') {
      await page.waitForLoadState('domcontentloaded', { timeout });
    } else {
      await Promise.race([
        page.waitForLoadState('networkidle', { timeout: Math.min(timeout, 5000) }).catch(() => {}),
        page.waitForTimeout(3000),
      ]);
    }

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

    const response: Response<SearchResponse> = successResponse(command.id, {
      query: command.query,
      engine,
      results,
      total: results.length,
    });

    if (command.outputFile && response.success) {
      fs.writeFileSync(command.outputFile, JSON.stringify(response.data, null, 2), 'utf-8');
    }

    return response;
  } catch (error) {
    return {
      id: command.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
