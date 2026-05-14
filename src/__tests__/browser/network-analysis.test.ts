import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AnalysisEngine } from '../../browser/network-analysis.js';
import type {
  InputEntry,
  ScoredRequest,
  ClassificationResult,
} from '../../browser/network-analysis.js';

const NOW = 1_700_000_000_000;

function makeRequest(
  overrides: Partial<{
    url: string;
    method: string;
    resourceType: string;
    timestamp: number;
    headers: Record<string, string>;
  }> = {}
) {
  return {
    url: overrides.url ?? 'https://example.com/api/data',
    method: overrides.method ?? 'GET',
    resourceType: overrides.resourceType ?? 'fetch',
    timestamp: overrides.timestamp ?? NOW,
    headers: overrides.headers ?? {},
  };
}

describe('InputMemory', () => {
  let engine: AnalysisEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    engine = new AnalysisEngine(
      { ttlMs: 5000, maxEntries: 5 },
      {
        maxTips: 3,
        minScore: 0,
        deduplicateWindowMs: 1000,
      }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should store and retrieve input entries via scorer', () => {
    engine.rememberInput({ selector: '#username', value: 'alice', timestamp: NOW });
    engine.onRequest(
      makeRequest({ url: 'https://example.com/api/search?user=alice', method: 'POST' })
    );
    const tips = engine.getTips(NOW);
    expect(tips.length).toBeGreaterThanOrEqual(1);
    expect(tips[0]).toContain('#username');
  });

  it('should mask password-like selectors (pass, pwd, secret, token)', () => {
    engine.rememberInput({ selector: '#password', value: 's3cret123', timestamp: NOW });
    engine.rememberInput({ selector: '#pass', value: 'mypass', timestamp: NOW });
    engine.rememberInput({ selector: '#pwd', value: 'mypwd', timestamp: NOW });
    engine.rememberInput({ selector: '#secret', value: 'mysecret', timestamp: NOW });
    engine.rememberInput({ selector: '#token', value: 'mytoken', timestamp: NOW });

    engine.onRequest(
      makeRequest({ url: 'https://example.com/api/login?s3cret123=1', method: 'POST' })
    );
    const tips = engine.getTips(NOW);
    const matchedTip = tips.find((t) => t.includes('matched input'));
    expect(matchedTip).toBeUndefined();
  });

  it('should NOT mask normal selectors', () => {
    engine.rememberInput({ selector: '#search', value: 'hello', timestamp: NOW });
    engine.onRequest(
      makeRequest({ url: 'https://example.com/api/search?q=hello', method: 'POST' })
    );
    const tips = engine.getTips(NOW);
    expect(tips.length).toBeGreaterThanOrEqual(1);
    expect(tips[0]).toContain('matched input');
  });

  it('should expire entries after TTL', () => {
    engine.rememberInput({ selector: '#query', value: 'testval', timestamp: NOW - 6000 });
    engine.onRequest(makeRequest({ url: 'https://example.com/api?q=testval', method: 'POST' }));
    const tips = engine.getTips(NOW);
    expect(tips.length).toBeLessThanOrEqual(1);
  });

  it('should cap at maxEntries (5 configured)', () => {
    for (let i = 0; i < 8; i++) {
      engine.rememberInput({ selector: `#field${i}`, value: `val${i}`, timestamp: NOW });
    }
    engine.onRequest(makeRequest({ url: 'https://example.com/api?val7=x', method: 'POST' }));
    engine.getTips(NOW);
  });

  it('clear() should reset', () => {
    engine.rememberInput({ selector: '#q', value: 'findme', timestamp: NOW });
    engine.onRequest(makeRequest({ url: 'https://example.com/api?q=findme', method: 'POST' }));
    engine.clear();
    const tips = engine.getTips(NOW);
    expect(tips).toHaveLength(0);
  });
});

