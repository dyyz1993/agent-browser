import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserManager } from '../../browser/index.js';
import { executeCommand } from '../../actions/index.js';
import { parseCliArgs } from '../utils/parseCli.js';
import { isSuccessResponse } from '../../types.js';
import { FlowExecutor } from '../../flow/flow-executor.js';
import type { SiteDefinition } from '../../flow/types.js';
import { getFreePort } from '../utils/free-port.js';
import http from 'http';

const executablePath = process.env.AGENT_BROWSER_EXECUTABLE_PATH;

function createServer(port: number): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      const url = new URL(req.url || '/', `http://localhost:${port}`);

      if (url.pathname === '/api/json') {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            type: 'json',
            keyword: url.searchParams.get('q'),
            items: [1, 2, 3],
          })
        );
      } else if (url.pathname === '/api/products') {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            code: 0,
            data: {
              items: [
                { id: 1, name: 'Product A', price: 99.9 },
                { id: 2, name: 'Product B', price: 199.9 },
              ],
              total: 2,
            },
          })
        );
      } else if (url.pathname === '/page-with-fetch') {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!DOCTYPE html>
<html><body>
<div id="status">Ready</div>
<script>
  async function makeFetchCall() {
    var resp = await fetch('/api/json?q=hello');
    var data = await resp.json();
    document.getElementById('status').textContent = 'Fetch done: ' + JSON.stringify(data);
    return data;
  }
  function makeXhrCall() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/json?q=xhr-call', false);
    xhr.send();
    return xhr.responseText;
  }
</script>
</body></html>`);
      } else if (url.pathname === '/page-with-products') {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!DOCTYPE html>
<html><body>
<div id="results"></div>
<script>
  async function loadProducts() {
    var resp = await fetch('/api/products');
    var data = await resp.json();
    document.getElementById('results').textContent = JSON.stringify(data);
    return data;
  }
</script>
</body></html>`);
      } else if (url.pathname === '/page-with-blocked') {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!DOCTYPE html>
<html><body>
<div id="status">Ready</div>
<script>
  async function loadBlocked() {
    try {
      var resp = await fetch('/api/blocked');
      var data = await resp.json();
      document.getElementById('status').textContent = 'Loaded: ' + JSON.stringify(data);
    } catch(e) {
      document.getElementById('status').textContent = 'Blocked!';
    }
  }
</script>
</body></html>`);
      } else {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!DOCTYPE html>
<html><body>
<div id="status">Ready</div>
</body></html>`);
      }
    });
    server.listen(port, () => resolve(server));
  });
}

