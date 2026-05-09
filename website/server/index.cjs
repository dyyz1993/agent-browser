const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { chromium } = require('playwright-core');
const { htmlToMarkdown } = require('./html-to-markdown.cjs');

const app = express();
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests, please try again later' }
});
app.use('/api/', limiter);

const BROWSER_WS_URL = process.env.BROWSER_WS_URL ||
  'wss://browser.19930810.xyz:8443/ws/connect?apiKey=bf8c246f-77ba-4324-a249-ecc667152d9d&width=1280&height=800&sharedUserData=true';

let browserInstance = null;

async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.connectOverCDP(BROWSER_WS_URL, { timeout: 15000 });
  }
  return browserInstance;
}

const EXCLUDE_SELECTORS = [
  'header', 'footer', 'nav', 'aside', '.header', '.navbar', '.sidebar',
  '.modal', '.popup', '.overlay', '.ad', '.ads', '.social', '.menu',
  '.navigation', '.share', '.widget', '.cookie', 'script', 'style',
  'noscript', 'iframe', 'svg', '.feedback', '.chat-widget', '.toolbar',
  '.back-to-top', '.pagination', '[role="navigation"]', '[role="banner"]',
  '[role="contentinfo"]', '.doc-footer', '.doc-sidebar', '.site-footer',
  '.customer-service', '.consult', '.vote', '.report',
];

const CONTENT_SELECTORS = [
  '.markdown-body', '.markdown-section', '.doc-content', '.article-content',
  '.docs-content', '.theme-default-content', '.md-content',
  'article', 'main', '#main', '#content', '.content',
];

async function extractContent(page, format, selector) {
  return page.evaluate(({ fmt, sel, excludeSelectors, contentSelectors }) => {
    function cleanElement(el) {
      const clone = el.cloneNode(true);
      for (const s of excludeSelectors) {
        clone.querySelectorAll(s).forEach(e => e.remove());
      }
      clone.querySelectorAll('svg').forEach(e => e.remove());
      clone.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src') || '';
        if (src.startsWith('data:image')) img.remove();
      });
      return clone;
    }

    function formatOutput(el, fmt) {
      switch (fmt) {
        case 'text': return (el.textContent || '').trim();
        case 'html': return el.innerHTML;
        case 'markdown': return el.innerHTML;
        default: return el.innerHTML;
      }
    }

    if (sel) {
      const el = document.querySelector(sel);
      if (el) {
        const cleaned = cleanElement(el);
        const text = (cleaned.textContent || '').trim();
        if (text.length > 0) return formatOutput(cleaned, fmt);
      }
    }

    for (const s of contentSelectors) {
      const el = document.querySelector(s);
      if (!el) continue;
      const cleaned = cleanElement(el);
      const text = (cleaned.textContent || '').trim();
      if (text.length <= 50) continue;
      return formatOutput(cleaned, fmt);
    }

    const bodyCleaned = cleanElement(document.body);
    return formatOutput(bodyCleaned, fmt);
  }, { fmt: format, sel: selector, excludeSelectors: EXCLUDE_SELECTORS, contentSelectors: CONTENT_SELECTORS });
}

async function waitForSpa(page, url) {
  if (url.includes('#/') || url.includes('#!')) {
    await page.waitForFunction((sels) => {
      for (const s of sels) {
        const el = document.querySelector(s);
        if (el && el.textContent && el.textContent.trim().length > 50) return true;
      }
      return false;
    }, ['.markdown-section', '.content', 'article', '.theme-default-content', 'main'], { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
}

function sanitizeError(err) {
  const msg = err.message || String(err);
  if (msg.includes('Timeout') && msg.includes('exceeded')) return 'Page load timed out (15s). The site may be slow or blocking headless browsers.';
  if (msg.includes('net::ERR_NAME_NOT_RESOLVED')) return 'DNS resolution failed. Check the URL is correct.';
  if (msg.includes('net::ERR_CONNECTION_REFUSED')) return 'Connection refused. The server may be down.';
  if (msg.includes('net::ERR_SSL')) return 'SSL/TLS error. The site may have certificate issues.';
  if (msg.includes('Navigation')) return 'Navigation failed. The URL may be invalid or the site is unreachable.';
  return 'An unexpected error occurred. Please try again.';
}

app.post('/api/scrape', async (req, res) => {
  try {
    const { url, format = 'markdown', selector } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'url is required' });

    try { new URL(url); } catch { return res.status(400).json({ success: false, error: 'Invalid URL format' }); }

    const browser = await getBrowser();
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await waitForSpa(page, url);

      const content = await extractContent(page, format, selector);
      const title = await page.title();

      let finalContent = content;
      if (format === 'markdown') {
        finalContent = htmlToMarkdown(content);
      }

      res.json({ success: true, data: { url: page.url(), title, content: finalContent, format } });
    } finally {
      await context.close();
    }
  } catch (err) {
    console.error('Scrape error:', err);
    res.status(500).json({ success: false, error: sanitizeError(err) });
  }
});