describe('RequestScorer', () => {
  let engine: AnalysisEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    engine = new AnalysisEngine(undefined, {
      maxTips: 10,
      minScore: 0,
      deduplicateWindowMs: 1000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should score POST higher than GET', () => {
    engine.onRequest(makeRequest({ method: 'GET', url: 'https://example.com/a' }));
    engine.onRequest(makeRequest({ method: 'POST', url: 'https://example.com/b' }));
    const tips = engine.getTips(NOW);
    expect(tips).toHaveLength(2);
    expect(tips[0]).toContain('POST');
  });

  it('should score XHR/fetch higher than other resource types', () => {
    engine.onRequest(makeRequest({ resourceType: 'fetch', url: 'https://example.com/a' }));
    engine.onRequest(makeRequest({ resourceType: 'document', url: 'https://example.com/b' }));
    const tips = engine.getTips(NOW);
    expect(tips[0]).toContain('a');
  });

  it('should add input match score when URL contains input value', () => {
    engine.rememberInput({ selector: '#email', value: 'user123', timestamp: NOW });
    engine.onRequest(makeRequest({ url: 'https://example.com/api?email=user123', method: 'GET' }));
    engine.onRequest(makeRequest({ url: 'https://example.com/api/other', method: 'GET' }));
    const tips = engine.getTips(NOW);
    const matched = tips.find((t) => t.includes('matched input'));
    expect(matched).toBeDefined();
    expect(matched).toContain('#email');
  });

  it('should NOT match masked input values', () => {
    engine.rememberInput({ selector: '#password', value: 'secretvalue', timestamp: NOW });
    engine.onRequest(
      makeRequest({ url: 'https://example.com/api?pwd=secretvalue', method: 'POST' })
    );
    const tips = engine.getTips(NOW);
    const matchedTip = tips.find((t) => t.includes('matched input'));
    expect(matchedTip).toBeUndefined();
  });

  it('should score recent requests higher than old ones', () => {
    engine.onRequest(makeRequest({ timestamp: NOW - 200_000, url: 'https://example.com/old' }));
    engine.onRequest(makeRequest({ timestamp: NOW - 1000, url: 'https://example.com/recent' }));
    const tips = engine.getTips(NOW);
    expect(tips[0]).toContain('recent');
  });

  it('should give bonus score to API URLs (/api/, graphql, /v1/)', () => {
    engine.onRequest(makeRequest({ url: 'https://example.com/api/data', resourceType: 'fetch' }));
    engine.onRequest(makeRequest({ url: 'https://example.com/graphql', resourceType: 'fetch' }));
    engine.onRequest(
      makeRequest({ url: 'https://example.com/v1/resource', resourceType: 'fetch' })
    );
    engine.onRequest(
      makeRequest({ url: 'https://example.com/static/page', resourceType: 'fetch' })
    );
    const tips = engine.getTips(NOW);
    expect(tips).toHaveLength(4);
    const nonApiIndex = tips.findIndex((t) => t.includes('/static/page'));
    expect(nonApiIndex).toBe(tips.length - 1);
  });

  it('total score should be sum of all breakdowns', () => {
    engine.rememberInput({ selector: '#q', value: 'hello', timestamp: NOW });
    engine.onRequest(
      makeRequest({ url: 'https://example.com/api?q=hello', method: 'POST', timestamp: NOW })
    );
    const tips = engine.getTips(NOW);
    expect(tips).toHaveLength(1);
    expect(tips[0]).toMatch(/POST/);
  });
});

