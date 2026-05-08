import type { Page } from 'playwright-core';
import type { BrowserManager } from '../browser/index.js';
import type { CrawlCommand, CrawlPage, CrawlResult, Response } from '../types.js';
import { successResponse } from '../protocol.js';
import { htmlToMarkdown, extractContentFromPage, EXCLUDE_SELECTORS } from './utils.js';

const STATIC_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.css',
  '.js',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.zip',
  '.tar',
  '.gz',
  '.rar',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.mp3',
  '.mp4',
  '.avi',
  '.mov',
  '.rss',
  '.atom',
  '.xml',
];

const SOCIAL_DOMAINS = [
  'facebook.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'linkedin.com',
  'youtube.com',
  'tiktok.com',
  'reddit.com',
  'pinterest.com',
  'tumblr.com',
  'weibo.com',
  'zhihu.com',
];

const LOW_VALUE_PATTERNS = [
  /\/commit\//i,
  /\/tree\//i,
  /\/blob\//i,
  /\/raw\//i,
  /\/releases\//i,
  /\/compare\//i,
  /\/fork/i,
  /\/stargazers/i,
  /\/watchers/i,
  /\/network/i,
  /\/graphs/i,
  /\/settings/i,
  /\/community/i,
  /\/templates/i,
  /\/milestones/i,
  /\/labels/i,
  /\/assignments/i,
];

export async function handleCrawl(
  command: CrawlCommand,
  browser: BrowserManager
): Promise<Response<CrawlResult>> {
  const page = browser.getPage();
  if (!page) {
    return {
      id: command.id,
      success: false,
      error: 'Browser page not initialized',
    };
  }

  const maxDepth = command.depth ?? 2;
  const maxPages = command.limit ?? 50;
  const format = command.format ?? 'markdown';
  const timeoutMs = (command.timeout ?? 15) * 1000;

  const startUrl = normalizeUrl(command.url);
  const parsedStart = new URL(startUrl);
  const baseOrigin = parsedStart.origin;
  const baseHostname = parsedStart.hostname.replace(/^www\./, '');
  const basePath = parsedStart.pathname.replace(/\/$/, '');
  const visited = new Set<string>();
  const pages: CrawlPage[] = [];
  const pageUrls = new Set<string>();
  let failed = 0;

  type QueueEntry = { url: string; depth: number; priority: number };
  const queue: QueueEntry[] = [{ url: startUrl, depth: 0, priority: 0 }];

  function urlPriority(url: string): number {
    for (const p of LOW_VALUE_PATTERNS) {
      if (p.test(url)) return 10;
    }
    return 0;
  }

  while (queue.length > 0 && pages.length < maxPages) {
    queue.sort((a, b) => a.priority - b.priority || a.depth - b.depth);

    const batch: QueueEntry[] = [];
    while (queue.length > 0 && batch.length < 1 && pages.length + batch.length < maxPages) {
      const entry = queue.shift()!;
      const normalized = normalizeUrl(entry.url);
      if (visited.has(normalized)) continue;
      visited.add(normalized);
      batch.push({ ...entry, url: normalized });
    }

    const results = await Promise.allSettled(
      batch.map((entry) =>
        crawlPage(
          page,
          entry.url,
          baseOrigin,
          baseHostname,
          basePath,
          format,
          command.selector,
          timeoutMs
        )
      )
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const entry = batch[i];

      if (result.status === 'fulfilled' && result.value) {
        const crawlPageData = result.value;
        const finalUrl = normalizeUrl(crawlPageData.url);
        if (pageUrls.has(finalUrl)) continue;
        pageUrls.add(finalUrl);
        pages.push(crawlPageData);

        if (entry.depth < maxDepth) {
          for (const link of crawlPageData.links || []) {
            const normalized = normalizeUrl(link);
            if (visited.has(normalized)) continue;
            if (!isAllowedUrl(normalized, baseOrigin, baseHostname, basePath)) continue;
            if (pages.length + queue.length >= maxPages) break;
            queue.push({
              url: normalized,
              depth: entry.depth + 1,
              priority: urlPriority(normalized),
            });
          }
        }
      } else {
        failed++;
      }
    }
  }

  return successResponse(command.id, {
    url: startUrl,
    pages,
    total: pages.length,
    crawled: pages.length,
    failed,
  });
}

