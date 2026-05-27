import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CollectionEntry, CollectionSession } from '../types/interruption.js';

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import fs from 'node:fs';
import {
  loadCollections,
  groupEntriesByType,
  extractDomainPatterns,
  extractPathPatterns,
  extractSelectors,
  extractIframePatterns,
  computeConfidence,
  processCollections,
  processAndOutput,
} from '../processor/collection-processor.js';

const BASE_ELEMENT = {
  selector: '.cookie-banner',
  xpath: '//div[@class="cookie-banner"]',
  tagName: 'div',
  html: '<div class="cookie-banner">Accept</div>',
  boundingBox: { x: 0, y: 0, width: 800, height: 100 },
  isIframe: false,
};

const BASE_CONTEXT = {
  trigger: 'auto_popup' as const,
  isVisible: true,
  zIndex: 9999,
  hasOverlay: false,
};

function buildEntry(overrides: Partial<CollectionEntry> = {}): CollectionEntry {
  return {
    id: overrides.id ?? 'entry-1',
    timestamp: overrides.timestamp ?? '2024-01-01T00:00:00Z',
    type: overrides.type ?? 'popup',
    subType: overrides.subType ?? 'cookie_consent',
    page: overrides.page ?? {
      url: 'https://example.com/page',
      domain: 'example.com',
      path: '/page',
      title: 'Test Page',
    },
    element: overrides.element ?? { ...BASE_ELEMENT },
    context: overrides.context ?? { ...BASE_CONTEXT },
  };
}

function buildSession(entries: CollectionEntry[]): CollectionSession {
  return {
    sessionId: 'sess-1',
    startedAt: '2024-01-01T00:00:00Z',
    stoppedAt: '2024-01-01T01:00:00Z',
    totalPages: 5,
    collections: entries,
  };
}

function makeSimpleElement(
  selector: string,
  extra: Record<string, unknown> = {}
): CollectionEntry['element'] {
  return {
    ...BASE_ELEMENT,
    selector,
    ...extra,
  };
}

function makePage(domain: string, path = '/'): CollectionEntry['page'] {
  return { url: `https://${domain}${path}`, domain, path, title: '' };
}

describe('loadCollections', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns empty array for non-existent directory', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(loadCollections('/no/such/dir')).toEqual([]);
  });

  it('returns empty array for directory with no session files', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([
      'other.json',
      'readme.txt',
    ] as unknown as fs.Dirent[]);
    expect(loadCollections('/empty/dir')).toEqual([]);
  });

  it('reads session_*.json files and merges entries', () => {
    const entry1 = buildEntry({ id: 'e1' });
    const entry2 = buildEntry({ id: 'e2' });
    const session1 = buildSession([entry1]);
    const session2 = buildSession([entry2]);

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([
      'session_001.json',
      'session_002.json',
    ] as unknown as fs.Dirent[]);
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(session1))
      .mockReturnValueOnce(JSON.stringify(session2));

    const result = loadCollections('/data');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('e1');
    expect(result[1].id).toBe('e2');
  });

  it('ignores non-session files', () => {
    const entry = buildEntry();
    const session = buildSession([entry]);

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([
      'session_001.json',
      'notes.txt',
      'data.csv',
    ] as unknown as fs.Dirent[]);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(session));

    const result = loadCollections('/data');
    expect(result).toHaveLength(1);
  });
});

describe('groupEntriesByType', () => {
  it('groups entries by type:subType', () => {
    const e1 = buildEntry({ type: 'captcha', subType: 'recaptcha_v2' });
    const e2 = buildEntry({ type: 'captcha', subType: 'recaptcha_v2' });
    const e3 = buildEntry({ type: 'popup', subType: 'cookie_consent' });

    const groups = groupEntriesByType([e1, e2, e3]);
    expect(groups.get('captcha:recaptcha_v2')).toHaveLength(2);
    expect(groups.get('popup:cookie_consent')).toHaveLength(1);
  });

  it('returns empty map for empty input', () => {
    const groups = groupEntriesByType([]);
    expect(groups.size).toBe(0);
  });

  it('handles entries with same type but different subTypes', () => {
    const e1 = buildEntry({ type: 'captcha', subType: 'recaptcha_v2' });
    const e2 = buildEntry({ type: 'captcha', subType: 'hcaptcha' });

    const groups = groupEntriesByType([e1, e2]);
    expect(groups.size).toBe(2);
    expect(groups.get('captcha:recaptcha_v2')).toHaveLength(1);
    expect(groups.get('captcha:hcaptcha')).toHaveLength(1);
  });
});

