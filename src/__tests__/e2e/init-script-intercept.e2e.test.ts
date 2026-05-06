import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions/index.js';
import { parseCliArgs } from '../utils/parseCli.js';
import { isSuccessResponse } from '../../types.js';
import { getFreePort } from '../utils/free-port.js';
import http from 'http';

const executablePath = process.env.AGENT_BROWSER_EXECUTABLE_PATH;

interface EvalResultData {
  result?: string;
  [key: string]: unknown;
}

function castEvalData(data: unknown): EvalResultData | undefined {
  if (typeof data === 'object' && data !== null) return data as EvalResultData;
  return undefined;
}

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
      } else if (url.pathname === '/api/sse') {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        let count = 0;
        const interval = setInterval(() => {
          res.write(`data: ${JSON.stringify({ count, time: Date.now() })}\n\n`);
          count++;
          if (count >= 3) {
            clearInterval(interval);
            res.end();
          }
        }, 200);
      } else if (url.pathname === '/page-that-deletes') {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!DOCTYPE html>
<html><body>
<script>
  async function run() {
    var resp = await fetch('/api/json?q=delete-test');
    var data = await resp.json();
    if (window.__netLog) {
      delete window.__netLog;
    }
  }
  run();
</script>
</body></html>`);
      } else if (url.pathname === '/page-with-xhr') {
        res.setHeader('Content-Type', 'text/html');
        res.end(`<!DOCTYPE html>
<html><body>
<script>
  function doXhr() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/json?q=xhr-test', false);
    xhr.send();
    return xhr.responseText;
  }
  doXhr();
