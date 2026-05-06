import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions/index.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';
import { isSuccessResponse, type DiffActionData } from '../../types.js';

describe('diff E2E tests', () => {
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

  describe('form value changes', () => {
    beforeEach(async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', getFixturePath('diff-form.html')]),
        browser
      );
      expect(openResult.success).toBe(true);
    });

    it('should detect text input value change', async () => {
      const snapshotBefore = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      expect(snapshotBefore.success).toBe(true);

      const fillResult = await executeCommand(
        parseCliArgs(['fill', '#name', 'John Doe', '--diff']),
        browser
      );
      expect(fillResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(fillResult)) {
        expect(fillResult.data.diff).toBeDefined();
        expect(fillResult.data.diff).toContain('John Doe');
      }
    });

    it('should detect email input value change', async () => {
      const fillResult = await executeCommand(
        parseCliArgs(['fill', '#email', 'test@example.com', '--diff']),
        browser
      );
      expect(fillResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(fillResult)) {
        expect(fillResult.data.diff).toBeDefined();
      }
    });

    it('should detect password input value change', async () => {
      const fillResult = await executeCommand(
        parseCliArgs(['fill', '#password', 'secret123', '--diff']),
        browser
      );
      expect(fillResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(fillResult)) {
        expect(fillResult.data.diff).toBeDefined();
      }
    });

    it('should detect textarea value change', async () => {
      const fillResult = await executeCommand(
        parseCliArgs(['fill', '#bio', 'This is my bio', '--diff']),
        browser
      );
      expect(fillResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(fillResult)) {
        expect(fillResult.data.diff).toBeDefined();
      }
    });

    it('should detect select value change', async () => {
      const selectResult = await executeCommand(
        parseCliArgs(['select', '#country', 'us', '--diff']),
        browser
      );
      expect(selectResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(selectResult)) {
        expect(selectResult.data.diff).toBeDefined();
      }
    });

    it('should detect checkbox state change', async () => {
      const checkResult = await executeCommand(
        parseCliArgs(['check', '#agree', '--diff']),
        browser
      );
      expect(checkResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(checkResult)) {
        expect(checkResult.data.diff).toBeDefined();
      }
    });
  });

  describe('text content changes', () => {
    beforeEach(async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', getFixturePath('diff-counter.html')]),
        browser
      );
      expect(openResult.success).toBe(true);
    });

    it('should detect counter increment', async () => {
      const snapshotBefore = await executeCommand(parseCliArgs(['snapshot']), browser);
      expect(snapshotBefore.success).toBe(true);

      const clickResult = await executeCommand(
        parseCliArgs(['click', '#increment', '--diff']),
        browser
      );
      expect(clickResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(clickResult)) {
        expect(clickResult.data.diff).toBeDefined();
        expect(clickResult.data.diff).toContain('Counter:');
      }
    });

    it('should detect counter decrement', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', '#decrement', '--diff']),
        browser
      );
      expect(clickResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(clickResult)) {
        expect(clickResult.data.diff).toBeDefined();
        expect(clickResult.data.diff).toContain('Counter:');
      }
    });

    it('should detect counter reset', async () => {
      await executeCommand(parseCliArgs(['click', '#increment']), browser);
      await executeCommand(parseCliArgs(['click', '#increment']), browser);

      const clickResult = await executeCommand(
        parseCliArgs(['click', '#reset', '--diff']),
        browser
      );
      expect(clickResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(clickResult)) {
        expect(clickResult.data.diff).toBeDefined();
      }
    });

    it('should detect message change', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', '#increment', '--diff']),
        browser
      );
      expect(clickResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(clickResult)) {
        expect(clickResult.data.diff).toBeDefined();
      }
    });
  });

  describe('element add/remove', () => {
    beforeEach(async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', getFixturePath('diff-toggle.html')]),
        browser
      );
      expect(openResult.success).toBe(true);
    });

    it('should detect showing hidden element', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', '#toggle', '--diff']),
        browser
      );
      expect(clickResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(clickResult)) {
        expect(clickResult.data.diff).toBeDefined();
        expect(clickResult.data.diff).toContain('+ paragraph');
      }
    });

    it('should detect hiding visible element', async () => {
      await executeCommand(parseCliArgs(['click', '#toggle']), browser);

      const clickResult = await executeCommand(
        parseCliArgs(['click', '#toggle', '--diff']),
        browser
      );
      expect(clickResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(clickResult)) {
        expect(clickResult.data.diff).toBeDefined();
        expect(clickResult.data.diff).toContain('- paragraph');
      }
    });

    it('should detect adding element', async () => {
      const clickResult = await executeCommand(parseCliArgs(['click', '#add', '--diff']), browser);
      expect(clickResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(clickResult)) {
        expect(clickResult.data.diff).toBeDefined();
        expect(clickResult.data.diff).toContain('+');
      }
    });

    it('should detect removing element', async () => {
      await executeCommand(parseCliArgs(['click', '#add']), browser);

      const clickResult = await executeCommand(
        parseCliArgs(['click', '#remove', '--diff']),
        browser
      );
      expect(clickResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(clickResult)) {
        expect(clickResult.data.diff).toBeDefined();
        expect(clickResult.data.diff).toContain('-');
      }
    });

    it('should detect multiple additions', async () => {
      await executeCommand(parseCliArgs(['click', '#add']), browser);
      await executeCommand(parseCliArgs(['click', '#add']), browser);

      const snapshotBefore = await executeCommand(parseCliArgs(['snapshot']), browser);
      expect(snapshotBefore.success).toBe(true);

      const clickResult = await executeCommand(parseCliArgs(['click', '#add', '--diff']), browser);
      expect(clickResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(clickResult)) {
        expect(clickResult.data.diff).toBeDefined();
      }
    });
  });

  describe('special characters', () => {
    beforeEach(async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', getFixturePath('diff-special-chars.html')]),
        browser
      );
      expect(openResult.success).toBe(true);
    });

    it('should handle unicode characters', async () => {
      const fillResult = await executeCommand(
        parseCliArgs(['fill', '#unicode-input', '你好世界 🌍', '--diff']),
        browser
      );
      expect(fillResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(fillResult)) {
        expect(fillResult.data.diff).toBeDefined();
      }
    });

    it('should handle html entities', async () => {
      const fillResult = await executeCommand(
        parseCliArgs(['fill', '#html-input', '<div>test</div>', '--diff']),
        browser
      );
      expect(fillResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(fillResult)) {
        expect(fillResult.data.diff).toBeDefined();
      }
    });

    it('should handle special characters', async () => {
      const fillResult = await executeCommand(
        parseCliArgs(['fill', '#special-input', 'Line1\\nLine2', '--diff']),
        browser
      );
      expect(fillResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(fillResult)) {
        expect(fillResult.data.diff).toBeDefined();
      }
    });

    it('should handle quotes', async () => {
      const fillResult = await executeCommand(
        parseCliArgs(['fill', '#quotes-input', 'He said "Hello"', '--diff']),
        browser
      );
      expect(fillResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(fillResult)) {
        expect(fillResult.data.diff).toBeDefined();
      }
    });
  });

  describe('large page performance', () => {
    beforeEach(async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', getFixturePath('diff-large.html')]),
        browser
      );
      expect(openResult.success).toBe(true);
    });

    it('should handle initializing 100 items', async () => {
      const clickResult = await executeCommand(parseCliArgs(['click', '#init', '--diff']), browser);
      expect(clickResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(clickResult)) {
        expect(clickResult.data.diff).toBeDefined();
      }
    });

    it('should handle adding 50 more items', async () => {
      await executeCommand(parseCliArgs(['click', '#init']), browser);

      const clickResult = await executeCommand(
        parseCliArgs(['click', '#add-50', '--diff']),
        browser
      );
      expect(clickResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(clickResult)) {
        expect(clickResult.data.diff).toBeDefined();
      }
    });

    it('should handle removing half items', async () => {
      await executeCommand(parseCliArgs(['click', '#init']), browser);

      const clickResult = await executeCommand(
        parseCliArgs(['click', '#remove-half', '--diff']),
        browser
      );
      expect(clickResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(clickResult)) {
        expect(clickResult.data.diff).toBeDefined();
      }
    });

    it('should handle clearing all items', async () => {
      await executeCommand(parseCliArgs(['click', '#init']), browser);

      const clickResult = await executeCommand(
        parseCliArgs(['click', '#clear', '--diff']),
        browser
      );
      expect(clickResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(clickResult)) {
        expect(clickResult.data.diff).toBeDefined();
      }
    });
  });

  describe('diff scope options', () => {
    beforeEach(async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', getFixturePath('diff-counter.html')]),
        browser
      );
      expect(openResult.success).toBe(true);
    });

    it('should work with default scope (3 levels up)', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', '#increment', '--diff']),
        browser
      );
      expect(clickResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(clickResult)) {
        expect(clickResult.data.diffScope).toBe('3 levels up');
      }
    });

    it('should work with full page scope', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', '#increment', '--diff', 'full']),
        browser
      );
      expect(clickResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(clickResult)) {
        expect(clickResult.data.diffScope).toBe('full page');
      }
    });

    it('should work with custom levels', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', '#increment', '--diff', '5']),
        browser
      );
      expect(clickResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(clickResult)) {
        expect(clickResult.data.diffScope).toBe('5 levels up');
      }
    });

    it('should work with CSS selector scope', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', '#increment', '--diff', '#counter']),
        browser
      );
      expect(clickResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(clickResult)) {
        expect(clickResult.data.diffScope).toBe('#counter');
      }
    });
  });

  describe('no changes detected', () => {
    beforeEach(async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', getFixturePath('diff-form.html')]),
        browser
      );
      expect(openResult.success).toBe(true);
    });

    it('should report no changes when clicking non-interactive element', async () => {
      const snapshotResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      expect(snapshotResult.success).toBe(true);

      const hoverResult = await executeCommand(parseCliArgs(['hover', 'h1', '--diff']), browser);
      expect(hoverResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(hoverResult)) {
        expect(hoverResult.data.diff).toBe('(no changes detected)');
      }
    });

    it('should report no changes when focusing input without typing', async () => {
      const focusResult = await executeCommand(parseCliArgs(['focus', '#name', '--diff']), browser);
      expect(focusResult.success).toBe(true);

      if (isSuccessResponse<DiffActionData>(focusResult)) {
        expect(focusResult.data.diff).toBe('(no changes detected)');
      }
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', getFixturePath('diff-form.html')]),
        browser
      );
      expect(openResult.success).toBe(true);
    });

    it('should handle non-existent element gracefully', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', '#non-existent', '--diff']),
        browser
      );
      expect(clickResult.success).toBe(false);
    });

    it('should handle invalid selector gracefully', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', '[[invalid', '--diff']),
        browser
      );
      expect(clickResult.success).toBe(false);
    });
  });
});
