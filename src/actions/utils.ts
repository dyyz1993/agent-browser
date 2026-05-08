import type { Page, Locator } from 'playwright-core';

export interface SnapshotData {
  snapshot: string;
  refs?: Record<string, { role: string; name?: string }>;
}

export const EXCLUDE_SELECTORS = [
  'header',
  'footer',
  'nav',
  'aside',
  '.header',
  '.top',
  '.navbar',
  '#header',
  '.footer',
  '.bottom',
  '#footer',
  '.sidebar',
  '.side',
  '.aside',
  '#sidebar',
  '.modal',
  '.popup',
  '#modal',
  '.overlay',
  '.ad',
  '.ads',
  '.advert',
  '#ad',
  '.lang-selector',
  '.language',
  '#language-selector',
  '.social',
  '.social-media',
  '.social-links',
  '#social',
  '.menu',
  '.navigation',
  '#nav',
  '.nav',
  '.breadcrumbs',
  '#breadcrumbs',
  '.share',
  '#share',
  '.widget',
  '#widget',
  '.cookie',
  '#cookie',
  '.cookie-banner',
  'script',
  'style',
  'noscript',
  'iframe',
];

export const FORCE_INCLUDE_SELECTORS = [
  '#main',
  '#content',
  '#article',
  '#post',
  '.main',
  '.content',
  '.article',
  '.post',
  '.markdown-section',
  '.theme-default-content',
  '.md-content',
  'article[role="main"]',
  'main',
  'article',
];

export async function extractContentFromPage(
  page: Page,
  format: 'text' | 'html' | 'markdown',
  selector?: string
): Promise<string> {
  if (selector) {
    const loc = page.locator(selector).first();
    switch (format) {
      case 'text':
        return await loc.evaluate((el) => (el as HTMLElement).innerText || '').catch(() => '');
      case 'html':
        return await loc.evaluate((el) => (el as HTMLElement).innerHTML || '').catch(() => '');
      case 'markdown': {
        const html = await loc
          .evaluate((el) => (el as HTMLElement).innerHTML || '')
          .catch(() => '');
        return htmlToMarkdown(html);
      }
    }
  }

  for (const sel of FORCE_INCLUDE_SELECTORS) {
    try {
      const element = page.locator(sel).first();
      const count = await element.count();
      if (count === 0) continue;

      const text = await element.textContent();
      if (text && text.trim().length > 50) {
        switch (format) {
          case 'text':
            return (await element.textContent())?.trim() || '';
          case 'html':
            return await element.evaluate((el) => (el as HTMLElement).innerHTML);
          case 'markdown': {
            const html = await element.evaluate((el) => (el as HTMLElement).innerHTML);
            return htmlToMarkdown(html);
          }
        }
      }
    } catch {
      continue;
    }
  }

  const cleaned = await page.evaluate((excludeSelectors: string[]) => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    for (const sel of excludeSelectors) {
      const elements = clone.querySelectorAll(sel);
      elements.forEach((el) => el.remove());
    }
    return {
      text: clone.textContent?.trim() || '',
      html: clone.innerHTML,
    };
  }, EXCLUDE_SELECTORS);

  if (cleaned.text.length > 50) {
    switch (format) {
      case 'text':
        return cleaned.text;
      case 'html':
        return cleaned.html;
      case 'markdown':
        return htmlToMarkdown(cleaned.html);
    }
  }

  switch (format) {
    case 'text':
      return await page.evaluate(() => document.body?.innerText || '');
    case 'html':
      return await page.evaluate(() => document.documentElement?.outerHTML || '');
    case 'markdown': {
      const html = await page.evaluate(() => document.documentElement?.outerHTML || '');
      return htmlToMarkdown(html);
    }
  }
}

export async function assertElementExists(
  locator: Locator,
  selector: string,
  isRef: boolean
): Promise<void> {
  const count = await locator.count();
  if (count === 0) {
    if (isRef) {
      throw new Error(
        `Element ref "${selector}" not found. ` + `Run 'snapshot' to get updated element refs.`
      );
    } else {
      throw new Error(
        `No element matches selector "${selector}". ` + `Run 'snapshot' to see available elements.`
      );
    }
  }
}

