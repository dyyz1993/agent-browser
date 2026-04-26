import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { getFixturePath } from './utils/test-helpers.js';
import type { CDPSession } from 'playwright-core';

const EXECUTABLE_PATH = '/Applications/Chromium.app/Contents/MacOS/Chromium';

describe('Mobile Touch Events - E2E Tests', () => {
  let browser: BrowserManager;
  let cdp: CDPSession;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-touch-launch',
      headless: true,
      executablePath: EXECUTABLE_PATH,
      viewport: { width: 375, height: 812 },
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    const page = browser.getPage();
    await page.goto(getFixturePath('touch-test.html'));
    await page.waitForTimeout(200);
    cdp = await page.context().newCDPSession(page);
  });

  async function cdpTouchStart(
    points: Array<{ x: number; y: number; id?: number }>
  ): Promise<void> {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })),
    });
  }

  async function cdpTouchMove(points: Array<{ x: number; y: number; id?: number }>): Promise<void> {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })),
    });
  }

  async function cdpTouchEnd(points: Array<{ x: number; y: number; id?: number }>): Promise<void> {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })),
    });
  }

  describe('tap triggers click', () => {
    it('should register a click on button via CDP touch tap', async () => {
      const page = browser.getPage();
      const btnBox = await page.locator('#btn-click').boundingBox();
      expect(btnBox).toBeTruthy();
      const cx = btnBox!.x + btnBox!.width / 2;
      const cy = btnBox!.y + btnBox!.height / 2;

      await cdpTouchStart([{ x: cx, y: cy }]);
      await page.waitForTimeout(50);
      await cdpTouchEnd([{ x: cx, y: cy }]);
      await page.waitForTimeout(300);

      const log = await page.locator('#click-log').textContent();
      expect(log).toContain('clicks=1');
    });

    it('should record correct coordinates', async () => {
      const page = browser.getPage();
      const btnBox = await page.locator('#btn-click').boundingBox();
      const cx = btnBox!.x + btnBox!.width / 2;
      const cy = btnBox!.y + btnBox!.height / 2;

      await cdpTouchStart([{ x: cx, y: cy }]);
      await page.waitForTimeout(50);
      await cdpTouchEnd([{ x: cx, y: cy }]);
      await page.waitForTimeout(300);

      const log = await page.locator('#click-log').textContent();
      expect(log).toMatch(/x=\d+/);
      expect(log).toMatch(/y=\d+/);
    });

    it('should handle multiple taps', async () => {
      const page = browser.getPage();
      const btnBox = await page.locator('#btn-click').boundingBox();
      const cx = btnBox!.x + btnBox!.width / 2;
      const cy = btnBox!.y + btnBox!.height / 2;

      for (let i = 0; i < 3; i++) {
        await cdpTouchStart([{ x: cx, y: cy }]);
        await page.waitForTimeout(50);
        await cdpTouchEnd([{ x: cx, y: cy }]);
        await page.waitForTimeout(200);
      }

      const log = await page.locator('#click-log').textContent();
      expect(log).toContain('clicks=3');
    });
  });

  describe('touch drag dispatches events', () => {
    it('should dispatch touchstart/touchmove/touchend sequence', async () => {
      const page = browser.getPage();
      await page.evaluate(() => {
        (window as any).__touchLog = [];
        document.getElementById('touch-area').addEventListener('touchstart', (e) => {
          (window as any).__touchLog.push('start:' + e.touches.length);
        });
        document.getElementById('touch-area').addEventListener('touchmove', (e) => {
          (window as any).__touchLog.push('move:' + e.touches.length);
        });
        document.getElementById('touch-area').addEventListener('touchend', (e) => {
          (window as any).__touchLog.push('end:' + e.changedTouches.length);
        });
      });

      const area = await page.locator('#touch-area').boundingBox();
      expect(area).toBeTruthy();
      const startX = area!.x + 30;
      const startY = area!.y + 30;

      await cdpTouchStart([{ x: startX, y: startY, id: 0 }]);
      await page.waitForTimeout(50);
      await cdpTouchMove([{ x: startX + 100, y: startY + 100, id: 0 }]);
      await page.waitForTimeout(50);
      await cdpTouchEnd([{ x: startX + 100, y: startY + 100, id: 0 }]);
      await page.waitForTimeout(100);

      const log = await page.evaluate(() => (window as any).__touchLog);
      expect(log).toContain('start:1');
      expect(log).toContain('move:1');
      expect(log).toContain('end:1');
    });
  });

  describe('two-finger touch', () => {
    it('should dispatch touchstart with 2 touch points', async () => {
      const page = browser.getPage();
      await page.evaluate(() => {
        (window as any).__touchLog = [];
        document.getElementById('touch-area').addEventListener('touchstart', (e) => {
          (window as any).__touchLog.push('start:' + e.touches.length);
        });
        document.getElementById('touch-area').addEventListener('touchmove', (e) => {
          (window as any).__touchLog.push('move:' + e.touches.length);
        });
        document.getElementById('touch-area').addEventListener('touchend', (e) => {
          (window as any).__touchLog.push('end:' + e.changedTouches.length);
        });
      });

      const area = await page.locator('#touch-area').boundingBox()!;
      const cx = area!.x + area!.width / 2;
      const cy = area!.y + area!.height / 2;

      await cdpTouchStart([
        { x: cx - 20, y: cy - 20, id: 0 },
        { x: cx + 20, y: cy + 20, id: 1 },
      ]);
      await page.waitForTimeout(50);

      await cdpTouchMove([
        { x: cx - 20, y: cy + 60, id: 0 },
        { x: cx + 20, y: cy + 80, id: 1 },
      ]);
      await page.waitForTimeout(50);

      await cdpTouchEnd([
        { x: cx - 20, y: cy + 60, id: 0 },
        { x: cx + 20, y: cy + 80, id: 1 },
      ]);
      await page.waitForTimeout(100);

      const log = await page.evaluate(() => (window as any).__touchLog);
      expect(log).toContain('start:2');
      expect(log).toContain('move:2');
      expect(log).toContain('end:1');
    });
  });

  describe('touchcancel', () => {
    it('should not crash on touchCancel', async () => {
      const page = browser.getPage();
      const btnBox = await page.locator('#btn-click').boundingBox();
      const cx = btnBox!.x + btnBox!.width / 2;
      const cy = btnBox!.y + btnBox!.height / 2;

      await cdpTouchStart([{ x: cx, y: cy, id: 0 }]);
      await page.waitForTimeout(100);

      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchCancel',
        touchPoints: [],
      });
      await page.waitForTimeout(200);

      const log = await page.locator('#click-log').textContent();
      expect(log).toContain('clicks=0');

      await cdpTouchStart([{ x: cx, y: cy, id: 0 }]);
      await page.waitForTimeout(50);
      await cdpTouchEnd([{ x: cx, y: cy, id: 0 }]);
      await page.waitForTimeout(200);

      const log2 = await page.locator('#click-log').textContent();
      expect(log2).toContain('clicks=1');
    });
  });
});
