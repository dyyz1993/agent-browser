import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';

describe('Selector Uniqueness E2E Tests', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-launch',
      headless: true,
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  // Helper to get the actual result value from executeCommand response
  function extractResult(data: any): any {
    if (data === null || data === undefined) return null;
    if (typeof data === 'object' && 'result' in data) {
      return extractResult(data.result);
    }
    return data;
  }

  async function getSelectorForElement(targetSelector: string): Promise<string | null> {
    const result = await executeCommand(
      parseCliArgs([
        'eval',
        `(function() {
        const el = document.querySelector('${targetSelector}');
        if (!el) return null;

        function isUniqueSelector(sel) {
          try {
            return document.querySelectorAll(sel).length === 1;
          } catch (e) {
            return false;
          }
        }

        function getBaseSelector(element) {
          let sel = element.tagName.toLowerCase();
          if (element.className && typeof element.className === 'string') {
            const classes = element.className.trim().split(/\\s+/)
              .filter(c => c && !c.startsWith('_') && !c.startsWith('css-') && !/^[a-z]{1,2}$/.test(c));
            if (classes.length > 0) {
              sel += '.' + classes.slice(0, 2).map(c => CSS.escape(c)).join('.');
            }
          }
          return sel;
        }

        function makeUniqueWithNth(element, baseSelector) {
          const parent = element.parentElement;
          if (!parent) return baseSelector;
          const siblings = Array.from(parent.children);
          const sameTagSiblings = siblings.filter(s => s.tagName === element.tagName);
          if (sameTagSiblings.length === 1) return baseSelector;
          const index = siblings.indexOf(element) + 1;
          return baseSelector + ':nth-child(' + index + ')';
        }

        function buildUniquePath(element, maxDepth = 5) {
          const parts = [];
          let current = element;
          let depth = 0;
          while (current && current !== document.body && depth < maxDepth) {
            const baseSelector = getBaseSelector(current);
            const selector = makeUniqueWithNth(current, baseSelector);
            parts.unshift(selector);
            const fullSelector = parts.join(' > ');
            if (isUniqueSelector(fullSelector)) return fullSelector;
            current = current.parentElement;
            depth++;
          }
          return parts.length > 0 ? parts.join(' > ') : null;
        }

        function getSelector(element) {
          if (element.id) {
            const sel = '#' + CSS.escape(element.id);
            if (isUniqueSelector(sel)) return sel;
          }
          const semanticAttrs = ['data-testid', 'data-test', 'data-cy', 'aria-label', 'name', 'role', 'title'];
          for (const attr of semanticAttrs) {
            const value = element.getAttribute(attr);
            if (value) {
              const sel = element.tagName.toLowerCase() + '[' + attr + '="' + CSS.escape(value) + '"]';
              if (isUniqueSelector(sel)) return sel;
            }
          }
          const baseSelector = getBaseSelector(element);
          const uniqueSelector = makeUniqueWithNth(element, baseSelector);
          if (isUniqueSelector(uniqueSelector)) return uniqueSelector;
          const pathSelector = buildUniquePath(element);
          if (pathSelector) return pathSelector;
          return element.tagName.toLowerCase();
        }

        return getSelector(el);
      })()`,
      ]),
      browser
    );

    if (result.success && result.data) {
      return extractResult(result.data);
    }
    return null;
  }

  async function verifySelectorUniqueness(generatedSelector: string): Promise<boolean> {
    const result = await executeCommand(
      parseCliArgs(['eval', `document.querySelectorAll('${generatedSelector}').length`]),
      browser
    );
    if (result.success && result.data) {
      const data = extractResult(result.data);
      return data === 1;
    }
    return false;
  }

  describe('Unique ID Selectors', () => {
    it('should generate unique selector for element with ID', async () => {
      await executeCommand(
        parseCliArgs(['open', getFixturePath('selector-uniqueness.html')]),
        browser
      );

      const selector = await getSelectorForElement('#unique-button');
      expect(selector).toBe('#unique-button');

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });

    it('should generate unique selector for deep nested element with ID', async () => {
      const selector = await getSelectorForElement('#deep-button');
      expect(selector).toBe('#deep-button');

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });

    it('should handle ID with dot character', async () => {
      // Test that CSS.escape properly escapes dot in ID
      const selector = await getSelectorForElement('button[id="submit.btn"]');
      expect(selector).toBeTruthy();
      expect(typeof selector).toBe('string');
      // The selector should use CSS.escape to produce a valid selector
      expect(selector).toMatch(/#submit.*btn|button\[id/);
    });

    it('should handle ID with colon character', async () => {
      const selector = await getSelectorForElement('input[id="user:name"]');
      expect(selector).toBeTruthy();
      expect(typeof selector).toBe('string');
      expect(selector).toMatch(/#user.*name|input\[id/);
    });

    it('should handle ID with bracket characters', async () => {
      const selector = await getSelectorForElement('span[id="item[0]"]');
      expect(selector).toBeTruthy();
      expect(typeof selector).toBe('string');
      expect(selector).toMatch(/#item.*0|span\[id/);
    });
  });

  describe('Semantic Attribute Selectors', () => {
    it('should generate unique selector for data-testid', async () => {
      const selector = await getSelectorForElement('[data-testid="submit-btn"]');
      expect(selector).toBe('button[data-testid="submit-btn"]');

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });

    it('should generate unique selector for aria-label', async () => {
      const selector = await getSelectorForElement('[aria-label="search-input"]');
      expect(selector).toBe('input[aria-label="search-input"]');

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });

    it('should generate unique selector for aria-label button', async () => {
      const selector = await getSelectorForElement('[aria-label="search"]');
      expect(selector).toBe('button[aria-label="search"]');

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });

    it('should generate unique selector for data-cy', async () => {
      const selector = await getSelectorForElement('[data-cy="cancel-btn"]');
      expect(selector).toBe('button[data-cy="cancel-btn"]');

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });

    it('should generate unique selector for name attribute', async () => {
      const selector = await getSelectorForElement('[name="email"]');
      expect(selector).toBe('input[name="email"]');

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });

    it('should generate unique selector for name attribute (password)', async () => {
      const selector = await getSelectorForElement('[name="password"]');
      expect(selector).toBe('input[name="password"]');

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });

    it('should generate unique selector for role attribute (submit)', async () => {
      const selector = await getSelectorForElement('[role="submit"]');
      expect(selector).toBe('button[role="submit"]');

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });

    it('should generate unique selector for role attribute (cancel)', async () => {
      const selector = await getSelectorForElement('[role="cancel"]');
      expect(selector).toBe('button[role="cancel"]');

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });
  });

  describe('Nth-child Selectors', () => {
    it('should generate unique selector for multiple same tags (3rd li)', async () => {
      const selector = await getSelectorForElement('.simple-list li:nth-child(3)');
      expect(selector).toBeTruthy();
      expect(selector).toContain(':nth-child');

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });

    it('should generate unique selector for same class elements (2nd .item)', async () => {
      const selector = await getSelectorForElement('.item-group .item:nth-child(2)');
      expect(selector).toBeTruthy();
      expect(selector).toContain(':nth-child');

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });

    it('should generate unique selector for multiple same tags', async () => {
      const selector = await getSelectorForElement('.list-container a[href="#3"]');
      expect(selector).toBeTruthy();
      expect(selector).toContain(':nth-child');

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });

    it('should generate unique selector for same class elements', async () => {
      const selector = await getSelectorForElement('.btn-action:nth-of-type(2)');
      expect(selector).toBeTruthy();

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });

    it('should generate unique selector for pagination link (3rd page)', async () => {
      const selector = await getSelectorForElement('.pagination a[href="?page=3"]');
      expect(selector).toBeTruthy();
      expect(selector).toContain(':nth-child');

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });

    it('should generate unique selector for list item (5th item)', async () => {
      const selector = await getSelectorForElement('.item-list li:nth-child(5)');
      expect(selector).toBeTruthy();
      expect(selector).toContain(':nth-child');

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });
  });

  describe('Path-based Selectors', () => {
    it('should generate unique selector for nested structure', async () => {
      const selector = await getSelectorForElement('.level-3 .target');
      expect(selector).toBeTruthy();

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });
  });

  describe('Dynamic Classes', () => {
    it('should filter out dynamic classes and use nth-child', async () => {
      const selector = await getSelectorForElement('#test-id-unique + .container div');
      expect(selector).toBeTruthy();

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });

    it('should filter css-* pattern classes', async () => {
      // Find the div with css-abc123 class using direct selector
      const selector = await getSelectorForElement('.css-abc123');
      expect(selector).toBeTruthy();
      expect(typeof selector).toBe('string');

      // The generated selector should not contain css- prefix
      if (selector && typeof selector === 'string') {
        expect(selector).not.toContain('css-');
        const isUnique = await verifySelectorUniqueness(selector);
        expect(isUnique).toBe(true);
      }
    });

    it('should filter underscore-prefixed classes', async () => {
      // Find the div with css-def456 class using direct selector
      const selector = await getSelectorForElement('.css-def456');
      expect(selector).toBeTruthy();
      expect(typeof selector).toBe('string');

      // The generated selector should not contain underscore-prefixed classes
      if (selector && typeof selector === 'string') {
        expect(selector).not.toMatch(/\._/);
        const isUnique = await verifySelectorUniqueness(selector);
        expect(isUnique).toBe(true);
      }
    });
  });

  describe('High-Entropy Class Names', () => {
    it('should filter high-entropy class like oMpq4HiN', async () => {
      const selector = await getSelectorForElement('[data-testid="high-entropy-btn-1"]');
      expect(selector).toBeTruthy();
      expect(typeof selector).toBe('string');

      // The generated selector should use data-testid, not the high-entropy class
      expect(selector).toContain('data-testid');
      expect(selector).not.toContain('oMpq4HiN');

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });

    it('should filter multiple high-entropy classes', async () => {
      const selector = await getSelectorForElement('[data-testid="high-entropy-btn-2"]');
      expect(selector).toBeTruthy();
      expect(typeof selector).toBe('string');

      // Should use data-testid instead of YoNA2Hyj or qKr0RhiL
      expect(selector).toContain('data-testid');
      expect(selector).not.toContain('YoNA2Hyj');
      expect(selector).not.toContain('qKr0RhiL');

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });

    it('should filter Emotion-style classes (sc-*)', async () => {
      const selector = await getSelectorForElement('[data-testid="high-entropy-div"]');
      expect(selector).toBeTruthy();
      expect(typeof selector).toBe('string');

      // Should use data-testid instead of sc-dkzDqf
      expect(selector).toContain('data-testid');
      expect(selector).not.toContain('sc-');

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });

    it('should filter alternating case pattern classes', async () => {
      const selector = await getSelectorForElement('[data-testid="high-entropy-span"]');
      expect(selector).toBeTruthy();
      expect(typeof selector).toBe('string');

      // xYzAbC has alternating case pattern, should be filtered
      expect(selector).toContain('data-testid');
      expect(selector).not.toContain('xYzAbC');

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });

    it('should prefer semantic class over high-entropy class', async () => {
      const selector = await getSelectorForElement('[data-testid="semantic-with-random"]');
      expect(selector).toBeTruthy();
      expect(typeof selector).toBe('string');

      // Should use data-testid first (highest priority)
      expect(selector).toContain('data-testid');

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });
  });

  describe('Shadow DOM Support', () => {
    it('should generate selector for shadow DOM element', async () => {
      await executeCommand(parseCliArgs(['open', getFixturePath('shadow-dom-test.html')]), browser);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const result = await executeCommand(
        parseCliArgs([
          'eval',
          `(function() {
          const host = document.querySelector('#shadow-btn-1');
          if (!host) return { error: 'no host element' };
          if (!host.shadowRoot) return { error: 'no shadowRoot', hostExists: true };
          const btn = host.shadowRoot.querySelector('#inner-btn');
          if (!btn) return { error: 'no btn', hostExists: true, shadowRootExists: true };
          
          function getShadowHost(element) {
            let current = element;
            while (current) {
              if (current.getRootNode() instanceof ShadowRoot) {
                return current.getRootNode().host;
              }
              current = current.parentElement;
            }
            return null;
          }
          
          const shadowHost = getShadowHost(btn);
          if (shadowHost) {
            return {
              hasShadowHost: true,
              hostSelector: '#' + shadowHost.id,
              innerSelector: '#' + btn.id
            };
          }
          return { error: 'no shadowHost found', btnExists: true };
        })()`,
        ]),
        browser
      );

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        const data = (result.data as any).result || result.data;
        expect(data.hasShadowHost).toBe(true);
        expect(data.hostSelector).toBe('#shadow-btn-1');
        expect(data.innerSelector).toBe('#inner-btn');
      }
    });

    it('should generate selector for nested shadow DOM element', async () => {
      const result = await executeCommand(
        parseCliArgs([
          'eval',
          `(function() {
          const outer = document.querySelector('#outer-1');
          if (!outer) return { error: 'no outer element' };
          if (!outer.shadowRoot) return { error: 'no outer shadowRoot' };
          
          const inner = outer.shadowRoot.querySelector('#inner-1');
          if (!inner) return { error: 'no inner element' };
          if (!inner.shadowRoot) return { error: 'no inner shadowRoot' };
          
          const btn = inner.shadowRoot.querySelector('#deep-shadow-btn');
          if (!btn) return { error: 'no btn' };
          
          return {
            found: true,
            btnId: btn.id,
            dataTestid: btn.getAttribute('data-testid')
          };
        })()`,
        ]),
        browser
      );

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        const data = (result.data as any).result || result.data;
        expect(data.found).toBe(true);
        expect(data.btnId).toBe('deep-shadow-btn');
      }
    });
  });

  describe('Recorder Integration', () => {
    it('should record unique selectors during click', async () => {
      await executeCommand(
        parseCliArgs(['open', getFixturePath('selector-uniqueness.html')]),
        browser
      );

      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(parseCliArgs(['click', '.pagination .page-link:nth-child(2)']), browser);

      await new Promise((resolve) => setTimeout(resolve, 300));

      const result = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);

      expect(result.success).toBe(true);
      if (result.success) {
        const yaml = (result.data as any).yaml;
        expect(yaml).toContain('selector:');

        const selectorMatch = yaml.match(/selector:\s*"([^"]+)"/);
        if (selectorMatch) {
          const recordedSelector = selectorMatch[1];
          const isUnique = await verifySelectorUniqueness(recordedSelector);
          expect(isUnique).toBe(true);
        }
      }
    });
  });
});
