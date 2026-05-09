import type { Page } from 'playwright-core';
import type { BrowserManager } from '../browser/index.js';
import type { CrawlCommand, CrawlPage, CrawlResult, Response } from '../types.js';
import { successResponse } from '../protocol.js';
import { extractContentFromPage, waitForSPAContent } from './utils.js';

const STATIC_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.webp',
  '.avif',
  '.bmp',
  '.tiff',
  '.mp3',
  '.mp4',
  '.avi',
  '.mov',
  '.wmv',
  '.flv',
  '.webm',
  '.ogg',
  '.wav',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.css',
  '.js',
  '.mjs',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.odt',
  '.ods',
  '.odp',
  '.rtf',
  '.zip',
  '.gz',
  '.tar',
  '.rar',
  '.7z',
  '.bz2',
  '.exe',
  '.dmg',
  '.deb',
  '.rpm',
  '.msi',
  '.xml',
  '.json',
  '.yaml',
  '.yml',
  '.csv',
  '.bin',
  '.iso',
  '.img',
  '.apk',
  '.ipa',
  '.rss',
  '.atom',
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

function matchesPattern(url: string, pattern: string): boolean {
  const regex = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '<<<GLOBSTAR>>>')
        .replace(/\*/g, '[^/]*')
        .replace(/<<<GLOBSTAR>>>/g, '.*')
        .replace(/\?/g, '[^/]') +
      '$'
  );
  return regex.test(url);
}

function filterUrlByPatterns(
  url: string,
  excludePatterns?: string[],
  includePatterns?: string[]
): boolean {
  if (excludePatterns?.length) {
    for (const pattern of excludePatterns) {
      if (matchesPattern(url, pattern)) return false;
    }
  }
  if (includePatterns?.length) {
    for (const pattern of includePatterns) {
      if (matchesPattern(url, pattern)) return true;
    }
    return false;
  }
  return true;
}

interface RobotsRule {
  allowed: string[];
  disallowed: string[];
  crawlDelay?: number;
}

async function fetchRobotsTxt(origin: string): Promise<string> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? await res.text() : '';
  } catch {
    return '';
  }
}

function parseRobotsTxt(robotsTxt: string, userAgent: string = '*'): RobotsRule {
  const allowed: string[] = [];
  const disallowed: string[] = [];
  let crawlDelay: number | undefined;

  const lines = robotsTxt.split('\n').map((l) => l.trim());
  let matchAgent = false;

  for (const line of lines) {
    if (line.startsWith('#') || !line) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (key === 'user-agent') {
      matchAgent = value === '*' || value.toLowerCase() === (userAgent || '*').toLowerCase();
    } else if (matchAgent) {
      if (key === 'disallow' && value) {
        disallowed.push(value);
      } else if (key === 'allow' && value) {
        allowed.push(value);
      } else if (key === 'crawl-delay' && value) {
        crawlDelay = parseFloat(value);
      }
    }
  }

  return { allowed, disallowed, crawlDelay };
}

function matchesRobotsPattern(pathname: string, pattern: string): boolean {
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\$$/, '');
  try {
    return new RegExp(`^${regex}`).test(pathname);
  } catch {
    return false;
  }
}

