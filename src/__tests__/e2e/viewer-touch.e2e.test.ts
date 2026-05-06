import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import { BrowserManager } from '../../browser.js';
import { StreamServer } from '../../stream-server.js';
import { getViewerHtml } from '../../viewer-html.js';
import { getFixturePath, getChromiumExecutablePath } from './utils/test-helpers.js';

const EXEC = await getChromiumExecutablePath();

describe('Virtual Touchpad - Touch -> Mouse -> WebSocket Pipeline', () => {
  let browser: BrowserManager;
  let server: StreamServer;
  let httpSrv: http.Server;
  let vPage: import('playwright-core').Page;
  let vCdp: import('playwright-core').CDPSession;
  let vCtx: import('playwright-core').BrowserContext;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-vtouch',
      headless: true,
      executablePath: EXEC,
      viewport: { width: 1280, height: 800 },
    });
    await browser.getPage().goto(getFixturePath('touch-test.html'));
    await browser.getPage().waitForTimeout(300);

    const wsPort = 5400 + Math.floor(Math.random() * 1000);
    server = new StreamServer(browser, wsPort);
    await server.start();

    const html = getViewerHtml().replace(
      'const port = parseInt(location.port, 10) || defaultPort;',
      `const port = ${wsPort};`
    );
    const vp = wsPort + 1000;
    httpSrv = http.createServer((_q, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
    });
    await new Promise<void>((r) => httpSrv.listen(vp, () => r()));

    const b = browser.getPage().context().browser()!;
    vCtx = await b.newContext({ viewport: { width: 375, height: 812 } });
    vPage = await vCtx.newPage();

    await vPage.addInitScript(() => {
      Object.defineProperty(window, 'ontouchstart', { value: {}, writable: true });
      Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, writable: false });
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        writable: true,
      });
      const orig = WebSocket.prototype.send;
      (window as Record<string, unknown>).__wsMsgs = [];
      WebSocket.prototype.send = function (data: unknown) {
        try {
          ((window as Record<string, unknown>).__wsMsgs as unknown[]).push(
            JSON.parse(data as string)
          );
        } catch {/* empty */}
        return orig.call(this, data);
      };
    });

    await vPage.goto(`http://localhost:${vp}/view`);

    await vPage.waitForFunction(
      () => {
        const img = document.getElementById('screen') as HTMLImageElement;
        return img && img.src.startsWith('blob:') && img.naturalWidth > 0;
      },
      { timeout: 15000 }
    );

    vCdp = await vCtx.newCDPSession(vPage);
    await vPage.waitForTimeout(1000);
  }, 30000);

  afterAll(async () => {
    await vCtx?.close();
    httpSrv?.close();
    await server?.stop();
    await browser?.close();
  });

  beforeEach(async () => {
    await vPage.evaluate(() => {
      (window as Record<string, unknown>).__wsMsgs = [];
    });
  });

  async function tStart(pts: { x: number; y: number; id?: number }[]) {
    await vCdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })),
    });
  }

  async function tMove(pts: { x: number; y: number; id?: number }[]) {
    await vCdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })),
    });
  }

  async function tEnd(pts: { x: number; y: number; id?: number }[]) {
    await vCdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })),
    });
  }

  async function getMouseMsgs(): Promise<Record<string, unknown>[]> {
    const all = await vPage.evaluate(
      () => (window as Record<string, unknown>).__wsMsgs as Record<string, unknown>[]
    );
    return all.filter((m: Record<string, unknown>) => m.type === 'input_mouse');
  }

  async function getTouchpadBox() {
    const box = await vPage.locator('#touchpad').boundingBox();
    expect(box).toBeTruthy();
    return box!;
  }

  it('should show cursor element', async () => {
    const visible = await vPage.locator('#cursor').isVisible();
    expect(visible).toBe(true);
  });

  it('should show touchpad element', async () => {
    const visible = await vPage.locator('#touchpad').isVisible();
    expect(visible).toBe(true);
  });

  it('short tap on touchpad → mousePressed + mouseReleased', async () => {
    const tp = await getTouchpadBox();
    const cx = tp.x + tp.width / 2;
    const cy = tp.y + tp.height / 2;

    await tStart([{ x: cx, y: cy }]);
    await vPage.waitForTimeout(50);
    await tEnd([{ x: cx, y: cy }]);
    await vPage.waitForTimeout(500);

    const msgs = await getMouseMsgs();
    expect(msgs.find((m) => m.eventType === 'mousePressed')).toBeTruthy();
    expect(msgs.find((m) => m.eventType === 'mouseReleased')).toBeTruthy();
  });

  it('long press on touchpad → mousePressed, then drag → mouseMoved + mouseReleased', async () => {
    const tp = await getTouchpadBox();
    const sx = tp.x + tp.width / 2;
    const sy = tp.y + tp.height / 2;
    const ex = sx + 60;
    const ey = sy + 60;

    await tStart([{ x: sx, y: sy, id: 0 }]);
    await vPage.waitForTimeout(600);

    let msgs = await getMouseMsgs();
    expect(msgs.find((m) => m.eventType === 'mousePressed')).toBeTruthy();

    await vPage.evaluate(() => {
      (window as Record<string, unknown>).__wsMsgs = [];
    });

    await tMove([{ x: ex, y: ey, id: 0 }]);
    await vPage.waitForTimeout(100);
    await tEnd([{ x: ex, y: ey, id: 0 }]);
    await vPage.waitForTimeout(500);

    msgs = await getMouseMsgs();
    expect(msgs.find((m) => m.eventType === 'mouseMoved')).toBeTruthy();
    expect(msgs.find((m) => m.eventType === 'mouseReleased')).toBeTruthy();
  });

  it('two-finger on touchpad → mouseWheel', async () => {
    const tp = await getTouchpadBox();
    const cx = tp.x + tp.width / 2;
    const cy = tp.y + tp.height / 2;

    await tStart([
      { x: cx - 20, y: cy - 20, id: 0 },
      { x: cx + 20, y: cy + 20, id: 1 },
    ]);
    await vPage.waitForTimeout(100);

    await vPage.evaluate(() => {
      (window as Record<string, unknown>).__wsMsgs = [];
    });

    await tMove([
      { x: cx - 20, y: cy + 60, id: 0 },
      { x: cx + 20, y: cy + 80, id: 1 },
    ]);
    await vPage.waitForTimeout(100);

    await tEnd([
      { x: cx - 20, y: cy + 60, id: 0 },
      { x: cx + 20, y: cy + 80, id: 1 },
    ]);
    await vPage.waitForTimeout(500);

    const msgs = await getMouseMsgs();
    expect(msgs.filter((m) => m.eventType === 'mouseWheel').length).toBeGreaterThanOrEqual(1);
  });

  it('cursor moves when sliding on touchpad', async () => {
    const tp = await getTouchpadBox();
    const sx = tp.x + tp.width / 2;
    const sy = tp.y + tp.height / 2;

    const beforePos = await vPage.evaluate(() => {
      const c = document.getElementById('cursor')!;
      return { left: c.style.left, top: c.style.top };
    });

    await tStart([{ x: sx, y: sy, id: 0 }]);
    await vPage.waitForTimeout(50);
    await tMove([{ x: sx + 80, y: sy + 40, id: 0 }]);
    await vPage.waitForTimeout(100);
    await tEnd([{ x: sx + 80, y: sy + 40, id: 0 }]);
    await vPage.waitForTimeout(200);

    const afterPos = await vPage.evaluate(() => {
      const c = document.getElementById('cursor')!;
      return { left: c.style.left, top: c.style.top };
    });

    expect(afterPos.left).not.toBe(beforePos.left);
    expect(afterPos.top).not.toBe(beforePos.top);
  });
});
