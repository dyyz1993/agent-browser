import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';
import { isSuccessResponse } from '../../types.js';

const executablePath = process.env.AGENT_BROWSER_EXECUTABLE_PATH;

describe('Snapshot Selector Shadow DOM E2E', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-selector-shadow',
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    const openResult = await executeCommand(
      parseCliArgs(['open', getFixturePath('shadow-dom-selector-test.html')]),
      browser
    );
    expect(openResult.success).toBe(true);
  });

  describe('snapshot -i with Shadow DOM elements', () => {
    it('should return snapshot with header containing snap_N ID', async () => {
      const result = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const snapshot = (result.data as { snapshot: string }).snapshot;
        expect(snapshot).toMatch(/Snapshot #snap_\d+/);
        expect(snapshot).toContain('Tips:');
        expect(snapshot).toContain('--selector-for');
        expect(snapshot).toContain('--selectors-of');
        expect(snapshot).toContain('--validate');
      }
    });

    it('should return snapshot with element count including Shadow DOM', async () => {
      const result = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const snapshot = (result.data as { snapshot: string }).snapshot;
        expect(snapshot).toMatch(/\(\d+ interactive elements\)/);
      }
    });

    it('should pierce open Shadow DOM and include shadow elements', async () => {
      const result = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const snapshot = (result.data as { snapshot: string }).snapshot;
        expect(snapshot).toContain('Shadow Button');
      }
    });
  });

  describe('selector-for with Shadow DOM elements', () => {
    it('should return CSS selector for Shadow DOM element by ref', async () => {
      const snapResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      expect(snapResult.success).toBe(true);
      const snapshot = (snapResult.data as { snapshot: string }).snapshot;
      const match = snapshot.match(/Snapshot #(snap_\d+)/);
      expect(match).not.toBeNull();
      const snapId = match![1];

      const selResult = await executeCommand(
        parseCliArgs(['snapshot', '--selector-for', `${snapId}:@e1`]),
        browser
      );
      expect(selResult.success).toBe(true);
      if (isSuccessResponse(selResult)) {
        const data = selResult.data as { cssSelector: string; role: string };
        expect(data.cssSelector).toBeDefined();
        expect(data.cssSelector.length).toBeGreaterThan(0);
        expect(data.role).toBeDefined();
      }
    });

    it('should return CSS selector for Shadow DOM element by index', async () => {
      const snapResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      const snapshot = (snapResult.data as { snapshot: string }).snapshot;
      const match = snapshot.match(/Snapshot #(snap_\d+)/);
      const snapId = match![1];

      const selResult = await executeCommand(
        parseCliArgs(['snapshot', '--selector-for', `${snapId}:1`]),
        browser
      );
      expect(selResult.success).toBe(true);
      if (isSuccessResponse(selResult)) {
        const data = selResult.data as { cssSelector: string; index: number };
        expect(data.cssSelector).toBeDefined();
        expect(data.index).toBe(1);
      }
    });

    it('should return error for invalid ref in Shadow DOM snapshot', async () => {
      const snapResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      const snapshot = (snapResult.data as { snapshot: string }).snapshot;
      const match = snapshot.match(/Snapshot #(snap_\d+)/);
      const snapId = match![1];

      const result = await executeCommand(
        parseCliArgs(['snapshot', '--selector-for', `${snapId}:@e999`]),
        browser
      );
      expect(result.success).toBe(false);
    });
  });

  describe('selectors-of with Shadow DOM', () => {
    it('should list all selectors for a Shadow DOM snapshot', async () => {
      const snapResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      const snapshot = (snapResult.data as { snapshot: string }).snapshot;
      const match = snapshot.match(/Snapshot #(snap_\d+)/);
      const snapId = match![1];

      const result = await executeCommand(
        parseCliArgs(['snapshot', '--selectors-of', snapId]),
        browser
      );
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const data = result.data as {
          elements: Array<{ cssSelector: string }>;
        };
        expect(data.elements).toBeDefined();
        expect(data.elements.length).toBeGreaterThan(0);
        for (const el of data.elements) {
          expect(el.cssSelector).toBeDefined();
          expect(el.cssSelector.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('validate with Shadow DOM', () => {
    it('should run validate on Shadow DOM snapshot and return results', async () => {
      const snapResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      const snapshot = (snapResult.data as { snapshot: string }).snapshot;
      const match = snapshot.match(/Snapshot #(snap_\d+)/);
      const snapId = match![1];

      const result = await executeCommand(
        parseCliArgs(['snapshot', '--validate', snapId]),
        browser
      );
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const data = result.data as {
          results: Array<{ status: string }>;
        };
        expect(data.results).toBeDefined();
        expect(data.results.length).toBeGreaterThan(0);
      }
    });

    it('should detect removed elements after navigation away', async () => {
      const snapResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      const snapshot = (snapResult.data as { snapshot: string }).snapshot;
      const match = snapshot.match(/Snapshot #(snap_\d+)/);
      const snapId = match![1];

      await executeCommand(parseCliArgs(['open', 'about:blank']), browser);

      const result = await executeCommand(
        parseCliArgs(['snapshot', '--validate', snapId]),
        browser
      );
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const data = result.data as {
          results: Array<{ status: string }>;
        };
        const notFound = data.results.filter((r) => r.status === 'not_found');
        expect(notFound.length).toBeGreaterThan(0);
      }
    });
  });
});
