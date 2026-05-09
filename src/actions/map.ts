import type { BrowserManager } from '../browser/index.js';
import type { MapCommand, MapResult, Response } from '../types.js';
import { successResponse } from '../protocol.js';
import { discoverLinks } from './crawl.js';

function parseSitemapXml(xml: string): string[] {
  const urls: string[] = [];
  const urlMatches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
  for (const match of urlMatches) {
    urls.push(match[1].trim());
  }
  return urls;
}

function parseSitemapIndex(xml: string): string[] {
  const sitemapUrls: string[] = [];
  const locRegex = /<sitemap[^>]*>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi;
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    sitemapUrls.push(match[1].trim());
  }
  return sitemapUrls;
}

async function discoverSitemapsFromRobots(origin: string): Promise<string[]> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    return text
      .split('\n')
      .filter((l) => l.toLowerCase().startsWith('sitemap:'))
      .map((l) => l.split(':').slice(1).join(':').trim());
  } catch {
    return [];
  }
}

async function fetchSitemapUrls(baseUrl: string): Promise<string[]> {
  const allUrls: string[] = [];
  const base = new URL(baseUrl);

  const robotsSitemaps = await discoverSitemapsFromRobots(base.origin);

  const sitemapUrls = [
    ...robotsSitemaps,
    new URL('/sitemap.xml', baseUrl).href,
    new URL('/sitemap_index.xml', baseUrl).href,
    new URL('/sitemap/', baseUrl).href,
  ];

  const tried = new Set<string>();
  for (const sitemapUrl of sitemapUrls) {
    if (tried.has(sitemapUrl)) continue;
    tried.add(sitemapUrl);
    try {
      const res = await fetch(sitemapUrl, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const xml = await res.text();

      if (xml.includes('<sitemapindex')) {
        const childUrls = parseSitemapIndex(xml);
        for (const childUrl of childUrls) {
          try {
            const childRes = await fetch(childUrl, { signal: AbortSignal.timeout(10000) });
            if (childRes.ok) {
              const childXml = await childRes.text();
              allUrls.push(...parseSitemapXml(childXml));
            }
          } catch {
            // child sitemap fetch failed
          }
        }
      } else {
        allUrls.push(...parseSitemapXml(xml));
      }

      if (allUrls.length > 0) break;
    } catch {
      // sitemap not available
    }
  }

  return allUrls.filter((url) => {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.hostname === base.hostname;
    } catch {
      return false;
    }
  });
}

export async function handleMap(
  command: MapCommand,
  browser: BrowserManager
): Promise<Response<MapResult>> {
  if (!browser.isLaunched()) {
    await browser.launch({
      id: 'auto',
      action: 'launch',
      headless: command.headless ?? true,
    });
  }

  const limit = command.limit ?? 100;
  const timeout = command.timeout ?? 15;
  const baseUrl = command.url;
  const baseOrigin = new URL(baseUrl).origin;
  const baseHostname = new URL(baseUrl).hostname.replace(/^www\./, '');

  const sitemapUrls = await fetchSitemapUrls(baseUrl);

  const page = browser.getPage();
  await page.goto(baseUrl, {
    timeout: timeout * 1000,
    waitUntil: 'domcontentloaded',
  });

  await Promise.race([
    page
      .waitForLoadState('networkidle', { timeout: Math.min(timeout * 1000, 5000) })
      .catch(() => {}),
    page.waitForTimeout(3000),
  ]);

  const htmlUrls = await discoverLinks(page, baseOrigin, baseHostname, '');

  const allUrls = new Set<string>();

  for (const url of [...sitemapUrls, ...htmlUrls]) {
    try {
      const normalized = new URL(url, baseUrl).href;
      const parsed = new URL(normalized);
      if (parsed.origin === baseOrigin) {
        allUrls.add(normalized);
      }
    } catch {
      // invalid URL
    }
  }

  const urls = Array.from(allUrls).slice(0, limit);

  const filtered =
    command.excludePatterns || command.includePatterns
      ? urls.filter((url) => {
          if (command.excludePatterns?.length) {
            for (const pattern of command.excludePatterns) {
              if (globMatch(url, pattern)) return false;
            }
          }
          if (command.includePatterns?.length) {
            for (const pattern of command.includePatterns) {
              if (globMatch(url, pattern)) return true;
            }
            return false;
          }
          return true;
        })
      : urls;

  return successResponse(command.id, {
    url: baseUrl,
    urls: filtered,
    total: filtered.length,
  });
}

function globMatch(url: string, pattern: string): boolean {
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
