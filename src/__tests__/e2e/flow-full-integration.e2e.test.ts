import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { FlowExecutor } from '../../flow/flow-executor.js';
import { parseYamlSiteFile } from '../../flow/yaml-parser.js';
import { getFreePort } from '../utils/free-port.js';
import http from 'http';
import path from 'path';

const executablePath = process.env.AGENT_BROWSER_EXECUTABLE_PATH;
let PORT: number;

function createSearchServer(port: number): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const url = new URL(req.url || '/', `http://localhost:${port}`);

    if (url.pathname === '/api/search') {
      const q = url.searchParams.get('q') || '';
      const page = parseInt(url.searchParams.get('page') || '1');
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          code: 0,
          data: {
            keyword: q,
            page,
            total: 50,
            items: Array.from({ length: 10 }, (_, i) => ({
              id: (page - 1) * 10 + i + 1,
              title: `${q} - Result ${(page - 1) * 10 + i + 1}`,
              url: `http://localhost:${port}/detail/${(page - 1) * 10 + i + 1}`,
              abstract: `Abstract for result ${(page - 1) * 10 + i + 1}`,
            })),
          },
        })
      );
    } else if (url.pathname === '/search') {
      const q = url.searchParams.get('q') || 'test';
      const page = parseInt(url.searchParams.get('page') || '1');
      const totalPages = 5;

      res.setHeader('Content-Type', 'text/html');
      const items = Array.from({ length: 10 }, (_, i) => {
        const idx = (page - 1) * 10 + i + 1;
        return `<div class="result-item">
          <a class="title" href="/detail/${idx}">Result ${idx} for "${q}"</a>
          <a class="link" href="/detail/${idx}">http://localhost:${port}/detail/${idx}</a>
          <p class="abstract">Abstract text for result ${idx} about ${q}</p>
        </div>`;
      }).join('');

      const prevLink =
        page > 1
          ? `<a class="prev-page" href="/search?q=${encodeURIComponent(q)}&page=${
              page - 1
            }">Prev</a>`
          : '';
      const nextLink =
        page < totalPages
          ? `<a class="next-page" href="/search?q=${encodeURIComponent(q)}&page=${
              page + 1
            }">Next</a>`
          : '';

      res.end(`<!DOCTYPE html>
<html><head><title>Search: ${q} - Page ${page}</title></head>
<body>
  <h1>Search: ${q}</h1>
  <div class="search-results">${items}</div>
  <div class="pagination">
    ${prevLink}
    <span class="current-page">Page ${page} of ${totalPages}</span>
    ${nextLink}
  </div>
  <div id="api-status">Loading API...</div>
  <script>
    fetch('/api/search?q=${encodeURIComponent(q)}&page=${page}')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        window.__apiData = d;
        document.getElementById('api-status').textContent =
          'API loaded: ' + d.data.items.length + ' items, page ' + d.data.page;
      })
      .catch(function(e) {
        document.getElementById('api-status').textContent = 'API error: ' + e.message;
      });
  </script>
</body></html>`);
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end('<html><body><h1>Home</h1></body></html>');
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

describe('Flow Engine Full Integration', { sequential: true }, () => {
  let browser: BrowserManager;
  let server: http.Server;

  beforeAll(async () => {
    PORT = await getFreePort();
    server = await createSearchServer(PORT);
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'flow-full-integration',
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
  }, 30000);

  afterAll(async () => {
    await browser.close();
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('should execute full search-full-pipeline flow from YAML', async () => {
    const yamlPath = path.resolve(process.cwd(), 'sites/baidu-search.yaml');
    const site = parseYamlSiteFile(yamlPath);
    site.baseUrl = `http://localhost:${PORT}`;

    const executor = new FlowExecutor(browser);
    const result = await executor.execute(site, 'search-full-pipeline', {
      keyword: 'agent-browser',
      maxPages: 3,
    });

    console.log('=== Full Integration Result ===');
    console.log('Success:', result.success);
    console.log('Duration:', result.duration, 'ms');
    console.log('Errors:', JSON.stringify(result.errors, null, 2));
    console.log('Data keys:', Object.keys(result.data));

    expect(result.success).toBe(true);
    expect(result.duration).toBeGreaterThan(0);
    expect(result.errors).toEqual([]);

    expect(result.data.domResults).toBeDefined();
    const domResults = result.data.domResults as Record<string, unknown>[];
    expect(Array.isArray(domResults)).toBe(true);
    expect(domResults.length).toBe(10);
    console.log('DOM results:', domResults.length, 'items (page 1)');
    expect(domResults[0]).toHaveProperty('title');
    expect(domResults[0]).toHaveProperty('url');
    expect(domResults[0]).toHaveProperty('abstract');
    expect(domResults[0].title).toContain('agent-browser');

    expect(result.data.results).toBeDefined();
    const paginatedResults = result.data.results as Record<string, unknown>[];
    expect(Array.isArray(paginatedResults)).toBe(true);
    expect(paginatedResults.length).toBe(30);
    console.log('Paginated results:', paginatedResults.length, 'items (3 pages)');
    expect(paginatedResults[0]).toHaveProperty('title');
    expect(paginatedResults[29]).toHaveProperty('title');

    if (result.data.apiResults && Array.isArray(result.data.apiResults)) {
      console.log('API results:', result.data.apiResults.length, 'requests captured');
      expect(result.data.apiResults.length).toBeGreaterThan(0);
    }

    if (result.data.scriptResults && Array.isArray(result.data.scriptResults)) {
      console.log('Script capture results:', result.data.scriptResults.length, 'captures');
      expect(result.data.scriptResults.length).toBeGreaterThan(0);
    }

    console.log('Full integration test PASSED');
  }, 120000);
});
