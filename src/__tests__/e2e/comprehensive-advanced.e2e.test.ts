import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { BrowserManager } from '../../browser/index.js';
import { executeCommand } from '../../actions/index.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';
import { isSuccessResponse } from '../../types.js';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

const executablePath = process.env.AGENT_BROWSER_EXECUTABLE_PATH;

describe('Comprehensive Advanced E2E', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-advanced-e2e',
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    await executeCommand(
      parseCliArgs(['open', getFixturePath('comprehensive-test.html')]),
      browser
    );
  });

  afterEach(async () => {
    const tabListResult = await executeCommand(parseCliArgs(['tab', 'list']), browser);
    if (isSuccessResponse(tabListResult)) {
      const tabs = (tabListResult.data as { tabs: unknown[] }).tabs;
      for (let i = tabs.length - 1; i > 0; i--) {
        await executeCommand(parseCliArgs(['tab', 'close', String(i)]), browser);
      }
    }
  });

  describe('Network monitoring', () => {
    it('should activate tracking on first network requests and show hint', async () => {
      const result = await executeCommand(parseCliArgs(['network', 'requests']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const data = result.data as { requests: unknown[]; hint?: string };
        expect(data.requests).toEqual([]);
        expect(data.hint).toBeDefined();
      }
    });

    it('should not show hint on second network requests call', async () => {
      await executeCommand(parseCliArgs(['network', 'requests']), browser);
      const result = await executeCommand(parseCliArgs(['network', 'requests']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const data = result.data as { requests: unknown[]; hint?: string };
        expect(data.hint).toBeUndefined();
      }
    });

    it('should clear captured requests with --clear flag', async () => {
      await executeCommand(parseCliArgs(['network', 'requests']), browser);
      const clearResult = await executeCommand(
        parseCliArgs(['network', 'requests', '--clear']),
        browser
      );
      expect(clearResult.success).toBe(true);
      if (isSuccessResponse(clearResult)) {
        expect((clearResult.data as { cleared: boolean }).cleared).toBe(true);
      }
    });

    it('should capture requests after reload', async () => {
      await executeCommand(parseCliArgs(['network', 'requests']), browser);
      await executeCommand(parseCliArgs(['reload']), browser);
      const result = await executeCommand(parseCliArgs(['network', 'requests']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const data = result.data as { requests: unknown[] };
        expect(Array.isArray(data.requests)).toBe(true);
      }
    });

    it('should filter requests by css with --filter', async () => {
      await executeCommand(parseCliArgs(['network', 'requests']), browser);
      await executeCommand(parseCliArgs(['reload']), browser);
      const result = await executeCommand(
        parseCliArgs(['network', 'requests', '--filter', 'css']),
        browser
      );
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const data = result.data as { requests: unknown[] };
        expect(Array.isArray(data.requests)).toBe(true);
      }
    });

    it('should set up network route to block URLs', async () => {
      const result = await executeCommand(
        parseCliArgs(['network', 'route', '**/*.css', '--abort']),
        browser
      );
      expect(result.success).toBe(true);
    });

    it('should return empty requests after clear', async () => {
      await executeCommand(parseCliArgs(['network', 'requests']), browser);
      await executeCommand(parseCliArgs(['network', 'requests', '--clear']), browser);
      const result = await executeCommand(parseCliArgs(['network', 'requests']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const data = result.data as { requests: unknown[] };
        expect(data.requests).toEqual([]);
      }
    });
  });

  describe('Tab management', () => {
    it('should list 1 tab initially', async () => {
      const result = await executeCommand(parseCliArgs(['tab', 'list']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const data = result.data as { tabs: unknown[]; active: number };
        expect(data.tabs.length).toBe(1);
      }
    });

    it('should create a new tab without URL', async () => {
      const result = await executeCommand(parseCliArgs(['tab', 'new']), browser);
      expect(result.success).toBe(true);
    });

    it('should create a new tab with URL and navigate', async () => {
      const result = await executeCommand(
        parseCliArgs(['tab', 'new', getFixturePath('comprehensive-test.html')]),
        browser
      );
      expect(result.success).toBe(true);
      const urlResult = await executeCommand(parseCliArgs(['get', 'url']), browser);
      if (isSuccessResponse(urlResult)) {
        expect((urlResult.data as { url: string }).url).toContain('comprehensive-test.html');
      }
    });

    it('should list 2 tabs after creating one', async () => {
      await executeCommand(parseCliArgs(['tab', 'new']), browser);
      const result = await executeCommand(parseCliArgs(['tab', 'list']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const data = result.data as { tabs: unknown[]; active: number };
        expect(data.tabs.length).toBe(2);
      }
    });

    it('should switch to tab index 0', async () => {
      await executeCommand(parseCliArgs(['tab', 'new']), browser);
      const result = await executeCommand(parseCliArgs(['tab', '0']), browser);
      expect(result.success).toBe(true);
    });

    it('should switch to tab index 1', async () => {
      await executeCommand(parseCliArgs(['tab', 'new']), browser);
      await executeCommand(parseCliArgs(['tab', '0']), browser);
      const result = await executeCommand(parseCliArgs(['tab', '1']), browser);
      expect(result.success).toBe(true);
    });

    it('should close tab by index', async () => {
      await executeCommand(parseCliArgs(['tab', 'new']), browser);
      const closeResult = await executeCommand(parseCliArgs(['tab', 'close', '1']), browser);
      expect(closeResult.success).toBe(true);
      const listResult = await executeCommand(parseCliArgs(['tab', 'list']), browser);
      if (isSuccessResponse(listResult)) {
        const data = listResult.data as { tabs: unknown[] };
        expect(data.tabs.length).toBe(1);
      }
    });
  });

  describe('Eval / JavaScript execution', () => {
    it('should return document.title via eval', async () => {
      const result = await executeCommand(parseCliArgs(['eval', 'document.title']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const evalResult = (result.data as { result: unknown }).result;
        expect(evalResult).toBe('Comprehensive Test Page');
      }
    });

    it('should return button count via eval', async () => {
      const result = await executeCommand(
        parseCliArgs(['eval', 'document.querySelectorAll("button").length']),
        browser
      );
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const evalResult = (result.data as { result: unknown }).result;
        expect(evalResult).toBeGreaterThan(0);
      }
    });

    it('should return current URL via eval', async () => {
      const result = await executeCommand(parseCliArgs(['eval', 'window.location.href']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const evalResult = (result.data as { result: unknown }).result as string;
        expect(evalResult).toContain('comprehensive-test.html');
      }
    });

    it('should return element text content via eval', async () => {
      const result = await executeCommand(
        parseCliArgs(['eval', 'document.querySelector("#btn1").textContent']),
        browser
      );
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const evalResult = (result.data as { result: unknown }).result;
        expect(evalResult).toBe('Button 1');
      }
    });

    it('should eval JS from file with --file flag', async () => {
      const tmpFile = join(process.cwd(), 'tmp-eval-test.js');
      writeFileSync(tmpFile, '1 + 1');
      try {
        const result = await executeCommand(parseCliArgs(['eval', '--file', tmpFile]), browser);
        expect(result.success).toBe(true);
        if (isSuccessResponse(result)) {
          expect((result.data as { result: unknown }).result).toBe(2);
        }
      } finally {
        unlinkSync(tmpFile);
      }
    });

    it('should eval arithmetic expression', async () => {
      const result = await executeCommand(parseCliArgs(['eval', '1 + 1']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect((result.data as { result: unknown }).result).toBe(2);
      }
    });
  });

  describe('Cookies', () => {
    it('should get cookies returns array', async () => {
      const result = await executeCommand(parseCliArgs(['cookies']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const data = result.data as { cookies: unknown[] };
        expect(Array.isArray(data.cookies)).toBe(true);
      }
    });

    it('should clear cookies without error', async () => {
      const result = await executeCommand(parseCliArgs(['cookies', 'clear']), browser);
      expect(result.success).toBe(true);
    });

    it('should handle cookies get after clear as empty', async () => {
      await executeCommand(parseCliArgs(['cookies', 'clear']), browser);
      const result = await executeCommand(parseCliArgs(['cookies']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const data = result.data as { cookies: unknown[] };
        expect(data.cookies.length).toBe(0);
      }
    });
  });

  describe('Wait commands', () => {
    it('should wait for specified time in ms', async () => {
      const result = await executeCommand(parseCliArgs(['wait', '100']), browser);
      expect(result.success).toBe(true);
    });

    it('should wait for existing element selector', async () => {
      const result = await executeCommand(parseCliArgs(['wait', '#username']), browser);
      expect(result.success).toBe(true);
    });

    it('should wait for load state', async () => {
      const result = await executeCommand(parseCliArgs(['wait', '--load', 'load']), browser);
      expect(result.success).toBe(true);
    });

    it('should wait for domcontentloaded state', async () => {
      const result = await executeCommand(
        parseCliArgs(['wait', '--load', 'domcontentloaded']),
        browser
      );
      expect(result.success).toBe(true);
    });

    it('should wait for function returning true', async () => {
      const result = await executeCommand(
        parseCliArgs(['wait', '--fn', 'document.readyState === "complete"']),
        browser
      );
      expect(result.success).toBe(true);
    });
  });

  describe('Keyboard', () => {
    it('should press Enter after filling input', async () => {
      await executeCommand(parseCliArgs(['fill', '#search', 'test query']), browser);
      const result = await executeCommand(parseCliArgs(['press', 'Enter']), browser);
      expect(result.success).toBe(true);
    });

    it('should press Tab to move focus', async () => {
      await executeCommand(parseCliArgs(['click', '#username']), browser);
      const result = await executeCommand(parseCliArgs(['press', 'Tab']), browser);
      expect(result.success).toBe(true);
    });

    it('should press Escape key', async () => {
      await executeCommand(parseCliArgs(['click', '#username']), browser);
      const result = await executeCommand(parseCliArgs(['press', 'Escape']), browser);
      expect(result.success).toBe(true);
    });

    it('should press Control+a to select all in input', async () => {
      await executeCommand(parseCliArgs(['fill', '#username', 'selectalltest']), browser);
      await executeCommand(parseCliArgs(['click', '#username']), browser);
      const result = await executeCommand(parseCliArgs(['press', 'Control+a']), browser);
      expect(result.success).toBe(true);
    });
  });

  describe('Viewport & Navigation', () => {
    it('should set viewport to 800x600', async () => {
      const result = await executeCommand(parseCliArgs(['set', 'viewport', '800', '600']), browser);
      expect(result.success).toBe(true);
    });

    it('should get URL containing comprehensive-test.html', async () => {
      const result = await executeCommand(parseCliArgs(['get', 'url']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect((result.data as { url: string }).url).toContain('comprehensive-test.html');
      }
    });

    it('should preserve history after tab new and back', async () => {
      const urlBefore = await executeCommand(parseCliArgs(['get', 'url']), browser);
      expect(urlBefore.success).toBe(true);

      await executeCommand(parseCliArgs(['tab', 'new']), browser);
      await executeCommand(parseCliArgs(['tab', '0']), browser);
      await executeCommand(parseCliArgs(['tab', 'close', '1']), browser);

      const urlAfter = await executeCommand(parseCliArgs(['get', 'url']), browser);
      expect(urlAfter.success).toBe(true);
      if (isSuccessResponse(urlAfter)) {
        expect((urlAfter.data as { url: string }).url).toContain('comprehensive-test.html');
      }
    });
  });

  describe('State management', () => {
    it('should set localStorage and verify value', async () => {
      const setResult = await executeCommand(
        parseCliArgs(['storage', 'local', 'set', 'testkey', 'testvalue']),
        browser
      );
      expect(setResult.success).toBe(true);
      if (isSuccessResponse(setResult)) {
        expect((setResult.data as { set: boolean }).set).toBe(true);
      }

      const getResult = await executeCommand(
        parseCliArgs(['storage', 'local', 'testkey']),
        browser
      );
      expect(getResult.success).toBe(true);
      if (isSuccessResponse(getResult)) {
        expect((getResult.data as { key: string; value: string }).value).toBe('testvalue');
      }
    });

    it('should return session info from tab list', async () => {
      const result = await executeCommand(parseCliArgs(['tab', 'list']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const data = result.data as { tabs: unknown[]; active: number };
        expect(data.tabs).toBeDefined();
        expect(data.active).toBeDefined();
        expect(typeof data.active).toBe('number');
      }
    });
  });
});
