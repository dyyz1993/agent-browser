import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';
import type { CountData } from '../../types.js';
import { isSuccessResponse } from '../../types.js';

describe('dynamic content (E2E)', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({ 
      action: 'launch', 
      id: 'test-launch', 
      headless: true 
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    const openResult = await executeCommand(
      parseCliArgs(['open', getFixturePath('dynamic-content.html')]),
      browser
    );
    expect(openResult.success).toBe(true);
  });

  describe('add dynamic items', () => {
    it('should add one item', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', '#add-btn']),
        browser
      );
      expect(clickResult.success).toBe(true);

      const countResult = await executeCommand(
        parseCliArgs(['get', 'count', '.dynamic-item']),
        browser
      );
      expect(countResult.success).toBe(true);
      if (isSuccessResponse(countResult)) {
        expect((countResult.data as CountData).count).toBe(1);
      }
    });

    it('should add multiple items', async () => {
      await executeCommand(parseCliArgs(['click', '#add-btn']), browser);
      await executeCommand(parseCliArgs(['click', '#add-btn']), browser);
      await executeCommand(parseCliArgs(['click', '#add-btn']), browser);

      const countResult = await executeCommand(
        parseCliArgs(['get', 'count', '.dynamic-item']),
        browser
      );
      expect(countResult.success).toBe(true);
      if (isSuccessResponse(countResult)) {
        expect((countResult.data as CountData).count).toBe(3);
      }
    });
  });

  describe('wait for dynamic elements', () => {
    it('should wait for element to appear', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', '#add-btn']),
        browser
      );
      expect(clickResult.success).toBe(true);

      const waitResult = await executeCommand(
        parseCliArgs(['wait', '.dynamic-item']),
        browser
      );
      expect(waitResult.success).toBe(true);
    });

    it('should wait for async content', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', '#load-btn']),
        browser
      );
      expect(clickResult.success).toBe(true);

      const waitResult = await executeCommand(
        parseCliArgs(['wait', '.async-item']),
        browser
      );
      expect(waitResult.success).toBe(true);

      const countResult = await executeCommand(
        parseCliArgs(['get', 'count', '.async-item']),
        browser
      );
      expect(countResult.success).toBe(true);
      if (isSuccessResponse(countResult)) {
        expect((countResult.data as CountData).count).toBe(2);
      }
    });
  });

  describe('remove dynamic items', () => {
    it('should remove last item', async () => {
      await executeCommand(parseCliArgs(['click', '#add-btn']), browser);
      await executeCommand(parseCliArgs(['click', '#add-btn']), browser);
      await executeCommand(parseCliArgs(['click', '#add-btn']), browser);

      const removeResult = await executeCommand(
        parseCliArgs(['click', '#remove-btn']),
        browser
      );
      expect(removeResult.success).toBe(true);

      const countResult = await executeCommand(
        parseCliArgs(['get', 'count', '.dynamic-item']),
        browser
      );
      expect(countResult.success).toBe(true);
      if (isSuccessResponse(countResult)) {
        expect((countResult.data as CountData).count).toBe(2);
      }
    });

    it('should clear all items', async () => {
      await executeCommand(parseCliArgs(['click', '#add-btn']), browser);
      await executeCommand(parseCliArgs(['click', '#add-btn']), browser);

      const clearResult = await executeCommand(
        parseCliArgs(['click', '#clear-btn']),
        browser
      );
      expect(clearResult.success).toBe(true);

      const countResult = await executeCommand(
        parseCliArgs(['get', 'count', '.dynamic-item']),
        browser
      );
      expect(countResult.success).toBe(true);
      if (isSuccessResponse(countResult)) {
        expect((countResult.data as CountData).count).toBe(0);
      }
    });
  });

  describe('snapshot with dynamic content', () => {
    it('should snapshot dynamic items', async () => {
      await executeCommand(parseCliArgs(['click', '#add-btn']), browser);
      await executeCommand(parseCliArgs(['click', '#add-btn']), browser);

      const snapshotResult = await executeCommand(
        parseCliArgs(['snapshot']),
        browser
      );
      expect(snapshotResult.success).toBe(true);
      if (isSuccessResponse(snapshotResult)) {
        expect(snapshotResult.data).toBeDefined();
      }
    });
  });
});