async function crawlPage(
  page: Page,
  url: string,
  baseOrigin: string,
  baseHostname: string,
  basePath: string,
  format: 'text' | 'html' | 'markdown',
  selector?: string,
  timeoutMs: number = 15000
): Promise<CrawlPage | null> {
  try {
    await page.goto(url, { timeout: timeoutMs, waitUntil: 'domcontentloaded' });

    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

    if (selector) {
      try {
        await page.locator(selector).first().waitFor({ state: 'attached', timeout: 5000 });
      } catch {
        // Selector may not exist on all pages
      }
    }

    const [title, content, links] = await Promise.all([
      page.title(),
      extractContentFromPage(page, format, selector),
      discoverLinks(page, baseOrigin, baseHostname, basePath),
    ]);

    return { url: page.url(), title, content, links };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Timeout') || msg.includes('timeout')) {
      try {
        const [title, content] = await Promise.all([
          page.title().catch(() => url),
          extractContentFromPage(page, format, selector).catch(() => ''),
        ]);
        const links = await discoverLinks(page, baseOrigin, baseHostname, basePath).catch(
          () => [] as string[]
        );
        return { url: page.url(), title, content, links };
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function discoverLinks(
  page: Page,
  baseOrigin: string,
  baseHostname: string,
  basePath: string
): Promise<string[]> {
  const hrefs = await page.evaluate((origin: string) => {
    const anchors = document.querySelectorAll('a[href]');
    const results: string[] = [];
    anchors.forEach((a) => {
      const href = a.getAttribute('href');
      if (!href) return;
      try {
        const fullUrl = new URL(href, origin).href;
        results.push(fullUrl);
      } catch {
        // invalid URL
      }
    });
    return results;
  }, baseOrigin);

  const filtered = new Set<string>();

  for (const href of hrefs) {
    try {
      const url = new URL(href);

      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;

      const pathname = url.pathname.toLowerCase();
      if (STATIC_EXTENSIONS.some((ext) => pathname.endsWith(ext))) continue;

      const hostname = url.hostname.replace(/^www\./, '');
      if (SOCIAL_DOMAINS.some((d) => hostname === d || hostname.endsWith('.' + d))) continue;

      if (hostname !== baseHostname && !hostname.endsWith('.' + baseHostname)) {
        if (url.origin !== baseOrigin) continue;
      }

      if (basePath && basePath !== '/') {
        const normalizedBase = basePath.endsWith('/') ? basePath : basePath + '/';
        const urlPath = url.pathname;
        if (urlPath !== basePath && !urlPath.startsWith(normalizedBase)) continue;
      }

      const normalized = normalizeUrlFromUrl(url);
      if (normalized) filtered.add(normalized);
    } catch {
      continue;
    }
  }

  return Array.from(filtered);
}

function isAllowedUrl(
  url: string,
  baseOrigin: string,
  baseHostname: string,
  basePath: string
): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const pathname = u.pathname.toLowerCase();
    if (STATIC_EXTENSIONS.some((ext) => pathname.endsWith(ext))) return false;
    const hostname = u.hostname.replace(/^www\./, '');
    if (SOCIAL_DOMAINS.some((d) => hostname === d || hostname.endsWith('.' + d))) return false;

    if (
      hostname !== baseHostname &&
      !hostname.endsWith('.' + baseHostname) &&
      u.origin !== baseOrigin
    ) {
      return false;
    }

    if (basePath && basePath !== '/') {
      const normalizedBase = basePath.endsWith('/') ? basePath : basePath + '/';
      const urlPath = u.pathname;
      if (urlPath !== basePath && !urlPath.startsWith(normalizedBase)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return normalizeUrlFromUrl(u);
  } catch {
    return url;
  }
}

export function normalizeUrlFromUrl(u: URL): string {
  let pathname = u.pathname;
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  const hash = u.hash;
  if (hash && hash.startsWith('#/')) {
    const hashPath = hash.slice(2);
    const cleanHashPath = hashPath.split(/[?#]/)[0];
    if (!cleanHashPath || cleanHashPath === '/') {
      return `${u.origin}${pathname}`;
    }
    return `${u.origin}${pathname}#/${cleanHashPath}`;
  }
  return `${u.origin}${pathname}`;
}
