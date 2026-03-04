import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';
import { isSuccessResponse } from '../../types.js';

describe('Recorder Panel Close E2E Tests', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-launch',
      headless: true,
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    const openResult = await executeCommand(
      parseCliArgs(['open', getFixturePath('recorder-test.html')]),
      browser
    );
    expect(openResult.success).toBe(true);
  });

  async function checkPanelExists(): Promise<boolean> {
    const page = browser.getPage();
    if (!page) return false;

    return await page.evaluate(() => {
      const panel = document.getElementById('xyzPnl');
      const shadow = document.getElementById('xyzSh');
      const toolbar = document.getElementById('xyzTb');
      const canvas = document.getElementById('xyzCv');
      const markers = document.getElementById('xyzMk');

      return !!(panel || shadow || toolbar || canvas || markers);
    });
  }

  async function checkRecorderInitialized(): Promise<boolean> {
    const page = browser.getPage();
    if (!page) return false;

    return await page.evaluate(() => {
      return (window as any).xyzInited === true;
    });
  }

  describe('Panel Lifecycle', () => {
    it('should have no panel before recording starts', async () => {
      const hasPanel = await checkPanelExists();
      expect(hasPanel).toBe(false);
    });

    it('should create panel when recording starts', async () => {
      const startResult = await executeCommand(parseCliArgs(['recorder', 'start']), browser);
      expect(startResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const hasPanel = await checkPanelExists();
      expect(hasPanel).toBe(true);

      const isInitialized = await checkRecorderInitialized();
      expect(isInitialized).toBe(true);

      await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
    });

    it('should remove panel when recording stops', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);
      await new Promise((resolve) => setTimeout(resolve, 100));

      let hasPanel = await checkPanelExists();
      expect(hasPanel).toBe(true);

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 100));

      hasPanel = await checkPanelExists();
      expect(hasPanel).toBe(false);
    });

    it('should reset xyzInited flag when panel closes', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);
      await new Promise((resolve) => setTimeout(resolve, 100));

      let isInitialized = await checkRecorderInitialized();
      expect(isInitialized).toBe(true);

      await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      await new Promise((resolve) => setTimeout(resolve, 100));

      isInitialized = await checkRecorderInitialized();
      expect(isInitialized).toBe(false);
    });

    it('should be able to start recording again after stop', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const startResult = await executeCommand(parseCliArgs(['recorder', 'start']), browser);
      expect(startResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const hasPanel = await checkPanelExists();
      expect(hasPanel).toBe(true);

      await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
    });

    it('should handle stop when page navigates away', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);
      await new Promise((resolve) => setTimeout(resolve, 100));

      let hasPanel = await checkPanelExists();
      expect(hasPanel).toBe(true);

      await executeCommand(parseCliArgs(['open', getFixturePath('basic.html')]), browser);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);
    });
  });

  describe('Panel Elements', () => {
    it('should have all required UI elements when recording', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const page = browser.getPage();
      expect(page).toBeDefined();

      const elements = await page!.evaluate(() => {
        return {
          panel: !!document.getElementById('xyzPnl'),
          shadow: !!document.getElementById('xyzSh'),
          toolbar: !!document.getElementById('xyzTb'),
          canvas: !!document.getElementById('xyzCv'),
          markers: !!document.getElementById('xyzMk'),
          styles: !!document.getElementById('xyzSt'),
        };
      });

      expect(elements.panel).toBe(true);
      expect(elements.shadow).toBe(true);
      expect(elements.toolbar).toBe(true);
      expect(elements.canvas).toBe(true);
      expect(elements.markers).toBe(true);
      expect(elements.styles).toBe(true);

      await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
    });

    it('should remove all UI elements when stop', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const page = browser.getPage();
      expect(page).toBeDefined();

      const elements = await page!.evaluate(() => {
        return {
          panel: !!document.getElementById('xyzPnl'),
          shadow: !!document.getElementById('xyzSh'),
          toolbar: !!document.getElementById('xyzTb'),
          canvas: !!document.getElementById('xyzCv'),
          markers: !!document.getElementById('xyzMk'),
          styles: !!document.getElementById('xyzSt'),
        };
      });

      expect(elements.panel).toBe(false);
      expect(elements.shadow).toBe(false);
      expect(elements.toolbar).toBe(false);
      expect(elements.canvas).toBe(false);
      expect(elements.markers).toBe(false);
      expect(elements.styles).toBe(false);
    });
  });
});
