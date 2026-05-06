import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Page } from 'playwright-core';
import { BrowserManager } from '../browser.js';

const executablePath =
  process.env.AGENT_BROWSER_EXECUTABLE_PATH ||
  '/Applications/Chromium.app/Contents/MacOS/Chromium';

const injectScript = `
  (function() {
    if (window.__agentBrowserListenerInjected) return;
    window.__agentBrowserListenerInjected = true;

    document.addEventListener('focus', function(e) {
      var el = e.target;
      if (!el) return;
      var tag = el.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !el.isContentEditable) return;
      try {
        window.__agentBrowserInputEvent({
          type: 'input_focused',
          tag: tag,
          inputType: el.type || '',
          value: typeof el.value === 'string' ? el.value : '',
          placeholder: el.placeholder || '',
          id: el.id || ''
        });
      } catch(ex) {}
    }, true);

    document.addEventListener('input', function(e) {
      var el = e.target;
      if (!el) return;
      var tag = el.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !el.isContentEditable) return;
      try {
        window.__agentBrowserInputEvent({
          type: 'input_value',
          text: typeof el.value === 'string' ? el.value : ''
        });
      } catch(ex) {}
    }, true);

    document.addEventListener('blur', function() {
      try {
        window.__agentBrowserInputEvent({ type: 'input_blur' });
      } catch(ex) {}
    }, true);
  })();
`;

describe('injectFocusListener - E2E integration (real browser)', () => {
  let browser: BrowserManager;
  let page: Page;
  let receivedEvents: Array<Record<string, unknown>> = [];

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-focus-listener-e2e',
      headless: true,
      executablePath,
    });
    page = browser.getPage();

    const html = `<!DOCTYPE html>
<html>
<body>
  <h1>Focus Listener Test</h1>
  <input id="text-input" type="text" placeholder="Type here" />
  <textarea id="textarea-input" placeholder="Multi-line"></textarea>
  <div id="clickable" style="padding:20px;background:#eee;">Click me</div>
  <button id="btn">Button</button>
  <div id="editable" contenteditable="true" style="border:1px solid #ccc;padding:10px;">Editable</div>
</body>
</html>`;
    await page.goto('data:text/html,' + encodeURIComponent(html));

    await page.exposeFunction('__agentBrowserInputEvent', (data: unknown) => {
      receivedEvents.push(data as Record<string, unknown>);
    });
    await page.addInitScript(injectScript);
    await page.evaluate(injectScript);
  }, 30000);

  afterAll(async () => {
    await browser.close();
  }, 10000);

  it('exposes __agentBrowserInputEvent as function on page after injection', async () => {
    const result = await page.evaluate(() => typeof window.__agentBrowserInputEvent);
    expect(result).toBe('function');
  });

  it('sets injection guard flag after evaluation', async () => {
    const result = await page.evaluate(() => window.__agentBrowserListenerInjected);
    expect(result).toBe(true);
  });

  it('focusing input triggers input_focused callback with correct data', async () => {
    receivedEvents = [];
    await page.focus('#text-input');
    await page.waitForTimeout(100);

    expect(receivedEvents.length).toBeGreaterThanOrEqual(1);
    const focusEvent = receivedEvents.find((e) => e.type === 'input_focused');
    expect(focusEvent).toBeDefined();
    expect(focusEvent!.tag).toBe('INPUT');
    expect(focusEvent!.id).toBe('text-input');
    expect(focusEvent!.inputType).toBe('text');
    expect(focusEvent!.placeholder).toBe('Type here');
  });

  it('focusing textarea triggers input_focused with TEXTAREA tag', async () => {
    receivedEvents = [];
    await page.focus('#textarea-input');
    await page.waitForTimeout(100);

    const focusEvent = receivedEvents.find((e) => e.type === 'input_focused');
    expect(focusEvent).toBeDefined();
    expect(focusEvent!.tag).toBe('TEXTAREA');
    expect(focusEvent!.id).toBe('textarea-input');
  });

  it('typing in input triggers input_value callback', async () => {
    receivedEvents = [];
    await page.focus('#text-input');
    await page.waitForTimeout(50);
    await page.type('#text-input', 'hello world');
    await page.waitForTimeout(100);

    const valueEvents = receivedEvents.filter((e) => e.type === 'input_value');
    expect(valueEvents.length).toBeGreaterThan(0);
    const lastValue = valueEvents[valueEvents.length - 1];
    expect(lastValue.text).toContain('hello world');
  });

  it('blurring input triggers input_blur callback', async () => {
    receivedEvents = [];
    await page.focus('#text-input');
    await page.waitForTimeout(50);
    await page.click('#clickable');
    await page.waitForTimeout(100);

    const blurEvent = receivedEvents.find((e) => e.type === 'input_blur');
    expect(blurEvent).toBeDefined();
  });

  it('clicking non-input element does NOT trigger input_focused', async () => {
    receivedEvents = [];
    await page.click('#btn');
    await page.waitForTimeout(100);

    const focusEvents = receivedEvents.filter((e) => e.type === 'input_focused');
    expect(focusEvents.length).toBe(0);
  });

  it('focusing contentEditable div triggers input_focused', async () => {
    receivedEvents = [];
    await page.focus('#editable');
    await page.waitForTimeout(100);

    const focusEvent = receivedEvents.find((e) => e.type === 'input_focused');
    expect(focusEvent).toBeDefined();
    expect(focusEvent!.id).toBe('editable');
  });
});
