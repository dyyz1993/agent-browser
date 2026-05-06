import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions/index.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';

const executablePath = process.env.AGENT_BROWSER_EXECUTABLE_PATH;

describe('Network requests hint on first activation', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-requests-hint-e2e',
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

  it('should return hint when request tracking is first activated with empty results', async () => {
    expect(browser.trackingEnabled).toBe(false);

    const result = await executeCommand(parseCliArgs(['network', 'requests']), browser);

    expect(result.success).toBe(true);
    const data = result.data as { requests: unknown[]; hint?: string };
    expect(data.requests).toEqual([]);
    expect(data.hint).toBe(
      'Request tracking just activated. Reload or navigate to capture requests.'
    );
  });

  it('should NOT return hint on second call when tracking is already enabled', async () => {
    await executeCommand(parseCliArgs(['network', 'requests']), browser);

    const result = await executeCommand(parseCliArgs(['network', 'requests']), browser);

    expect(result.success).toBe(true);
    const data = result.data as { requests: unknown[]; hint?: string };
    expect(data.hint).toBeUndefined();
  });

  it('should clear requests with clear flag', async () => {
    await executeCommand(parseCliArgs(['network', 'requests']), browser);

    const clearResult = await executeCommand(
      parseCliArgs(['network', 'requests', '--clear']),
      browser
    );
    expect(clearResult.success).toBe(true);
    expect((clearResult.data as { cleared: boolean }).cleared).toBe(true);
  });
});
