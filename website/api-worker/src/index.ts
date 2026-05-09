interface Env {
  BROWSER_WS_URL: string;
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

const EXTRACT_CONTENT_JS = (fmt: string, sel: string | null, excludeSelectors: string[], contentSelectors: string[]) => {
  return `(() => {
    const fmt = ${JSON.stringify(fmt)};
    const sel = ${JSON.stringify(sel)};
    const excludeSelectors = ${JSON.stringify(excludeSelectors)};
    const contentSelectors = ${JSON.stringify(contentSelectors)};

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
  })()`;
};

const EXTRACT_LINKS_JS = (origin: string) => {
  return `(() => {
    const origin = ${JSON.stringify(origin)};
    const anchors = document.querySelectorAll('a[href]');
    const seen = new Set();
    anchors.forEach(a => {
      const href = a.getAttribute('href');
      if (!href) return;
      try {
        const fullUrl = new URL(href, origin).href;
        if (fullUrl.startsWith(origin) && !fullUrl.match(/\\.(png|jpg|css|js|pdf)$/i)) {
          seen.add(fullUrl);
        }
      } catch {}
    });
    return Array.from(seen).slice(0, 20);
  })()`;
};

const EXTRACT_MAP_URLS_JS = (origin: string) => {
  return `(() => {
    const origin = ${JSON.stringify(origin)};
    const anchors = document.querySelectorAll('a[href]');
    const seen = new Set();
    anchors.forEach(a => {
      const href = a.getAttribute('href');
      if (!href) return;
      try {
        const fullUrl = new URL(href, origin).href;
        if (fullUrl.startsWith('http') && !fullUrl.match(/\\.(png|jpg|css|js|pdf|zip|gz)$/i)) {
          seen.add(fullUrl);
        }
      } catch {}
    });
    return Array.from(seen);
  })()`;
};

const EXTRACT_SEARCH_RESULTS_JS = `(() => {
  const items = [];
  document.querySelectorAll('article[data-testid="result"]').forEach(el => {
    const titleEl = el.querySelector('h2 a, a[data-testid="result-title-a"]');
    const snippetEl = el.querySelector('div[data-result="snippet"]');
    if (titleEl) {
      items.push({
        title: titleEl.textContent?.trim() || '',
        url: titleEl.getAttribute('href') || '',
        snippet: snippetEl?.textContent?.trim() || ''
      });
    }
  });
  if (items.length === 0) {
    document.querySelectorAll('.result').forEach(el => {
      const titleEl = el.querySelector('.result__a');
      const snippetEl = el.querySelector('.result__snippet');
      if (titleEl) {
        items.push({
          title: titleEl.textContent?.trim() || '',
          url: titleEl.getAttribute('href') || '',
          snippet: snippetEl?.textContent?.trim() || ''
        });
      }
    });
  }
  return items.slice(0, 10);
})()`;

const EXTRACT_TITLE_JS = `document.title`;

const SPA_WAIT_JS = `(() => {
  const sels = ['.markdown-section', '.content', 'article', '.theme-default-content', 'main'];
  for (const s of sels) {
    const el = document.querySelector(s);
    if (el && el.textContent && el.textContent.trim().length > 50) return true;
  }
  return false;
})()`;

function htmlToMarkdown(html: string): string {
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

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders, ...extraHeaders },
  });
}

function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('Timeout') && msg.includes('exceeded')) return 'Page load timed out (15s). The site may be slow or blocking headless browsers.';
  if (msg.includes('net::ERR_NAME_NOT_RESOLVED')) return 'DNS resolution failed. Check the URL is correct.';
  if (msg.includes('net::ERR_CONNECTION_REFUSED')) return 'Connection refused. The server may be down.';
  if (msg.includes('net::ERR_SSL')) return 'SSL/TLS error. The site may have certificate issues.';
  if (msg.includes('Navigation')) return 'Navigation failed. The URL may be invalid or the site is unreachable.';
  if (msg.includes('WebSocket')) return 'Browser connection failed. Please try again.';
  return 'An unexpected error occurred. Please try again.';
}

interface CdpPending {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: ReturnType<typeof setTimeout>;
}

class CdpClient {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, CdpPending>();
  private eventHandlers: ((method: string, params: any) => void)[] = [];
  private sessionId: string | null = null;
  private sessionEventHandlers: ((method: string, params: any) => void)[] = [];
  private closed = false;

  constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string);
      if (msg.id && this.pending.has(msg.id)) {
        const entry = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        clearTimeout(entry.timer);
        if (msg.error) entry.reject(new Error(msg.error.message));
        else entry.resolve(msg.result);
      }
      if (msg.method) {
        if (msg.params?.sessionId === this.sessionId || !msg.params?.sessionId) {
          for (const fn of this.eventHandlers) {
            fn(msg.method, msg.params);
          }
        }
      }
      if (msg.method && msg.params?.sessionId === this.sessionId) {
        for (const fn of this.sessionEventHandlers) {
          fn(msg.method, msg.params);
        }
      }
    });
    ws.addEventListener('close', () => {
      this.closed = true;
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error('WebSocket closed'));
      }
      this.pending.clear();
    });
    ws.addEventListener('error', () => {
      this.closed = true;
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error('WebSocket error'));
      }
      this.pending.clear();
    });
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    if (this.closed) return Promise.reject(new Error('WebSocket is closed'));
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      const msg: Record<string, unknown> = { id, method, params };
      if (this.sessionId) {
        msg.sessionId = this.sessionId;
      }
      this.ws.send(JSON.stringify(msg));
    });
  }

  onEvent(fn: (method: string, params: any) => void) {
    this.eventHandlers.push(fn);
  }

  onSessionEvent(fn: (method: string, params: any) => void) {
    this.sessionEventHandlers.push(fn);
  }

  setSessionId(sid: string) {
    this.sessionId = sid;
  }

  close() {
    this.closed = true;
    this.ws.close();
  }
}

async function createCdpSession(wsUrl: string): Promise<CdpClient> {
  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket connection timeout'));
    }, 15000);
    ws.addEventListener('open', () => {
      clearTimeout(timeout);
      resolve();
    });
    ws.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error('WebSocket connection failed'));
    });
  });

  const cdp = new CdpClient(ws);

  const { targetInfos } = await cdp.send('Target.getTargets');
  let targetId: string | undefined;
  const page = (targetInfos as Array<{ type: string; targetId: string }>).find(t => t.type === 'page');
  if (page) {
    targetId = page.targetId;
  } else {
    const result = await cdp.send('Target.createTarget', { url: 'about:blank' });
    targetId = result.targetId;
  }

  const attached = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  cdp.setSessionId(attached.sessionId);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');

  return cdp;
}

async function navigateAndWait(cdp: CdpClient, url: string): Promise<void> {
  const navPromise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Navigation timeout exceeded')), 15000);
    const handler = (method: string, params: any) => {
      if (method === 'Page.frameNavigated' || method === 'Page.loadEventFired') {
        clearTimeout(timeout);
        cdp.onEvent(() => {});
        resolve();
      }
    };
    cdp.onEvent(handler);
  });

  await cdp.send('Page.navigate', { url });

  try {
    await navPromise;
  } catch {
    // navigation timeout is acceptable
  }

  await waitForNetworkIdle(cdp, 10000);
}

async function waitForNetworkIdle(cdp: CdpClient, timeoutMs: number = 10000): Promise<void> {
  await cdp.send('Network.enable');

  let activeRequests = 0;
  let resolveIdle: () => void;
  const idlePromise = new Promise<void>(r => { resolveIdle = r; });
  let idleTimer: ReturnType<typeof setTimeout>;

  const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    if (activeRequests === 0) {
      idleTimer = setTimeout(() => resolveIdle(), 500);
    }
  };

  cdp.onSessionEvent((method: string) => {
    if (method === 'Network.requestWillBeSent') {
      activeRequests++;
      clearTimeout(idleTimer);
    } else if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
      activeRequests = Math.max(0, activeRequests - 1);
      resetIdleTimer();
    }
  });

  const timeout = setTimeout(() => resolveIdle(), timeoutMs);
  resetIdleTimer();
  await idlePromise;
  clearTimeout(timeout);
}

async function evaluateJs(cdp: CdpClient, expression: string): Promise<any> {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: false,
  });
  if (result.exceptionDetails) {
    throw new Error(`JS evaluation error: ${result.exceptionDetails.text}`);
  }
  return result.result?.value;
}

async function waitForSpa(cdp: CdpClient, url: string): Promise<void> {
  if (url.includes('#/') || url.includes('#!')) {
    await new Promise<void>(resolve => {
      let attempts = 0;
      const check = async () => {
        attempts++;
        if (attempts > 10) { resolve(); return; }
        try {
          const ready = await evaluateJs(cdp, SPA_WAIT_JS);
          if (ready) { resolve(); return; }
        } catch {}
        setTimeout(check, 500);
      };
      check();
    });
    await new Promise(r => setTimeout(r, 500));
  }
}