describe('NoiseFilter', () => {
  let engine: AnalysisEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    engine = new AnalysisEngine(undefined, {
      maxTips: 10,
      minScore: 0,
      deduplicateWindowMs: 1000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should filter image/stylesheet/font/media resource types', () => {
    engine.onRequest(makeRequest({ resourceType: 'image', url: 'https://example.com/img' }));
    engine.onRequest(makeRequest({ resourceType: 'stylesheet', url: 'https://example.com/css' }));
    engine.onRequest(makeRequest({ resourceType: 'font', url: 'https://example.com/font' }));
    engine.onRequest(makeRequest({ resourceType: 'media', url: 'https://example.com/media' }));
    engine.onRequest(makeRequest({ resourceType: 'fetch', url: 'https://example.com/api/data' }));
    const tips = engine.getTips(NOW);
    expect(tips).toHaveLength(1);
    expect(tips[0]).toContain('/api/data');
  });

  it('should filter static file URLs (.js, .css, .png, etc)', () => {
    engine.onRequest(makeRequest({ resourceType: 'fetch', url: 'https://example.com/bundle.js' }));
    engine.onRequest(makeRequest({ resourceType: 'fetch', url: 'https://example.com/style.css' }));
    engine.onRequest(makeRequest({ resourceType: 'fetch', url: 'https://example.com/logo.png' }));
    engine.onRequest(makeRequest({ resourceType: 'fetch', url: 'https://example.com/api/real' }));
    const tips = engine.getTips(NOW);
    expect(tips).toHaveLength(1);
    expect(tips[0]).toContain('/api/real');
  });

  it('should filter analytics URLs', () => {
    engine.onRequest(
      makeRequest({ resourceType: 'fetch', url: 'https://example.com/analytics/track' })
    );
    engine.onRequest(
      makeRequest({ resourceType: 'fetch', url: 'https://example.com/telemetry/ping' })
    );
    engine.onRequest(makeRequest({ resourceType: 'fetch', url: 'https://example.com/api/data' }));
    const tips = engine.getTips(NOW);
    expect(tips).toHaveLength(1);
  });

  it('should filter third-party tracker URLs', () => {
    engine.onRequest(
      makeRequest({ resourceType: 'fetch', url: 'https://google-analytics.com/collect' })
    );
    engine.onRequest(makeRequest({ resourceType: 'fetch', url: 'https://www.facebook.net/sdk' }));
    engine.onRequest(makeRequest({ resourceType: 'fetch', url: 'https://example.com/api/data' }));
    const tips = engine.getTips(NOW);
    expect(tips).toHaveLength(1);
    expect(tips[0]).toContain('/api/data');
  });

  it('should NOT filter XHR/fetch requests', () => {
    engine.onRequest(makeRequest({ resourceType: 'xhr', url: 'https://example.com/api/xhr' }));
    engine.onRequest(makeRequest({ resourceType: 'fetch', url: 'https://example.com/api/fetch' }));
    const tips = engine.getTips(NOW);
    expect(tips).toHaveLength(2);
  });
});

describe('AttentionFilter', () => {
  let engine: AnalysisEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return top-N by score (maxTips=3)', () => {
    engine = new AnalysisEngine(undefined, { maxTips: 3, minScore: 0, deduplicateWindowMs: 1000 });
    engine.onRequest(
      makeRequest({ method: 'POST', url: 'https://example.com/api/a', timestamp: NOW })
    );
    engine.onRequest(
      makeRequest({ method: 'GET', url: 'https://example.com/api/b', timestamp: NOW })
    );
    engine.onRequest(
      makeRequest({ method: 'POST', url: 'https://example.com/api/c', timestamp: NOW })
    );
    engine.onRequest(
      makeRequest({ method: 'GET', url: 'https://example.com/api/d', timestamp: NOW })
    );
    const tips = engine.getTips(NOW);
    expect(tips).toHaveLength(3);
  });

  it('should filter below minScore threshold', () => {
    engine = new AnalysisEngine(undefined, {
      maxTips: 10,
      minScore: 100,
      deduplicateWindowMs: 1000,
    });
    engine.onRequest(
      makeRequest({
        method: 'GET',
        url: 'https://example.com/page',
        resourceType: 'document',
        timestamp: NOW,
      })
    );
    const tips = engine.getTips(NOW);
    expect(tips).toHaveLength(0);
  });

  it('should deduplicate same method+path within window', () => {
    engine = new AnalysisEngine(undefined, { maxTips: 10, minScore: 0, deduplicateWindowMs: 5000 });
    engine.onRequest(
      makeRequest({ method: 'POST', url: 'https://example.com/api/data', timestamp: NOW })
    );
    engine.onRequest(
      makeRequest({ method: 'POST', url: 'https://example.com/api/data', timestamp: NOW + 100 })
    );
    const tips = engine.getTips(NOW);
    expect(tips).toHaveLength(1);
  });

  it('should NOT deduplicate same method+path outside window', () => {
    engine = new AnalysisEngine(undefined, { maxTips: 10, minScore: 0, deduplicateWindowMs: 5000 });
    engine.onRequest(
      makeRequest({ method: 'POST', url: 'https://example.com/api/data', timestamp: NOW })
    );
    engine.onRequest(
      makeRequest({ method: 'POST', url: 'https://example.com/api/data', timestamp: NOW + 10_000 })
    );
    const tips = engine.getTips(NOW + 10_000);
    expect(tips).toHaveLength(1);
    expect(tips[0]).toContain('/api/data');
  });
});

