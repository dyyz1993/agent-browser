import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import { BrowserManager } from '../../browser/index.js';
import { StreamServer } from '../../stream-server.js';
import { getFixturePath } from './utils/test-helpers.js';

describe('keyboard input via WebSocket (Full E2E)', () => {
  let browser: BrowserManager;
  let streamServer: StreamServer;
  let wsPort: number;
  let ws: WebSocket | null = null;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-launch-ws',
      headless: true,
    });

    wsPort = 5006 + Math.floor(Math.random() * 1000);
    streamServer = new StreamServer(browser, wsPort);
    await streamServer.start();
    console.log('[Test] StreamServer started on port', wsPort);
  });

  afterAll(async () => {
    if (ws) {
      ws.close();
    }
    await streamServer.stop();
    await browser.close();
  });

  beforeEach(async () => {
    const page = browser.getPage();
    await page.goto(getFixturePath('input-test.html'));
  });

  afterEach(() => {
    if (ws) {
      ws.close();
      ws = null;
    }
  });

  function connectWebSocket(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const url = `ws://localhost:${wsPort}`;
      const socket = new WebSocket(url);

      socket.on('open', () => {
        resolve(socket);
      });

      socket.on('error', (err) => {
        reject(err);
      });

      setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 5000);
    });
  }

  function sendKeyboardDown(key: string): void {
    if (!ws) throw new Error('WebSocket not connected');
    ws.send(JSON.stringify({ type: 'keyboard_down', key }));
  }

  function sendKeyboardUp(key: string): void {
    if (!ws) throw new Error('WebSocket not connected');
    ws.send(JSON.stringify({ type: 'keyboard_up', key }));
  }

  function sendKeyboardInsertText(text: string): void {
    if (!ws) throw new Error('WebSocket not connected');
    ws.send(JSON.stringify({ type: 'keyboard_insert_text', text }));
  }

  function sendMouseDown(x: number, y: number): void {
    if (!ws) throw new Error('WebSocket not connected');
    ws.send(
      JSON.stringify({
        type: 'input_mouse',
        eventType: 'mousePressed',
        x,
        y,
        button: 'left',
        clickCount: 1,
      })
    );
  }

  function sendMouseUp(x: number, y: number): void {
    if (!ws) throw new Error('WebSocket not connected');
    ws.send(
      JSON.stringify({
        type: 'input_mouse',
        eventType: 'mouseReleased',
        x,
        y,
        button: 'left',
        clickCount: 1,
      })
    );
  }

  describe('WebSocket connection', () => {
    it('should connect to StreamServer', async () => {
      ws = await connectWebSocket();
      expect(ws.readyState).toBe(WebSocket.OPEN);
    });
  });

  describe('keyboard input via WebSocket', () => {
    beforeEach(async () => {
      ws = await connectWebSocket();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should type letters via WebSocket', async () => {
      const page = browser.getPage();

      const inputBox = await page.locator('#text-input').boundingBox();
      if (!inputBox) throw new Error('Input not found');

      const centerX = Math.round(inputBox.x + inputBox.width / 2);
      const centerY = Math.round(inputBox.y + inputBox.height / 2);

      sendMouseDown(centerX, centerY);
      sendMouseUp(centerX, centerY);

      await new Promise((resolve) => setTimeout(resolve, 100));

      sendKeyboardDown('h');
      sendKeyboardUp('h');
      sendKeyboardDown('i');
      sendKeyboardUp('i');

      await new Promise((resolve) => setTimeout(resolve, 200));

      const value = await page.locator('#text-input').inputValue();
      expect(value).toBe('hi');
    });

    it('should type multiple letters via WebSocket', async () => {
      const page = browser.getPage();

      await page.click('#text-input');

      const text = 'hello';
      for (const char of text) {
        sendKeyboardDown(char);
        sendKeyboardUp(char);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      await new Promise((resolve) => setTimeout(resolve, 200));

      const value = await page.locator('#text-input').inputValue();
      expect(value).toBe(text);
    });

    it('should type numbers via WebSocket', async () => {
      const page = browser.getPage();

      await page.click('#text-input');

      sendKeyboardDown('1');
      sendKeyboardUp('1');
      sendKeyboardDown('2');
      sendKeyboardUp('2');
      sendKeyboardDown('3');
      sendKeyboardUp('3');

      await new Promise((resolve) => setTimeout(resolve, 200));

      const value = await page.locator('#text-input').inputValue();
      expect(value).toBe('123');
    });

    it('should insert text via keyboard_insert_text', async () => {
      const page = browser.getPage();

      await page.click('#text-input');

      sendKeyboardInsertText('你好世界');

      await new Promise((resolve) => setTimeout(resolve, 200));

      const value = await page.locator('#text-input').inputValue();
      expect(value).toBe('你好世界');
    });

    it('should handle special keys via WebSocket', async () => {
      const page = browser.getPage();

      await page.click('#text-input');

      sendKeyboardDown('a');
      sendKeyboardUp('a');
      sendKeyboardDown('b');
      sendKeyboardUp('b');

      await new Promise((resolve) => setTimeout(resolve, 100));

      let value = await page.locator('#text-input').inputValue();
      expect(value).toBe('ab');

      sendKeyboardDown('Backspace');
      sendKeyboardUp('Backspace');

      await new Promise((resolve) => setTimeout(resolve, 100));

      value = await page.locator('#text-input').inputValue();
      expect(value).toBe('a');
    });

    it('should handle Enter in textarea via WebSocket', async () => {
      const page = browser.getPage();

      await page.click('#textarea');

      sendKeyboardDown('a');
      sendKeyboardUp('a');
      sendKeyboardDown('Enter');
      sendKeyboardUp('Enter');
      sendKeyboardDown('b');
      sendKeyboardUp('b');

      await new Promise((resolve) => setTimeout(resolve, 200));

      const value = await page.locator('#textarea').inputValue();
      expect(value).toBe('a\nb');
    });
  });
});