const rateLimiter = {
  counts: new Map<string, { count: number; resetAt: number }>(),
  check(ip: string, limit: number = 10): boolean {
    const now = Date.now();
    const entry = this.counts.get(ip);
    if (!entry || now > entry.resetAt) {
      this.counts.set(ip, { count: 1, resetAt: now + 60000 });
      return true;
    }
    entry.count++;
    return entry.count <= limit;
  },
};

async function handleScrape(body: any, env: Env): Promise<Response> {
  const { url, format = 'markdown', selector } = body;
  if (!url) return jsonResponse({ success: false, error: 'url is required' }, 400);

  try { new URL(url); } catch { return jsonResponse({ success: false, error: 'Invalid URL format' }, 400); }

  const cdp = await createCdpSession(env.BROWSER_WS_URL);
  try {
    await navigateAndWait(cdp, url);
    await waitForSpa(cdp, url);

    const content = await evaluateJs(cdp, EXTRACT_CONTENT_JS(format, selector || null, EXCLUDE_SELECTORS, CONTENT_SELECTORS));
    const title = await evaluateJs(cdp, EXTRACT_TITLE_JS);
    const finalUrl = await evaluateJs(cdp, 'document.location.href');

    let finalContent = content;
    if (format === 'markdown') {
      finalContent = htmlToMarkdown(content);
    }

    return jsonResponse({ success: true, data: { url: finalUrl, title, content: finalContent, format } });
  } finally {
    cdp.close();
  }
}

async function handleSearch(body: any, env: Env): Promise<Response> {
  const { query } = body;
  if (!query) return jsonResponse({ success: false, error: 'query is required' }, 400);

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const cdp = await createCdpSession(env.BROWSER_WS_URL);
    try {
      const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
      await navigateAndWait(cdp, searchUrl);

      const results = await evaluateJs(cdp, EXTRACT_SEARCH_RESULTS_JS);

      return jsonResponse({ success: true, data: { query, results, total: results.length } });
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('closed') && !msg.includes('WebSocket')) throw err;
    } finally {
      cdp.close();
    }
  }
  throw lastError;
}

async function handleMap(body: any, env: Env): Promise<Response> {
  const { url } = body;
  if (!url) return jsonResponse({ success: false, error: 'url is required' }, 400);

  try { new URL(url); } catch { return jsonResponse({ success: false, error: 'Invalid URL format' }, 400); }

  const cdp = await createCdpSession(env.BROWSER_WS_URL);
  try {
    await navigateAndWait(cdp, url);

    const origin = new URL(url).origin;
    const urls = await evaluateJs(cdp, EXTRACT_MAP_URLS_JS(origin));

    return jsonResponse({ success: true, data: { url, urls, total: urls.length } });
  } finally {
    cdp.close();
  }
}

async function handleCrawl(body: any, env: Env): Promise<Response> {
  const { url, format = 'markdown' } = body;
  if (!url) return jsonResponse({ success: false, error: 'url is required' }, 400);

  try { new URL(url); } catch { return jsonResponse({ success: false, error: 'Invalid URL format' }, 400); }

  const cdp = await createCdpSession(env.BROWSER_WS_URL);
  try {
    await navigateAndWait(cdp, url);

    const title = await evaluateJs(cdp, EXTRACT_TITLE_JS);
    const origin = new URL(url).origin;
    const links = await evaluateJs(cdp, EXTRACT_LINKS_JS(origin));

    return jsonResponse({
      success: true,
      data: {
        url,
        title,
        links,
        total: links.length + 1,
        message: 'Demo mode: returns discovered links from the start page. Full crawl requires CLI.',
      },
    });
  } finally {
    cdp.close();
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return jsonResponse({ status: 'ok', browser: 'cloudflare-worker' });
    }

    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!rateLimiter.check(clientIp, 10)) {
      return jsonResponse({ error: 'Too many requests, please try again later' }, 429);
    }

    try {
      let body: any = {};
      if (request.method === 'POST') {
        const text = await request.text();
        if (text) {
          try { body = JSON.parse(text); } catch { return jsonResponse({ success: false, error: 'Invalid JSON' }, 400); }
        }
      }

      switch (url.pathname) {
        case '/api/scrape':
          return await handleScrape(body, env);
        case '/api/search':
          return await handleSearch(body, env);
        case '/api/map':
          return await handleMap(body, env);
        case '/api/crawl':
          return await handleCrawl(body, env);
        default:
          return jsonResponse({ error: 'Not found' }, 404);
      }
    } catch (err) {
      return jsonResponse({ success: false, error: sanitizeError(err) }, 500);
    }
  },
};
