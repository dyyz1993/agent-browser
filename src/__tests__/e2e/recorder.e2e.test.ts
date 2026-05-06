import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions/index.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';

describe('Recorder E2E Tests', () => {
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

  describe('Basic Recording', () => {
    it('should start recorder', async () => {
      const result = await executeCommand(parseCliArgs(['recorder', 'start']), browser);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('started', true);
        expect(result.data).toHaveProperty('sessionId');
      }
    });

    it('should get recorder status', async () => {
      const result = await executeCommand(parseCliArgs(['recorder', 'status']), browser);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('isRecording');
        expect(result.data).toHaveProperty('steps');
      }
    });

    it('should record click events', async () => {
      // Open test page
      const openResult = await executeCommand(
        parseCliArgs(['open', getFixturePath('recorder-test.html')]),
        browser
      );
      expect(openResult.success).toBe(true);

      // Click button
      const clickResult = await executeCommand(parseCliArgs(['click', '#btn-primary']), browser);
      expect(clickResult.success).toBe(true);

      // Wait a bit for recording
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check status
      const statusResult = await executeCommand(parseCliArgs(['recorder', 'status']), browser);
      expect(statusResult.success).toBe(true);
      if (statusResult.success) {
        expect(statusResult.data.steps).toBeGreaterThan(0);
      }
    });

    it('should stop recorder and return YAML', async () => {
      const result = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('yaml');
        expect(result.data).toHaveProperty('steps');

        const yaml = (result.data as Record<string, unknown>).yaml;
        expect(yaml).toContain('session:');
        expect(yaml).toContain('steps:');
      }
    });
  });

  describe('YAML Format', () => {
    it('should generate valid YAML with all required fields', async () => {
      // Start recorder
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      // Open test page
      await executeCommand(parseCliArgs(['open', getFixturePath('recorder-test.html')]), browser);

      // Perform some actions
      await executeCommand(parseCliArgs(['fill', '#text-input', 'test value']), browser);
      await executeCommand(parseCliArgs(['click', '#btn-secondary']), browser);

      // Wait for recording
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Stop and get YAML
      const result = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);

      expect(result.success).toBe(true);
      if (result.success) {
        const yaml = (result.data as Record<string, unknown>).yaml;

        // Check YAML structure
        expect(yaml).toContain('id:');
        expect(yaml).toContain('startTime:');
        expect(yaml).toContain('endTime:');
        expect(yaml).toContain('action:');
        expect(yaml).toContain('steps:');
      }
    });
  });
});
