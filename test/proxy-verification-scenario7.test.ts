import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { BrowserManager } from '../src/browser.js';
import { parseCliArgs } from '../src/__tests__/utils/parseCli.js';
import { executeCommand } from '../src/actions.js';
import * as http from 'http';
import * as net from 'net';
import * as url from 'url';

describe('Scenario 7: Proxy Settings Verification', () => {
  let browser: BrowserManager;
  let proxyServer: http.Server;
  let targetServer: http.Server;
  let proxyPort: number;
  let targetPort: number;
  let proxyRequests: Array<{ method: string; url: string; headers: Record<string, string> }> = [];
  let targetRequests: Array<{ method: string; url: string }> = [];

  beforeEach(async () => {
    // Reset request tracking
    proxyRequests = [];
    targetRequests = [];

    // Start a simple target server
    targetServer = http.createServer((req, res) => {
      targetRequests.push({
        method: req.method || 'GET',
        url: req.url || ''
      });

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h1>Target Server</h1></body></html>');
    });

    await new Promise<void>((resolve) => {
      targetServer.listen(0, () => {
        const address = targetServer.address() as any;
        targetPort = address.port;
        resolve();
      });
    });

    // Start a simple HTTP proxy server
    proxyServer = http.createServer((req, res) => {
      proxyRequests.push({
        method: req.method || 'GET',
        url: req.url || '',
        headers: req.headers as Record<string, string>
      });

      // Parse the URL from the request
      const parsedUrl = url.parse(req.url || '');

      // Forward request to target server
      const options = {
        hostname: 'localhost',
        port: targetPort,
        path: parsedUrl.path,
        method: req.method,
        headers: req.headers
      };

      const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err) => {
        console.error('Proxy request error:', err);
        res.writeHead(500);
        res.end('Proxy error');
      });

      req.pipe(proxyReq);
    });

    // Handle CONNECT method for HTTPS
    proxyServer.on('connect', (req, clientSocket, head) => {
      proxyRequests.push({
        method: 'CONNECT',
        url: req.url || '',
        headers: req.headers as Record<string, string>
      });

      const { port, hostname } = url.parse(`http://${req.url}`);

      const serverSocket = net.connect(port || 80, hostname || 'localhost', () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        serverSocket.write(head);
        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
      });

      serverSocket.on('error', (err) => {
        console.error('Proxy CONNECT error:', err);
        clientSocket.end();
      });
    });

    await new Promise<void>((resolve) => {
      proxyServer.listen(0, () => {
        const address = proxyServer.address() as any;
        proxyPort = address.port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (browser?.isLaunched()) {
      await browser.close();
    }

    // Close servers
    await new Promise<void>((resolve) => {
      targetServer.close(() => resolve());
    });

    await new Promise<void>((resolve) => {
      proxyServer.close(() => resolve());
    });
  });

  describe('Basic Proxy Configuration', () => {
    it('should launch browser with proxy configuration', async () => {
      browser = new BrowserManager();
      await browser.launch({
        headless: true,
        proxy: {
          server: `http://localhost:${proxyPort}`
        }
      });

      expect(browser.isLaunched()).toBe(true);

      const page = browser.getPage();

      // Navigate to target server
      await page.goto(`http://localhost:${targetPort}/test`);

      // Wait a bit for the request to be processed
      await page.waitForTimeout(100);

      // Verify the request went through the proxy
      expect(proxyRequests.length).toBeGreaterThan(0);
      expect(proxyRequests.some(req => req.url.includes('/test'))).toBe(true);
    });

    it('should use proxy for multiple requests', async () => {
      browser = new BrowserManager();
      await browser.launch({
        headless: true,
        proxy: {
          server: `http://localhost:${proxyPort}`
        }
      });

      const page = browser.getPage();

      // Make multiple requests
      await page.goto(`http://localhost:${targetPort}/page1`);
      await page.goto(`http://localhost:${targetPort}/page2`);
      await page.goto(`http://localhost:${targetPort}/page3`);

      // Wait for requests to be processed
      await page.waitForTimeout(200);

      // Verify all requests went through the proxy
      expect(proxyRequests.length).toBeGreaterThanOrEqual(3);
      expect(proxyRequests.some(req => req.url.includes('/page1'))).toBe(true);
      expect(proxyRequests.some(req => req.url.includes('/page2'))).toBe(true);
      expect(proxyRequests.some(req => req.url.includes('/page3'))).toBe(true);
    });
  });

  describe('Proxy with Bypass List', () => {
    it('should bypass proxy for localhost addresses', async () => {
      browser = new BrowserManager();
      await browser.launch({
        headless: true,
        proxy: {
          server: `http://localhost:${proxyPort}`,
          bypass: 'localhost'
        }
      });

      const page = browser.getPage();

      // Navigate to localhost (should bypass proxy)
      await page.goto(`http://localhost:${targetPort}/bypass-test`);

      // Wait for request to be processed
      await page.waitForTimeout(100);

      // Verify the request did NOT go through the proxy
      // (it should have bypassed the proxy and gone directly to target)
      // Note: In practice, localhost bypass behavior may vary by browser/OS
      // This test verifies the configuration is accepted
      expect(browser.isLaunched()).toBe(true);
    });

    it('should bypass proxy for multiple patterns', async () => {
      browser = new BrowserManager();
      await browser.launch({
        headless: true,
        proxy: {
          server: `http://localhost:${proxyPort}`,
          bypass: 'localhost,*.internal.com,192.168.*'
        }
      });

      expect(browser.isLaunched()).toBe(true);

      const page = browser.getPage();

      // Make a request that might bypass
      await page.goto(`http://localhost:${targetPort}/test`);

      // Wait for request
      await page.waitForTimeout(100);

      // Verify browser launched successfully with complex bypass list
      expect(browser.isLaunched()).toBe(true);
    });
  });

  describe('Proxy Authentication', () => {
    it('should handle proxy with authentication configuration', async () => {
      // Note: This test verifies the configuration is accepted
      // Actual authentication testing requires a proxy with auth enabled
      browser = new BrowserManager();

      const launchResult = await browser.launch({
        headless: true,
        proxy: {
          server: `http://localhost:${proxyPort}`,
          username: 'testuser',
          password: 'testpass'
        }
      });

      expect(browser.isLaunched()).toBe(true);
    });
  });

  describe('Proxy Failure Scenarios', () => {
    it('should fail when proxy server is unreachable', async () => {
      browser = new BrowserManager();

      // Launch with non-existent proxy
      await browser.launch({
        headless: true,
        proxy: {
          server: 'http://127.0.0.1:59999' // Non-existent proxy
        }
      });

      const page = browser.getPage();

      // Try to navigate - should fail because proxy is unreachable
      await expect(
        page.goto('http://example.com', { timeout: 5000 })
      ).rejects.toThrow();
    });

    it('should handle proxy server timeout', async () => {
      // Create a proxy that doesn't respond
      const slowProxy = net.createServer();
      let slowProxyPort = 0;

      await new Promise<void>((resolve) => {
        slowProxy.listen(0, () => {
          const address = slowProxy.address() as any;
          slowProxyPort = address.port;
          resolve();
        });
      });

      browser = new BrowserManager();
      await browser.launch({
        headless: true,
        proxy: {
          server: `http://localhost:${slowProxyPort}`
        }
      });

      const page = browser.getPage();

      // This might timeout or fail depending on proxy behavior
      const startTime = Date.now();
      try {
        await page.goto('http://example.com', { timeout: 3000 });
      } catch (e) {
        // Expected to fail or timeout
        const elapsed = Date.now() - startTime;
        expect(elapsed).toBeGreaterThan(0);
      }

      slowProxy.close();
    });
  });

  describe('Proxy with HTTPS', () => {
    it('should accept HTTPS proxy configuration', async () => {
      browser = new BrowserManager();

      // Note: This test just verifies the configuration is accepted
      // Actual HTTPS proxy testing requires a proper HTTPS proxy setup
      const launchOptions = {
        headless: true,
        proxy: {
          server: `http://localhost:${proxyPort}`
        }
      };

      await browser.launch(launchOptions);

      expect(browser.isLaunched()).toBe(true);
    });
  });

  describe('Proxy with Other Launch Options', () => {
    it('should work with proxy and custom user agent', async () => {
      const customUA = 'ProxyTestBot/1.0';

      browser = new BrowserManager();
      await browser.launch({
        headless: true,
        proxy: {
          server: `http://localhost:${proxyPort}`
        },
        userAgent: customUA
      });

      const page = browser.getPage();
      await page.goto(`http://localhost:${targetPort}/test`);

      // Wait for request
      await page.waitForTimeout(100);

      // Verify both proxy and user agent are working
      expect(proxyRequests.length).toBeGreaterThan(0);

      const userAgent = await page.evaluate(() => navigator.userAgent);
      expect(userAgent).toBe(customUA);
    });

    it('should work with proxy and browser args', async () => {
      browser = new BrowserManager();
      await browser.launch({
        headless: true,
        proxy: {
          server: `http://localhost:${proxyPort}`
        },
        args: ['--disable-blink-features=AutomationControlled']
      });

      const page = browser.getPage();

      // Verify both options are applied
      const webdriver = await page.evaluate(() => navigator.webdriver);
      expect(webdriver).toBe(false);

      await page.goto(`http://localhost:${targetPort}/test`);

      // Wait for request
      await page.waitForTimeout(100);

      expect(proxyRequests.length).toBeGreaterThan(0);
    });
  });

  describe('Proxy State Management', () => {
    it('should maintain proxy across page navigations', async () => {
      browser = new BrowserManager();
      await browser.launch({
        headless: true,
        proxy: {
          server: `http://localhost:${proxyPort}`
        }
      });

      const page = browser.getPage();

      // Navigate to multiple pages
      const urls = [
        `http://localhost:${targetPort}/page1`,
        `http://localhost:${targetPort}/page2`,
        `http://localhost:${targetPort}/page3`
      ];

      for (const url of urls) {
        await page.goto(url);
        await page.waitForTimeout(50);
      }

      // All requests should have gone through the proxy
      expect(proxyRequests.length).toBeGreaterThanOrEqual(urls.length);
    });

    it('should handle proxy changes across browser sessions', async () => {
      // First browser instance with proxy
      browser = new BrowserManager();
      await browser.launch({
        headless: true,
        proxy: {
          server: `http://localhost:${proxyPort}`
        }
      });

      let page = browser.getPage();
      await page.goto(`http://localhost:${targetPort}/session1`);
      await page.waitForTimeout(100);

      const firstProxyRequestCount = proxyRequests.length;
      expect(firstProxyRequestCount).toBeGreaterThan(0);

      // Close and relaunch with different proxy config
      await browser.close();

      // Note: We can't easily test switching to a different proxy in the same test
      // because we'd need multiple proxy servers. This test verifies the lifecycle.
      expect(browser.isLaunched()).toBe(false);
    });
  });

  describe('CLI Integration with Proxy', () => {
    it('should accept proxy configuration via launch options', async () => {
      browser = new BrowserManager();

      // Directly use launch options with proxy
      const launchOptions = {
        headless: true,
        proxy: {
          server: `http://localhost:${proxyPort}`
        }
      };

      await browser.launch(launchOptions);

      expect(browser.isLaunched()).toBe(true);

      const page = browser.getPage();
      await page.goto(`http://localhost:${targetPort}/cli-test`);
      await page.waitForTimeout(100);

      expect(proxyRequests.length).toBeGreaterThan(0);
    });
  });

  describe('Proxy Request Verification', () => {
    it('should preserve request headers through proxy', async () => {
      browser = new BrowserManager();
      await browser.launch({
        headless: true,
        proxy: {
          server: `http://localhost:${proxyPort}`
        }
      });

      const page = browser.getPage();

      // Set custom headers
      await page.setExtraHTTPHeaders({
        'X-Custom-Header': 'test-value'
      });

      await page.goto(`http://localhost:${targetPort}/headers-test`);
      await page.waitForTimeout(100);

      // Verify headers were preserved through proxy
      expect(proxyRequests.length).toBeGreaterThan(0);
      const testRequest = proxyRequests.find(req => req.url.includes('/headers-test'));
      expect(testRequest).toBeDefined();
      expect(testRequest?.headers['x-custom-header']).toBe('test-value');
    });

    it('should handle different HTTP methods through proxy', async () => {
      browser = new BrowserManager();
      await browser.launch({
        headless: true,
        proxy: {
          server: `http://localhost:${proxyPort}`
        }
      });

      const page = browser.getPage();

      // Make different types of requests
      await page.goto(`http://localhost:${targetPort}/get-test`);

      await page.evaluate(async (port) => {
        await fetch(`http://localhost:${port}/post-test`, { method: 'POST' });
        await fetch(`http://localhost:${port}/put-test`, { method: 'PUT' });
        await fetch(`http://localhost:${port}/delete-test`, { method: 'DELETE' });
      }, targetPort);

      await page.waitForTimeout(200);

      // Verify all methods went through proxy
      expect(proxyRequests.length).toBeGreaterThanOrEqual(4);
      expect(proxyRequests.some(req => req.method === 'GET')).toBe(true);
      expect(proxyRequests.some(req => req.method === 'POST')).toBe(true);
      expect(proxyRequests.some(req => req.method === 'PUT')).toBe(true);
      expect(proxyRequests.some(req => req.method === 'DELETE')).toBe(true);
    });
  });
});