app.post('/api/crawl', async (req, res) => {
  try {
    const { url, limit = 5, depth = 1, format = 'markdown' } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'url is required' });

    try { new URL(url); } catch { return res.status(400).json({ success: false, error: 'Invalid URL format' }); }

    const maxPages = Math.min(limit, 5);
    const maxDepth = Math.min(depth, 2);

    const browser = await getBrowser();
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

      const title = await page.title();

      const links = await page.evaluate((origin) => {
        const anchors = document.querySelectorAll('a[href]');
        const seen = new Set();
        anchors.forEach(a => {
          const href = a.getAttribute('href');
          if (!href) return;
          try {
            const fullUrl = new URL(href, origin).href;
            if (fullUrl.startsWith(origin) && !fullUrl.match(/\.(png|jpg|css|js|pdf)$/i)) {
              seen.add(fullUrl);
            }
          } catch {}
        });
        return Array.from(seen).slice(0, 20);
      }, new URL(url).origin);

      res.json({
        success: true,
        data: {
          url,
          title,
          links,
          total: links.length + 1,
          message: 'Demo mode: returns discovered links from the start page. Full crawl requires CLI.'
        }
      });
    } finally {
      await context.close();
    }
  } catch (err) {
    console.error('Crawl error:', err);
    res.status(500).json({ success: false, error: sanitizeError(err) });
  }
});

app.post('/api/map', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'url is required' });

    try { new URL(url); } catch { return res.status(400).json({ success: false, error: 'Invalid URL format' }); }

    const browser = await getBrowser();
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

      const urls = await page.evaluate((origin) => {
        const anchors = document.querySelectorAll('a[href]');
        const seen = new Set();
        anchors.forEach(a => {
          const href = a.getAttribute('href');
          if (!href) return;
          try {
            const fullUrl = new URL(href, origin).href;
            if (fullUrl.startsWith('http') && !fullUrl.match(/\.(png|jpg|css|js|pdf|zip|gz)$/i)) {
              seen.add(fullUrl);
            }
          } catch {}
        });
        return Array.from(seen);
      }, new URL(url).origin);

      res.json({ success: true, data: { url, urls, total: urls.length } });
    } finally {
      await context.close();
    }
  } catch (err) {
    console.error('Map error:', err);
    res.status(500).json({ success: false, error: sanitizeError(err) });
  }
});

app.post('/api/search', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, error: 'query is required' });

    const browser = await getBrowser();
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
        timeout: 15000, waitUntil: 'domcontentloaded'
      });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

      const results = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('.b_algo').forEach(el => {
          const titleEl = el.querySelector('h2 a');
          const snippetEl = el.querySelector('.b_caption p');
          if (titleEl) {
            items.push({
              title: titleEl.textContent?.trim() || '',
              url: titleEl.getAttribute('href') || '',
              snippet: snippetEl?.textContent?.trim() || ''
            });
          }
        });
        return items.slice(0, 10);
      });

      res.json({ success: true, data: { query, results, total: results.length } });
    } finally {
      await context.close();
    }
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ success: false, error: sanitizeError(err) });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', browser: browserInstance?.isConnected() ? 'connected' : 'disconnected' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Agent Browser API server running on port ${PORT}`);
});
