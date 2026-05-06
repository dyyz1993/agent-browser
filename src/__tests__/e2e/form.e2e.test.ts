import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions/index.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';
import type { TextData, ValueData, VisibleData, CheckedData } from '../../types.js';
import { isSuccessResponse } from '../../types.js';

describe('form complex (E2E)', () => {
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
      parseCliArgs(['open', getFixturePath('form-complex.html')]),
      browser
    );
    expect(openResult.success).toBe(true);
  });

  describe('fill form fields', () => {
    it('should fill text input', async () => {
      const fillResult = await executeCommand(
        parseCliArgs(['fill', '#username', 'testuser']),
        browser
      );
      expect(fillResult.success).toBe(true);

      const valueResult = await executeCommand(
        parseCliArgs(['get', 'value', '#username']),
        browser
      );
      expect(valueResult.success).toBe(true);
      if (isSuccessResponse(valueResult)) {
        expect((valueResult.data as ValueData).value).toBe('testuser');
      }
    });

    it('should fill email input', async () => {
      const fillResult = await executeCommand(
        parseCliArgs(['fill', '#email', 'test@example.com']),
        browser
      );
      expect(fillResult.success).toBe(true);

      const valueResult = await executeCommand(parseCliArgs(['get', 'value', '#email']), browser);
      expect(valueResult.success).toBe(true);
      if (isSuccessResponse(valueResult)) {
        expect((valueResult.data as ValueData).value).toBe('test@example.com');
      }
    });

    it('should fill password input', async () => {
      const fillResult = await executeCommand(
        parseCliArgs(['fill', '#password', 'secret123']),
        browser
      );
      expect(fillResult.success).toBe(true);

      const valueResult = await executeCommand(
        parseCliArgs(['get', 'value', '#password']),
        browser
      );
      expect(valueResult.success).toBe(true);
      if (isSuccessResponse(valueResult)) {
        expect((valueResult.data as ValueData).value).toBe('secret123');
      }
    });

    it('should fill textarea', async () => {
      const fillResult = await executeCommand(
        parseCliArgs(['fill', '#bio', 'This is my bio']),
        browser
      );
      expect(fillResult.success).toBe(true);

      const valueResult = await executeCommand(parseCliArgs(['get', 'value', '#bio']), browser);
      expect(valueResult.success).toBe(true);
      if (isSuccessResponse(valueResult)) {
        expect((valueResult.data as ValueData).value).toBe('This is my bio');
      }
    });
  });

  describe('select dropdown', () => {
    it('should select single option', async () => {
      const selectResult = await executeCommand(
        parseCliArgs(['select', '#country', 'cn']),
        browser
      );
      expect(selectResult.success).toBe(true);

      const valueResult = await executeCommand(parseCliArgs(['get', 'value', '#country']), browser);
      expect(valueResult.success).toBe(true);
      if (isSuccessResponse(valueResult)) {
        expect((valueResult.data as ValueData).value).toBe('cn');
      }
    });

    it('should select multiple options', async () => {
      const selectResult = await executeCommand(
        parseCliArgs(['select', '#skills', 'js', 'ts']),
        browser
      );
      expect(selectResult.success).toBe(true);
    });
  });

  describe('checkbox and radio', () => {
    it('should check checkbox', async () => {
      const checkResult = await executeCommand(parseCliArgs(['check', '#agree']), browser);
      expect(checkResult.success).toBe(true);

      const checkedResult = await executeCommand(
        parseCliArgs(['is', 'checked', '#agree']),
        browser
      );
      expect(checkedResult.success).toBe(true);
      if (isSuccessResponse(checkedResult)) {
        expect((checkedResult.data as CheckedData).checked).toBe(true);
      }
    });

    it('should uncheck checkbox', async () => {
      await executeCommand(parseCliArgs(['check', '#agree']), browser);

      const uncheckResult = await executeCommand(parseCliArgs(['uncheck', '#agree']), browser);
      expect(uncheckResult.success).toBe(true);

      const checkedResult = await executeCommand(
        parseCliArgs(['is', 'checked', '#agree']),
        browser
      );
      expect(checkedResult.success).toBe(true);
      if (isSuccessResponse(checkedResult)) {
        expect((checkedResult.data as CheckedData).checked).toBe(false);
      }
    });

    it('should click radio button', async () => {
      const clickResult = await executeCommand(parseCliArgs(['click', '#gender-male']), browser);
      expect(clickResult.success).toBe(true);
    });
  });

  describe('form submission', () => {
    it('should submit form and verify result', async () => {
      await executeCommand(parseCliArgs(['fill', '#username', 'testuser']), browser);
      await executeCommand(parseCliArgs(['fill', '#email', 'test@example.com']), browser);
      await executeCommand(parseCliArgs(['select', '#country', 'cn']), browser);
      await executeCommand(parseCliArgs(['check', '#agree']), browser);

      const submitResult = await executeCommand(parseCliArgs(['click', '#submit-btn']), browser);
      expect(submitResult.success).toBe(true);

      const textResult = await executeCommand(
        parseCliArgs(['get', 'text', '#submit-btn']),
        browser
      );
      expect(textResult.success).toBe(true);
      if (isSuccessResponse(textResult)) {
        expect((textResult.data as TextData).text).toBe('Submitted!');
      }
    });

    it('should reset form', async () => {
      await executeCommand(parseCliArgs(['fill', '#username', 'testuser']), browser);

      const resetResult = await executeCommand(parseCliArgs(['click', '#reset-btn']), browser);
      expect(resetResult.success).toBe(true);

      const valueResult = await executeCommand(
        parseCliArgs(['get', 'value', '#username']),
        browser
      );
      expect(valueResult.success).toBe(true);
      if (isSuccessResponse(valueResult)) {
        expect((valueResult.data as ValueData).value).toBe('');
      }
    });
  });

  describe('form validation', () => {
    it('should validate form and show error', async () => {
      const validateResult = await executeCommand(
        parseCliArgs(['click', '#validate-btn']),
        browser
      );
      expect(validateResult.success).toBe(true);

      const visibleResult = await executeCommand(
        parseCliArgs(['is', 'visible', '#username-error']),
        browser
      );
      expect(visibleResult.success).toBe(true);
      if (isSuccessResponse(visibleResult)) {
        expect((visibleResult.data as VisibleData).visible).toBe(true);
      }
    });

    it('should hide error after filling field', async () => {
      await executeCommand(parseCliArgs(['click', '#validate-btn']), browser);
      await executeCommand(parseCliArgs(['fill', '#username', 'testuser']), browser);
      await executeCommand(parseCliArgs(['click', '#validate-btn']), browser);

      const visibleResult = await executeCommand(
        parseCliArgs(['is', 'visible', '#username-error']),
        browser
      );
      expect(visibleResult.success).toBe(true);
      if (isSuccessResponse(visibleResult)) {
        expect((visibleResult.data as VisibleData).visible).toBe(false);
      }
    });
  });
});
