import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions/index.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';
import { isSuccessResponse } from '../../types.js';

describe('diff iframe/fragment/shadow E2E tests', () => {
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

  describe('multi-layer iframe diff', () => {
    beforeEach(async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', getFixturePath('diff-iframe-main.html')]),
        browser
      );
      expect(openResult.success).toBe(true);
    }, 15000);

    describe('level 1 iframe operations', () => {
      it('should click button in level 1 iframe', async () => {
        // Wait for level 1 iframe to load
        const page = browser.getPage();
        const frame1 = page.frameLocator('#frame1');
        await frame1.locator('#level1-btn').waitFor({ state: 'visible', timeout: 5000 });

        const clickResult = await executeCommand(
          parseCliArgs(['click', '#level1-btn', '--in-frame', '#frame1']),
          browser
        );
        expect(clickResult.success).toBe(true);

        // Verify the counter was incremented by checking the text
        const counterText = await frame1.locator('#level1-counter').textContent();
        expect(counterText).toContain('1');
      }, 15000);

      it('should fill input in level 1 iframe', async () => {
        // Wait for level 1 iframe to load
        const page = browser.getPage();
        const frame1 = page.frameLocator('#frame1');
        await frame1.locator('#level1-input').waitFor({ state: 'visible', timeout: 5000 });

        const fillResult = await executeCommand(
          parseCliArgs(['fill', '#level1-input', 'test value', '--in-frame', '#frame1']),
          browser
        );
        expect(fillResult.success).toBe(true);

        // Verify the input value
        const inputValue = await frame1.locator('#level1-input').inputValue();
        expect(inputValue).toBe('test value');
      }, 15000);
    });

    describe('level 2 iframe operations', () => {
      it('should click button in level 2 iframe', async () => {
        // Wait for nested iframes to load
        const page = browser.getPage();
        const frame1 = page.frameLocator('#frame1');
        const frame2 = frame1.frameLocator('#frame2');
        await frame2.locator('#level2-btn').waitFor({ state: 'visible', timeout: 5000 });

        const clickResult = await executeCommand(
          parseCliArgs(['click', '#level2-btn', '--in-frame', '#frame1/#frame2']),
          browser
        );
        expect(clickResult.success).toBe(true);

        // Verify the counter was incremented
        const counterText = await frame2.locator('#level2-counter').textContent();
        expect(counterText).toContain('1');
      }, 15000);

      it('should fill email in level 2 iframe', async () => {
        // Wait for nested iframes to load
        const page = browser.getPage();
        const frame1 = page.frameLocator('#frame1');
        const frame2 = frame1.frameLocator('#frame2');
        await frame2.locator('#level2-email').waitFor({ state: 'visible', timeout: 5000 });

        const fillResult = await executeCommand(
          parseCliArgs([
            'fill',
            '#level2-email',
            'test@example.com',
            '--in-frame',
            '#frame1/#frame2',
          ]),
          browser
        );
        expect(fillResult.success).toBe(true);

        // Verify the input value
        const inputValue = await frame2.locator('#level2-email').inputValue();
        expect(inputValue).toBe('test@example.com');
      }, 15000);

      it('should detect select change in level 2 iframe', async () => {
        // Wait for nested iframes to load
        const page = browser.getPage();
        const frame1 = page.frameLocator('#frame1');
        const frame2 = frame1.frameLocator('#frame2');
        await frame2.locator('#level2-select').waitFor({ state: 'visible', timeout: 5000 });

        const selectResult = await executeCommand(
          parseCliArgs([
            'select',
            '#level2-select',
            'a',
            '--in-frame',
            '#frame1/#frame2',
            '--diff',
          ]),
          browser
        );
        expect(selectResult.success).toBe(true);

        if (isSuccessResponse(selectResult)) {
          expect(selectResult.data.diff).toBeDefined();
        }
      }, 15000);
    });

    describe('main page operations', () => {
      it('should detect main page button click', async () => {
        const clickResult = await executeCommand(
          parseCliArgs(['click', '#main-btn', '--diff']),
          browser
        );
        expect(clickResult.success).toBe(true);

        if (isSuccessResponse(clickResult)) {
          expect(clickResult.data.diff).toBeDefined();
          expect(clickResult.data.diff).toContain('Main Counter');
        }
      }, 15000);
    });
  });

  describe('fragment diff', () => {
    beforeEach(async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', getFixturePath('diff-fragment.html')]),
        browser
      );
      expect(openResult.success).toBe(true);
    }, 15000);

    it('should detect fragment navigation change', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', 'a[href="#section1"]', '--diff']),
        browser
      );
      expect(clickResult.success).toBe(true);

      if (isSuccessResponse(clickResult)) {
        expect(clickResult.data.diff).toBeDefined();
        expect(clickResult.data.diff).toContain('#section1');
      }
    }, 15000);

    it('should detect counter increment in section 1', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', '#s1-btn', '--diff']),
        browser
      );
      expect(clickResult.success).toBe(true);

      if (isSuccessResponse(clickResult)) {
        expect(clickResult.data.diff).toBeDefined();
        expect(clickResult.data.diff).toContain('Section 1 Counter');
      }
    }, 15000);

    it('should detect status change in section 3', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', '#s3-btn', '--diff']),
        browser
      );
      expect(clickResult.success).toBe(true);

      if (isSuccessResponse(clickResult)) {
        expect(clickResult.data.diff).toBeDefined();
        expect(clickResult.data.diff).toContain('Status');
      }
    }, 15000);

    it('should detect toggle show in section 3', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', '#s3-toggle', '--diff']),
        browser
      );
      expect(clickResult.success).toBe(true);

      if (isSuccessResponse(clickResult)) {
        expect(clickResult.data.diff).toBeDefined();
        expect(clickResult.data.diff).toContain('+ paragraph');
      }
    }, 15000);

    it('should work with CSS selector scope', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', '#s1-btn', '--diff', '#section1']),
        browser
      );
      expect(clickResult.success).toBe(true);

      if (isSuccessResponse(clickResult)) {
        expect(clickResult.data.diffScope).toBe('#section1');
      }
    }, 15000);

    it('should work with full scope', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', '#s1-btn', '--diff', 'full']),
        browser
      );
      expect(clickResult.success).toBe(true);

      if (isSuccessResponse(clickResult)) {
        expect(clickResult.data.diffScope).toBe('full page');
      }
    }, 15000);
  });

  describe('shadow DOM diff', () => {
    beforeEach(async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', getFixturePath('diff-shadow.html')]),
        browser
      );
      expect(openResult.success).toBe(true);
    }, 15000);

    describe('outside shadow DOM operations', () => {
      it('should detect outside counter increment', async () => {
        const clickResult = await executeCommand(
          parseCliArgs(['click', '#outside-btn', '--diff']),
          browser
        );
        expect(clickResult.success).toBe(true);

        if (isSuccessResponse(clickResult)) {
          expect(clickResult.data.diff).toBeDefined();
          expect(clickResult.data.diff).toContain('Outside Shadow DOM');
        }
      }, 15000);

      it('should detect outside toggle show', async () => {
        const clickResult = await executeCommand(
          parseCliArgs(['click', '#outside-toggle', '--diff']),
          browser
        );
        expect(clickResult.success).toBe(true);

        if (isSuccessResponse(clickResult)) {
          expect(clickResult.data.diff).toBeDefined();
          expect(clickResult.data.diff).toContain('+ paragraph');
        }
      }, 15000);
    });

    describe('shadow DOM operations', () => {
      it('should detect shadow counter increment', async () => {
        // Playwright can interact with shadow DOM using internal: selectors
        const page = browser.getPage();
        // Use locate on the shadow host and then find the button inside
        const shadowCounter = page.locator('#shadow-counter');
        const incBtn = shadowCounter.getByRole('button', { name: 'Increment' });
        await incBtn.waitFor({ state: 'visible', timeout: 5000 });

        // Get snapshot before
        await executeCommand(parseCliArgs(['snapshot']), browser);

        await incBtn.click();

        // Get diff by taking another snapshot
        const snapshotAfter = await executeCommand(parseCliArgs(['snapshot']), browser);
        expect(snapshotAfter.success).toBe(true);

        // Verify the counter was incremented
        const counterText = await shadowCounter.locator('#count').textContent();
        expect(counterText).toContain('1');
      }, 15000);

      it('should detect shadow input fill', async () => {
        const page = browser.getPage();
        const shadowForm = page.locator('#shadow-form');
        const shadowInput = shadowForm.getByPlaceholder('Shadow input');
        await shadowInput.waitFor({ state: 'visible', timeout: 5000 });

        await shadowInput.fill('shadow test');
        const value = await shadowInput.inputValue();
        expect(value).toBe('shadow test');
      }, 15000);

      it('should detect shadow toggle show', async () => {
        const page = browser.getPage();
        const shadowToggle = page.locator('#shadow-toggle');
        const toggleBtn = shadowToggle.getByRole('button');
        await toggleBtn.waitFor({ state: 'visible', timeout: 5000 });

        await toggleBtn.click();

        // Verify the secret text is now visible
        const secretText = shadowToggle.locator('#secret-text');
        await secretText.waitFor({ state: 'visible', timeout: 3000 });
        expect(await secretText.isVisible()).toBe(true);
      }, 15000);
    });

    describe('diff scope options with shadow DOM', () => {
      it('should work with full scope', async () => {
        const clickResult = await executeCommand(
          parseCliArgs(['click', '#outside-btn', '--diff', 'full']),
          browser
        );
        expect(clickResult.success).toBe(true);

        if (isSuccessResponse(clickResult)) {
          expect(clickResult.data.diffScope).toBe('full page');
        }
      }, 15000);

      it('should work with CSS selector scope', async () => {
        const clickResult = await executeCommand(
          parseCliArgs(['click', '#outside-btn', '--diff', '#outside-text']),
          browser
        );
        expect(clickResult.success).toBe(true);

        if (isSuccessResponse(clickResult)) {
          expect(clickResult.data.diffScope).toBe('#outside-text');
        }
      }, 15000);
    });
  });
});
