import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import WebSocket from 'ws';
import { BrowserManager } from '../../browser.js';
import { StreamServer, type FrameMessage, type StatusMessage } from '../../stream-server.js';
import { getFixturePath, getChromiumExecutablePath } from './utils/test-helpers.js';
import sharp from 'sharp';

describe('Element Selector Mode - Real E2E Tests', () => {
  let browser: BrowserManager;
  let streamServer: StreamServer;
  let wsPort: number;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-selector-launch',
      headless: true,
      executablePath: await getChromiumExecutablePath(),
    });

    wsPort = 5010 + Math.floor(Math.random() * 1000);
    streamServer = new StreamServer(browser, wsPort);
    await streamServer.start();
  });

  afterAll(async () => {
    await streamServer.stop();
    await browser.close();
  });

  function connectWithSelector(selector: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const encoded = encodeURIComponent(selector);
      const url = `ws://localhost:${wsPort}?selector=${encoded}`;
      const ws = new WebSocket(url);
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 8000);
    });
  }

  function connectWithoutSelector(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const url = `ws://localhost:${wsPort}`;
      const ws = new WebSocket(url);
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 8000);
    });
  }

  function waitForStatus(
    ws: WebSocket,
    predicate?: (msg: StatusMessage) => boolean
  ): Promise<StatusMessage> {
    return new Promise((resolve, reject) => {
      const handler = (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'status') {
            if (!predicate || predicate(msg)) {
              ws.off('message', handler);
              resolve(msg as StatusMessage);
            }
          }
        } catch {/* empty */}
      };
      ws.on('message', handler);
      setTimeout(() => {
        ws.off('message', handler);
        reject(new Error('Timeout waiting for status message'));
      }, 8000);
    });
  }

  function waitForFrame(ws: WebSocket): Promise<{ header: FrameMessage; binary: Buffer }> {
    return new Promise((resolve, reject) => {
      let header: FrameMessage | null = null;
      const handler = (data: WebSocket.Data) => {
        if (typeof data === 'string') {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'frame') {
              header = msg as FrameMessage;
            }
          } catch {/* empty */}
        } else if (header) {
          ws.off('message', handler);
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
          resolve({ header, binary: buf });
        }
      };
      ws.on('message', handler);
      setTimeout(() => {
        ws.off('message', handler);
        reject(new Error('Timeout waiting for frame'));
      }, 15000);
    });
  }

  describe('1. Status and element info', () => {
    let ws: WebSocket;

    afterEach(() => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    });

    it('should connect with selector and receive status with element info', async () => {
      const page = browser.getPage();
      await page.goto(getFixturePath('element-selector.html'));
      await page.waitForLoadState('networkidle');

      ws = await connectWithSelector('#target-element');
      const status = await waitForStatus(
        ws,
        (msg) => msg.element !== undefined && msg.screencasting === true
      );

      expect(status.connected).toBe(true);
      expect(status.screencasting).toBe(true);
      expect(status.element).toBeDefined();
      expect(status.element!.selector).toBe('#target-element');

      const expectedBox = await page.locator('#target-element').boundingBox();
      expect(expectedBox).not.toBeNull();
      expect(status.element!.width).toBe(Math.round(expectedBox!.width));
      expect(status.element!.height).toBe(Math.round(expectedBox!.height));
    });

    it('should connect without selector and receive full viewport status without element', async () => {
      const page = browser.getPage();
      await page.goto(getFixturePath('element-selector.html'));
      await page.waitForLoadState('networkidle');

      ws = await connectWithoutSelector();
      const status = await waitForStatus(ws);

      expect(status.connected).toBe(true);
      expect(status.element).toBeUndefined();
      expect(status.viewportWidth).toBeDefined();
      expect(status.viewportHeight).toBeDefined();
    });

    it('should receive status with element position matching Playwright boundingBox', async () => {
      const page = browser.getPage();
      await page.goto(getFixturePath('element-selector.html'));
      await page.waitForLoadState('networkidle');

      ws = await connectWithSelector('#target-element');
      const status = await waitForStatus(
        ws,
        (msg) => msg.element !== undefined && msg.screencasting === true
      );

      expect(status.element).toBeDefined();

      const expectedBox = await page.locator('#target-element').boundingBox();
      expect(expectedBox).not.toBeNull();

      expect(status.element!.x).toBe(Math.round(expectedBox!.x));
      expect(status.element!.y).toBe(Math.round(expectedBox!.y));
      expect(status.element!.width).toBe(Math.round(expectedBox!.width));
      expect(status.element!.height).toBe(Math.round(expectedBox!.height));
    });
  });

  describe('2. Coordinate accuracy', () => {
    let ws: WebSocket;

    beforeAll(async () => {
      const page = browser.getPage();
      await page.goto(getFixturePath('element-selector.html'));
      await page.waitForLoadState('networkidle');
    });

    afterEach(() => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    });

    it('should click center of element via WebSocket input_mouse and verify hit', async () => {
      const page = browser.getPage();

      await page.evaluate(() => {
        const el = document.getElementById('target-element')!;
        el.addEventListener('click', () => {
          const log = document.getElementById('click-log')!;
          log.textContent = 'element-clicked';
        });
      });

      const elementBox = await page.locator('#target-element').boundingBox();
      expect(elementBox).not.toBeNull();

      const centerX = Math.round(elementBox!.x + elementBox!.width / 2);
      const centerY = Math.round(elementBox!.y + elementBox!.height / 2);

      ws = await connectWithSelector('#target-element');
      await waitForStatus(ws, (msg) => msg.element !== undefined && msg.screencasting === true);

      ws.send(
        JSON.stringify({
          type: 'input_mouse',
          eventType: 'mousePressed',
          x: centerX,
          y: centerY,
          button: 'left',
          clickCount: 1,
        })
      );
      ws.send(
        JSON.stringify({
          type: 'input_mouse',
          eventType: 'mouseReleased',
          x: centerX,
          y: centerY,
          button: 'left',
          clickCount: 1,
        })
      );

      await new Promise((r) => setTimeout(r, 500));

      const clickedText = await page.evaluate(() => {
        const el = document.querySelector('#click-log') as HTMLSpanElement | null;
        return el?.textContent ?? null;
      });

      expect(clickedText).toBe('element-clicked');
    });

    it('should click button inside element via WebSocket input_mouse', async () => {
      const page = browser.getPage();

      await page.evaluate(() => {
        const btn = document.getElementById('click-btn')!;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const log = document.getElementById('click-log')!;
          log.textContent = 'click-btn-clicked';
        });
      });

      const btnBox = await page.locator('#click-btn').boundingBox();
      expect(btnBox).not.toBeNull();

      const btnCenterX = Math.round(btnBox!.x + btnBox!.width / 2);
      const btnCenterY = Math.round(btnBox!.y + btnBox!.height / 2);

      ws = await connectWithSelector('#target-element');
      await waitForStatus(ws, (msg) => msg.element !== undefined && msg.screencasting === true);

      ws.send(
        JSON.stringify({
          type: 'input_mouse',
          eventType: 'mousePressed',
          x: btnCenterX,
          y: btnCenterY,
          button: 'left',
          clickCount: 1,
        })
      );
      ws.send(
        JSON.stringify({
          type: 'input_mouse',
          eventType: 'mouseReleased',
          x: btnCenterX,
          y: btnCenterY,
          button: 'left',
          clickCount: 1,
        })
      );

      await new Promise((r) => setTimeout(r, 500));

      const clickedText = await page.evaluate(() => {
        const el = document.querySelector('#click-log') as HTMLSpanElement | null;
        return el?.textContent ?? null;
      });

      expect(clickedText).toBe('click-btn-clicked');
    });
  });

  describe('3. Degradation', () => {
    let ws: WebSocket;

    afterEach(() => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    });

    it('should receive degraded status after element is removed from DOM', async () => {
      const page = browser.getPage();
      await page.goto(getFixturePath('element-selector.html'));
      await page.waitForLoadState('networkidle');

      ws = await connectWithSelector('#degrade-target');

      const initialStatus = await waitForStatus(
        ws,
        (msg) => msg.element !== undefined && msg.screencasting === true
      );

      expect(initialStatus.element).toBeDefined();
      expect(initialStatus.element!.selector).toBe('#degrade-target');

      await page.evaluate(() => {
        document.getElementById('degrade-target')?.remove();
      });

      ws.send(JSON.stringify({ type: 'status' }));

      const degradationMsg = await waitForStatus(ws, (msg) => msg.degraded === true);

      expect(degradationMsg).toBeDefined();
      expect(degradationMsg.degraded).toBe(true);
    }, 15000);
  });

  describe('4. Multi-match', () => {
    let ws: WebSocket;

    afterEach(() => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    });

    it('should select first element when selector matches multiple', async () => {
      const page = browser.getPage();
      await page.goto(getFixturePath('element-selector.html'));
      await page.waitForLoadState('networkidle');

      ws = await connectWithSelector('.multi-item');
      const status = await waitForStatus(
        ws,
        (msg) => msg.element !== undefined && msg.screencasting === true
      );

      expect(status.element).toBeDefined();
      expect(status.element!.selector).toBe('.multi-item');

      const firstItemBox = await page.locator('.multi-item').first().boundingBox();
      expect(firstItemBox).not.toBeNull();

      expect(status.element!.x).toBe(Math.round(firstItemBox!.x));
      expect(status.element!.y).toBe(Math.round(firstItemBox!.y));
      expect(status.element!.width).toBe(Math.round(firstItemBox!.width));
      expect(status.element!.height).toBe(Math.round(firstItemBox!.height));
    });
  });
});
