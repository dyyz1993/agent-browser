import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Page } from 'playwright-core';
import type { CollectionEntry } from '../types/interruption.js';

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('node:path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:path')>();
  return {
    ...actual,
    join: (...args: string[]) => args.join('/'),
  };
});

vi.mock('node:os', () => ({
  default: {
    homedir: vi.fn().mockReturnValue('/home/test'),
  },
  homedir: vi.fn().mockReturnValue('/home/test'),
}));

import fs from 'node:fs';
import { CollectorManager } from '../browser/collector-manager.js';

function createMockPage(): Page {
  const mockContext = {
    addInitScript: vi.fn().mockResolvedValue(undefined),
  };
  return {
    evaluate: vi.fn().mockResolvedValue(undefined),
    exposeFunction: vi.fn().mockResolvedValue(undefined),
    context: vi.fn().mockReturnValue(mockContext),
  } as unknown as Page;
}

function createSampleEntry(): Omit<CollectionEntry, 'id'> {
  return {
    timestamp: new Date().toISOString(),
    type: 'popup' as any,
    subType: 'modal' as any,
    page: {
      url: 'https://example.com/page',
      domain: 'example.com',
      path: '/page',
      title: 'Test Page',
    },
    element: {
      selector: '#dialog',
      xpath: '//div[@id="dialog"]',
      tagName: 'div',
      html: '<div id="dialog">Hello</div>',
      boundingBox: { x: 10, y: 20, width: 300, height: 200 },
      isIframe: false,
    },
    context: { trigger: 'click' as any, isVisible: true, zIndex: 1000, hasOverlay: true },
  };
}

describe('CollectorManager', () => {
  let mockPage: Page;
  let manager: CollectorManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPage = createMockPage();
    manager = new CollectorManager(() => mockPage);
  });

  describe('constructor', () => {
    it('starts inactive with no session', () => {
      expect(manager.isActive()).toBe(false);
      expect(manager.getSessionId()).toBe('');
      expect(manager.getCollectionCount()).toBe(0);
    });
  });

  describe('start()', () => {
    it('sets active, creates sessionId, and calls exposeFunction + addInitScript', async () => {
      const result = await manager.start();

      expect(result.started).toBe(true);
      expect(result.sessionId).toMatch(/^sess_\d+$/);
      expect(manager.isActive()).toBe(true);
      expect(manager.getSessionId()).toBe(result.sessionId);
      expect(mockPage.exposeFunction).toHaveBeenCalledTimes(1);
      expect(mockPage.exposeFunction).toHaveBeenCalledWith(
        '__agentBrowserCollectCallback',
        expect.any(Function)
      );
      expect(mockPage.context).toHaveBeenCalledTimes(1);
      expect(mockPage.context().addInitScript).toHaveBeenCalledTimes(1);
    });

    it('returns started: false when already active', async () => {
      const first = await manager.start();
      const second = await manager.start();

      expect(first.started).toBe(true);
      expect(second.started).toBe(false);
      expect(second.sessionId).toBe(first.sessionId);
      expect(mockPage.exposeFunction).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop()', () => {
    it('returns stopped: false when not active', async () => {
      const result = await manager.stop();

      expect(result).toEqual({ stopped: false, path: '', count: 0 });
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('writes JSON file with session data', async () => {
      await manager.start();
      const entry = createSampleEntry();
      manager.addEntry(entry);

      const result = await manager.stop();

      expect(result.stopped).toBe(true);
      expect(result.count).toBe(1);
      expect(result.path).toContain('session_');
      expect(result.path).toContain('.json');
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);

      const writtenData = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenData);
      expect(parsed.sessionId).toBe(manager.getSessionId());
      expect(parsed.collections).toHaveLength(1);
      expect(parsed.collections[0].id).toBe('col_001');
      expect(parsed.collections[0].type).toBe(entry.type);
      expect(parsed.collections[0].page.url).toBe(entry.page.url);
    });

    it('calls page.evaluate for cleanup', async () => {
      await manager.start();
      const evaluateSpy = vi.mocked(mockPage.evaluate);

      await manager.stop();

      expect(evaluateSpy).toHaveBeenCalledTimes(1);
    });

    it('resets collections and counter after stopping', async () => {
      await manager.start();
      manager.addEntry(createSampleEntry());
      manager.addEntry(createSampleEntry());
      expect(manager.getCollectionCount()).toBe(2);

      await manager.stop();

      expect(manager.getCollectionCount()).toBe(0);
      expect(manager.isActive()).toBe(false);
    });

    it('handles page.evaluate error gracefully when page is closed', async () => {
      await manager.start();
      vi.mocked(mockPage.evaluate).mockRejectedValue(new Error('Page closed'));

      const result = await manager.stop();

      expect(result.stopped).toBe(true);
      expect(manager.isActive()).toBe(false);
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    });

    it('creates collect directory if it does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await manager.start();

      await manager.stop();

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.agent-browser/collections'),
        { recursive: true }
      );
    });
  });

  describe('addEntry()', () => {
    it('auto-generates id with padded counter', async () => {
      await manager.start();
      const entry = manager.addEntry(createSampleEntry());

      expect(entry.id).toBe('col_001');
    });

    it('increments counter sequentially', async () => {
      await manager.start();
      const first = manager.addEntry(createSampleEntry());
      const second = manager.addEntry(createSampleEntry());
      const third = manager.addEntry(createSampleEntry());

      expect(first.id).toBe('col_001');
      expect(second.id).toBe('col_002');
      expect(third.id).toBe('col_003');
    });

    it('preserves all entry fields from input', async () => {
      await manager.start();
      const input = createSampleEntry();
      const result = manager.addEntry(input);

      expect(result.timestamp).toBe(input.timestamp);
      expect(result.type).toBe(input.type);
      expect(result.subType).toBe(input.subType);
      expect(result.page).toEqual(input.page);
      expect(result.element).toEqual(input.element);
      expect(result.context).toEqual(input.context);
    });

    it('adds entries to the internal collections array', async () => {
      await manager.start();
      manager.addEntry(createSampleEntry());
      manager.addEntry(createSampleEntry());

      expect(manager.getCollectionCount()).toBe(2);
    });
  });

  describe('state tracking', () => {
    it('isActive reflects lifecycle', async () => {
      expect(manager.isActive()).toBe(false);
      await manager.start();
      expect(manager.isActive()).toBe(true);
      await manager.stop();
      expect(manager.isActive()).toBe(false);
    });

    it('getSessionId returns empty before start and id after', async () => {
      expect(manager.getSessionId()).toBe('');
      const { sessionId } = await manager.start();
      expect(manager.getSessionId()).toBe(sessionId);
      await manager.stop();
    });

    it('getCollectionCount tracks entries across operations', async () => {
      expect(manager.getCollectionCount()).toBe(0);
      await manager.start();
      manager.addEntry(createSampleEntry());
      expect(manager.getCollectionCount()).toBe(1);
      manager.addEntry(createSampleEntry());
      expect(manager.getCollectionCount()).toBe(2);
      await manager.stop();
      expect(manager.getCollectionCount()).toBe(0);
    });

    it('counter resets after stop so ids restart from col_001', async () => {
      await manager.start();
      manager.addEntry(createSampleEntry());
      await manager.stop();

      await manager.start();
      const entry = manager.addEntry(createSampleEntry());
      expect(entry.id).toBe('col_001');
      await manager.stop();
    });
  });
});
