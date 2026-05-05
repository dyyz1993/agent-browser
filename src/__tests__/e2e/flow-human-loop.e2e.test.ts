import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { FlowExecutor } from '../../flow/flow-executor.js';
import type { SiteDefinition } from '../../flow/types.js';
import { getFixturePath } from './utils/test-helpers.js';

const executablePath =
  process.env.AGENT_BROWSER_EXECUTABLE_PATH || '/Applications/Chromium.app/Contents/MacOS/Chromium';

describe('Flow Engine - Human-in-the-Loop', () => {
  let browser: BrowserManager;
  let executor: FlowExecutor;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'human-loop-test',
      headless: true,
      executablePath,
    });
    executor = new FlowExecutor(browser);
  }, 30000);

  afterAll(async () => {
    await browser.close();
  });

  it('Scenario 1: detectBlocking should detect captcha element', async () => {
    const site: SiteDefinition = {
      name: 'captcha-detect',
      baseUrl: getFixturePath('human-loop-captcha.html'),
      flows: {
        'detect-captcha': {
          id: 'detect-captcha',
          steps: [
            { id: 'nav', action: 'navigate', url: '${baseUrl}' },
            {
              id: 'detect',
              action: 'detectBlocking',
              blockingConditions: [{ selector: '.captcha-verify' }],
            },
          ],
          output: ['blockingDetected'],
        },
      },
    };

    const result = await executor.execute(site, 'detect-captcha', {});
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.data.blockingDetected).toBe(true);
    expect(executor.getContext().variables['isBlocked']).toBe(true);
  }, 30000);

  it('Scenario 1b: detectBlocking should detect modal popup', async () => {
    const site: SiteDefinition = {
      name: 'popup-detect',
      baseUrl: getFixturePath('human-loop-popup.html'),
      flows: {
        'detect-popup': {
          id: 'detect-popup',
          steps: [
            { id: 'nav', action: 'navigate', url: '${baseUrl}' },
            {
              id: 'detect',
              action: 'detectBlocking',
              blockingConditions: [{ selector: '.modal-popup' }],
            },
          ],
          output: ['blockingDetected'],
        },
      },
    };

    const result = await executor.execute(site, 'detect-popup', {});
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.data.blockingDetected).toBe(true);
  }, 30000);

  it('Scenario 1c: detectBlocking should detect text content', async () => {
    const site: SiteDefinition = {
      name: 'login-text-detect',
      baseUrl: getFixturePath('human-loop-login.html'),
      flows: {
        'detect-text': {
          id: 'detect-text',
          steps: [
            { id: 'nav', action: 'navigate', url: '${baseUrl}' },
            {
              id: 'detect',
              action: 'detectBlocking',
              blockingConditions: [{ textContains: 'Please log in' }],
            },
          ],
          output: ['blockingDetected'],
        },
      },
    };

    const result = await executor.execute(site, 'detect-text', {});
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.data.blockingDetected).toBe(true);
  }, 30000);

  it('Scenario 1d: detectBlocking should detect URL pattern', async () => {
    const site: SiteDefinition = {
      name: 'login-url-detect',
      baseUrl: getFixturePath('human-loop-login.html'),
      flows: {
        'detect-url': {
          id: 'detect-url',
          steps: [
            { id: 'nav', action: 'navigate', url: '${baseUrl}' },
            {
              id: 'detect',
              action: 'detectBlocking',
              blockingConditions: [{ urlPattern: 'human-loop-login' }],
            },
          ],
          output: ['blockingDetected'],
        },
      },
    };

    const result = await executor.execute(site, 'detect-url', {});
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.data.blockingDetected).toBe(true);
  }, 30000);

  it('Scenario 2: waitForHuman should wait for auto-resolving captcha', async () => {
    const site: SiteDefinition = {
      name: 'captcha-wait',
      baseUrl: getFixturePath('human-loop-captcha.html'),
      flows: {
        'wait-captcha': {
          id: 'wait-captcha',
          steps: [
            { id: 'nav', action: 'navigate', url: '${baseUrl}' },
            {
              id: 'wait',
              action: 'waitForHuman',
              blockingConditions: [{ selector: '.captcha-verify' }],
              checkInterval: 500,
              resolveTimeout: 15000,
              onResolved: [
                {
                  id: 'extract-after',
                  action: 'eval',
                  value:
                    "JSON.stringify(Array.from(document.querySelectorAll('.data-item')).map(el => ({text: el.textContent.trim()})))",
                  outputVar: 'items',
                },
              ],
            },
          ],
          output: ['items'],
        },
      },
    };

    const result = await executor.execute(site, 'wait-captcha', {});
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.data.items).toBeDefined();
    const items = result.data.items as Array<Record<string, unknown>>;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(3);
  }, 30000);

  it('Scenario 2b: waitForHuman should detect popup auto-resolve', async () => {
    const site: SiteDefinition = {
      name: 'popup-wait',
      baseUrl: getFixturePath('human-loop-popup.html'),
      flows: {
        'wait-popup': {
          id: 'wait-popup',
          steps: [
            { id: 'nav', action: 'navigate', url: '${baseUrl}' },
            {
              id: 'wait',
              action: 'waitForHuman',
              blockingConditions: [{ selector: '.modal-popup' }],
              checkInterval: 500,
              resolveTimeout: 15000,
            },
          ],
        },
      },
    };

    const result = await executor.execute(site, 'wait-popup', {});
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  }, 30000);

  it('Scenario 3: autoRecover full cycle - detect, wait, resume', async () => {
    const site: SiteDefinition = {
      name: 'auto-recover',
      baseUrl: getFixturePath('human-loop-captcha.html'),
      flows: {
        'auto-recover-captcha': {
          id: 'auto-recover-captcha',
          steps: [
            { id: 'nav', action: 'navigate', url: '${baseUrl}' },
            {
              id: 'recover',
              action: 'autoRecover',
              blockingConditions: [{ selector: '.captcha-verify' }],
              intervention: {
                message: 'Please resolve the captcha',
                openViewer: false,
                screenshot: false,
                mode: 'wait',
              },
              checkInterval: 500,
              resolveTimeout: 15000,
              onResolved: [
                {
                  id: 'verify-content',
                  action: 'eval',
                  value:
                    "JSON.stringify(Array.from(document.querySelectorAll('.data-item')).map(el => ({text: el.textContent.trim()})))",
                  outputVar: 'recoveredItems',
                },
              ],
            },
          ],
          output: ['recoveredItems'],
        },
      },
    };

    const result = await executor.execute(site, 'auto-recover-captcha', {});
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.data.recoveredItems).toBeDefined();
    const items = result.data.recoveredItems as Array<Record<string, unknown>>;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(3);
  }, 30000);

  it('Scenario 3b: autoRecover with jsExpression blocking condition', async () => {
    const site: SiteDefinition = {
      name: 'auto-recover-js',
      baseUrl: getFixturePath('human-loop-captcha.html'),
      flows: {
        'auto-recover-js': {
          id: 'auto-recover-js',
          steps: [
            { id: 'nav', action: 'navigate', url: '${baseUrl}' },
            {
              id: 'recover',
              action: 'autoRecover',
              blockingConditions: [
                { jsExpression: "document.getElementById('captcha-modal') !== null" },
              ],
              intervention: {
                message: 'Captcha detected via JS expression',
                mode: 'wait',
              },
              checkInterval: 500,
              resolveTimeout: 15000,
            },
          ],
        },
      },
    };

    const result = await executor.execute(site, 'auto-recover-js', {});
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  }, 30000);

  it('Scenario 4: autoRecover with no blocking condition should skip', async () => {
    const site: SiteDefinition = {
      name: 'no-blocking',
      baseUrl: getFixturePath('human-loop-clean.html'),
      flows: {
        'no-block': {
          id: 'no-block',
          steps: [
            { id: 'nav', action: 'navigate', url: '${baseUrl}' },
            {
              id: 'recover',
              action: 'autoRecover',
              blockingConditions: [{ selector: '.captcha-verify' }, { selector: '.modal-popup' }],
              intervention: {
                message: 'Should not be triggered',
                mode: 'wait',
              },
              checkInterval: 500,
              resolveTimeout: 5000,
            },
            {
              id: 'extract-clean',
              action: 'eval',
              value:
                "JSON.stringify(Array.from(document.querySelectorAll('.data-item')).map(el => ({text: el.textContent.trim()})))",
              outputVar: 'cleanItems',
            },
          ],
          output: ['cleanItems'],
        },
      },
    };

    const result = await executor.execute(site, 'no-block', {});
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.data.cleanItems).toBeDefined();
    const items = result.data.cleanItems as Array<Record<string, unknown>>;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(2);
  }, 30000);

  it('Scenario 5: waitForHuman should timeout and run onTimeout steps', async () => {
    const site: SiteDefinition = {
      name: 'timeout-test',
      baseUrl: getFixturePath('human-loop-captcha.html'),
      flows: {
        'timeout-flow': {
          id: 'timeout-flow',
          steps: [
            { id: 'nav', action: 'navigate', url: '${baseUrl}' },
            {
              id: 'wait',
              action: 'waitForHuman',
              blockingConditions: [{ selector: '.captcha-verify' }],
              checkInterval: 500,
              resolveTimeout: 1000,
              onTimeout: [
                {
                  id: 'timeout-extract',
                  action: 'eval',
                  value: "'timed-out'",
                  outputVar: 'timeoutResult',
                },
              ],
            },
          ],
          output: ['timeoutResult'],
        },
      },
    };

    const result = await executor.execute(site, 'timeout-flow', {});
    expect(result.success).toBe(true);
    expect(result.data.timeoutResult).toBe('timed-out');
  }, 30000);

  it('Scenario 6: full pipeline with multiple blocking conditions (OR logic)', async () => {
    const site: SiteDefinition = {
      name: 'multi-condition',
      baseUrl: getFixturePath('human-loop-captcha.html'),
      flows: {
        'multi-detect': {
          id: 'multi-detect',
          steps: [
            { id: 'nav', action: 'navigate', url: '${baseUrl}' },
            {
              id: 'detect',
              action: 'detectBlocking',
              blockingConditions: [
                { selector: '.nonexistent-class' },
                { textContains: 'Please complete captcha' },
                { urlPattern: 'human-loop-captcha' },
              ],
            },
          ],
          output: ['blockingDetected'],
        },
      },
    };

    const result = await executor.execute(site, 'multi-detect', {});
    expect(result.success).toBe(true);
    expect(result.data.blockingDetected).toBe(true);
  }, 30000);

  it('Scenario 7: detectBlocking returns false when no conditions match on clean page', async () => {
    const site: SiteDefinition = {
      name: 'no-match',
      baseUrl: getFixturePath('human-loop-clean.html'),
      flows: {
        'no-match': {
          id: 'no-match',
          steps: [
            { id: 'nav', action: 'navigate', url: '${baseUrl}' },
            {
              id: 'detect',
              action: 'detectBlocking',
              blockingConditions: [
                { selector: '.captcha-verify' },
                { selector: '.modal-popup' },
                { textContains: 'Please log in' },
                { urlPattern: 'login-required' },
              ],
            },
          ],
          output: ['blockingDetected'],
        },
      },
    };

    const result = await executor.execute(site, 'no-match', {});
    expect(result.success).toBe(true);
    expect(result.data.blockingDetected).toBe(false);
  }, 30000);
});
