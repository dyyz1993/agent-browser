import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';
import { isSuccessResponse } from '../../types.js';

const executablePath = process.env.AGENT_BROWSER_EXECUTABLE_PATH;

describe('Fill with @ref selector', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-fill-ref-e2e',
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

  it('should fill input using @ref selector from snapshot', async () => {
    const snapResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
    expect(snapResult.success).toBe(true);

    const refs = (snapResult.data as Record<string, unknown>).refs;
    expect(refs).toBeDefined();

    const refEntries = Object.entries(refs).filter(
      ([_, data]: [string, Record<string, unknown>]) => data.role === 'textbox'
    );
    expect(refEntries.length).toBeGreaterThan(0);

    const [refId] = refEntries[0];

    const fillResult = await executeCommand(
      parseCliArgs(['fill', `@${refId}`, 'test-ref-value']),
      browser
    );
    expect(fillResult.success).toBe(true);

    const valueResult = await executeCommand(parseCliArgs(['get', 'value', `@${refId}`]), browser);
    expect(valueResult.success).toBe(true);
    if (isSuccessResponse(valueResult)) {
      expect((valueResult.data as { value: string }).value).toBe('test-ref-value');
    }
  });

  it('should fill multiple inputs using @ref selectors', async () => {
    const snapResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
    const refs = (snapResult.data as Record<string, unknown>).refs;
    const textboxRefs = Object.entries(refs).filter(
      ([_, data]: [string, Record<string, unknown>]) => data.role === 'textbox'
    );

    if (textboxRefs.length >= 2) {
      const [ref1] = textboxRefs[0];
      const [ref2] = textboxRefs[1];

      const fill1 = await executeCommand(
        parseCliArgs(['fill', `@${ref1}`, 'first-value']),
        browser
      );
      expect(fill1.success).toBe(true);

      const fill2 = await executeCommand(
        parseCliArgs(['fill', `@${ref2}`, 'second-value']),
        browser
      );
      expect(fill2.success).toBe(true);
    }
  });

  it('should not throw querySelector error when filling with @ref', async () => {
    const snapResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
    const refs = (snapResult.data as Record<string, unknown>).refs;
    const textboxRefs = Object.entries(refs).filter(
      ([_, data]: [string, Record<string, unknown>]) => data.role === 'textbox'
    );
    if (!textboxRefs.length) return;

    const [refId] = textboxRefs[0];
    const fillResult = await executeCommand(
      parseCliArgs(['fill', `@${refId}`, 'no-error-value']),
      browser
    );

    expect(fillResult.success).toBe(true);
    expect(fillResult.error).toBeUndefined();
  });
});