describe('Flow Engine Integrated E2E', { sequential: true }, () => {
  let browser: BrowserManager;
  let server: http.Server;
  let PORT: number;
  let baseUrl: string;

  beforeAll(async () => {
    PORT = await getFreePort();
    baseUrl = `http://localhost:${PORT}`;
    server = await createServer(PORT);
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'flow-integrated-test',
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

  describe('Scenario 1: captureScript + readCapture', () => {
    it('should inject capture script, navigate, trigger API calls, and read captured data', async () => {
      const executor = new FlowExecutor(browser);

      const site: SiteDefinition = {
        name: 'test',
        baseUrl,
        flows: {
          'capture-script': {
            id: 'capture-script',
            steps: [
              {
                id: 'inject',
                action: 'captureScript',
                captureFilter: '/api/json',
              },
              {
                id: 'nav',
                action: 'navigate',
                url: '${baseUrl}/page-with-fetch',
              },
              {
                id: 'trigger-fetch',
                action: 'eval',
                value: 'makeFetchCall()',
              },
              {
                id: 'wait',
                action: 'wait',
                timeout: 2000,
              },
              {
                id: 'read',
                action: 'readCapture',
                outputVar: 'capturedApiData',
              },
            ],
            output: ['capturedApiData'],
          },
        },
      };

      const result = await executor.execute(site, 'capture-script', { baseUrl });
      console.log('Scenario 1 result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.data['capturedApiData']).toBeDefined();
      const captured = result.data['capturedApiData'] as Record<string, unknown>[];
      expect(Array.isArray(captured)).toBe(true);
      expect(captured.length).toBeGreaterThan(0);

      const fetchCapture = captured.find(
        (r: Record<string, unknown>) => typeof r.url === 'string' && r.url.includes('/api/json')
      );
      expect(fetchCapture).toBeDefined();
      expect(fetchCapture.type).toBe('fetch');
      expect(fetchCapture.status).toBe(200);
    }, 60000);
  });

  describe('Scenario 2: captureAPI + readAPI', () => {
    it('should start network capture, navigate, trigger API calls, and read API data', async () => {
      const executor = new FlowExecutor(browser);

      const site: SiteDefinition = {
        name: 'test',
        baseUrl,
        flows: {
          'capture-api': {
            id: 'capture-api',
            steps: [
              {
                id: 'start-capture',
                action: 'captureAPI',
                apiUrl: '/api/products',
                outputVar: 'apiData',
              },
              {
                id: 'nav',
                action: 'navigate',
                url: '${baseUrl}/page-with-products',
              },
              {
                id: 'trigger',
                action: 'eval',
                value: 'loadProducts()',
              },
              {
                id: 'wait',
                action: 'wait',
                timeout: 2000,
              },
              {
                id: 'read',
                action: 'readAPI',
                outputVar: 'apiData',
              },
            ],
            output: ['apiData'],
          },
        },
      };

      const result = await executor.execute(site, 'capture-api', { baseUrl });
      console.log('Scenario 2 result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.errors.length).toBe(0);
    }, 60000);
  });

  describe('Scenario 3: interceptRoute mock', () => {
    it('should mock an API response and verify mocked data', async () => {
      const executor = new FlowExecutor(browser);

      const mockBody = JSON.stringify({ mocked: true, items: [{ id: 99, name: 'Mocked' }] });

      const site: SiteDefinition = {
        name: 'test',
        baseUrl,
        flows: {
          'mock-route': {
            id: 'mock-route',
            steps: [
              {
                id: 'intercept',
                action: 'interceptRoute',
                url: '**/api/products**',
                mockResponse: mockBody,
                mockStatus: 200,
              },
              {
                id: 'nav',
                action: 'navigate',
                url: '${baseUrl}/page-with-products',
              },
              {
                id: 'trigger',
                action: 'eval',
                value: 'loadProducts()',
              },
              {
                id: 'wait',
                action: 'wait',
                timeout: 2000,
              },
              {
                id: 'read',
                action: 'eval',
                value: 'document.getElementById("results").textContent',
                outputVar: 'mockedResult',
              },
              {
                id: 'cleanup',
                action: 'removeRoute',
                url: '**/api/products**',
              },
            ],
            output: ['mockedResult'],
          },
        },
      };

      const result = await executor.execute(site, 'mock-route', { baseUrl });
      console.log('Scenario 3 result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.errors.length).toBe(0);

      const mockedResult = result.data['mockedResult'] as string;
      if (mockedResult) {
        const parsed = typeof mockedResult === 'string' ? JSON.parse(mockedResult) : mockedResult;
        expect(parsed.mocked).toBe(true);
        expect(parsed.items[0].name).toBe('Mocked');
      }
    }, 60000);
  });

  describe('Scenario 4: interceptRoute abort', () => {
    it('should block a request and verify it was blocked', async () => {
      const executor = new FlowExecutor(browser);

      const site: SiteDefinition = {
        name: 'test',
        baseUrl,
        flows: {
          'abort-route': {
            id: 'abort-route',
            steps: [
              {
                id: 'block',
                action: 'interceptRoute',
                url: '**/api/blocked**',
                abortRequests: true,
              },
              {
                id: 'nav',
                action: 'navigate',
                url: '${baseUrl}/page-with-blocked',
              },
              {
                id: 'trigger',
                action: 'eval',
                value: 'loadBlocked()',
              },
              {
                id: 'wait',
                action: 'wait',
                timeout: 2000,
              },
              {
                id: 'read-status',
                action: 'eval',
                value: 'document.getElementById("status").textContent',
                outputVar: 'statusText',
              },
              {
                id: 'cleanup',
                action: 'removeRoute',
                url: '**/api/blocked**',
              },
            ],
            output: ['statusText'],
          },
        },
      };

      const result = await executor.execute(site, 'abort-route', { baseUrl });
      console.log('Scenario 4 result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.errors.length).toBe(0);

      const statusText = String(result.data['statusText'] || '');
      expect(statusText).toContain('Blocked');
    }, 60000);
  });

  describe('Scenario 5: Full pipeline', () => {
    it('should run captureScript + captureAPI + navigate + extract + readCapture + readAPI', async () => {
      const executor = new FlowExecutor(browser);

      const site: SiteDefinition = {
        name: 'test',
        baseUrl,
        flows: {
          'full-pipeline': {
            id: 'full-pipeline',
            steps: [
              {
                id: 'inject-capture',
                action: 'captureScript',
                captureFilter: '/api',
              },
              {
                id: 'start-api-capture',
                action: 'captureAPI',
                apiUrl: '/api',
                outputVar: 'apiData',
              },
              {
                id: 'nav',
                action: 'navigate',
                url: '${baseUrl}/page-with-fetch',
              },
              {
                id: 'trigger',
                action: 'eval',
                value: 'makeFetchCall()',
              },
              {
                id: 'wait',
                action: 'wait',
                timeout: 2000,
              },
              {
                id: 'extract-dom',
                action: 'extract',
                container: '#status',
                fields: {
                  status: '#status',
                },
                outputVar: 'domData',
              },
              {
                id: 'read-capture',
                action: 'readCapture',
                outputVar: 'capturedApiData',
              },
              {
                id: 'read-api',
                action: 'readAPI',
                outputVar: 'apiData',
              },
            ],
            output: ['capturedApiData', 'apiData', 'domData'],
          },
        },
      };

      const result = await executor.execute(site, 'full-pipeline', { baseUrl });
      console.log('Scenario 5 result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.errors.length).toBe(0);

      expect(result.data['domData']).toBeDefined();
      const domData = result.data['domData'] as Record<string, unknown>[];
      expect(Array.isArray(domData)).toBe(true);
      expect(domData.length).toBeGreaterThan(0);

      expect(result.data['capturedApiData']).toBeDefined();
      const captured = result.data['capturedApiData'] as Record<string, unknown>[];
      expect(Array.isArray(captured)).toBe(true);
      expect(captured.length).toBeGreaterThan(0);
    }, 60000);
  });
});