describe('extractDomainPatterns', () => {
  it('extracts unique domains', () => {
    const e1 = buildEntry({ page: makePage('a.com') });
    const e2 = buildEntry({ page: makePage('b.com') });

    expect(extractDomainPatterns([e1, e2])).toEqual(['a.com', 'b.com']);
  });

  it('strips www prefix', () => {
    const e = buildEntry({ page: makePage('www.example.com') });
    expect(extractDomainPatterns([e])).toEqual(['example.com']);
  });

  it('returns ["*"] when more than 5 unique domains', () => {
    const entries = ['a.com', 'b.com', 'c.com', 'd.com', 'e.com', 'f.com'].map((d) =>
      buildEntry({ page: makePage(d) })
    );
    expect(extractDomainPatterns(entries)).toEqual(['*']);
  });

  it('returns sorted domains', () => {
    const e1 = buildEntry({ page: makePage('z.com') });
    const e2 = buildEntry({ page: makePage('a.com') });

    expect(extractDomainPatterns([e1, e2])).toEqual(['a.com', 'z.com']);
  });
});

describe('extractPathPatterns', () => {
  it('returns undefined when all paths are /', () => {
    const e1 = buildEntry({ page: makePage('a.com', '/') });
    const e2 = buildEntry({ page: makePage('a.com', '/') });
    expect(extractPathPatterns([e1, e2])).toBeUndefined();
  });

  it('returns unique path patterns sorted', () => {
    const e1 = buildEntry({ page: makePage('a.com', '/b') });
    const e2 = buildEntry({ page: makePage('a.com', '/a') });

    const result = extractPathPatterns([e1, e2]);
    expect(result).toEqual(['/a', '/b']);
  });

  it('returns undefined when no useful pattern', () => {
    const e = buildEntry({ page: { url: 'https://a.com/', domain: 'a.com', path: '', title: '' } });
    expect(extractPathPatterns([e])).toBeUndefined();
  });
});

