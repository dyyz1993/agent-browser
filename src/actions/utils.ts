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
  '.cookie-notice',
  '.feedback',
  '.feedback-container',
  '#feedback',
  '.report',
  '.vote',
  '.vote-container',
  'script',
  'style',
  'noscript',
  'iframe',
  'svg',
  'form[action*="search"]',
  '.search-form',
  '#search',
  '.doc-footer',
  '.doc-header',
  '.doc-sidebar',
  '.doc-nav',
  '.page-footer',
  '.page-header',
  '.site-footer',
  '.site-header',
  '.site-nav',
  '.global-nav',
  '.global-footer',
  '.chat-widget',
  '.chat-button',
  '.chat-widget-container',
  '#chat-widget',
  '.consult',
  '.online-consult',
  '.customer-service',
  '.toolbar',
  '.tool-bar',
  '.floating-bar',
  '.fixed-bar',
  '.sticky-bar',
  '.back-to-top',
  '.breadcrumb',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '.prev-next',
  '.pagination',
  '.pager',
  '.article-nav',
  '.article-navigation',
  '.post-navigation',
  '.turn-page',
  '[class*="sidebar"]',
  '[class*="Sidebar"]',
  '[class*="feedback"]',
  '[class*="Feedback"]',
  '[class*="footer"]',
  '[class*="Footer"]',
  '[class*="chat-"]',
  '[class*="consult"]',
  '[class*="favorite"]',
  '[class*="download"]',
  '[class*="toolbar"]',
  '[class*="Toolbar"]',
  '[class*="drawer"]',
  '[class*="Drawer"]',
  '[class*="appbar"]',
  '[class*="Appbar"]',
  '[class*="consult"]',
  '[class*="customer"]',
  '[class*="feedback"]',
  '[class*="report"]',
];

const SPECIFIC_CONTENT_SELECTORS = [
  '.markdown-body',
  '.markdown-section',
  '.doc-content',
  '.doc-body',
  '.article-content',
  '.post-content',
  '.entry-content',
  '.documentation',
  '.docs-content',
  '.readme',
  '.theme-default-content',
  '.md-content',
];

const SEMANTIC_CONTENT_SELECTORS = [
  'article[role="main"]',
  'main article',
  '#main article',
  '.main article',
  '[role="article"]',
  'article',
  'main',
];

const GENERIC_CONTENT_SELECTORS = [
  '#main',
  '#content',
  '#article',
  '.main',
  '.content',
  '.article',
  '.post',
];

const FUZZY_CONTENT_SELECTORS = [
  '[class*="doc-content"]',
  '[class*="docContent"]',
  '[class*="content-doc"]',
  '[class*="markdown-body"]',
  '[class*="markdownBody"]',
  '[class*="markdown-section"]',
  '[class*="markdownSection"]',
  '[class*="article-content"]',
  '[class*="articleContent"]',
  '[class*="docs-content"]',
  '[class*="docsContent"]',
  '[class*="post-content"]',
  '[class*="postContent"]',
  '[class*="md-viewer"]',
  '[class*="MdViewer"]',
  '[class*="md-content"]',
  '[class*="MdContent"]',
  '[class*="doc-viewer"]',
  '[class*="DocViewer"]',
  '[class*="viewer-container"]',
  '[class*="ViewerContainer"]',
];

export const FORCE_INCLUDE_SELECTORS = [
  ...SPECIFIC_CONTENT_SELECTORS,
  ...SEMANTIC_CONTENT_SELECTORS,
  ...GENERIC_CONTENT_SELECTORS,
  ...FUZZY_CONTENT_SELECTORS,
];

