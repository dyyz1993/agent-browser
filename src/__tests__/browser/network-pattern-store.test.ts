import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { NetworkPatternStore } from '../../browser/network-pattern-store.js';
import type { StoredPattern } from '../../browser/network-pattern-store.js';
import type { ClassificationResult } from '../../browser/network-analysis.js';

function makeClassification(
  type: ClassificationResult['type'] = 'direct',
  indicators: string[] = []
): ClassificationResult {
  return { type, indicators };
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pattern-store-test-'));
}

describe('NetworkPatternStore', () => {
  let dir: string;
  let store: NetworkPatternStore;

  beforeEach(() => {
    dir = tmpDir();
    store = new NetworkPatternStore(dir);
  });

  afterEach(() => {
    vi.useRealTimers();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should record and lookup a pattern', () => {
    const cls = makeClassification('signed', ['header:sign']);
    store.record('https://example.com/api/v1/search', 'POST', cls);

    const result = store.lookup('https://example.com/api/v1/search', 'POST');
    expect(result).not.toBeNull();
    expect(result!.pathPattern).toBe('/api/v1/search');
    expect(result!.method).toBe('POST');
    expect(result!.classification).toBe('signed');
    expect(result!.indicators).toEqual(['header:sign']);
    expect(result!.hitCount).toBe(1);
  });

  it('should return null for unknown patterns', () => {
    const result = store.lookup('https://example.com/api/unknown', 'GET');
    expect(result).toBeNull();
  });

  it('should increment hitCount on repeated records', () => {
    const cls = makeClassification('direct');
    store.record('https://example.com/api/data', 'GET', cls);
    store.record('https://example.com/api/data', 'GET', cls);
    store.record('https://example.com/api/data', 'GET', cls);

    const result = store.lookup('https://example.com/api/data', 'GET');
    expect(result!.hitCount).toBe(3);
  });

  it('should update classification and indicators on repeated records', () => {
    store.record('https://example.com/api/data', 'POST', makeClassification('direct'));
    store.record(
      'https://example.com/api/data',
      'POST',
      makeClassification('csrf_protected', ['header:csrf'])
    );

    const result = store.lookup('https://example.com/api/data', 'POST');
    expect(result!.classification).toBe('csrf_protected');
    expect(result!.indicators).toEqual(['header:csrf']);
  });

  it('should treat method case-insensitively', () => {
    store.record('https://example.com/api/data', 'post', makeClassification('direct'));
    const result = store.lookup('https://example.com/api/data', 'POST');
    expect(result).not.toBeNull();
    expect(result!.method).toBe('POST');
  });

  it('should extract pathname from URL for pattern key', () => {
    store.record(
      'https://example.com/api/search?q=hello&page=1',
      'GET',
      makeClassification('direct')
    );
    const result = store.lookup('https://example.com/api/search?other=2', 'GET');
    expect(result).not.toBeNull();
    expect(result!.pathPattern).toBe('/api/search');
  });

  it('should evict oldest patterns when exceeding 100', () => {
    vi.useFakeTimers();

    for (let i = 0; i < 105; i++) {
      vi.setSystemTime(1000 + i * 1000);
      store.record(`https://example.com/api/item${i}`, 'GET', makeClassification('direct'));
    }

    const earliest = store.lookup('https://example.com/api/item0', 'GET');
    expect(earliest).toBeNull();

    const latest = store.lookup('https://example.com/api/item104', 'GET');
    expect(latest).not.toBeNull();
  });

  it('should handle corrupt file gracefully', () => {
    const filePath = path.join(dir, 'network-patterns.json');
    fs.writeFileSync(filePath, '{ not valid json }}}', 'utf-8');

    const freshStore = new NetworkPatternStore(dir);
    const result = freshStore.lookup('https://example.com/api/data', 'GET');
    expect(result).toBeNull();
  });

  it('should handle missing file gracefully', () => {
    const missingDir = path.join(os.tmpdir(), 'nonexistent-' + Date.now());
    const freshStore = new NetworkPatternStore(missingDir);
    const result = freshStore.lookup('https://example.com/api/data', 'GET');
    expect(result).toBeNull();

    try {
      fs.rmSync(missingDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should debounce flush and not write immediately on record', () => {
    vi.useFakeTimers();

    store.record('https://example.com/api/data', 'GET', makeClassification('direct'));

    const filePath = path.join(dir, 'network-patterns.json');
    expect(fs.existsSync(filePath)).toBe(false);

    vi.advanceTimersByTime(5000);
    expect(fs.existsSync(filePath)).toBe(true);

    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    expect(data.patterns).toHaveLength(1);
    expect(data.version).toBe(1);
  });

  it('save() should cancel debounce timer and write immediately', () => {
    vi.useFakeTimers();

    store.record('https://example.com/api/data', 'GET', makeClassification('direct'));

    const filePath = path.join(dir, 'network-patterns.json');
    expect(fs.existsSync(filePath)).toBe(false);

    store.save();
    expect(fs.existsSync(filePath)).toBe(true);

    vi.advanceTimersByTime(10000);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    expect(data.patterns).toHaveLength(1);
  });

  it('should persist data across store instances', () => {
    const cls = makeClassification('session_required', ['cookie']);
    store.record('https://example.com/api/me', 'GET', cls);
    store.save();

    const restored = new NetworkPatternStore(dir);
    const result = restored.lookup('https://example.com/api/me', 'GET');
    expect(result).not.toBeNull();
    expect(result!.classification).toBe('session_required');
    expect(result!.indicators).toEqual(['cookie']);
    expect(result!.hitCount).toBe(1);
  });

  it('should not write when nothing was recorded', () => {
    vi.useFakeTimers();
    const emptyStore = new NetworkPatternStore(dir);
    vi.advanceTimersByTime(10000);
    emptyStore.save();

    const filePath = path.join(dir, 'network-patterns.json');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('flush() should write dirty data', () => {
    store.record('https://example.com/api/data', 'GET', makeClassification('direct'));
    store.flush();

    const filePath = path.join(dir, 'network-patterns.json');
    expect(fs.existsSync(filePath)).toBe(true);
  });
});
