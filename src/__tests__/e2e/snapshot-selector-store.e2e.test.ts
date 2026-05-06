import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions/index.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';
import { isSuccessResponse } from '../../types.js';

const executablePath = process.env.AGENT_BROWSER_EXECUTABLE_PATH;

describe('Snapshot Selector Store E2E', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-selector-store',
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    const openResult = await executeCommand(
      parseCliArgs(['open', getFixturePath('form-complex.html')]),
      browser
    );
    expect(openResult.success).toBe(true);
  });

  describe('snapshot -i with selector store', () => {
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

    it('should return snapshot with element count', async () => {
      const result = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const snapshot = (result.data as { snapshot: string }).snapshot;
        expect(snapshot).toMatch(/\(\d+ interactive elements\)/);
      }
    });
  });

  describe('selector-for command', () => {
    it('should return CSS selector for element by ref', async () => {
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

    it('should return CSS selector for element by index', async () => {
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

    it('should return error for invalid snapshot ID', async () => {
      const result = await executeCommand(
        parseCliArgs(['snapshot', '--selector-for', 'snap_999:@e1']),
        browser
      );
      expect(result.success).toBe(false);
    });

    it('should return error for invalid ref', async () => {
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

  describe('selectors-of command', () => {
    it('should list all selectors for a snapshot', async () => {
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

    it('should return error for non-existent snapshot', async () => {
      const result = await executeCommand(
        parseCliArgs(['snapshot', '--selectors-of', 'snap_999']),
        browser
      );
      expect(result.success).toBe(false);
    });
  });

  describe('validate command', () => {
    it('should validate all selectors on current page', async () => {
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
        for (const r of data.results) {
          expect(r.status).toBe('valid');
        }
      }
    });

    it('should detect removed elements after navigation', async () => {
      const snapResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      const snapshot = (snapResult.data as { snapshot: string }).snapshot;
      const match = snapshot.match(/Snapshot #(snap_\d+)/);
      const snapId = match![1];

      await executeCommand(parseCliArgs(['snapshot', '--selectors-of', snapId]), browser);

      await browser.getPage().goto('about:blank');
      await browser.getPage().waitForLoadState('load');

      const result = await executeCommand(
        parseCliArgs(['snapshot', '--validate', snapId]),
        browser
      );
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const notFound = (
          result.data as {
            results: Array<{ status: string }>;
          }
        ).results.filter((r) => r.status === 'not_found');
        expect(notFound.length).toBeGreaterThan(0);
        if ((result.data as { newSnapshotId?: string }).newSnapshotId) {
          expect((result.data as { newSnapshotId: string }).newSnapshotId).toBeDefined();
        }
      }
    });
  });
});
