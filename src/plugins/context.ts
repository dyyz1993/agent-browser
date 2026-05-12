import type { BrowserManager } from '../browser/index.js';
import type { PluginContext } from './types.js';
import type { Page } from 'playwright-core';
import { extractContentFromPage, waitForSPAContent } from '../actions/utils.js';
import { executeCommand } from '../actions/index.js';

let _dispatchId = 0;

export function createPluginContext(browser: BrowserManager): PluginContext {
  const getPage = (): Page => {
    const page = browser.getPage();
    if (!page) throw new Error('No active page. Open a URL first.');
    return page;
  };

  return {
    browser,
    get page() {
      return getPage();
    },

    async goto(url, opts) {
      const page = getPage();
      await page.goto(url, {
        timeout: opts?.timeout ?? 30000,
        waitUntil: (opts?.waitUntil as 'domcontentloaded') ?? 'domcontentloaded',
      });
    },

    async scrape(url, opts) {
      const page = getPage();
      if (page.url() !== url) {
        await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        if (url.includes('#/') || url.includes('#!')) {
          await waitForSPAContent(page, 5000);
        }
      }
      return extractContentFromPage(
        page,
        (opts?.format as 'text' | 'html' | 'markdown') ?? 'markdown',
        opts?.selector
      );
    },

    async eval(expression) {
      const page = getPage();
      return page.evaluate(expression);
    },

    async snapshot() {
      const page = getPage();
      return page.evaluate(() => document.body?.innerText || '');
    },

    async click(selector) {
      await getPage().locator(selector).first().click();
    },

    async fill(selector, value) {
      await getPage().locator(selector).first().fill(value);
    },

    async type(selector, text) {
      await getPage().locator(selector).first().pressSequentially(text);
    },

    async press(key) {
      await getPage().keyboard.press(key);
    },

    async select(selector, values) {
      await getPage().locator(selector).first().selectOption(values);
    },

    async wait(ms) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    },

    async waitForSelector(selector, opts) {
      await getPage()
        .locator(selector)
        .first()
        .waitFor({
          state: 'attached',
          timeout: opts?.timeout ?? 10000,
        });
    },

    async title() {
      return getPage().title();
    },

    url() {
      return getPage().url();
    },

    async newTab(url) {
      const browserInstance = browser.getBrowser();
      if (!browserInstance) throw new Error('No browser instance');
      const page = await browserInstance.newPage();
      if (url) {
        await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
      }
      return page;
    },

    async closeTab(page) {
      const p = page ?? getPage();
      await p.close().catch(() => {});
    },

    async requireLogin(options) {
      const { site, loginUrl, checkScript, maxWaitMs = 180000, pollIntervalMs = 3000 } = options;
      const page = browser.getPage();
      if (!page) return { loggedIn: false, message: 'No browser page for ' + site + ' login' };

      try {
        const alreadyLoggedIn = await page.evaluate(checkScript);
        if (alreadyLoggedIn) return { loggedIn: true, message: 'Already logged in' };
      } catch {
        /* ignored */
      }

      try {
        await page.goto(loginUrl, { timeout: 30000, waitUntil: 'domcontentloaded' });
      } catch (e) {
        return {
          loggedIn: false,
          message: 'Failed to navigate to ' + site + ' login: ' + String(e),
        };
      }

      const start = Date.now();
      while (Date.now() - start < maxWaitMs) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        try {
          const loggedIn = await page.evaluate(checkScript);
          if (loggedIn) return { loggedIn: true, message: 'Login successful' };
        } catch {
          /* ignored */
        }
      }

      return {
        loggedIn: false,
        message: site + ' login timed out after ' + maxWaitMs / 1000 + 's',
      };
    },

    inFrame(frameSelector: string) {
      const page = getPage();
      const frame = page.frameLocator(frameSelector);
      return {
        async click(selector: string) {
          await frame.locator(selector).first().click();
        },
        async fill(selector: string, value: string) {
          await frame.locator(selector).first().fill(value);
        },
        async waitForSelector(selector: string, opts?: { timeout?: number }) {
          await frame
            .locator(selector)
            .first()
            .waitFor({
              state: 'attached',
              timeout: opts?.timeout ?? 10000,
            });
        },
        async eval(expression: string) {
          return frame.locator('body').evaluate((_, expr) => {
            return eval(expr);
          }, expression);
        },
        async snapshot() {
          return frame.locator('body').innerText();
        },
        locator(selector: string) {
          return frame.locator(selector);
        },
      };
    },

    // --- the only new method ---
    async dispatch(cmd) {
      const command = { id: ++_dispatchId, ...cmd };
      return executeCommand(command as any, browser);
    },
  };
}