function isAllowedByRobots(pathname: string, rules: RobotsRule): boolean {
  for (const pattern of rules.allowed) {
    if (matchesRobotsPattern(pathname, pattern)) return true;
  }
  for (const pattern of rules.disallowed) {
    if (matchesRobotsPattern(pathname, pattern)) return false;
  }
  return true;
}

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
  const allowExternal = command.allowExternal ?? false;
  const excludePatterns = command.excludePatterns;
  const includePatterns = command.includePatterns;
  const concurrency = command.concurrency ?? 1;

  const context = page.context();
  if (command.cookies && command.cookies.length > 0) {
    await context.addCookies(command.cookies);
  }

  const startUrl = normalizeUrl(command.url);
  const parsedStart = new URL(startUrl);
  const baseOrigin = parsedStart.origin;
  const baseHostname = parsedStart.hostname.replace(/^www\./, '');
  const basePath = parsedStart.pathname.replace(/\/$/, '');
  const robotsTxt = await fetchRobotsTxt(baseOrigin);
  const robotsRules = parseRobotsTxt(robotsTxt);
  const crawlDelay = robotsRules.crawlDelay ? robotsRules.crawlDelay * 1000 : 0;
  const visited = new Set<string>();
  const pages: CrawlPage[] = [];
  const pageUrls = new Set<string>();
  let failed = 0;

  type QueueEntry = { url: string; depth: number; priority: number };
  const queue: QueueEntry[] = [{ url: startUrl, depth: 0, priority: 0 }];

  function generateUrlPermutations(url: string): string[] {
    try {
      const u = new URL(url);
      const variants: string[] = [u.href];

      if (u.hostname.startsWith('www.')) {
        const stripped = new URL(u.href);
        stripped.hostname = u.hostname.slice(4);
        variants.push(stripped.href);
      } else {
        const withWWW = new URL(u.href);
        withWWW.hostname = 'www.' + u.hostname;
        variants.push(withWWW.href);
      }

      if (u.pathname.endsWith('/')) {
        const noSlash = new URL(u.href);
        noSlash.pathname = noSlash.pathname.replace(/\/$/, '') || '/';
        variants.push(noSlash.href);
      } else {
        const withSlash = new URL(u.href);
        withSlash.pathname += '/';
        variants.push(withSlash.href);
      }

      const indexPattern = /\/(index\.(html|htm|php|aspx?))$/i;
      if (indexPattern.test(u.pathname)) {
        const noIndex = new URL(u.href);
        noIndex.pathname = u.pathname.replace(indexPattern, '/') || '/';
        variants.push(noIndex.href);
      }

      if (u.hash && !u.hash.startsWith('#/') && !u.hash.startsWith('#!')) {
        const noHash = new URL(u.href);
        noHash.hash = '';
        variants.push(noHash.href);
      }

      return [...new Set(variants)];
    } catch {
      return [url];
    }
  }

  function isVisited(url: string): boolean {
    return generateUrlPermutations(url).some((perm) => visited.has(perm));
  }

  function markVisited(url: string): void {
    for (const perm of generateUrlPermutations(url)) {
      visited.add(perm);
    }
  }

  function urlPriority(url: string): number {
    for (const p of LOW_VALUE_PATTERNS) {
      if (p.test(url)) return 10;
    }
    return 0;
  }

  while (queue.length > 0 && pages.length < maxPages) {
    queue.sort((a, b) => a.priority - b.priority || a.depth - b.depth);

    const batch: QueueEntry[] = [];
    while (
      queue.length > 0 &&
      batch.length < concurrency &&
      pages.length + batch.length < maxPages
    ) {
      const entry = queue.shift()!;
      const normalized = normalizeUrl(entry.url);
      if (isVisited(normalized)) continue;
      markVisited(normalized);
      batch.push({ ...entry, url: normalized });
    }

    const results = await Promise.allSettled(
      batch.map((entry) =>
        crawlPage(
          browser,
          page,
          entry.url,
          baseOrigin,
          baseHostname,
          basePath,
          format,
          command.selector,
          timeoutMs,
          allowExternal,
          excludePatterns,
          includePatterns,
          command.javaScriptEnabled,
          robotsRules,
          crawlDelay,
          concurrency > 1
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
        markVisited(finalUrl);
        pages.push(crawlPageData);

        if (crawlDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, crawlDelay));
        }

        if (entry.depth < maxDepth) {
          for (const link of crawlPageData.links || []) {
            const normalized = normalizeUrl(link);
            if (isVisited(normalized)) continue;
            if (!isAllowedUrl(normalized, baseOrigin, baseHostname, basePath, allowExternal))
              continue;
            if (!filterUrlByPatterns(normalized, excludePatterns, includePatterns)) continue;
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
  browser: BrowserManager,
  mainPage: Page,
  url: string,
  baseOrigin: string,
  baseHostname: string,
  basePath: string,
  format: 'text' | 'html' | 'markdown',
  selector?: string,
  timeoutMs: number = 15000,
  allowExternal: boolean = false,
  excludePatterns?: string[],
  includePatterns?: string[],
  javaScriptEnabled?: boolean,
  robotsRules?: RobotsRule,
  crawlDelay?: number,
  useNewTab: boolean = false
): Promise<CrawlPage | null> {
  let page = mainPage;
  let disposable = false;

  if (useNewTab) {
    const browserInstance = browser.getBrowser();
    if (!browserInstance) return null;
    try {
      page = await browserInstance.newPage(
        javaScriptEnabled === false ? { javaScriptEnabled: false } : undefined
      );
      disposable = true;
    } catch {
      return null;
    }
  } else if (javaScriptEnabled === false) {
    const browserInstance = browser.getBrowser();
    if (browserInstance) {
      page = await browserInstance.newPage({ javaScriptEnabled: false });
      disposable = true;
    }
  }

  try {
    if (robotsRules) {
      const urlPath = new URL(url).pathname;
      if (!isAllowedByRobots(urlPath, robotsRules)) {
        return null;
      }
    }

    if (!useNewTab) {
      const currentUrl = page.url();
      if (currentUrl !== 'about:blank' && currentUrl !== url) {
        try {
          const currentHost = new URL(currentUrl).hostname;
          const targetHost = new URL(url).hostname;
          if (currentHost !== targetHost) {
            await page.goto('about:blank').catch(() => {});
          }
        } catch {
          await page.goto('about:blank').catch(() => {});
        }
      }
    }

    await page.goto(url, { timeout: timeoutMs, waitUntil: 'domcontentloaded' });

    const contentType = await page.evaluate(() => document.contentType).catch(() => '');
    if (contentType && !contentType.includes('html')) {
      return null;
    }

    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

    if (url.includes('#/') || url.includes('#!')) {
      await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
      await waitForSPAContent(page, 5000);
    }

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
      discoverLinks(page, baseOrigin, baseHostname, basePath, allowExternal),
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
        const links = await discoverLinks(
          page,
          baseOrigin,
          baseHostname,
          basePath,
          allowExternal
        ).catch(() => [] as string[]);
        return { url: page.url(), title, content, links };
      } catch {
        return null;
      } finally {
        if (disposable) await page.close().catch(() => {});
      }
    }
    return null;
  } finally {
    if (disposable) await page.close().catch(() => {});
  }
}

export async function discoverLinks(
  page: Page,
  baseOrigin: string,
  baseHostname: string,
  basePath: string,
  allowExternal: boolean = false
): Promise<string[]> {
  const hrefs = await page.evaluate(() => {
    const anchors = document.querySelectorAll('a[href]');
    const results: string[] = [];
    const base = document.baseURI;
    anchors.forEach((a) => {
      const href = a.getAttribute('href');
      if (!href) return;
      try {
        const fullUrl = new URL(href, base).href;
        results.push(fullUrl);
      } catch {
        // invalid URL
      }
    });
    return results;
  });

  const filtered = new Set<string>();

  for (const href of hrefs) {
    try {
      const url = new URL(href);

      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;

      const pathname = url.pathname.toLowerCase();
      if (STATIC_EXTENSIONS.some((ext) => pathname.endsWith(ext))) continue;

      const hostname = url.hostname.replace(/^www\./, '');
      if (SOCIAL_DOMAINS.some((d) => hostname === d || hostname.endsWith('.' + d))) continue;

      if (!allowExternal) {
        if (hostname !== baseHostname && !hostname.endsWith('.' + baseHostname)) {
          if (url.origin !== baseOrigin) continue;
        }
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
  basePath: string,
  allowExternal: boolean = false
): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const pathname = u.pathname.toLowerCase();
    if (STATIC_EXTENSIONS.some((ext) => pathname.endsWith(ext))) return false;
    const hostname = u.hostname.replace(/^www\./, '');
    if (SOCIAL_DOMAINS.some((d) => hostname === d || hostname.endsWith('.' + d))) return false;

    if (!allowExternal) {
      if (
        hostname !== baseHostname &&
        !hostname.endsWith('.' + baseHostname) &&
        u.origin !== baseOrigin
      ) {
        return false;
      }
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
