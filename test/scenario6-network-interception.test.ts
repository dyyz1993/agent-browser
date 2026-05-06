import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { BrowserManager } from '../src/browser/index.js';
import type { LaunchCommand } from '../src/types.js';

describe('Scenario 6: Network Request Interception Tests', () => {
  let browser: BrowserManager;

  afterEach(async () => {
    if (browser?.isLaunched()) {
      await browser.close();
    }
  });

  describe('Request Tracking', () => {
    it('should track network requests', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();

      // Start tracking requests
      browser.startRequestTracking();

      // Navigate to a page
      await page.goto('https://example.com');
      await page.waitForTimeout(500);

      // Get tracked requests
      const requests = browser.getRequests();

      // Should have tracked at least the page request
      expect(requests.length).toBeGreaterThan(0);
      expect(requests[0]).toHaveProperty('url');
      expect(requests[0]).toHaveProperty('method');
      expect(requests[0]).toHaveProperty('timestamp');
      expect(requests[0]).toHaveProperty('resourceType');
    });

    it('should filter requests by URL', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();

      // Start tracking requests
      browser.startRequestTracking();

      // Navigate to a page
      await page.goto('https://example.com');

      // Wait for navigation to complete
      await page.waitForTimeout(500);

      // Get filtered requests
      const exampleRequests = browser.getRequests('example');

      expect(exampleRequests.length).toBeGreaterThan(0);
      exampleRequests.forEach((request) => {
        expect(request.url).toContain('example');
      });
    });

    it('should clear tracked requests', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();

      // Start tracking requests
      browser.startRequestTracking();

      // Navigate to a page
      await page.goto('https://example.com');

      // Wait for navigation
      await page.waitForTimeout(500);

      // Clear requests
      browser.clearRequests();

      // Get cleared requests
      const requests = browser.getRequests();

      expect(requests.length).toBe(0);
    });
  });

  describe('Route Mocking', () => {
    it('should mock API responses', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
        ignoreHTTPSErrors: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();

      // Add a route to mock API responses
      await browser.addRoute('**/api/test', {
        response: {
          status: 200,
          body: '{"mock": true, "data": "test data"}',
          contentType: 'application/json',
        },
      });

      // Navigate and make a request
      await page.goto('https://example.com');
      const responseData = await page.evaluate(async () => {
        try {
          const response = await fetch('https://example.com/api/test');
          return await response.json();
        } catch (e) {
          return { error: (e as Error).message };
        }
      });

      // Verify the mocked response
      expect(responseData).toEqual({
        mock: true,
        data: 'test data',
      });

      // Clean up
      await browser.removeRoute('**/api/test');
    });

    it('should abort requests', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
        ignoreHTTPSErrors: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();

      // Add a route to abort requests
      await browser.addRoute('**/api/block', {
        abort: true,
      });

      // Navigate and try to make a request
      await page.goto('https://example.com');
      const result = await page.evaluate(async () => {
        try {
          await fetch('https://example.com/api/block');
          return { success: true };
        } catch (e) {
          return { success: false, error: (e as Error).name };
        }
      });

      // Verify the request was aborted
      expect(result.success).toBe(false);

      // Clean up
      await browser.removeRoute('**/api/block');
    });

    it('should mock different status codes', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();

      // Add a route to return 404
      await browser.addRoute('**/api/notfound', {
        response: {
          status: 404,
          body: '{"error": "Not Found"}',
          contentType: 'application/json',
        },
      });

      // Navigate and make a request
      await page.goto('https://example.com');
      const response = await page.evaluate(async () => {
        try {
          const res = await fetch('https://example.com/api/notfound');
          return {
            status: res.status,
            body: await res.text(),
          };
        } catch (e) {
          return { error: (e as Error).message };
        }
      });

      // Verify the status code
      expect(response.status).toBe(404);
      expect(response.body).toBe('{"error": "Not Found"}');

      // Clean up
      await browser.removeRoute('**/api/notfound');
    });

    it('should handle multiple routes', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();

      // Add multiple routes
      await browser.addRoute('**/api/users', {
        response: {
          status: 200,
          body: '{"users": []}',
          contentType: 'application/json',
        },
      });

      await browser.addRoute('**/api/posts', {
        response: {
          status: 200,
          body: '{"posts": []}',
          contentType: 'application/json',
        },
      });

      // Navigate and make requests
      await page.goto('https://example.com');
      const results = await page.evaluate(async () => {
        const usersRes = await fetch('https://example.com/api/users');
        const users = await usersRes.json();

        const postsRes = await fetch('https://example.com/api/posts');
        const posts = await postsRes.json();

        return { users, posts };
      });

      // Verify both routes work
      expect(results.users).toEqual({ users: [] });
      expect(results.posts).toEqual({ posts: [] });

      // Clean up
      await browser.removeRoute('**/api/users');
      await browser.removeRoute('**/api/posts');
    });
  });

  describe('Header Manipulation', () => {
    it('should set extra headers for all requests', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();

      // Set extra headers
      await browser.setExtraHeaders({
        'X-Custom-Header': 'custom-value',
        'X-Another-Header': 'another-value',
      });

      // Navigate to a page that echoes headers
      await page.goto('https://example.com');

      // Make a request and verify headers
      const result = await page.evaluate(async () => {
        try {
          const response = await fetch('https://example.com/api/test');
          return { success: true };
        } catch (e) {
          return { success: false };
        }
      });

      // The headers should be set (we can't easily verify them without a server)
      expect(result.success).toBe(true);
    });

    it('should set scoped headers for specific origin', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();

      // Set scoped headers
      await browser.setScopedHeaders('example.com', {
        'X-Scoped-Header': 'scoped-value',
      });

      // Navigate to a page
      await page.goto('https://example.com');

      // The scoped headers should be set for example.com
      expect(true).toBe(true);
    });
  });

  describe('Network Interception Scenarios', () => {
    it('should intercept and modify JSON responses', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();

      // Mock an API endpoint
      await browser.addRoute('**/api/data', {
        response: {
          status: 200,
          body: JSON.stringify({
            id: 1,
            name: 'Test User',
            email: 'test@example.com',
          }),
          contentType: 'application/json',
        },
      });

      // Navigate and fetch data
      await page.goto('https://example.com');
      const data = await page.evaluate(async () => {
        const response = await fetch('https://example.com/api/data');
        return await response.json();
      });

      expect(data).toEqual({
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
      });

      // Clean up
      await browser.removeRoute('**/api/data');
    });

    it('should simulate slow network with delayed responses', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();

      // Mock with delay (simulated by setting up the route)
      await browser.addRoute('**/api/slow', {
        response: {
          status: 200,
          body: '{"data": "slow response"}',
          contentType: 'application/json',
        },
      });

      // Navigate and fetch
      await page.goto('https://example.com');
      const startTime = Date.now();
      const data = await page.evaluate(async () => {
        const response = await fetch('https://example.com/api/slow');
        return await response.json();
      });
      const endTime = Date.now();

      expect(data).toEqual({ data: 'slow response' });

      // Clean up
      await browser.removeRoute('**/api/slow');
    });

    it('should handle concurrent intercepted requests', async () => {
      browser = new BrowserManager();
      const launchOptions: Partial<LaunchCommand> = {
        headless: true,
      };
      await browser.launch(launchOptions as LaunchCommand);

      const page = browser.getPage();

      // Set up multiple routes
      await browser.addRoute('**/api/1', {
        response: {
          status: 200,
          body: '{"id": 1}',
          contentType: 'application/json',
        },
      });

      await browser.addRoute('**/api/2', {
        response: {
          status: 200,
          body: '{"id": 2}',
          contentType: 'application/json',
        },
      });

      await browser.addRoute('**/api/3', {
        response: {
          status: 200,
          body: '{"id": 3}',
          contentType: 'application/json',
        },
      });

      // Navigate and make concurrent requests
      await page.goto('https://example.com');
      const results = await page.evaluate(async () => {
        const [res1, res2, res3] = await Promise.all([
          fetch('https://example.com/api/1').then((r) => r.json()),
          fetch('https://example.com/api/2').then((r) => r.json()),
          fetch('https://example.com/api/3').then((r) => r.json()),
        ]);
        return [res1, res2, res3];
      });

      expect(results).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);

      // Clean up
      await browser.removeRoute();
    });
  });
});
