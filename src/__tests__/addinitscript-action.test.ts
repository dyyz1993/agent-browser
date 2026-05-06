import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAddInitScript } from '../actions.js';
import type { AddInitScriptCommand } from '../types.js';
import type { BrowserManager } from '../browser.js';

function createMockBrowser(pageEvaluateError?: Error) {
  const addInitScript = vi.fn().mockResolvedValue(undefined);
  const evaluate = pageEvaluateError
    ? vi.fn().mockRejectedValue(pageEvaluateError)
    : vi.fn().mockResolvedValue(undefined);

  const context = { addInitScript };
  const page = { context: vi.fn().mockReturnValue(context), evaluate };

  return {
    getPage: vi.fn().mockReturnValue(page),
    _page: page,
    _context: context,
  } as unknown as BrowserManager & {
    _page: Record<string, unknown>;
    _context: Record<string, unknown>;
  };
}

describe('handleAddInitScript', () => {
  const baseCommand: AddInitScriptCommand = {
    id: 'test-1',
    action: 'addinitscript',
    script: 'window.__injected = true',
  };

  it('should register init script on context', async () => {
    const browser = createMockBrowser();
    const result = await handleAddInitScript(baseCommand, browser);

    expect(browser._context.addInitScript).toHaveBeenCalledWith('window.__injected = true');
    expect(result.success).toBe(true);
  });

  it('should also eval script on current page for immediate effect', async () => {
    const browser = createMockBrowser();
    await handleAddInitScript(baseCommand, browser);

    expect(browser._page.evaluate).toHaveBeenCalledWith('window.__injected = true');
  });

  it('should return tips when eval on current page fails', async () => {
    const evalError = new Error('Execution context was destroyed');
    const browser = createMockBrowser(evalError);
    const result = await handleAddInitScript(baseCommand, browser);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.tips).toBeDefined();
      const tips = Array.isArray(result.tips) ? result.tips : [result.tips];
      expect(tips.length).toBeGreaterThan(0);
      expect(tips[0]).toContain('Execution context was destroyed');
      expect(tips[0]).toContain('next navigation');
    }
  });

  it('should return tips when page is not yet loaded', async () => {
    const evalError = new Error('Page has not been loaded yet');
    const browser = createMockBrowser(evalError);
    const result = await handleAddInitScript(baseCommand, browser);

    expect(result.success).toBe(true);
    if (result.success && result.tips) {
      const tips = Array.isArray(result.tips) ? result.tips : [result.tips];
      expect(tips[0]).toContain('not been loaded');
    }
  });

  it('should not include tips when both addInitScript and eval succeed', async () => {
    const browser = createMockBrowser();
    const result = await handleAddInitScript(baseCommand, browser);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.tips).toBeUndefined();
    }
  });

  it('should return { added: true } in data', async () => {
    const browser = createMockBrowser();
    const result = await handleAddInitScript(baseCommand, browser);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ added: true });
    }
  });

  it('should still return added: true even if eval fails', async () => {
    const evalError = new Error('Page crashed');
    const browser = createMockBrowser(evalError);
    const result = await handleAddInitScript(baseCommand, browser);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ added: true });
    }
  });
});
