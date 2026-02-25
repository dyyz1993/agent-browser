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
      const data = result.data as any;
      return data.result || data;
    }
    return null;
  }

  async function verifySelectorUniqueness(generatedSelector: string): Promise<boolean> {
    const result = await executeCommand(
      parseCliArgs(['eval', `document.querySelectorAll('${generatedSelector}').length`]),
      browser
    );
    if (result.success && result.data) {
      const data = result.data as any;
      return data === 1 || data.result === 1;
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

    it('should generate unique selector for data-cy', async () => {
      const selector = await getSelectorForElement('[data-cy="cancel-btn"]');
      expect(selector).toBe('button[data-cy="cancel-btn"]');

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });
  });

  describe('Nth-child Selectors', () => {
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
  });

  describe('Path-based Selectors', () => {
    it('should generate unique selector for nested structure', async () => {
      const selector = await getSelectorForElement('.level-3 .target');
      expect(selector).toBeTruthy();

      const isUnique = await verifySelectorUniqueness(selector!);
      expect(isUnique).toBe(true);
    });
  });

  describe('Pagination Links (Real-world)', () => {
    it('should generate unique selector for pagination link', async () => {
      const selector = await getSelectorForElement('.pagination a[href="?page=3"]');
      expect(selector).toBeTruthy();
      expect(selector).toContain(':nth-child');

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
