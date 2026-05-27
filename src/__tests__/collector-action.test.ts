import { describe, it, expect, vi } from 'vitest';
import { handleCollectStart, handleCollectStop } from '../actions/collector.js';
import type { BrowserManager } from '../browser/index.js';

function createMockBrowser(
  collectorOverrides: { start?: () => Promise<unknown>; stop?: () => Promise<unknown> } = {}
): BrowserManager {
  return {
    collector: {
      start: collectorOverrides.start ?? vi.fn(async () => ({ started: true })),
      stop: collectorOverrides.stop ?? vi.fn(async () => ({ stopped: true })),
    },
  } as unknown as BrowserManager;
}

describe('handleCollectStart', () => {
  it('calls browser.collector.start() and returns success response with correct id and data', async () => {
    const mockStart = vi.fn(async () => ({ started: true }));
    const browser = createMockBrowser({ start: mockStart });
    const command = { action: 'collect_start' as const, id: 'test-id-1' };

    const response = await handleCollectStart(command, browser);

    expect(mockStart).toHaveBeenCalledOnce();
    expect(response.id).toBe('test-id-1');
    expect(response.success).toBe(true);
    expect(response.data).toEqual({ started: true });
  });

  it('returns started: false when already active', async () => {
    const mockStart = vi.fn(async () => ({ started: false }));
    const browser = createMockBrowser({ start: mockStart });
    const command = { action: 'collect_start' as const, id: 'test-id-2' };

    const response = await handleCollectStart(command, browser);

    expect(mockStart).toHaveBeenCalledOnce();
    expect(response.id).toBe('test-id-2');
    expect(response.success).toBe(true);
    expect(response.data).toEqual({ started: false });
  });
});

describe('handleCollectStop', () => {
  it('calls browser.collector.stop() and returns success response', async () => {
    const mockStop = vi.fn(async () => ({ stopped: true }));
    const browser = createMockBrowser({ stop: mockStop });
    const command = { action: 'collect_stop' as const, id: 'test-id-3' };

    const response = await handleCollectStop(command, browser);

    expect(mockStop).toHaveBeenCalledOnce();
    expect(response.id).toBe('test-id-3');
    expect(response.success).toBe(true);
    expect(response.data).toEqual({ stopped: true });
  });

  it('returns stopped: false when not active', async () => {
    const mockStop = vi.fn(async () => ({ stopped: false }));
    const browser = createMockBrowser({ stop: mockStop });
    const command = { action: 'collect_stop' as const, id: 'test-id-4' };

    const response = await handleCollectStop(command, browser);

    expect(mockStop).toHaveBeenCalledOnce();
    expect(response.id).toBe('test-id-4');
    expect(response.success).toBe(true);
    expect(response.data).toEqual({ stopped: false });
  });
});
