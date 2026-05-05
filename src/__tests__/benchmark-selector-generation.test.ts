/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import {
  generateXPath,
  generateCSSPath,
  getSemanticClass,
  collectAttributes,
} from '../snapshot.js';

type AttributeList = Array<{ name: string; value: string }>;

interface MockElementOptions {
  tagName?: string;
  id?: string;
  classes?: string[];
  attributes?: Record<string, string>;
  children?: MockElement[];
  textContent?: string;
}

class MockElement implements Element {
  tagName: string;
  id = '';
  className = '';
  classList: DOMTokenList;
  children: HTMLCollection;
  childElementCount: number;
  parentElement: Element | null = null;
  textContent: string;
  attributes: AttributeList = [];
  nodeType = 1;

  private _children: MockElement[] = [];

  constructor(opts: MockElementOptions = {}) {
    this.tagName = (opts.tagName || 'div').toUpperCase();
    if (opts.id) {
      this.id = opts.id;
      this.attributes.push({ name: 'id', value: opts.id });
    }
    if (opts.classes && opts.classes.length > 0) {
      this.className = opts.classes.join(' ');
      for (const cls of opts.classes) {
        this.attributes.push({ name: 'class', value: cls });
      }
    }
    if (opts.attributes) {
      for (const [name, value] of Object.entries(opts.attributes)) {
        this.attributes.push({ name, value });
      }
    }
    this.textContent = opts.textContent || '';
    this._children = opts.children || [];
    for (const child of this._children) {
      child.parentElement = this;
    }

    const self = this;
    this.children = {
      length: self._children.length,
      item(index: number): Element | null {
        return self._children[index] || null;
      },
      [Symbol.iterator](): Iterator<Element> {
        let i = 0;
        return {
          next(): IteratorResult<Element> {
            if (i < self._children.length) {
              return { value: self._children[i++], done: false };
            }
            return { value: undefined as any, done: true };
          },
        };
      },
    } as HTMLCollection;
    this.childElementCount = this._children.length;

    const classArray = opts.classes || [];
    this.classList = {
      length: classArray.length,
      contains(token: string): boolean {
        return classArray.includes(token);
      },
      [Symbol.iterator](): Iterator<string> {
        let i = 0;
        return {
          next(): IteratorResult<string> {
            if (i < classArray.length) {
              return { value: classArray[i++], done: false };
            }
            return { value: undefined as any, done: true };
          },
        };
      },
    } as DOMTokenList;
  }

  getAttribute(name: string): string | null {
    const attr = this.attributes.find((a) => a.name === name);
    return attr ? attr.value : null;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.some((a) => a.name === name);
  }

  querySelector(_selectors: string): Element | null {
    return null;
  }

  querySelectorAll(_selectors: string): NodeListOf<Element> {
    return [] as unknown as NodeListOf<Element>;
  }
}

function buildElement(opts: {
  hasId?: boolean;
  hasDataTestId?: boolean;
  hasName?: boolean;
  hasAriaLabel?: boolean;
  hasClasses?: boolean;
  tag?: string;
  index?: number;
  depth?: number;
}): MockElement {
  const i = opts.index ?? 0;
  const tags = ['button', 'input', 'a', 'span', 'div', 'nav', 'section', 'article'];
  const tag = opts.tag || tags[i % tags.length];

  const classes = opts.hasClasses ? [`component-${i % 20}`, `variant-${i % 5}`] : [];

  const attrs: Record<string, string> = {};
  if (opts.hasDataTestId) attrs['data-testid'] = `test-elem-${i}`;
  if (opts.hasName) attrs['name'] = `field-${i}`;
  if (opts.hasAriaLabel) attrs['aria-label'] = `Label for element ${i}`;

  return new MockElement({
    tagName: tag,
    id: opts.hasId ? `elem-${i}` : undefined,
    classes,
    attributes: attrs,
    textContent: `Element ${i}`,
  });
}

function buildNestedDOM(depth: number, breadth: number, parent?: MockElement): MockElement[] {
  if (depth === 0) return [];

  const elements: MockElement[] = [];
  for (let i = 0; i < breadth; i++) {
    const el = new MockElement({
      tagName: ['div', 'section', 'nav', 'article', 'main'][i % 5],
      classes: [`level-${depth}-item-${i}`],
      attributes: {
        'data-depth': String(depth),
        'data-index': String(i),
      },
      textContent: `Node d${depth}-i${i}`,
    });
    if (parent) {
      el.parentElement = parent;
    }
    const children = buildNestedDOM(depth - 1, breadth, el);
    elements.push(el, ...children);
  }
  return elements;
}