describe('RequestClassifier', () => {
  let engine: AnalysisEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    engine = new AnalysisEngine(undefined, { maxTips: 10, minScore: 0, deduplicateWindowMs: 1000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should classify direct when no signing headers/params', () => {
    engine.onRequest(makeRequest({ headers: {} }));
    const tips = engine.getTips(NOW);
    expect(tips[0]).toContain('directly reusable');
  });

  it('should classify signed when has sign header', () => {
    engine.onRequest(makeRequest({ headers: { sign: 'abc123' } }));
    const tips = engine.getTips(NOW);
    expect(tips[0]).toContain('has signature params');
  });

  it('should classify signed when has sign + timestamp', () => {
    engine.onRequest(makeRequest({ headers: { sign: 'abc', timestamp: '123456' } }));
    const tips = engine.getTips(NOW);
    expect(tips[0]).toContain('has signature params');
  });

  it('should classify csrf_protected when has csrf/xsrf headers', () => {
    engine.onRequest(makeRequest({ headers: { csrf: 'tok123' } }));
    const tips = engine.getTips(NOW);
    expect(tips[0]).toContain('needs CSRF token');
  });

  it('should classify session_required when only has cookie header', () => {
    engine.onRequest(makeRequest({ headers: { cookie: 'session=abc' } }));
    const tips = engine.getTips(NOW);
    expect(tips[0]).toContain('requires session');
  });

  it('should detect sign params in URL query string', () => {
    engine.onRequest(
      makeRequest({ url: 'https://example.com/api?sign=abc&timestamp=123', headers: {} })
    );
    const tips = engine.getTips(NOW);
    expect(tips[0]).toContain('has signature params');
  });

  it('should prioritize csrf over signed over session_required over direct', () => {
    engine.onRequest(makeRequest({ headers: { csrf: 'tok', sign: 'abc' } }));
    const tips = engine.getTips(NOW);
    expect(tips[0]).toContain('needs CSRF token');
  });
});

describe('AnalysisEngine integration', () => {
  let engine: AnalysisEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    engine = new AnalysisEngine(
      { ttlMs: 60_000, maxEntries: 50 },
      { maxTips: 3, minScore: 50, deduplicateWindowMs: 5000 }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should score and classify requests via onRequest', () => {
    engine.onRequest(
      makeRequest({ method: 'POST', url: 'https://example.com/api/users', headers: {} })
    );
    const tips = engine.getTips(NOW);
    expect(tips).toHaveLength(1);
  });

  it('should update status via onResponse', () => {
    engine.onRequest(
      makeRequest({ method: 'POST', url: 'https://example.com/api/users', timestamp: NOW })
    );
    engine.onResponse({ url: 'https://example.com/api/users', timestamp: NOW, status: 200 });
    const tips = engine.getTips(NOW);
    expect(tips[0]).toContain('(200)');
  });

  it('should filter noise requests', () => {
    engine.onRequest(makeRequest({ resourceType: 'image', url: 'https://example.com/img.png' }));
    engine.onRequest(
      makeRequest({ resourceType: 'fetch', url: 'https://example.com/api/data', method: 'POST' })
    );
    const tips = engine.getTips(NOW);
    expect(tips).toHaveLength(1);
    expect(tips[0]).toContain('/api/data');
  });

  it('should generate tips from top scored requests', () => {
    engine.rememberInput({ selector: '#search', value: 'query', timestamp: NOW });
    engine.onRequest(
      makeRequest({ method: 'POST', url: 'https://example.com/api/search?q=query' })
    );
    const tips = engine.getTips(NOW);
    expect(tips).toHaveLength(1);
    expect(tips[0]).toMatch(/POST/);
    expect(tips[0]).toMatch(/matched input/);
  });

  it('should include method, path, status, input matches, classification in tips', () => {
    engine.rememberInput({ selector: '#email', value: 'a@b.com', timestamp: NOW });
    engine.onRequest(
      makeRequest({
        method: 'POST',
        url: 'https://example.com/api/login?email=a@b.com',
        headers: { csrf: 'tok' },
      })
    );
    engine.onResponse({ url: 'https://example.com/api/login?email=a@b.com', status: 200 });
    const tips = engine.getTips(NOW);
    const tip = tips[0];
    expect(tip).toContain('POST');
    expect(tip).toContain('/api/login');
    expect(tip).toContain('(200)');
    expect(tip).toContain('matched input');
    expect(tip).toContain('needs CSRF token');
  });

  it('should cap tips at 120 chars', () => {
    const longPath = 'a'.repeat(150);
    engine.onRequest(
      makeRequest({ method: 'POST', url: `https://example.com/api/${longPath}`, headers: {} })
    );
    const tips = engine.getTips(NOW);
    expect(tips[0].length).toBeLessThanOrEqual(120);
  });

  it('getTips should clear tipped requests (no repeat)', () => {
    engine.onRequest(makeRequest({ method: 'POST', url: 'https://example.com/api/data' }));
    const tips1 = engine.getTips(NOW);
    expect(tips1).toHaveLength(1);
    const tips2 = engine.getTips(NOW);
    expect(tips2).toHaveLength(0);
  });

  it('rememberInput should feed into scorer', () => {
    engine.rememberInput({ selector: '#q', value: 'searchterm', timestamp: NOW });
    engine.onRequest(makeRequest({ method: 'POST', url: 'https://example.com/api?q=searchterm' }));
    const tips = engine.getTips(NOW);
    expect(tips).toHaveLength(1);
    expect(tips[0]).toContain('matched input');
  });

  it('clear should reset everything', () => {
    engine.rememberInput({ selector: '#q', value: 'x', timestamp: NOW });
    engine.onRequest(makeRequest({ method: 'POST', url: 'https://example.com/api?q=x' }));
    engine.clear();
    const tips = engine.getTips(NOW);
    expect(tips).toHaveLength(0);
  });
});

