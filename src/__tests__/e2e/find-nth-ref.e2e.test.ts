import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser/index.js';
import { executeCommand } from '../../actions/index.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';

const executablePath = process.env.AGENT_BROWSER_EXECUTABLE_PATH;

describe('Find nth with @ref selector', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-nth-ref-e2e',
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

  it('should click nth button using CSS selector', async () => {
    const result = await executeCommand(
      parseCliArgs(['find', 'nth', '0', 'button', '--click']),
      browser
    );
    expect(result.success).toBe(true);
  });

  it('should click last button using CSS selector', async () => {
    const result = await executeCommand(
      parseCliArgs(['find', 'last', 'button', '--click']),
      browser
    );
    expect(result.success).toBe(true);
  });

  it('should find nth text using CSS selector', async () => {
    const result = await executeCommand(
      parseCliArgs(['find', 'nth', '0', 'button', '--text']),
      browser
    );
    expect(result.success).toBe(true);
  });

  it('should click nth element using @ref from snapshot', async () => {
    const snapResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
    expect(snapResult.success).toBe(true);

    const buttons = snapResult.data.elements?.filter(
      (el: Record<string, unknown>) => el.role === 'button'
    );
    if (!buttons?.length) return;

    const firstBtnRef = buttons[0].ref;

    const result = await executeCommand(
      parseCliArgs(['find', 'nth', '0', `@${firstBtnRef}`, '--click']),
      browser
    );
    expect(result.success).toBe(true);
  });
});