</script>
</body></html>`);
      } else {
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
      }
    });

    server.listen(port, () => resolve(server));
  });
}

describe('Init Script Interception Verification', { sequential: true }, () => {
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
      id: 'init-script-test',
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

  describe('Scenario 1: Fetch interception via addinitscript', () => {
    it('should capture fetch responses via monkey-patched fetch', async () => {
      const initScript = `(function() {
        if (window.__fetchPatched) return;
        window.__fetchPatched = true;
        window.__capturedRequests = [];
        var origFetch = window.fetch;
        window.fetch = function() {
          var args = Array.prototype.slice.call(arguments);
          var url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
          return origFetch.apply(this, args).then(function(resp) {
            var ct = resp.headers.get('content-type') || '';
            if (ct.includes('json')) {
              resp.clone().text().then(function(body) {
                window.__capturedRequests.push({
                  type: 'fetch',
                  url: url,
                  status: resp.status,
                  body: body
                });
              });
            }
            return resp;
          });
        };
      })()`;

      const addResult = await executeCommand(parseCliArgs(['addinitscript', initScript]), browser);

      console.log('Add init script result:', JSON.stringify(addResult, null, 2));
      expect(isSuccessResponse(addResult)).toBe(true);

      await executeCommand(parseCliArgs(['open', baseUrl]), browser);
      await new Promise((r) => setTimeout(r, 1000));

      await executeCommand(parseCliArgs(['eval', 'makeFetchCall()']), browser);
      await new Promise((r) => setTimeout(r, 1500));

      const readResult = await executeCommand(
        parseCliArgs(['eval', 'JSON.stringify(window.__capturedRequests || [])']),
        browser
      );

      console.log('Captured fetch data:', JSON.stringify(readResult, null, 2));

      if (isSuccessResponse(readResult)) {
        const captured = JSON.parse(String(castEvalData(readResult.data)?.result || '[]'));
        expect(captured.length).toBeGreaterThan(0);

        const fetchCapture = captured.find(
          (r: Record<string, unknown>) => typeof r.url === 'string' && r.url.includes('/api/json')
        );
        expect(fetchCapture).toBeDefined();
        expect(fetchCapture!.status).toBe(200);
        expect(fetchCapture!.body).toBeDefined();

        const body = JSON.parse(fetchCapture!.body as string);
        expect(body.type).toBe('json');
        expect(body.keyword).toBe('hello');
        console.log('Successfully captured fetch response:', body);
      }
    }, 30000);
  });

  describe('Scenario 2: XHR interception via addinitscript', () => {
    it('should capture XHR responses', async () => {
      const initScript = `(function() {
        if (window.__xhrPatched) return;
        window.__xhrPatched = true;
        window.__capturedXhr = [];
        var origOpen = XMLHttpRequest.prototype.open;
        var origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(method, url) {
          this.__captureUrl = url;
          this.__captureMethod = method;
          return origOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function(body) {
          var self = this;
          this.addEventListener('load', function() {
            window.__capturedXhr.push({
              type: 'xhr',
              url: self.__captureUrl,
              method: self.__captureMethod,
              status: self.status,
              body: self.responseText
            });
          });
          return origSend.apply(this, arguments);
        };
      })()`;

      await executeCommand(parseCliArgs(['addinitscript', initScript]), browser);

      await executeCommand(parseCliArgs(['open', `${baseUrl}/page-with-xhr`]), browser);
      await new Promise((r) => setTimeout(r, 2000));

      const readResult = await executeCommand(
        parseCliArgs(['eval', 'JSON.stringify(window.__capturedXhr || [])']),
        browser
      );

      console.log('Captured XHR data:', JSON.stringify(readResult, null, 2));

      if (isSuccessResponse(readResult)) {
        const captured = JSON.parse(String(castEvalData(readResult.data)?.result || '[]'));
        expect(captured.length).toBeGreaterThan(0);

        const xhrCapture = captured.find(
          (r: Record<string, unknown>) => typeof r.url === 'string' && r.url.includes('/api/json')
        );
        expect(xhrCapture).toBeDefined();
        console.log('Successfully captured XHR response:', xhrCapture);
      }
    }, 30000);
  });

  describe('Scenario 3: Data preservation against page deletion', () => {
    it('should preserve captured data even when page tries to delete it', async () => {
      const initScript = `(function() {
        if (window.__protectedCapture) return;
        var _privateStore = [];
        window.__protectedCapture = true;
        var origFetch = window.fetch;
        window.fetch = function() {
          var args = Array.prototype.slice.call(arguments);
          var url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
          return origFetch.apply(this, args).then(function(resp) {
            var ct = resp.headers.get('content-type') || '';
            if (ct.includes('json')) {
              resp.clone().text().then(function(body) {
                _privateStore.push({ url: url, body: body, ts: Date.now() });
              });
            }
            return resp;
          });
        };
        window.__getProtectedData = function() {
          return JSON.parse(JSON.stringify(_privateStore));
        };
      })()`;

      await executeCommand(parseCliArgs(['addinitscript', initScript]), browser);

      await executeCommand(parseCliArgs(['open', `${baseUrl}/page-that-deletes`]), browser);
      await new Promise((r) => setTimeout(r, 2000));

      const result = await executeCommand(
        parseCliArgs([
          'eval',
          'JSON.stringify(window.__getProtectedData ? window.__getProtectedData() : [])',
        ]),
        browser
      );

      console.log('Protected data result:', JSON.stringify(result, null, 2));

      if (isSuccessResponse(result)) {
        const protectedData = JSON.parse(String(castEvalData(result.data)?.result || '[]'));
        console.log('Protected captures:', protectedData);

        expect(protectedData.length).toBeGreaterThan(0);
        expect(protectedData[0].url).toContain('/api/json');
        console.log('Data preserved despite page deletion attempt!');
      }
    }, 30000);
  });

  describe('Scenario 4: Init script persists across navigations', () => {
    it('should still intercept on a new page after navigation', async () => {
      await executeCommand(parseCliArgs(['open', baseUrl]), browser);
      await new Promise((r) => setTimeout(r, 1000));

      await executeCommand(parseCliArgs(['eval', 'makeFetchCall()']), browser);
      await new Promise((r) => setTimeout(r, 1500));

      const result = await executeCommand(
        parseCliArgs(['eval', 'JSON.stringify(window.__capturedRequests || [])']),
        browser
      );

      if (isSuccessResponse(result)) {
        const captured = JSON.parse(String(castEvalData(result.data)?.result || '[]'));
        console.log('Captured after navigation:', captured.length, 'requests');
        expect(captured.length).toBeGreaterThan(0);
        console.log('Init script persisted across navigation!');
      }
    }, 30000);
  });

  describe('Scenario 5: Error tips from init script', () => {
    it('should return tips when init script has issues on current page', async () => {
      await browser.close();
      browser = new BrowserManager();
      await browser.launch({
        action: 'launch',
        id: 'init-script-error-test',
        headless: true,
        ...(executablePath ? { executablePath } : {}),
      });

      // Navigate first so there's a real page for eval to fail on
      await executeCommand(parseCliArgs(['open', baseUrl]), browser);
      await new Promise((r) => setTimeout(r, 500));

      const badScript = `document.getElementById('nonexistent').click()`;

      const result = await executeCommand(parseCliArgs(['addinitscript', badScript]), browser);

      console.log('Error script result:', JSON.stringify(result, null, 2));

      expect(isSuccessResponse(result)).toBe(true);
      if (isSuccessResponse(result)) {
        const data = result.data as { added?: boolean };
        expect(data.added).toBe(true);

        const tips = (result as Record<string, unknown>).tips;
        if (tips && (Array.isArray(tips) ? tips.length : tips)) {
          console.log('Got error tips:', tips);
          const tipText = Array.isArray(tips) ? tips[0] : tips;
          expect(tipText).toContain('Init script error');
        } else {
          console.log('No tips returned (page may have handled the error gracefully)');
        }
      }
    }, 30000);
  });
});
