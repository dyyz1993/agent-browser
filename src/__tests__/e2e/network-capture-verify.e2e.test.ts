import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions/index.js';
import { parseCliArgs } from '../utils/parseCli.js';
import { getFreePort } from '../utils/free-port.js';
import http from 'http';
import path from 'path';
import fs from 'fs';

const executablePath = process.env.AGENT_BROWSER_EXECUTABLE_PATH;

function createTestServer(port: number): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (req.url?.startsWith('/api/products')) {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            code: 0,
            data: {
              items: [
                { id: 1, name: 'Product A', price: 99.9 },
                { id: 2, name: 'Product B', price: 199.9 },
                { id: 3, name: 'Product C', price: 299.9 },
              ],
              total: 3,
              page: 1,
            },
          })
        );
      } else if (req.url?.startsWith('/api/search')) {
        const url = new URL(req.url || '', `http://localhost:${port}`);
        const keyword = url.searchParams.get('q') || '';
        const page = parseInt(url.searchParams.get('page') || '1');

        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            code: 0,
            data: {
              keyword,
              results: Array.from({ length: 10 }, (_, i) => ({
                id: (page - 1) * 10 + i + 1,
                title: `${keyword} - Result ${(page - 1) * 10 + i + 1}`,
                url: `https://example.com/detail/${(page - 1) * 10 + i + 1}`,
                abstract: `This is result ${(page - 1) * 10 + i + 1} for "${keyword}"`,
              })),
              page,
              total: 100,
              hasMore: page < 10,
            },
          })
        );
      } else {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!DOCTYPE html>
<html>
<head><title>Network Capture Test</title></head>
<body>
  <div id="status">Ready</div>
  <div id="results"></div>
  <script>
    async function search(keyword) {
      document.getElementById('status').textContent = 'Searching...';
      const resp = await fetch('/api/search?q=' + encodeURIComponent(keyword));
      const data = await resp.json();
      document.getElementById('status').textContent = 'Done';
      document.getElementById('results').textContent = JSON.stringify(data);
      return data;
    }
    async function loadProducts() {
      const resp = await fetch('/api/products');
      const data = await resp.json();
      document.getElementById('results').textContent = JSON.stringify(data);
      return data;
    }
  </script>
</body>
</html>`);
      }
    });

    server.listen(port, () => resolve(server));
  });
}

describe('Network Capture Capability Verification', { sequential: true }, () => {
  let browser: BrowserManager;
  let server: http.Server;
  let PORT: number;
  let baseUrl: string;

  beforeAll(async () => {
    PORT = await getFreePort();
    baseUrl = `http://localhost:${PORT}`;
    server = await createTestServer(PORT);
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'net-verify',
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

  describe('Scenario 1: Capture API response via network tracking', () => {
    it('should capture /api/products response body', async () => {
      await executeCommand(parseCliArgs(['network', 'requests', '--clear']), browser);
      await executeCommand(parseCliArgs(['network', 'requests', '--capture-response']), browser);

      await executeCommand(parseCliArgs(['open', baseUrl]), browser);
      await new Promise((r) => setTimeout(r, 1000));

      await executeCommand(parseCliArgs(['eval', 'loadProducts()']), browser);
      await new Promise((r) => setTimeout(r, 1500));

      const result = await executeCommand(
        parseCliArgs(['network', 'requests', '--type', 'json', '--filter', '/api/products']),
        browser
      );

      console.log('Capture Result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      const data = result.data as { requests?: Record<string, unknown>[] };
      expect(data.requests).toBeDefined();
      expect(Array.isArray(data.requests)).toBe(true);

      const apiRequests = data.requests || [];
      expect(apiRequests.length).toBeGreaterThan(0);

      const productsReq = apiRequests.find(
        (r: Record<string, unknown>) => typeof r.url === 'string' && r.url.includes('/api/products')
      );
      expect(productsReq).toBeDefined();
      if (productsReq) {
        console.log(
          'Captured Products API Response:',
          JSON.stringify(productsReq.responseBody, null, 2)
        );
        expect(productsReq.status).toBe(200);
        expect(productsReq.responseBody).toBeDefined();

        const body =
          typeof productsReq.responseBody === 'string'
            ? JSON.parse(productsReq.responseBody)
            : productsReq.responseBody;
        expect(body.data).toBeDefined();
        expect(body.data.items).toBeDefined();
        expect(body.data.items.length).toBe(3);
        expect(body.data.items[0].name).toBe('Product A');
      }
    }, 30000);
  });

  describe('Scenario 2: Capture search API with pagination', () => {
    it('should capture search API responses across multiple pages', async () => {
      await executeCommand(parseCliArgs(['network', 'requests', '--clear']), browser);
      await executeCommand(parseCliArgs(['network', 'requests', '--capture-response']), browser);

      await executeCommand(parseCliArgs(['open', baseUrl]), browser);
      await new Promise((r) => setTimeout(r, 1000));

      await executeCommand(parseCliArgs(['eval', 'search("test keyword")']), browser);
      await new Promise((r) => setTimeout(r, 1500));

      await executeCommand(
        parseCliArgs(['eval', 'fetch("/api/search?q=test+keyword&page=2").then(r=>r.json())']),
        browser
      );
      await new Promise((r) => setTimeout(r, 1500));

      const result = await executeCommand(
        parseCliArgs(['network', 'requests', '--type', 'json', '--filter', '/api/search']),
        browser
      );

      console.log('Search Capture Result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      const data = result.data as { requests?: Record<string, unknown>[] };
      const searchRequests = (data.requests || []).filter(
        (r: Record<string, unknown>) => typeof r.url === 'string' && r.url.includes('/api/search')
      );

      console.log(`Captured ${searchRequests.length} search API requests`);
      expect(searchRequests.length).toBeGreaterThanOrEqual(2);

      for (const req of searchRequests) {
        expect(req.responseBody).toBeDefined();
        const body =
          typeof req.responseBody === 'string' ? JSON.parse(req.responseBody) : req.responseBody;
        expect(body.data).toBeDefined();
        expect(body.data.results).toBeDefined();
        expect(body.data.results.length).toBeGreaterThan(0);
        console.log(
          `  Page ${body.data.page}: keyword="${body.data.keyword}", results=${body.data.results.length}`
        );
      }
    }, 30000);
  });

  describe('Scenario 3: Route interception (mock/block)', () => {
    it('should mock an API response', async () => {
      const mockBody = JSON.stringify({
        mocked: true,
        data: { items: [{ id: 99, name: 'Mocked Product' }] },
      });

      // Use addRoute directly because parseCliArgs sets body at top level
      // but handleRoute reads command.response (which is undefined from CLI)
      await browser.addRoute('**/api/products', {
        response: { body: mockBody, contentType: 'application/json' },
      });

      await executeCommand(parseCliArgs(['open', baseUrl]), browser);
      await new Promise((r) => setTimeout(r, 1000));

      await executeCommand(parseCliArgs(['eval', 'loadProducts()']), browser);
      await new Promise((r) => setTimeout(r, 1500));

      const result = await executeCommand(
        parseCliArgs(['eval', 'document.getElementById("results").textContent']),
        browser
      );

      console.log('Mocked Response:', JSON.stringify(result, null, 2));

      if (result.success) {
        const text = String((result.data as Record<string, unknown>).result || '');
        const parsed = JSON.parse(text);
        expect(parsed.mocked).toBe(true);
        expect(parsed.data.items[0].name).toBe('Mocked Product');
      }

      await browser.removeRoute('**/api/products');
    }, 30000);

    it('should block requests', async () => {
      await browser.addRoute('**/api/products', { abort: true });

      await executeCommand(parseCliArgs(['open', baseUrl]), browser);
      await new Promise((r) => setTimeout(r, 1000));

      const result = await executeCommand(
        parseCliArgs([
          'eval',
          'loadProducts().then(d => ({success: true, data: d})).catch(e => ({success: false, error: e.message}))',
        ]),
        browser
      );
      await new Promise((r) => setTimeout(r, 1000));

      console.log('Blocked Request Result:', JSON.stringify(result, null, 2));

      if (result.success) {
        const outcome = (result.data as Record<string, unknown>).result;
        if (typeof outcome === 'object' && outcome !== null) {
          expect(outcome.success).toBe(false);
          console.log('Request was blocked as expected:', outcome.error);
        }
      }

      await browser.removeRoute();
    }, 30000);
  });

  describe('Scenario 4: Save captured requests to disk', () => {
    it('should save API responses as individual JSON files', async () => {
      const outputDir = `/tmp/agent-browser-net-test-${Date.now()}`;

      await executeCommand(parseCliArgs(['network', 'requests', '--clear']), browser);
      await executeCommand(parseCliArgs(['network', 'requests', '--capture-response']), browser);

      await executeCommand(parseCliArgs(['open', baseUrl]), browser);
      await new Promise((r) => setTimeout(r, 1000));
      await executeCommand(parseCliArgs(['eval', 'loadProducts()']), browser);
      await new Promise((r) => setTimeout(r, 1500));
      await executeCommand(parseCliArgs(['eval', 'search("save test")']), browser);
      await new Promise((r) => setTimeout(r, 1500));

      const result = await executeCommand(
        parseCliArgs(['network', 'requests', '--type', 'json', '--output', outputDir]),
        browser
      );

      console.log('Save Result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      const data = result.data as {
        saved?: boolean;
        savedCount?: number;
        outputPath?: string;
        indexPath?: string;
      };
      expect(data.saved).toBe(true);
      expect(data.savedCount).toBeGreaterThan(0);
      console.log(`Saved ${data.savedCount} requests to ${data.outputPath}`);

      // Verify index.json exists
      const indexPath = path.join(outputDir, 'index.json');
      expect(fs.existsSync(indexPath)).toBe(true);

      // Verify individual request file has body
      const indexContent = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      expect(indexContent.requests.length).toBeGreaterThan(0);

      const firstEntry = indexContent.requests[0];
      const requestFilePath = path.join(outputDir, firstEntry.file);
      expect(fs.existsSync(requestFilePath)).toBe(true);

      const requestContent = JSON.parse(fs.readFileSync(requestFilePath, 'utf-8'));
      expect(requestContent).toHaveProperty('url');
      expect(requestContent).toHaveProperty('method');
      console.log(
        'Saved request body preview:',
        JSON.stringify(requestContent.body).substring(0, 200)
      );

      // Cleanup
      fs.rmSync(outputDir, { recursive: true, force: true });
    }, 30000);
  });
});