describe('Selector Generation Performance Benchmarks', () => {
  describe('generateXPath benchmarks', () => {
    it('should generate XPath for 10 elements under 5ms', () => {
      const elements = Array.from({ length: 10 }, (_, i) =>
        buildElement({ hasId: true, hasDataTestId: true, index: i })
      );

      const start = performance.now();
      for (const el of elements) {
        generateXPath(el);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(5);
      console.log(`  XPath 10 elements: ${duration.toFixed(2)}ms`);
    });

    it('should generate XPath for 100 elements under 20ms', () => {
      const elements = Array.from({ length: 100 }, (_, i) =>
        buildElement({ hasClasses: true, hasName: true, index: i })
      );

      const start = performance.now();
      for (const el of elements) {
        generateXPath(el);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(20);
      console.log(`  XPath 100 elements: ${duration.toFixed(2)}ms`);
    });

    it('should generate XPath for 500 elements under 100ms', () => {
      const elements = Array.from({ length: 500 }, (_, i) =>
        buildElement({ hasClasses: true, hasAriaLabel: i % 3 === 0, index: i })
      );

      const start = performance.now();
      for (const el of elements) {
        generateXPath(el);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100);
      console.log(`  XPath 500 elements: ${duration.toFixed(2)}ms`);
    });

    it('should generate XPath for 1000 elements under 200ms', () => {
      const elements = Array.from({ length: 1000 }, (_, i) =>
        buildElement({ hasClasses: true, index: i })
      );

      const start = performance.now();
      for (const el of elements) {
        generateXPath(el);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(200);
      console.log(`  XPath 1000 elements: ${duration.toFixed(2)}ms`);
    });
  });

  describe('generateCSSPath benchmarks', () => {
    it('should generate CSS path for 10 elements under 5ms', () => {
      const elements = Array.from({ length: 10 }, (_, i) =>
        buildElement({ hasId: true, hasDataTestId: true, index: i })
      );

      const start = performance.now();
      for (const el of elements) {
        generateCSSPath(el);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(5);
      console.log(`  CSS path 10 elements: ${duration.toFixed(2)}ms`);
    });

    it('should generate CSS path for 100 elements under 20ms', () => {
      const elements = Array.from({ length: 100 }, (_, i) =>
        buildElement({ hasClasses: true, hasName: true, index: i })
      );

      const start = performance.now();
      for (const el of elements) {
        generateCSSPath(el);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(20);
      console.log(`  CSS path 100 elements: ${duration.toFixed(2)}ms`);
    });

    it('should generate CSS path for 500 elements under 100ms', () => {
      const elements = Array.from({ length: 500 }, (_, i) =>
        buildElement({ hasClasses: true, hasAriaLabel: i % 3 === 0, index: i })
      );

      const start = performance.now();
      for (const el of elements) {
        generateCSSPath(el);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100);
      console.log(`  CSS path 500 elements: ${duration.toFixed(2)}ms`);
    });

    it('should generate CSS path for 1000 elements under 200ms', () => {
      const elements = Array.from({ length: 1000 }, (_, i) =>
        buildElement({ hasClasses: true, index: i })
      );

      const start = performance.now();
      for (const el of elements) {
        generateCSSPath(el);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(200);
      console.log(`  CSS path 1000 elements: ${duration.toFixed(2)}ms`);
    });
  });

  describe('getSemanticClass benchmarks', () => {
    it('should filter classes for 1000 elements under 50ms', () => {
      const elements = Array.from({ length: 1000 }, (_, i) =>
        buildElement({ hasClasses: true, index: i })
      );

      const start = performance.now();
      for (const el of elements) {
        getSemanticClass(el);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50);
      console.log(`  getSemanticClass 1000 elements: ${duration.toFixed(2)}ms`);
    });
  });

  describe('collectAttributes benchmarks', () => {
    it('should collect attributes for 1000 elements under 50ms', () => {
      const elements = Array.from({ length: 1000 }, (_, i) =>
        buildElement({
          hasId: true,
          hasDataTestId: true,
          hasClasses: true,
          hasAriaLabel: true,
          hasName: true,
          index: i,
        })
      );

      const start = performance.now();
      for (const el of elements) {
        collectAttributes(el);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50);
      console.log(`  collectAttributes 1000 elements: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Combined pipeline (XPath + CSSPath) benchmarks', () => {
    it('should generate both selectors for 100 elements under 30ms', () => {
      const elements = Array.from({ length: 100 }, (_, i) =>
        buildElement({
          hasId: i % 5 === 0,
          hasDataTestId: i % 3 === 0,
          hasClasses: true,
          hasName: i % 4 === 0,
          hasAriaLabel: i % 7 === 0,
          index: i,
        })
      );

      const start = performance.now();
      for (const el of elements) {
        generateXPath(el);
        generateCSSPath(el);
        getSemanticClass(el);
        collectAttributes(el);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(30);
      console.log(`  Full pipeline 100 elements: ${duration.toFixed(2)}ms`);
    });

    it('should generate both selectors for 500 elements under 150ms', () => {
      const elements = Array.from({ length: 500 }, (_, i) =>
        buildElement({
          hasId: i % 5 === 0,
          hasDataTestId: i % 3 === 0,
          hasClasses: true,
          hasName: i % 4 === 0,
          hasAriaLabel: i % 7 === 0,
          index: i,
        })
      );

      const start = performance.now();
      for (const el of elements) {
        generateXPath(el);
        generateCSSPath(el);
        getSemanticClass(el);
        collectAttributes(el);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(150);
      console.log(`  Full pipeline 500 elements: ${duration.toFixed(2)}ms`);
    });

    it('should generate both selectors for 1000 elements under 300ms', () => {
      const elements = Array.from({ length: 1000 }, (_, i) =>
        buildElement({
          hasId: i % 5 === 0,
          hasDataTestId: i % 3 === 0,
          hasClasses: true,
          hasName: i % 4 === 0,
          hasAriaLabel: i % 7 === 0,
          index: i,
        })
      );

      const start = performance.now();
      for (const el of elements) {
        generateXPath(el);
        generateCSSPath(el);
        getSemanticClass(el);
        collectAttributes(el);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(300);
      console.log(`  Full pipeline 1000 elements: ${duration.toFixed(2)}ms`);
    });
  });

  describe('Strategy priority performance', () => {
    it('ID strategy should be fastest (short-circuits immediately)', () => {
      const elem = buildElement({
        hasId: true,
        hasDataTestId: true,
        hasClasses: true,
        hasName: true,
        hasAriaLabel: true,
        index: 0,
      });

      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        generateXPath(elem);
        generateCSSPath(elem);
      }
      const duration = performance.now() - start;

      console.log(`  ID strategy (10k iterations): ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(200);
    });

    it('data-testid strategy should be fast (second check)', () => {
      const elem = buildElement({
        hasDataTestId: true,
        hasClasses: true,
        hasName: true,
        hasAriaLabel: true,
        index: 0,
      });

      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        generateXPath(elem);
        generateCSSPath(elem);
      }
      const duration = performance.now() - start;

      console.log(`  data-testid strategy (10k iterations): ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(200);
    });

    it('semantic class strategy should be fast', () => {
      const elem = buildElement({
        hasClasses: true,
        index: 0,
      });

      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        generateXPath(elem);
        generateCSSPath(elem);
      }
      const duration = performance.now() - start;

      console.log(`  class strategy (10k iterations): ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(300);
    });

    it('bare element fallback (no attributes) should still complete', () => {
      const elem = buildElement({ index: 0 });

      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        generateXPath(elem);
        generateCSSPath(elem);
      }
      const duration = performance.now() - start;

      console.log(`  bare element fallback (10k iterations): ${duration.toFixed(2)}ms`);
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Nested DOM benchmarks', () => {
    it('should handle deep nested structures (depth=5, breadth=5 = ~3900 elements)', () => {
      const elements = buildNestedDOM(5, 5);

      const start = performance.now();
      for (const el of elements) {
        generateXPath(el);
        generateCSSPath(el);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(1000);
      console.log(`  Nested DOM (${elements.length} elements, depth=5): ${duration.toFixed(2)}ms`);
    });

    it('should handle wide shallow structures (depth=2, breadth=50 = ~2500 elements)', () => {
      const elements = buildNestedDOM(2, 50);

      const start = performance.now();
      for (const el of elements) {
        generateXPath(el);
        generateCSSPath(el);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(500);
      console.log(
        `  Wide shallow DOM (${elements.length} elements, breadth=50): ${duration.toFixed(2)}ms`
      );
    });
  });
});
