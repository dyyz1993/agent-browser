import type { BrowserManager } from '../browser/index.js';
import type { MapCommand, MapResult, Response } from '../types.js';
import { successResponse } from '../protocol.js';
import { discoverLinks } from './crawl.js';

async function discoverFromSitemap(baseUrl: string): Promise<string[]> {
  const urls: string[] = [];

  try {
    const base = new URL(baseUrl);
    const sitemapUrl = `${base.origin}/sitemap.xml`;

    const response = await fetch(sitemapUrl, {
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const xml = await response.text();
      const urlMatches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
      for (const match of urlMatches) {
        const url = match[1].trim();
        try {
          const parsedUrl = new URL(url);
          if (parsedUrl.hostname === base.hostname) {
            urls.push(url);
          }
        } catch {
          // invalid URL
        }
      }
    }
  } catch {
    // Sitemap not available
  }

  return urls;
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

  const sitemapUrls = await discoverFromSitemap(baseUrl);

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

  return successResponse(command.id, {
    url: baseUrl,
    urls,
    total: urls.length,
  });
}