export function toAIFriendlyError(error: unknown, selector: string): Error {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('strict mode violation')) {
    const countMatch = message.match(/resolved to (\d+) elements/);
    const count = countMatch ? countMatch[1] : 'multiple';

    return new Error(
      `Selector "${selector}" matched ${count} elements. ` +
        `Run 'snapshot' to get updated refs, or use a more specific CSS selector. ` +
        `Tip: Use 'find nth <index> ${selector} --click' to target a specific match.`
    );
  }

  if (message.includes('intercepts pointer events')) {
    return new Error(
      `Element "${selector}" is blocked by another element (likely a modal or overlay). ` +
        `Try dismissing any modals/cookie banners first. ` +
        `Tip: Run 'snapshot -i' to see all visible elements and identify what's blocking.`
    );
  }

  if (message.includes('not visible') && !message.includes('Timeout')) {
    return new Error(
      `Element "${selector}" is not visible. ` +
        `Try 'scrollintoview ${selector}' or check if it's hidden. ` +
        `Tip: Run 'is visible ${selector}' to confirm visibility state.`
    );
  }

  if (message.includes('Timeout') && message.includes('exceeded')) {
    return new Error(
      `Action on "${selector}" timed out. The element may be blocked, still loading, or not interactable. ` +
        `Run 'snapshot' to check the current page state. ` +
        `Tip: If the page is still loading, try 'wait --load networkidle' first.`
    );
  }

  if (
    message.includes('waiting for') &&
    (message.includes('to be visible') || message.includes('Timeout'))
  ) {
    return new Error(
      `Element "${selector}" not found or not visible. ` +
        `Run 'snapshot -i' to see current page elements and their refs. ` +
        `Tip: If using @ref, the page may have changed. Re-run 'snapshot -i' to get fresh refs.`
    );
  }

  if (message.includes('Execution context was destroyed') || message.includes('Target closed')) {
    return new Error(
      `Browser context was lost (page navigated or closed). ` +
        `Re-open the page with 'open <url>' and start fresh. ` +
        `Tip: This usually happens after a form submission triggers navigation.`
    );
  }

  if (message.includes('querySelector') || message.includes('is not a valid selector')) {
    return new Error(
      `Invalid selector "${selector}". ` +
        `CSS selectors like '#id', '.class', or 'tag' are supported. ` +
        `Tip: Use 'snapshot -i' to get @ref selectors (e.g., @e1) that are always valid.`
    );
  }

  return error instanceof Error ? error : new Error(message);
}

export function htmlToMarkdown(html: string): string {
  let md = html;

  md = md.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  md = md.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gis, '\n```\n$1\n```\n');
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gis, '\n```\n$1\n```\n');
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gis, '`$1`');

  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gis, '\n# $1\n\n');
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gis, '\n## $1\n\n');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gis, '\n### $1\n\n');
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gis, '\n#### $1\n\n');
  md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gis, '\n##### $1\n\n');
  md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gis, '\n###### $1\n\n');

  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gis, '**$1**');
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gis, '**$1**');
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gis, '*$1*');
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gis, '*$1*');

  md = md.replace(/<p[^>]*>(.*?)<\/p>/gis, '\n$1\n\n');
  md = md.replace(/<div[^>]*>(.*?)<\/div>/gis, '\n$1\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');

  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gis, (_match, content) => {
    return '\n' + content.replace(/<li[^>]*>(.*?)<\/li>/gis, '- $1\n') + '\n';
  });

  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gis, (_match, content) => {
    let index = 1;
    return '\n' + content.replace(/<li[^>]*>(.*?)<\/li>/gis, () => `${index++}. $1\n`) + '\n';
  });

  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gis, '[$2]($1)');
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gis, '![$2]($1)');
  md = md.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*>/gis, '![$1]($2)');
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*>/gis, '![]($1)');

  md = md.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, '\n> $1\n\n');
  md = md.replace(/<hr[^>]*>/gi, '\n---\n');

  md = md.replace(/<[^>]+>/g, '');

  md = md.replace(/&nbsp;/g, ' ');
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");

  md = md.replace(/\n{3,}/g, '\n\n');
  return md.trim();
}