describe('extractSelectors', () => {
  it('returns selectors appearing in >= 30% of entries', () => {
    const el = makeSimpleElement('.btn');
    const entries = [
      buildEntry({ element: el }),
      buildEntry({ element: el }),
      buildEntry({ element: el }),
    ];

    const result = extractSelectors(entries);
    expect(result).toContain('.btn');
  });

  it('returns at least 1 selector even if frequency is low', () => {
    const entries = [buildEntry({ element: makeSimpleElement('.rare') })];

    const result = extractSelectors(entries);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('sorts by frequency descending', () => {
    const entries = [
      buildEntry({ element: makeSimpleElement('.low') }),
      buildEntry({ element: makeSimpleElement('.high') }),
      buildEntry({ element: makeSimpleElement('.high') }),
    ];

    const result = extractSelectors(entries);
    expect(result[0]).toBe('.high');
  });

  it('handles empty entries', () => {
    expect(extractSelectors([])).toEqual([]);
  });
});

describe('extractIframePatterns', () => {
  it('extracts iframe[src*=hostname] patterns from iframe entries', () => {
    const el = makeSimpleElement('iframe', {
      isIframe: true,
      iframeSrc: 'https://cdn.vendor.com/widget',
    });
    const e = buildEntry({ element: el });

    const patterns = extractIframePatterns([e]);
    expect(patterns).toContain("iframe[src*='cdn.vendor.com']");
  });

  it('returns empty array when no iframe entries', () => {
    const e = buildEntry({ element: makeSimpleElement('.popup') });
    expect(extractIframePatterns([e])).toEqual([]);
  });

  it('deduplicates patterns', () => {
    const el = makeSimpleElement('iframe', {
      isIframe: true,
      iframeSrc: 'https://ads.example.com/banner',
    });
    const e1 = buildEntry({ element: { ...el } });
    const e2 = buildEntry({ element: { ...el } });

    const patterns = extractIframePatterns([e1, e2]);
    expect(patterns).toHaveLength(1);
  });
});

describe('computeConfidence', () => {
  it('returns at least 0.5 base', () => {
    const e = buildEntry();
    const score = computeConfidence([e], []);
    expect(score).toBeGreaterThanOrEqual(0.5);
  });

  it('increases with more entries (cap at 0.3 bonus)', () => {
    const one = buildEntry();
    const many = Array.from({ length: 10 }, (_, i) => buildEntry({ id: `e-${i}` }));

    const scoreOne = computeConfidence([one], []);
    const scoreMany = computeConfidence(many, []);
    expect(scoreMany).toBeGreaterThan(scoreOne);
  });

  it('caps at 0.95', () => {
    const entries = Array.from({ length: 50 }, (_, i) => buildEntry({ id: `e-${i}` }));
    const selectors = ['.btn'];
    const score = computeConfidence(entries, selectors);
    expect(score).toBeLessThanOrEqual(0.95);
  });
});

describe('processCollections', () => {
  it('returns rules sorted by confidence descending', () => {
    const e1 = buildEntry({ id: 'a', type: 'popup', subType: 'cookie_consent' });
    const e2 = buildEntry({ id: 'b', type: 'popup', subType: 'cookie_consent' });
    const e3 = buildEntry({ id: 'c', type: 'captcha', subType: 'recaptcha_v2' });

    const rules = processCollections([e1, e2, e3]);
    expect(rules.length).toBeGreaterThan(0);
    for (let i = 1; i < rules.length; i++) {
      expect(rules[i - 1].confidence).toBeGreaterThanOrEqual(rules[i].confidence);
    }
  });

  it('generates rule name from type and subType', () => {
    const entry = buildEntry({ type: 'captcha', subType: 'recaptcha_v2' });
    const rules = processCollections([entry]);
    expect(rules[0].name).toBe('captcha: recaptcha_v2 (collected)');
  });

  it('merges iframe selectors into selectors array', () => {
    const el = makeSimpleElement('.banner', {
      isIframe: true,
      iframeSrc: 'https://embed.partner.com/widget',
    });
    const entry = buildEntry({ type: 'popup', subType: 'cookie_consent', element: el });

    const rules = processCollections([entry]);
    const selectors = rules[0].selectors;
    const hasIframe = selectors.some((s) => s.startsWith('iframe['));
    expect(hasIframe).toBe(true);
  });

  it('returns empty array for empty input', () => {
    expect(processCollections([])).toEqual([]);
  });
});

describe('processAndOutput', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns stats with correct counts', () => {
    const entry = buildEntry();
    const session = buildSession([entry]);

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(['session_001.json'] as unknown as fs.Dirent[]);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(session));

    const result = processAndOutput('/data');
    expect(result.stats.sessions).toBe(1);
    expect(result.stats.entries).toBe(1);
    expect(result.stats.rules).toBeGreaterThanOrEqual(1);
  });

  it('writes file when outputPath provided', () => {
    const entry = buildEntry();
    const session = buildSession([entry]);

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(['session_001.json'] as unknown as fs.Dirent[]);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(session));

    processAndOutput('/data', '/out/rules.json');
    expect(fs.writeFileSync).toHaveBeenCalledWith('/out/rules.json', expect.any(String), 'utf-8');
  });

  it('uses default dir when not specified', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = processAndOutput();
    expect(result.stats.sessions).toBe(0);
    expect(result.stats.entries).toBe(0);
    expect(result.stats.rules).toBe(0);
  });
});
