import { describe, it, expect, vi } from 'vitest';
import {
  scanForInterruptions,
  formatInterruptionTip,
  getInterruptionRules,
} from '../browser/interruption-detector.js';

function createMockPage(
  url: string,
  selectorCounts: Record<string, number> = {},
  errors: Set<string> = new Set()
) {
  return {
    url: vi.fn().mockReturnValue(url),
    locator: vi.fn((selector: string) => ({
      count: errors.has(selector)
        ? vi.fn().mockRejectedValue(new Error('locator error'))
        : vi.fn().mockResolvedValue(selectorCounts[selector] ?? 0),
    })),
  };
}

describe('getInterruptionRules', () => {
  it('returns non-empty array with valid structure', () => {
    const rules = getInterruptionRules();
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule).toHaveProperty('name');
      expect(typeof rule.name).toBe('string');
      expect(Array.isArray(rule.domains)).toBe(true);
      expect(rule.domains.length).toBeGreaterThan(0);
      expect(Array.isArray(rule.selectors)).toBe(true);
      expect(rule.selectors.length).toBeGreaterThan(0);
      expect(rule).toHaveProperty('type');
      expect(rule).toHaveProperty('subType');
      expect(typeof rule.confidence).toBe('number');
      expect(rule.confidence).toBeGreaterThanOrEqual(0);
      expect(rule.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe('scanForInterruptions', () => {
  it('returns empty array for invalid URL', async () => {
    const page = createMockPage('about:blank');
    const results = await scanForInterruptions(page as any);
    expect(results).toEqual([]);
  });

  it('returns empty array when no rules match domain', async () => {
    const page = createMockPage('https://www.unknown-site-xyz.com/page');
    const results = await scanForInterruptions(page as any);
    const ruleNames = results.map((r) => r.ruleName);
    for (const name of ruleNames) {
      const rule = getInterruptionRules().find((r) => r.name === name);
      expect(rule?.domains).not.toContain('*');
    }
  });

  it('matches wildcard domain rules when selectors found', async () => {
    const page = createMockPage('https://example.com/page', {
      'div#cookie-banner': 1,
    });
    const results = await scanForInterruptions(page as any);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.type === 'popup')).toBe(true);
  });

  it('skips rules when selectors not found (count=0)', async () => {
    const page = createMockPage('https://example.com/page');
    const results = await scanForInterruptions(page as any);
    expect(results).toEqual([]);
  });

  it('matches specific domain rules correctly', async () => {
    const page = createMockPage('https://login.taobao.com/member/login.jhtml', {
      'form#J_Form': 1,
    });
    const results = await scanForInterruptions(page as any);
    expect(results.length).toBeGreaterThan(0);
    const taobaoRule = results.find((r) => r.ruleName === 'Taobao Login');
    expect(taobaoRule).toBeDefined();
    expect(taobaoRule!.type).toBe('login');
    expect(taobaoRule!.subType).toBe('full_page');
  });

  it('filters by path when rule has paths', async () => {
    const page = createMockPage('https://github.com/other/path', {
      "form[action='/session']": 1,
    });
    const results = await scanForInterruptions(page as any);
    const githubRule = results.find((r) => r.ruleName === 'GitHub Login');
    expect(githubRule).toBeUndefined();
  });

  it('matches rule when path matches path filter', async () => {
    const page = createMockPage('https://github.com/login', {
      "form[action='/session']": 1,
    });
    const results = await scanForInterruptions(page as any);
    const githubRule = results.find((r) => r.ruleName === 'GitHub Login');
    expect(githubRule).toBeDefined();
  });

  it('continues on locator error (catch)', async () => {
    const page = createMockPage(
      'https://example.com/page',
      { 'div#cookie-banner': 1 },
      new Set(['div#cookie-banner'])
    );
    const locatorSpy = vi.fn((selector: string) => ({
      count:
        selector === 'div#cookie-banner'
          ? vi.fn().mockRejectedValue(new Error('broken'))
          : vi.fn().mockResolvedValue(selector === 'div#cookie-consent' ? 1 : 0),
    }));
    const pageWithErrors = {
      url: vi.fn().mockReturnValue('https://example.com/page'),
      locator: locatorSpy,
    };
    const results = await scanForInterruptions(pageWithErrors as any);
    expect(results.length).toBeGreaterThan(0);
  });

  it('breaks on first matching selector per rule', async () => {
    const callOrder: string[] = [];
    const page = {
      url: vi.fn().mockReturnValue('https://example.com/page'),
      locator: vi.fn((selector: string) => {
        callOrder.push(selector);
        return {
          count: vi
            .fn()
            .mockResolvedValue(selector === "iframe[src*='recaptcha/api2/anchor']" ? 1 : 0),
        };
      }),
    };
    await scanForInterruptions(page as any);
    const recaptchaRule = getInterruptionRules().find((r) => r.name === 'Google reCAPTCHA v2')!;
    const recaptchaSelectors = recaptchaRule.selectors;
    const callsForRule = callOrder.filter((s) => recaptchaSelectors.includes(s));
    expect(callsForRule.length).toBeLessThan(recaptchaSelectors.length);
    expect(callsForRule[0]).toBe("iframe[src*='recaptcha/api2/anchor']");
  });
});

describe('formatInterruptionTip', () => {
  it('formats with subType correctly', () => {
    const tip = formatInterruptionTip({
      ruleName: 'Google reCAPTCHA v2',
      type: 'captcha',
      subType: 'recaptcha_v2',
      selector: '.g-recaptcha',
      confidence: 0.95,
    });
    expect(tip).toBe('[!] captcha detected: recaptcha v2 (Google reCAPTCHA v2)');
  });

  it('formats without subType', () => {
    const tip = formatInterruptionTip({
      ruleName: 'Age Verification (Generic)',
      type: 'age_verify',
      subType: '',
      selector: 'div.age-verify',
      confidence: 0.8,
    });
    expect(tip).toBe('[!] age verify detected (Age Verification (Generic))');
  });
});
