import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { FlowExecutor } from '../../flow/flow-executor.js';
import { formatOutput, writeOutput } from '../../flow/output.js';
import type { SiteDefinition } from '../../flow/types.js';
import { getFreePort } from '../utils/free-port.js';
import http from 'http';

const executablePath = process.env.AGENT_BROWSER_EXECUTABLE_PATH;
let PORT: number;

function createTestServer(port: number): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const url = new URL(req.url || '/', `http://localhost:${port}`);

    if (url.pathname === '/api/products') {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          products: [
            { id: 1, name: 'Widget A', price: 10 },
            { id: 2, name: 'Widget B', price: 20 },
            { id: 3, name: 'Widget C', price: 30 },
          ],
        })
      );
    } else if (url.pathname === '/api/dedupe-items') {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          items: [
            { id: 1, title: 'Item A', url: '/a' },
            { id: 2, title: 'Item B', url: '/b' },
            { id: 1, title: 'Item A', url: '/a' },
            { id: 3, title: 'Item C', url: '/c' },
            { id: 2, title: 'Item B', url: '/b' },
          ],
        })
      );
    } else if (url.pathname === '/smart-extract') {
      res.setHeader('Content-Type', 'text/html');
      res.end(`<!DOCTYPE html>
<html><head><title>Smart Extract</title>
<style>.item{padding:10px;margin:5px 0;border:1px solid #ccc}.name{font-weight:bold}.price{color:green}</style>
</head><body>
<h1>Products</h1>
<div id="status">Loading...</div>
<div id="product-list">
  <div class="item" data-id="1"><span class="name">Widget A</span><span class="price">$10</span></div>
  <div class="item" data-id="2"><span class="name">Widget B</span><span class="price">$20</span></div>
  <div class="item" data-id="3"><span class="name">Widget C</span><span class="price">$30</span></div>
  <div class="item" data-id="1"><span class="name">Widget A</span><span class="price">$10</span></div>
</div>
<script>
fetch('/api/products').then(function(r){return r.json()}).then(function(d){
  window.__apiData=d;
  document.getElementById('status').textContent='API loaded: '+d.products.length+' items';
}).catch(function(e){document.getElementById('status').textContent='API error'});
console.log('Page loaded with 4 products');
console.warn('Duplicate product exists: Widget A');
</script></body></html>`);
    } else if (url.pathname === '/dom-only') {
      res.setHeader('Content-Type', 'text/html');
      res.end(`<!DOCTYPE html>
<html><head><title>DOM Only</title>
<style>.item{padding:10px;margin:5px 0;border:1px solid #ccc}.name{font-weight:bold}.price{color:green}</style>
</head><body>
<h1>Items</h1>
<div class="item"><span class="name">Product X</span><span class="price">$99</span></div>
<div class="item"><span class="name">Product Y</span><span class="price">$88</span></div>
</body></html>`);
    } else if (url.pathname === '/dedupe') {
      res.setHeader('Content-Type', 'text/html');
      res.end(`<!DOCTYPE html>
<html><head><title>Dedupe</title></head><body>
<div class="item"><span class="title">A</span><span class="link">/a</span></div>
<div class="item"><span class="title">B</span><span class="link">/b</span></div>
<div class="item"><span class="title">A</span><span class="link">/a</span></div>
<div class="item"><span class="title">C</span><span class="link">/c</span></div>
<div class="item"><span class="title">B</span><span class="link">/b</span></div>
</body></html>`);
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end('<html><body><h1>Home</h1></body></html>');
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

describe('Flow Engine Phase 2', { sequential: true }, () => {
  let browser: BrowserManager;
  let server: http.Server;

  beforeAll(async () => {
    PORT = await getFreePort();
    server = await createTestServer(PORT);
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'flow-phase2',
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

  describe('smartExtract', () => {
    it('should fall back to DOM extraction when no API/script data available', async () => {
      const site: SiteDefinition = {
        name: 'test',
        baseUrl: `http://localhost:${PORT}`,
        flows: {
          'dom-fallback': {
            id: 'dom-fallback',
            steps: [
              { id: 'nav', action: 'navigate', url: '${baseUrl}/dom-only' },
              {
                id: 'smart1',
                action: 'smartExtract',
                container: '.item',
                outputVar: 'items',
              },
            ],
            output: ['items'],
          },
        },
      };

      const executor = new FlowExecutor(browser);
      const result = await executor.execute(site, 'dom-fallback', {});

      expect(result.success).toBe(true);
      const items = result.data.items as any[];
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThanOrEqual(1);
    }, 30000);

    it('should use API layer when captureAPI + readAPI available', async () => {
      const site: SiteDefinition = {
        name: 'test',
        baseUrl: `http://localhost:${PORT}`,
        flows: {
          'api-layer': {
            id: 'api-layer',
            steps: [
              {
                id: 'capture',
                action: 'captureAPI',
                apiUrl: '/api/products',
                outputVar: 'apiProds',
              },
              { id: 'nav', action: 'navigate', url: '${baseUrl}/smart-extract' },
              { id: 'wait', action: 'wait', timeout: 3000 },
              { id: 'read', action: 'readAPI', apiUrl: '/api/products', outputVar: 'apiProds' },
              {
                id: 'smart',
                action: 'smartExtract',
                outputVar: 'smartData',
                smartExtractConfig: {
                  apiUrl: '/api/products',
                  minResults: 1,
                },
              },
            ],
            output: ['apiProds', 'smartData'],
          },
        },
      };

      const executor = new FlowExecutor(browser);
      const result = await executor.execute(site, 'api-layer', {});

      const apiProds = result.data.apiProds as any[];
      expect(Array.isArray(apiProds)).toBe(true);
      expect(apiProds.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('preset capture scripts', () => {
    it('should load fetch-capture preset and intercept fetch requests', async () => {
      const site: SiteDefinition = {
        name: 'test',
        baseUrl: `http://localhost:${PORT}`,
        flows: {
          'preset-fetch': {
            id: 'preset-fetch',
            steps: [
              {
                id: 'preset',
                action: 'captureScript',
                preset: 'fetch-capture',
                captureFilter: '/api/products',
              },
              { id: 'nav', action: 'navigate', url: '${baseUrl}/smart-extract' },
              { id: 'wait', action: 'wait', timeout: 3000 },
              { id: 'read', action: 'readCapture', outputVar: 'captured' },
            ],
            output: ['captured'],
          },
        },
      };

      const executor = new FlowExecutor(browser);
      const result = await executor.execute(site, 'preset-fetch', {});

      const captured = result.data.captured as any[];
      expect(Array.isArray(captured)).toBe(true);
      expect(captured.length).toBeGreaterThan(0);
      expect(captured[0].type).toBe('fetch');
      expect(captured[0].body).toBeDefined();
    }, 30000);

    it('should load console-capture preset and capture console output', async () => {
      const site: SiteDefinition = {
        name: 'test',
        baseUrl: `http://localhost:${PORT}`,
        flows: {
          'preset-console': {
            id: 'preset-console',
            steps: [
              { id: 'preset', action: 'captureScript', preset: 'console-capture' },
              { id: 'nav', action: 'navigate', url: '${baseUrl}/smart-extract' },
              { id: 'wait', action: 'wait', timeout: 2000 },
              {
                id: 'read-console',
                action: 'eval',
                value:
                  'JSON.stringify(window.__getConsoleCapture ? window.__getConsoleCapture() : [])',
                outputVar: 'consoleOutput',
              },
            ],
            output: ['consoleOutput'],
          },
        },
      };

      const executor = new FlowExecutor(browser);
      const result = await executor.execute(site, 'preset-console', {});

      const output = result.data.consoleOutput as any[];
      expect(Array.isArray(output)).toBe(true);
      expect(output.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('output formatting', () => {
    it('should format data as JSON', () => {
      const data = [
        { name: 'Widget A', price: 10 },
        { name: 'Widget B', price: 20 },
      ];
      const result = formatOutput(data, { format: 'json', pretty: true });
      const parsed = JSON.parse(result);
      expect(parsed.length).toBe(2);
      expect(parsed[0].name).toBe('Widget A');
    });

    it('should format data as CSV', () => {
      const data = [
        { name: 'Widget A', price: 10 },
        { name: 'Widget B', price: 20 },
      ];
      const result = formatOutput(data, { format: 'csv' });
      const lines = result.split('\n');
      expect(lines[0]).toBe('name,price');
      expect(lines[1]).toBe('Widget A,10');
      expect(lines[2]).toBe('Widget B,20');
    });

    it('should format data as JSONL', () => {
      const data = [
        { name: 'A', price: 1 },
        { name: 'B', price: 2 },
      ];
      const result = formatOutput(data, { format: 'jsonl' });
      const lines = result.split('\n');
      expect(lines.length).toBe(2);
      expect(JSON.parse(lines[0]).name).toBe('A');
    });

    it('should format data as YAML', () => {
      const data = [{ name: 'A', price: 1 }];
      const result = formatOutput(data, { format: 'yaml' });
      expect(result).toContain('name: "A"');
      expect(result).toContain('price: 1');
    });

    it('should filter fields', () => {
      const data = [{ name: 'A', price: 1, extra: 'x' }];
      const result = formatOutput(data, { format: 'json', fields: ['name', 'price'] });
      const parsed = JSON.parse(result);
      expect(parsed[0]).toEqual({ name: 'A', price: 1 });
    });

    it('should deduplicate on a field', () => {
      const data = [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
        { id: 1, name: 'A' },
      ];
      const result = formatOutput(data, { format: 'json', dedupField: 'id' });
      const parsed = JSON.parse(result);
      expect(parsed.length).toBe(2);
    });

    it('should write output to file', async () => {
      const { writeFileSync, readFileSync, unlinkSync, existsSync } = await import('fs');
      const { resolve } = await import('path');
      const tmpFile = resolve('/tmp/flow-phase2-test-output.json');
      const data = [{ name: 'test' }];
      const filePath = writeOutput(data, { format: 'json', filePath: tmpFile, pretty: true });
      expect(existsSync(filePath)).toBe(true);
      const content = readFileSync(filePath, 'utf-8');
      expect(JSON.parse(content)[0].name).toBe('test');
      unlinkSync(filePath);
    });

    it('should formatOutput via flow step', async () => {
      const site: SiteDefinition = {
        name: 'test',
        baseUrl: `http://localhost:${PORT}`,
        flows: {
          'format-step': {
            id: 'format-step',
            steps: [
              { id: 'nav', action: 'navigate', url: '${baseUrl}/dom-only' },
              {
                id: 'extract',
                action: 'extract',
                container: '.item',
                fields: { name: '.name', price: '.price' },
                outputVar: 'items',
              },
              {
                id: 'format',
                action: 'formatOutput',
                outputVar: 'items',
                outputFormat: 'csv',
                dedupField: 'name',
              },
            ],
            output: ['items'],
          },
        },
      };

      const executor = new FlowExecutor(browser);
      const result = await executor.execute(site, 'format-step', {});

      const formatted = executor.getContext().variables['formattedOutput'] as string;
      expect(formatted).toBeDefined();
      expect(formatted).toContain('name,price');
    }, 30000);
  });

  describe('deduplication step', () => {
    it('should deduplicate extracted DOM data', async () => {
      const site: SiteDefinition = {
        name: 'test',
        baseUrl: `http://localhost:${PORT}`,
        flows: {
          'dedupe-flow': {
            id: 'dedupe-flow',
            steps: [
              { id: 'nav', action: 'navigate', url: '${baseUrl}/dedupe' },
              {
                id: 'extract',
                action: 'extract',
                container: '.item',
                fields: { title: '.title', url: '.link' },
                outputVar: 'items',
              },
              {
                id: 'dedupe',
                action: 'deduplicate',
                outputVar: 'items',
                dedupField: 'url',
              },
            ],
            output: ['items'],
          },
        },
      };

      const executor = new FlowExecutor(browser);
      const result = await executor.execute(site, 'dedupe-flow', {});

      expect(result.success).toBe(true);
      const items = result.data.items as any[];
      expect(items.length).toBe(3); // A, B, C (deduped from 5)
    }, 30000);
  });
});