export async function extractContentFromPage(
  page: Page,
  format: 'text' | 'html' | 'markdown',
  selector?: string
): Promise<string> {
  if (selector) {
    const loc = page.locator(selector).first();
    const result = await loc
      .evaluate((el, excludeSelectors) => {
        const clone = el.cloneNode(true) as HTMLElement;
        for (const sel of excludeSelectors) {
          clone.querySelectorAll(sel).forEach((n) => n.remove());
        }
        clone.querySelectorAll('svg').forEach((n) => n.remove());
        clone.querySelectorAll('img').forEach((img: HTMLImageElement) => {
          const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
          if (src.startsWith('data:image')) img.remove();
        });
        return {
          text: clone.textContent?.trim() || '',
          html: clone.innerHTML,
        };
      }, EXCLUDE_SELECTORS)
      .catch(() => null);

    if (result && result.text.length > 0) {
      switch (format) {
        case 'text':
          return result.text;
        case 'html':
          return result.html;
        case 'markdown':
          return htmlToMarkdown(result.html);
      }
    }
  }

  const contentElement = await findMainContentElement(page);
  if (contentElement) {
    switch (format) {
      case 'text':
        return contentElement.text;
      case 'html':
        return contentElement.html;
      case 'markdown':
        return htmlToMarkdown(contentElement.html);
    }
  }

  const cleaned = await page.evaluate((excludeSelectors: string[]) => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    for (const sel of excludeSelectors) {
      clone.querySelectorAll(sel).forEach((el) => el.remove());
    }
    clone.querySelectorAll('svg').forEach((el) => el.remove());
    clone.querySelectorAll('img').forEach((img: HTMLImageElement) => {
      const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
      if (src.startsWith('data:image')) img.remove();
    });
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

async function findMainContentElement(page: Page): Promise<{ text: string; html: string } | null> {
  const selectorWeights: [string, number][] = [
    ...SPECIFIC_CONTENT_SELECTORS.map((s) => [s, 3] as [string, number]),
    ...FUZZY_CONTENT_SELECTORS.map((s) => [s, 2.5] as [string, number]),
    ...SEMANTIC_CONTENT_SELECTORS.map((s) => [s, 1.5] as [string, number]),
    ...GENERIC_CONTENT_SELECTORS.map((s) => [s, 1] as [string, number]),
  ];

  const best = await page.evaluate(
    ([selWeights, excludeSelectors]: [Array<[string, number]>, string[]]) => {
      function cleanElement(el: HTMLElement, excSels: string[]): HTMLElement {
        const clone = el.cloneNode(true) as HTMLElement;
        for (const sel of excSels) {
          clone.querySelectorAll(sel).forEach((n: Element) => n.remove());
        }
        clone
          .querySelectorAll(
            '[aria-hidden="true"], [role="navigation"], [role="banner"], [role="complementary"], [role="search"], [role="contentinfo"]'
          )
          .forEach((n: Element) => n.remove());
        clone.querySelectorAll('[hidden]').forEach((n: Element) => n.remove());
        clone.querySelectorAll('[style]').forEach((n: Element) => {
          const style = (n as HTMLElement).getAttribute('style') || '';
          if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(style)) {
            n.remove();
          }
        });
        clone.querySelectorAll('svg').forEach((n: Element) => n.remove());
        clone.querySelectorAll('img').forEach((img: HTMLImageElement) => {
          const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
          if (src.startsWith('data:image')) {
            img.remove();
          }
        });
        return clone;
      }

      let bestResult: { text: string; html: string; score: number } | null = null;

      for (const [sel, weight] of selWeights) {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) continue;

        const clone = cleanElement(el, excludeSelectors);

        const text = clone.textContent?.trim() || '';
        if (text.length <= 50) continue;

        const contentTags = clone.querySelectorAll(
          'p, h1, h2, h3, h4, h5, h6, ul, ol, pre, table, blockquote'
        );
        if (contentTags.length < 2) continue;

        const textLength = text.length;
        const elementCount = clone.querySelectorAll('*').length;
        const density = elementCount > 0 ? textLength / elementCount : 0;
        if (density < 3) continue;

        const score = weight * density * Math.log(textLength + 1) * contentTags.length;

        if (!bestResult || score > bestResult.score) {
          bestResult = { text, html: clone.innerHTML, score };
        }
      }

      return bestResult ? { text: bestResult.text, html: bestResult.html } : null;
    },
    [selectorWeights, EXCLUDE_SELECTORS] as [Array<[string, number]>, string[]]
  );

  return best;
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

const SPA_CONTENT_SELECTORS = [
  '.markdown-section',
  '.theme-default-content',
  '#app main',
  '#main',
  '.content',
  'article',
  '.md-content',
  '[role="main"]',
];

export async function waitForSPAContent(page: Page, timeoutMs: number): Promise<void> {
  try {
    await page.waitForFunction(
      (selectors) => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && el.textContent && el.textContent.trim().length > 50) {
            return true;
          }
        }
        return false;
      },
      SPA_CONTENT_SELECTORS,
      { timeout: timeoutMs }
    );
    await page.waitForTimeout(500);
  } catch {
    // SPA content selectors may not match on non-SPA pages
  }
}

export function htmlToMarkdown(html: string): string {
  let md = html;

  md = md.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
  md = md.replace(/<meta[^>]*>/gi, '');
  md = md.replace(/<link[^>]*>/gi, '');

  md = md.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '');
  md = md.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  md = md.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  md = md.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

  md = md.replace(
    /<img[^>]*?(?:src|data-src)\s*=\s*["']?\s*data:image\/[^"'>]+["']?[^>]*\/?>/gi,
    ''
  );
  md = md.replace(/<img[^>]*?(?:src|data-src)\s*=\s*["']data:[^"']+["'][^>]*\/?>/gi, '');

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

  md = md.replace(/!\[[^\]]*\]\([^)]*data:[^)]*\)/gi, '');
  md = md.replace(/!\[[^\]]*\]\(data:image[^)]*\)/gi, '');
  md = md.replace(/data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+/gi, '');
  md = md.replace(/(?<!!)\[\]\([^)]*\)/g, '');
  md = md.replace(/\[Skip to Content\]\(.*?\)/gi, '');

  md = md.replace(/\[([^\]]*?)\n([^\]]*?)\]\(/g, '[$1 $2](');

  md = md.replace(/&nbsp;/g, ' ');
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");

  md = md.replace(/\n{3,}/g, '\n\n');
  return md.trim();
}