describe('Edge cases', () => {
  let engine: AnalysisEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    engine = new AnalysisEngine(
      { ttlMs: 60_000, maxEntries: 50 },
      { maxTips: 3, minScore: 0, deduplicateWindowMs: 5000 }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('empty input memory should still score (no input match bonus)', () => {
    engine.onRequest(makeRequest({ method: 'POST', url: 'https://example.com/api/data' }));
    const tips = engine.getTips(NOW);
    expect(tips).toHaveLength(1);
    expect(tips[0]).not.toContain('matched input');
  });

  it('very long URL should truncate path to 60 chars in tip', () => {
    const longSegment = 'b'.repeat(80);
    engine.onRequest(makeRequest({ method: 'GET', url: `https://example.com/api/${longSegment}` }));
    const tips = engine.getTips(NOW);
    expect(tips[0].length).toBeLessThanOrEqual(120);
    expect(tips[0]).not.toContain('b'.repeat(80));
  });

  it('multiple pages of requests should only return top 3 tips', () => {
    for (let i = 0; i < 10; i++) {
      engine.onRequest(
        makeRequest({
          method: i % 2 === 0 ? 'POST' : 'GET',
          url: `https://example.com/api/item${i}`,
          timestamp: NOW + i,
        })
      );
    }
    const tips = engine.getTips(NOW);
    expect(tips).toHaveLength(3);
  });

  it('same URL different timestamps should handle correctly', () => {
    engine = new AnalysisEngine(
      { ttlMs: 60_000, maxEntries: 50 },
      { maxTips: 10, minScore: 0, deduplicateWindowMs: 5000 }
    );
    engine.onRequest(makeRequest({ url: 'https://example.com/api/data', timestamp: NOW - 10_000 }));
    engine.onRequest(makeRequest({ url: 'https://example.com/api/data', timestamp: NOW }));
    engine.onResponse({ url: 'https://example.com/api/data', timestamp: NOW, status: 200 });
    const tips = engine.getTips(NOW);
    expect(tips).toHaveLength(1);
    expect(tips[0]).toContain('(200)');
  });
});

describe('Type exports', () => {
  it('InputEntry type should have correct shape', () => {
    const entry: InputEntry = {
      selector: '#test',
      value: 'hello',
      timestamp: Date.now(),
    };
    expect(entry.selector).toBe('#test');
    expect(entry.value).toBe('hello');
    expect(typeof entry.timestamp).toBe('number');
  });

  it('ScoredRequest type should have correct shape', () => {
    const req: ScoredRequest = {
      url: 'https://example.com',
      method: 'GET',
      score: 100,
      breakdown: {
        methodScore: 10,
        resourceTypeScore: 30,
        inputMatchScore: 15,
        recencyScore: 20,
        apiScore: 25,
      },
      inputMatches: ['#q'],
      timestamp: Date.now(),
    };
    expect(req.breakdown.methodScore).toBe(10);
    expect(req.inputMatches).toHaveLength(1);
  });

  it('ClassificationResult type should have correct shape', () => {
    const result: ClassificationResult = {
      type: 'csrf_protected',
      indicators: ['header:csrf'],
    };
    expect(result.type).toBe('csrf_protected');
    expect(result.indicators).toContain('header:csrf');
  });
});
