import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser/index.js';
import { executeCommand } from '../../actions/index.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';
import type { TextData, ValueData, VisibleData } from '../../types.js';
import { isSuccessResponse } from '../../types.js';

describe('visibility toggle (E2E)', () => {
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
      parseCliArgs(['open', getFixturePath('visibility-toggle.html')]),
      browser
    );
    expect(openResult.success).toBe(true);
  });

  describe('visibility check', () => {
    it('should check element is hidden initially', async () => {
      const visibleResult = await executeCommand(
        parseCliArgs(['is', 'visible', '#target-element']),
        browser
      );
      expect(visibleResult.success).toBe(true);
      if (isSuccessResponse(visibleResult)) {
        expect((visibleResult.data as VisibleData).visible).toBe(false);
      }
    });

    it('should check input inside hidden element is not visible', async () => {
      const visibleResult = await executeCommand(
        parseCliArgs(['is', 'visible', '#target-input']),
        browser
      );
      expect(visibleResult.success).toBe(true);
      if (isSuccessResponse(visibleResult)) {
        expect((visibleResult.data as VisibleData).visible).toBe(false);
      }
    });
  });

  describe('toggle visibility', () => {
    it('should show element after toggle', async () => {
      const toggleResult = await executeCommand(parseCliArgs(['click', '#toggle-btn']), browser);
      expect(toggleResult.success).toBe(true);

      const visibleResult = await executeCommand(
        parseCliArgs(['is', 'visible', '#target-element']),
        browser
      );
      expect(visibleResult.success).toBe(true);
      if (isSuccessResponse(visibleResult)) {
        expect((visibleResult.data as VisibleData).visible).toBe(true);
      }
    });

    it('should hide element after second toggle', async () => {
      await executeCommand(parseCliArgs(['click', '#toggle-btn']), browser);
      await executeCommand(parseCliArgs(['click', '#toggle-btn']), browser);

      const visibleResult = await executeCommand(
        parseCliArgs(['is', 'visible', '#target-element']),
        browser
      );
      expect(visibleResult.success).toBe(true);
      if (isSuccessResponse(visibleResult)) {
        expect((visibleResult.data as VisibleData).visible).toBe(false);
      }
    });
  });

  describe('show/hide buttons', () => {
    it('should show element with show button', async () => {
      const showResult = await executeCommand(parseCliArgs(['click', '#show-btn']), browser);
      expect(showResult.success).toBe(true);

      const visibleResult = await executeCommand(
        parseCliArgs(['is', 'visible', '#target-element']),
        browser
      );
      expect(visibleResult.success).toBe(true);
      if (isSuccessResponse(visibleResult)) {
        expect((visibleResult.data as VisibleData).visible).toBe(true);
      }
    });

    it('should hide element with hide button', async () => {
      await executeCommand(parseCliArgs(['click', '#show-btn']), browser);

      const hideResult = await executeCommand(parseCliArgs(['click', '#hide-btn']), browser);
      expect(hideResult.success).toBe(true);

      const visibleResult = await executeCommand(
        parseCliArgs(['is', 'visible', '#target-element']),
        browser
      );
      expect(visibleResult.success).toBe(true);
      if (isSuccessResponse(visibleResult)) {
        expect((visibleResult.data as VisibleData).visible).toBe(false);
      }
    });
  });

  describe('interact with revealed element', () => {
    it('should fill input inside revealed element', async () => {
      await executeCommand(parseCliArgs(['click', '#show-btn']), browser);

      const fillResult = await executeCommand(
        parseCliArgs(['fill', '#target-input', 'test value']),
        browser
      );
      expect(fillResult.success).toBe(true);

      const valueResult = await executeCommand(
        parseCliArgs(['get', 'value', '#target-input']),
        browser
      );
      expect(valueResult.success).toBe(true);
      if (isSuccessResponse(valueResult)) {
        expect((valueResult.data as ValueData).value).toBe('test value');
      }
    });

    it('should click button inside revealed element', async () => {
      await executeCommand(parseCliArgs(['click', '#show-btn']), browser);

      const clickResult = await executeCommand(parseCliArgs(['click', '#target-btn']), browser);
      expect(clickResult.success).toBe(true);

      const textResult = await executeCommand(
        parseCliArgs(['get', 'text', '#target-btn']),
        browser
      );
      expect(textResult.success).toBe(true);
      if (isSuccessResponse(textResult)) {
        expect((textResult.data as TextData).text).toBe('Clicked!');
      }
    });
  });

  describe('wait for visible element', () => {
    it('should wait for element to become visible', async () => {
      const clickResult = await executeCommand(parseCliArgs(['click', '#toggle-btn']), browser);
      expect(clickResult.success).toBe(true);

      const waitResult = await executeCommand(parseCliArgs(['wait', '#target-element']), browser);
      expect(waitResult.success).toBe(true);
    });
  });
});
