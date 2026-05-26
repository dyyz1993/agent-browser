import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser/index.js';
import { executeCommand } from '../../actions/index.js';
import { parseCliArgs } from '../utils/parseCli';
import { isSuccessResponse } from '../../types.js';

const executablePath = process.env.AGENT_BROWSER_EXECUTABLE_PATH;

function getTips(result: unknown): string | string[] | undefined {
  return (result as Record<string, unknown>).tips as string | string[] | undefined;
}

function normalizeTips(tips: string | string[] | undefined): string[] {
  if (!tips) return [];
  return Array.isArray(tips) ? tips : [tips];
}

describe('Ref Selector Tip Injection', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-ref-tip',
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  describe('basic tip injection on click', () => {
    const pageUrl =
      'data:text/html,<button id="submit-btn">Submit</button><input id="search" name="q" placeholder="Search">';

    beforeEach(async () => {
      await executeCommand(parseCliArgs(['open', pageUrl]), browser);
    });

    it('should include tips when clicking using @ref selector', async () => {
      const snapResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      expect(snapResult.success).toBe(true);
      const refs = (snapResult.data as Record<string, unknown>).refs as Record<
        string,
        Record<string, unknown>
      >;
      expect(refs).toBeDefined();

      const buttonRefs = Object.entries(refs).filter(([, data]) => data.role === 'button');
      expect(buttonRefs.length).toBeGreaterThan(0);
      const [refId] = buttonRefs[0];

      const clickResult = await executeCommand(parseCliArgs(['click', `@${refId}`]), browser);
      expect(clickResult.success).toBe(true);

      const tips = getTips(clickResult);
      expect(tips).toBeDefined();
      const tipArr = normalizeTips(tips);
      expect(tipArr.length).toBeGreaterThan(0);
      expect(tipArr[0]).toContain(`[ref=${refId}]`);
      expect(tipArr[0]).toContain('#submit-btn');
    });

    it('should include tips when filling using @ref selector', async () => {
      const snapResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      expect(snapResult.success).toBe(true);
      const refs = (snapResult.data as Record<string, unknown>).refs as Record<
        string,
        Record<string, unknown>
      >;

      const inputRefs = Object.entries(refs).filter(([, data]) => data.role === 'textbox');
      expect(inputRefs.length).toBeGreaterThan(0);
      const [refId] = inputRefs[0];

      const fillResult = await executeCommand(
        parseCliArgs(['fill', `@${refId}`, 'hello']),
        browser
      );
      expect(fillResult.success).toBe(true);

      const tips = getTips(fillResult);
      expect(tips).toBeDefined();
      const tipArr = normalizeTips(tips);
      expect(tipArr[0]).toContain(`[ref=${refId}]`);
      expect(tipArr[0]).toContain('#search');
    });

    it('should include tips when typing using @ref selector', async () => {
      const snapResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      expect(snapResult.success).toBe(true);
      const refs = (snapResult.data as Record<string, unknown>).refs as Record<
        string,
        Record<string, unknown>
      >;

      const inputRefs = Object.entries(refs).filter(([, data]) => data.role === 'textbox');
      expect(inputRefs.length).toBeGreaterThan(0);
      const [refId] = inputRefs[0];

      const typeResult = await executeCommand(
        parseCliArgs(['type', `@${refId}`, 'hello']),
        browser
      );
      expect(typeResult.success).toBe(true);

      const tips = getTips(typeResult);
      expect(tips).toBeDefined();
      const tipArr = normalizeTips(tips);
      expect(tipArr[0]).toContain(`[ref=${refId}]`);
    });

    it('should include tips when hovering using @ref selector', async () => {
      const snapResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      expect(snapResult.success).toBe(true);
      const refs = (snapResult.data as Record<string, unknown>).refs as Record<
        string,
        Record<string, unknown>
      >;

      const buttonRefs = Object.entries(refs).filter(([, data]) => data.role === 'button');
      expect(buttonRefs.length).toBeGreaterThan(0);
      const [refId] = buttonRefs[0];

      const hoverResult = await executeCommand(parseCliArgs(['hover', `@${refId}`]), browser);
      expect(hoverResult.success).toBe(true);

      const tips = getTips(hoverResult);
      expect(tips).toBeDefined();
      const tipArr = normalizeTips(tips);
      expect(tipArr[0]).toContain(`[ref=${refId}]`);
      expect(tipArr[0]).toContain('#submit-btn');
    });
  });

  describe('select command tip', () => {
    const pageUrl =
      'data:text/html,<select id="colors" name="color"><option value="red">Red</option><option value="blue">Blue</option></select>';

    beforeEach(async () => {
      await executeCommand(parseCliArgs(['open', pageUrl]), browser);
    });

    it('should include tips when selecting using @ref selector', async () => {
      const snapResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      expect(snapResult.success).toBe(true);
      const refs = (snapResult.data as Record<string, unknown>).refs as Record<
        string,
        Record<string, unknown>
      >;

      const selectRefs = Object.entries(refs).filter(([, data]) => data.role === 'combobox');
      expect(selectRefs.length).toBeGreaterThan(0);
      const [refId] = selectRefs[0];

      const selectResult = await executeCommand(
        parseCliArgs(['select', `@${refId}`, 'blue']),
        browser
      );
      expect(selectResult.success).toBe(true);

      const tips = getTips(selectResult);
      expect(tips).toBeDefined();
      const tipArr = normalizeTips(tips);
      expect(tipArr[0]).toContain(`[ref=${refId}]`);
      expect(tipArr[0]).toContain('#colors');
    });
  });

  describe('check/uncheck tip', () => {
    const pageUrl = 'data:text/html,<input type="checkbox" id="agree" name="agree">';

    beforeEach(async () => {
      await executeCommand(parseCliArgs(['open', pageUrl]), browser);
    });

    it('should include tips when checking using @ref selector', async () => {
      const snapResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      expect(snapResult.success).toBe(true);
      const refs = (snapResult.data as Record<string, unknown>).refs as Record<
        string,
        Record<string, unknown>
      >;

      const checkboxRefs = Object.entries(refs).filter(([, data]) => data.role === 'checkbox');
      expect(checkboxRefs.length).toBeGreaterThan(0);
      const [refId] = checkboxRefs[0];

      const checkResult = await executeCommand(parseCliArgs(['check', `@${refId}`]), browser);
      expect(checkResult.success).toBe(true);

      const tips = getTips(checkResult);
      expect(tips).toBeDefined();
      const tipArr = normalizeTips(tips);
      expect(tipArr[0]).toContain(`[ref=${refId}]`);
      expect(tipArr[0]).toContain('#agree');
    });

    it('should include tips when unchecking using @ref selector', async () => {
      await executeCommand(parseCliArgs(['check', '#agree']), browser);

      const snapResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      expect(snapResult.success).toBe(true);
      const refs = (snapResult.data as Record<string, unknown>).refs as Record<
        string,
        Record<string, unknown>
      >;

      const checkboxRefs = Object.entries(refs).filter(([, data]) => data.role === 'checkbox');
      expect(checkboxRefs.length).toBeGreaterThan(0);
      const [refId] = checkboxRefs[0];

      const uncheckResult = await executeCommand(parseCliArgs(['uncheck', `@${refId}`]), browser);
      expect(uncheckResult.success).toBe(true);

      const tips = getTips(uncheckResult);
      expect(tips).toBeDefined();
      const tipArr = normalizeTips(tips);
      expect(tipArr[0]).toContain(`[ref=${refId}]`);
    });
  });

  describe('non-ref selector should NOT generate tip', () => {
    const pageUrl = 'data:text/html,<button id="submit-btn">Submit</button>';

    beforeEach(async () => {
      await executeCommand(parseCliArgs(['open', pageUrl]), browser);
    });

    it('should NOT include tips when using CSS selector instead of @ref', async () => {
      await executeCommand(parseCliArgs(['snapshot', '-i']), browser);

      const clickResult = await executeCommand(parseCliArgs(['click', '#submit-btn']), browser);
      expect(clickResult.success).toBe(true);

      const tips = getTips(clickResult);
      expect(tips).toBeUndefined();
    });
  });

  describe('drag command tip with both source and target', () => {
    const pageUrl =
      'data:text/html,<button id="source">Drag me</button><button id="target">Drop here</button>';

    beforeEach(async () => {
      await executeCommand(parseCliArgs(['open', pageUrl]), browser);
    });

    it('should include tips for both source and target ref selectors', async () => {
      const snapResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      expect(snapResult.success).toBe(true);
      const data = snapResult.data as Record<string, unknown>;
      const refs = data.refs as Record<string, Record<string, unknown>> | undefined;
      expect(refs).toBeDefined();
      const allRefs = Object.entries(refs!);
      expect(allRefs.length).toBeGreaterThanOrEqual(2);

      const [sourceRef] = allRefs[0];
      const [targetRef] = allRefs[1];

      const dragResult = await executeCommand(
        parseCliArgs(['drag', `@${sourceRef}`, `@${targetRef}`]),
        browser
      );
      expect(dragResult.success).toBe(true);

      const tips = getTips(dragResult);
      expect(tips).toBeDefined();
      const tipArr = normalizeTips(tips);
      expect(tipArr.length).toBeGreaterThanOrEqual(2);
      expect(tipArr.some((t) => t.includes(`[ref=${sourceRef}]`))).toBe(true);
      expect(tipArr.some((t) => t.includes(`[ref=${targetRef}]`))).toBe(true);
    });
  });

  describe('iframe tip injection', () => {
    const iframeSrcdoc = encodeURIComponent(
      '<html><body><button id="iframe-btn">Click in iframe</button></body></html>'
    );
    const pageUrl = `data:text/html,<iframe id="myframe" srcdoc="${iframeSrcdoc}"></iframe>`;

    beforeEach(async () => {
      await executeCommand(parseCliArgs(['open', pageUrl]), browser);
      await executeCommand(parseCliArgs(['wait', '1000']), browser);
    });

    it('should include tips when using @ref selector inside an iframe', async () => {
      const snapResult = await executeCommand(
        parseCliArgs(['snapshot', '-i', '--in-frame', '#myframe']),
        browser
      );
      expect(snapResult.success).toBe(true);
      const data = snapResult.data as Record<string, unknown>;
      const refs = data.refs as Record<string, Record<string, unknown>> | undefined;
      if (!refs) return;

      const buttonRefs = Object.entries(refs).filter(([, val]) => val.role === 'button');
      if (buttonRefs.length === 0) return;
      const [refId] = buttonRefs[0];

      const clickResult = await executeCommand(
        parseCliArgs(['click', `@${refId}`, '--in-frame', '#myframe']),
        browser
      );
      expect(clickResult.success).toBe(true);

      const tips = getTips(clickResult);
      expect(tips).toBeDefined();
      const tipArr = normalizeTips(tips);
      expect(tipArr[0]).toContain(`[ref=${refId}]`);
    });
  });

  describe('multiple snapshots - tip finds correct snapshot', () => {
    it('should find ref in the most recent snapshot after navigating to a different page', async () => {
      const pageA = 'data:text/html,<button id="btn-a">Page A Button</button>';
      const pageB =
        'data:text/html,<button id="btn-b">Page B Button</button><input id="input-b" placeholder="B input">';

      await executeCommand(parseCliArgs(['open', pageA]), browser);
      await executeCommand(parseCliArgs(['snapshot', '-i']), browser);

      await executeCommand(parseCliArgs(['open', pageB]), browser);
      const snapB = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      expect(snapB.success).toBe(true);
      const refsB = (snapB.data as Record<string, unknown>).refs as Record<
        string,
        Record<string, unknown>
      >;

      const buttonRefs = Object.entries(refsB).filter(([, data]) => data.role === 'button');
      expect(buttonRefs.length).toBeGreaterThan(0);
      const [refId] = buttonRefs[0];

      const clickResult = await executeCommand(parseCliArgs(['click', `@${refId}`]), browser);
      expect(clickResult.success).toBe(true);

      const tips = getTips(clickResult);
      expect(tips).toBeDefined();
      const tipArr = normalizeTips(tips);
      expect(tipArr[0]).toContain(`[ref=${refId}]`);
      expect(tipArr[0]).toContain('#btn-b');
    });
  });
});
