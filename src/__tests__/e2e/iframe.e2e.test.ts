import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';
import type { TextData, ValueData, CountData } from '../../types.js';
import { isSuccessResponse } from '../../types.js';

describe('iframe nested (E2E)', () => {
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
      parseCliArgs(['open', getFixturePath('iframe-nested.html')]),
      browser
    );
    expect(openResult.success).toBe(true);
  });

  describe('navigate through nested iframes', () => {
    it('should get text in frame1 using --in-frame', async () => {
      const textResult = await executeCommand(
        parseCliArgs(['get', 'text', '#level2-text', '--in-frame', '#frame1']),
        browser
      );
      expect(textResult.success).toBe(true);
      if (isSuccessResponse(textResult)) {
        expect((textResult.data as TextData).text).toBe('This is level 2');
      }
    });

    it('should get text in frame2 using --in-frame with path', async () => {
      const textResult = await executeCommand(
        parseCliArgs(['get', 'text', '#level3-text', '--in-frame', '#frame1/#frame2']),
        browser
      );
      expect(textResult.success).toBe(true);
      if (isSuccessResponse(textResult)) {
        expect((textResult.data as TextData).text).toBe('This is level 3');
      }
    });

    it('should get text in frame3 using --in-frame with deep path', async () => {
      const textResult = await executeCommand(
        parseCliArgs(['get', 'text', '#level4-text', '--in-frame', '#frame1/#frame2/#frame3']),
        browser
      );
      expect(textResult.success).toBe(true);
      if (isSuccessResponse(textResult)) {
        expect((textResult.data as TextData).text).toBe('This is level 4');
      }
    });
  });

  describe('click in nested iframe', () => {
    it('should click button in deepest iframe (3 levels deep)', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', '#deep-btn', '--in-frame', '#frame1/#frame2/#frame3']),
        browser
      );
      expect(clickResult.success).toBe(true);

      const textResult = await executeCommand(
        parseCliArgs(['get', 'text', '#deep-btn', '--in-frame', '#frame1/#frame2/#frame3']),
        browser
      );
      expect(textResult.success).toBe(true);
      if (isSuccessResponse(textResult)) {
        expect((textResult.data as TextData).text).toBe('Clicked!');
      }
    });
  });

  describe('fill in nested iframe', () => {
    it('should fill input in deepest iframe', async () => {
      const fillResult = await executeCommand(
        parseCliArgs([
          'fill',
          '#deep-input',
          'test value',
          '--in-frame',
          '#frame1/#frame2/#frame3',
        ]),
        browser
      );
      expect(fillResult.success).toBe(true);

      const valueResult = await executeCommand(
        parseCliArgs(['get', 'value', '#deep-input', '--in-frame', '#frame1/#frame2/#frame3']),
        browser
      );
      expect(valueResult.success).toBe(true);
      if (isSuccessResponse(valueResult)) {
        expect((valueResult.data as ValueData).value).toBe('test value');
      }
    });

    it('should fill input using ref from iframe snapshot', async () => {
      const snapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#frame1/#frame2/#frame3']),
        browser
      );
      expect(snapshotResult.success).toBe(true);
      expect(isSuccessResponse(snapshotResult)).toBe(true);

      if (!isSuccessResponse(snapshotResult)) return;

      const refs = (snapshotResult.data as { refs?: Record<string, { role: string }> }).refs;
      expect(refs).toBeDefined();

      const inputRef = Object.entries(refs || {}).find(([_, data]) => data.role === 'textbox');
      expect(inputRef).toBeDefined();
      const refId = inputRef![0];

      const fillResult = await executeCommand(
        parseCliArgs(['fill', refId, 'filled by ref', '--in-frame', '#frame1/#frame2/#frame3']),
        browser
      );
      expect(fillResult.success).toBe(true);

      const valueResult = await executeCommand(
        parseCliArgs(['get', 'value', refId, '--in-frame', '#frame1/#frame2/#frame3']),
        browser
      );
      expect(valueResult.success).toBe(true);
      if (isSuccessResponse(valueResult)) {
        expect((valueResult.data as ValueData).value).toBe('filled by ref');
      }
    });
  });

  describe('ref selector support in iframe', () => {
    it('should get text using ref from iframe snapshot', async () => {
      const snapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#frame1/#frame2/#frame3']),
        browser
      );
      expect(snapshotResult.success).toBe(true);
      if (!isSuccessResponse(snapshotResult)) return;

      const refs = (
        snapshotResult.data as { refs?: Record<string, { role: string; name?: string }> }
      ).refs;
      expect(refs).toBeDefined();

      const buttonRef = Object.entries(refs || {}).find(([_, data]) => data.role === 'button');
      expect(buttonRef).toBeDefined();
      const refId = buttonRef![0];

      const textResult = await executeCommand(
        parseCliArgs(['get', 'text', refId, '--in-frame', '#frame1/#frame2/#frame3']),
        browser
      );
      expect(textResult.success).toBe(true);
      if (isSuccessResponse(textResult)) {
        expect((textResult.data as TextData).text).toBe('Deep Button');
      }
    });

    it('should get attribute using ref from iframe snapshot', async () => {
      const snapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#frame1/#frame2/#frame3']),
        browser
      );
      expect(snapshotResult.success).toBe(true);
      if (!isSuccessResponse(snapshotResult)) return;

      const refs = (snapshotResult.data as { refs?: Record<string, { role: string }> }).refs;
      expect(refs).toBeDefined();

      const buttonRef = Object.entries(refs || {}).find(([_, data]) => data.role === 'button');
      expect(buttonRef).toBeDefined();
      const refId = buttonRef![0];

      const attrResult = await executeCommand(
        parseCliArgs(['get', 'attr', refId, 'id', '--in-frame', '#frame1/#frame2/#frame3']),
        browser
      );
      expect(attrResult.success).toBe(true);
      if (isSuccessResponse(attrResult)) {
        expect((attrResult.data as { attribute: string; value: string | null }).value).toBe(
          'deep-btn'
        );
      }
    });

    it('should check visibility using ref from iframe snapshot', async () => {
      const snapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#frame1/#frame2/#frame3']),
        browser
      );
      expect(snapshotResult.success).toBe(true);
      if (!isSuccessResponse(snapshotResult)) return;

      const refs = (snapshotResult.data as { refs?: Record<string, { role: string }> }).refs;
      expect(refs).toBeDefined();

      const buttonRef = Object.entries(refs || {}).find(([_, data]) => data.role === 'button');
      expect(buttonRef).toBeDefined();
      const refId = buttonRef![0];

      const visibleResult = await executeCommand(
        parseCliArgs(['is', 'visible', refId, '--in-frame', '#frame1/#frame2/#frame3']),
        browser
      );
      expect(visibleResult.success).toBe(true);
      if (isSuccessResponse(visibleResult)) {
        expect((visibleResult.data as { visible: boolean }).visible).toBe(true);
      }
    });

    it('should get count using ref from iframe snapshot', async () => {
      const snapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#frame1/#frame2/#frame3']),
        browser
      );
      expect(snapshotResult.success).toBe(true);
      if (!isSuccessResponse(snapshotResult)) return;

      const refs = (snapshotResult.data as { refs?: Record<string, { role: string }> }).refs;
      expect(refs).toBeDefined();

      const textboxRef = Object.entries(refs || {}).find(([_, data]) => data.role === 'textbox');
      expect(textboxRef).toBeDefined();
      const refId = textboxRef![0];

      const countResult = await executeCommand(
        parseCliArgs(['get', 'count', refId, '--in-frame', '#frame1/#frame2/#frame3']),
        browser
      );
      expect(countResult.success).toBe(true);
      if (isSuccessResponse(countResult)) {
        expect((countResult.data as CountData).count).toBe(1);
      }
    });

    it('should get bounding box using ref from iframe snapshot', async () => {
      const snapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#frame1/#frame2/#frame3']),
        browser
      );
      expect(snapshotResult.success).toBe(true);
      if (!isSuccessResponse(snapshotResult)) return;

      const refs = (snapshotResult.data as { refs?: Record<string, { role: string }> }).refs;
      expect(refs).toBeDefined();

      const buttonRef = Object.entries(refs || {}).find(([_, data]) => data.role === 'button');
      expect(buttonRef).toBeDefined();
      const refId = buttonRef![0];

      const boxResult = await executeCommand(
        parseCliArgs(['get', 'box', refId, '--in-frame', '#frame1/#frame2/#frame3']),
        browser
      );
      expect(boxResult.success).toBe(true);
      if (isSuccessResponse(boxResult)) {
        const box = (
          boxResult.data as { box: { x: number; y: number; width: number; height: number } | null }
        ).box;
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThan(0);
        expect(box!.height).toBeGreaterThan(0);
      }
    });

    it('should check enabled state using ref from iframe snapshot', async () => {
      const snapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#frame1/#frame2/#frame3']),
        browser
      );
      expect(snapshotResult.success).toBe(true);
      if (!isSuccessResponse(snapshotResult)) return;

      const refs = (snapshotResult.data as { refs?: Record<string, { role: string }> }).refs;
      expect(refs).toBeDefined();

      const buttonRef = Object.entries(refs || {}).find(([_, data]) => data.role === 'button');
      expect(buttonRef).toBeDefined();
      const refId = buttonRef![0];

      const enabledResult = await executeCommand(
        parseCliArgs(['is', 'enabled', refId, '--in-frame', '#frame1/#frame2/#frame3']),
        browser
      );
      expect(enabledResult.success).toBe(true);
      if (isSuccessResponse(enabledResult)) {
        expect((enabledResult.data as { enabled: boolean }).enabled).toBe(true);
      }
    });
  });

  describe('main frame operations', () => {
    it('should operate on main frame without --in-frame', async () => {
      const textResult = await executeCommand(
        parseCliArgs(['get', 'text', '#level1-text']),
        browser
      );
      expect(textResult.success).toBe(true);
      if (isSuccessResponse(textResult)) {
        expect((textResult.data as TextData).text).toBe('This is level 1');
      }
    });
  });

  describe('snapshot in nested iframe', () => {
    it('should get snapshot of frame1 content', async () => {
      const snapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#frame1']),
        browser
      );
      expect(snapshotResult.success).toBe(true);
      if (isSuccessResponse(snapshotResult)) {
        const data = snapshotResult.data as { snapshot?: string; refs?: Record<string, unknown> };
        expect(data.snapshot).toBeDefined();
        expect(data.snapshot).toContain('Level 2 - First iframe');
        expect(data.snapshot).toContain('This is level 2');
        expect(data.snapshot).toContain('iframe');
      }
    });

    it('should get snapshot of frame2 content', async () => {
      const snapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#frame1/#frame2']),
        browser
      );
      expect(snapshotResult.success).toBe(true);
      if (isSuccessResponse(snapshotResult)) {
        const data = snapshotResult.data as { snapshot?: string; refs?: Record<string, unknown> };
        expect(data.snapshot).toBeDefined();
        expect(data.snapshot).toContain('Level 3 - Second iframe');
        expect(data.snapshot).toContain('This is level 3');
        expect(data.snapshot).toContain('iframe');
      }
    });

    it('should get snapshot of deepest iframe content', async () => {
      const snapshotResult = await executeCommand(
        parseCliArgs(['snapshot', '--in-frame', '#frame1/#frame2/#frame3']),
        browser
      );
      expect(snapshotResult.success).toBe(true);
      if (isSuccessResponse(snapshotResult)) {
        const data = snapshotResult.data as { snapshot?: string; refs?: Record<string, unknown> };
        expect(data.snapshot).toBeDefined();
        expect(data.snapshot).toContain('Level 4 - Deepest iframe');
        expect(data.snapshot).toContain('Deep Button');
        expect(data.snapshot).toContain('textbox "Deep input"');
        expect(data.snapshot).toContain('This is level 4');
      }
    });
  });
});
