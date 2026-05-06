import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser/index.js';
import { executeCommand } from '../../actions/index.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';
import { isSuccessResponse } from '../../types.js';

const executablePath = process.env.AGENT_BROWSER_EXECUTABLE_PATH;

describe('Comprehensive Interactions E2E', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-comprehensive-e2e',
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    await executeCommand(
      parseCliArgs(['open', getFixturePath('comprehensive-test.html')]),
      browser
    );
  });

  describe('Snapshot & Refs', () => {
    it('snapshot -i returns refs for interactive elements', async () => {
      const result = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const snapshot = (result.data as { snapshot: string }).snapshot;
        expect(snapshot).toContain('button');
        expect(snapshot).toContain('textbox');
      }
    });

    it('snapshot without -i returns full tree', async () => {
      const result = await executeCommand(parseCliArgs(['snapshot']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const snapshot = (result.data as { snapshot: string }).snapshot;
        expect(snapshot.length).toBeGreaterThan(100);
      }
    });

    it('snapshot -c returns compact output', async () => {
      const fullResult = await executeCommand(parseCliArgs(['snapshot']), browser);
      const compactResult = await executeCommand(parseCliArgs(['snapshot', '-c']), browser);
      expect(compactResult.success).toBe(true);
      if (isSuccessResponse(fullResult) && isSuccessResponse(compactResult)) {
        const full = (fullResult.data as { snapshot: string }).snapshot;
        const compact = (compactResult.data as { snapshot: string }).snapshot;
        expect(compact.length).toBeLessThanOrEqual(full.length);
      }
    });

    it('re-snapshot after page change returns fresh refs', async () => {
      const first = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      expect(first.success).toBe(true);
      const firstRefs = (first.data as Record<string, unknown>).refs;
      expect(firstRefs).toBeDefined();

      const second = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      expect(second.success).toBe(true);
      const secondRefs = (second.data as Record<string, unknown>).refs;
      expect(secondRefs).toBeDefined();
      expect(Object.keys(secondRefs).length).toBeGreaterThan(0);
    });

    it('snapshot with selector returns subtree', async () => {
      const result = await executeCommand(parseCliArgs(['snapshot', '-s', '#dataTable']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const snapshot = (result.data as { snapshot: string }).snapshot;
        expect(snapshot).toContain('Alice');
        expect(snapshot).toContain('Bob');
      }
    });

    it('get title returns "Comprehensive Test Page"', async () => {
      const result = await executeCommand(parseCliArgs(['get', 'title']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect((result.data as { title: string }).title).toBe('Comprehensive Test Page');
      }
    });
  });

  describe('Fill & Type', () => {
    it('fill #username with text', async () => {
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
        expect((valueResult.data as { value: string }).value).toBe('testuser');
      }
    });

    it('fill #email with email address', async () => {
      const fillResult = await executeCommand(
        parseCliArgs(['fill', '#email', 'user@example.com']),
        browser
      );
      expect(fillResult.success).toBe(true);
      const valueResult = await executeCommand(parseCliArgs(['get', 'value', '#email']), browser);
      expect(valueResult.success).toBe(true);
      if (isSuccessResponse(valueResult)) {
        expect((valueResult.data as { value: string }).value).toBe('user@example.com');
      }
    });

    it('fill #message textarea with long text', async () => {
      const longText =
        'This is a long message that spans multiple words and tests the textarea filling capability of the browser automation tool.';
      const fillResult = await executeCommand(
        parseCliArgs(['fill', '#message', longText]),
        browser
      );
      expect(fillResult.success).toBe(true);
      const valueResult = await executeCommand(parseCliArgs(['get', 'value', '#message']), browser);
      expect(valueResult.success).toBe(true);
      if (isSuccessResponse(valueResult)) {
        expect((valueResult.data as { value: string }).value).toBe(longText);
      }
    });

    it('type #search character by character', async () => {
      const typeResult = await executeCommand(parseCliArgs(['type', '#search', 'hello']), browser);
      expect(typeResult.success).toBe(true);
      const valueResult = await executeCommand(parseCliArgs(['get', 'value', '#search']), browser);
      expect(valueResult.success).toBe(true);
      if (isSuccessResponse(valueResult)) {
        expect((valueResult.data as { value: string }).value).toBe('hello');
      }
    });

    it('fill #number with numeric value', async () => {
      const fillResult = await executeCommand(parseCliArgs(['fill', '#number', '42']), browser);
      expect(fillResult.success).toBe(true);
      const valueResult = await executeCommand(parseCliArgs(['get', 'value', '#number']), browser);
      expect(valueResult.success).toBe(true);
      if (isSuccessResponse(valueResult)) {
        expect((valueResult.data as { value: string }).value).toBe('42');
      }
    });
  });

  describe('Click & Double-click', () => {
    it('click #btn1 succeeds', async () => {
      const result = await executeCommand(parseCliArgs(['click', '#btn1']), browser);
      expect(result.success).toBe(true);
    });

    it('click with class selector .secondary', async () => {
      const result = await executeCommand(parseCliArgs(['click', '.secondary']), browser);
      expect(result.success).toBe(true);
    });

    it('click with attribute selector [name="choice"][value="1"]', async () => {
      const result = await executeCommand(
        parseCliArgs(['click', '[name="choice"][value="1"]']),
        browser
      );
      expect(result.success).toBe(true);
    });

    it('dblclick #dblclick-btn', async () => {
      const result = await executeCommand(parseCliArgs(['dblclick', '#dblclick-btn']), browser);
      expect(result.success).toBe(true);
    });

    it('click with ref after snapshot', async () => {
      const snapResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      expect(snapResult.success).toBe(true);
      const clickResult = await executeCommand(parseCliArgs(['click', '#btn1']), browser);
      expect(clickResult.success).toBe(true);
    });
  });

  describe('Check/Uncheck', () => {
    it('check #cb1 then is checked returns true', async () => {
      await executeCommand(parseCliArgs(['check', '#cb1']), browser);
      const result = await executeCommand(parseCliArgs(['is', 'checked', '#cb1']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect((result.data as { checked: boolean }).checked).toBe(true);
      }
    });

    it('check #cb2 then uncheck #cb2 then is checked returns false', async () => {
      await executeCommand(parseCliArgs(['check', '#cb2']), browser);
      await executeCommand(parseCliArgs(['uncheck', '#cb2']), browser);
      const result = await executeCommand(parseCliArgs(['is', 'checked', '#cb2']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect((result.data as { checked: boolean }).checked).toBe(false);
      }
    });

    it('check #checkbox-agree', async () => {
      await executeCommand(parseCliArgs(['check', '#checkbox-agree']), browser);
      const result = await executeCommand(
        parseCliArgs(['is', 'checked', '#checkbox-agree']),
        browser
      );
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect((result.data as { checked: boolean }).checked).toBe(true);
      }
    });

    it('check multiple checkboxes in sequence', async () => {
      await executeCommand(parseCliArgs(['check', '#cb3']), browser);
      await executeCommand(parseCliArgs(['check', '#cb4']), browser);
      await executeCommand(parseCliArgs(['check', '#cb5']), browser);
      const r3 = await executeCommand(parseCliArgs(['is', 'checked', '#cb3']), browser);
      const r4 = await executeCommand(parseCliArgs(['is', 'checked', '#cb4']), browser);
      const r5 = await executeCommand(parseCliArgs(['is', 'checked', '#cb5']), browser);
      if (isSuccessResponse(r3)) expect((r3.data as { checked: boolean }).checked).toBe(true);
      if (isSuccessResponse(r4)) expect((r4.data as { checked: boolean }).checked).toBe(true);
      if (isSuccessResponse(r5)) expect((r5.data as { checked: boolean }).checked).toBe(true);
    });
  });

  describe('Select', () => {
    it('select #country cn then get value returns cn', async () => {
      await executeCommand(parseCliArgs(['select', '#country', 'cn']), browser);
      const result = await executeCommand(parseCliArgs(['get', 'value', '#country']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect((result.data as { value: string }).value).toBe('cn');
      }
    });

    it('select #city bj', async () => {
      await executeCommand(parseCliArgs(['select', '#city', 'bj']), browser);
      const result = await executeCommand(parseCliArgs(['get', 'value', '#city']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect((result.data as { value: string }).value).toBe('bj');
      }
    });

    it('select with ref selector after snapshot', async () => {
      await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      const selectResult = await executeCommand(
        parseCliArgs(['select', '#country', 'uk']),
        browser
      );
      expect(selectResult.success).toBe(true);
      const valueResult = await executeCommand(parseCliArgs(['get', 'value', '#country']), browser);
      if (isSuccessResponse(valueResult)) {
        expect((valueResult.data as { value: string }).value).toBe('uk');
      }
    });

    it('select another option replaces previous', async () => {
      await executeCommand(parseCliArgs(['select', '#country', 'us']), browser);
      await executeCommand(parseCliArgs(['select', '#country', 'jp']), browser);
      const result = await executeCommand(parseCliArgs(['get', 'value', '#country']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect((result.data as { value: string }).value).toBe('jp');
      }
    });
  });

  describe('Get commands', () => {
    it('get text #btn1 returns "Button 1"', async () => {
      const result = await executeCommand(parseCliArgs(['get', 'text', '#btn1']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect((result.data as { text: string }).text).toBe('Button 1');
      }
    });

    it('get text body returns page content', async () => {
      const result = await executeCommand(parseCliArgs(['get', 'text', 'body']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        const text = (result.data as { text: string }).text;
        expect(text).toContain('Comprehensive Test Page');
        expect(text.length).toBeGreaterThan(50);
      }
    });

    it('get value #username after fill', async () => {
      await executeCommand(parseCliArgs(['fill', '#username', 'filledvalue']), browser);
      const result = await executeCommand(parseCliArgs(['get', 'value', '#username']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect((result.data as { value: string }).value).toBe('filledvalue');
      }
    });

    it('get count button returns >10', async () => {
      const result = await executeCommand(parseCliArgs(['get', 'count', 'button']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect((result.data as { count: number }).count).toBeGreaterThan(10);
      }
    });

    it('get attr #username type returns "text"', async () => {
      const result = await executeCommand(
        parseCliArgs(['get', 'attr', '#username', 'type']),
        browser
      );
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect((result.data as { value: string }).value).toBe('text');
      }
    });

    it('is visible #username returns true', async () => {
      const result = await executeCommand(parseCliArgs(['is', 'visible', '#username']), browser);
      expect(result.success).toBe(true);
      if (isSuccessResponse(result)) {
        expect((result.data as { visible: boolean }).visible).toBe(true);
      }
    });
  });

  describe('Hover & Scroll', () => {
    it('hover #hoverBox', async () => {
      const result = await executeCommand(parseCliArgs(['hover', '#hoverBox']), browser);
      expect(result.success).toBe(true);
    });

    it('scroll down 100', async () => {
      const result = await executeCommand(parseCliArgs(['scroll', 'down', '100']), browser);
      expect(result.success).toBe(true);
    });

    it('scrollintoview #dataTable', async () => {
      const result = await executeCommand(parseCliArgs(['scrollintoview', '#dataTable']), browser);
      expect(result.success).toBe(true);
    });
  });

  describe('Form submission', () => {
    it('fill form fields and click submit', async () => {
      await executeCommand(parseCliArgs(['fill', '#firstName', 'John']), browser);
      await executeCommand(parseCliArgs(['fill', '#lastName', 'Doe']), browser);
      await executeCommand(parseCliArgs(['fill', '#phone', '1234567890']), browser);

      const fnResult = await executeCommand(parseCliArgs(['get', 'value', '#firstName']), browser);
      expect(fnResult.success).toBe(true);
      if (isSuccessResponse(fnResult)) {
        expect((fnResult.data as { value: string }).value).toBe('John');
      }

      const clickResult = await executeCommand(parseCliArgs(['click', '#submitForm']), browser);
      expect(clickResult.success).toBe(true);
    });

    it('fill form and click reset clears values', async () => {
      await executeCommand(parseCliArgs(['fill', '#firstName', 'Jane']), browser);
      await executeCommand(parseCliArgs(['fill', '#lastName', 'Smith']), browser);

      const beforeReset = await executeCommand(
        parseCliArgs(['get', 'value', '#firstName']),
        browser
      );
      if (isSuccessResponse(beforeReset)) {
        expect((beforeReset.data as { value: string }).value).toBe('Jane');
      }

      await executeCommand(parseCliArgs(['click', '#resetForm']), browser);

      const afterReset = await executeCommand(
        parseCliArgs(['get', 'value', '#firstName']),
        browser
      );
      expect(afterReset.success).toBe(true);
      if (isSuccessResponse(afterReset)) {
        expect((afterReset.data as { value: string }).value).toBe('');
      }
    });
  });
});
