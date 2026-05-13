import type { Page, Frame, FrameLocator } from 'playwright-core';
import type { RefMap, SnapshotOptions } from './types.js';
import { STYLE_CLASS_PATTERNS, SEMANTIC_TAGS } from './constants.js';

export function buildSelector(role: string, name?: string): string {
  if (name) {
    const escapedName = name.replace(/"/g, '\\"');
    return `getByRole('${role}', { name: "${escapedName}", exact: true })`;
  }
  return `getByRole('${role}')`;
}

export async function suggestSelectors(page: Page | Frame): Promise<string[]> {
  const selectors: string[] = [];

  try {
    const commonSelectors = [
      'body',
      'main',
      '#main',
      '#content',
      '.content',
      'article',
      'form',
      '#app',
      '.app',
    ];

    for (const selector of commonSelectors) {
      try {
        const locator = page.locator(selector);
        const count = await locator.count();
        if (count > 0) {
          selectors.push(selector);
        }
      } catch {}
    }

    if (selectors.length === 0) {
      selectors.push('body');
    }
  } catch {
    selectors.push('body');
  }

  return selectors;
}

export async function generateStableSelectors(
  page: Page | Frame,
  refs: RefMap
): Promise<Record<string, { cssSelector: string; xpath: string }>> {
  const result: Record<string, { cssSelector: string; xpath: string }> = {};

  for (const [ref, data] of Object.entries(refs)) {
    if (data.role === 'clickable' || data.role === 'focusable') {
      if (data.selector && !data.selector.startsWith('getByRole')) {
        result[ref] = { cssSelector: data.selector, xpath: '' };
      }
      continue;
    }

    try {
      let locator;
      if (data.name) {
        locator = page.getByRole(data.role as Parameters<typeof page.getByRole>[0], {
          name: data.name,
          exact: true,
        });
      } else {
        locator = page.getByRole(data.role as Parameters<typeof page.getByRole>[0]);
      }
      if (data.nth !== undefined) {
        locator = locator.nth(data.nth);
      }

      const elementCount = await locator.count();
      if (elementCount === 0) continue;

      const selectorData = await locator
        .evaluate((el: Element) => {
          const UTILITY_CLASS_PATTERNS = [
            /^_/,
            /^css-/,
            /^[a-z]{1,2}$/,
            /^(active|disabled|hidden|visible|selected|hover|focus|current|open|closed)$/i,
            /^(text-|font-|bg-|p-|m-|w-|h-|flex|grid|border|rounded|shadow|opacity|z-)/,
            /^(sm:|md:|lg:|xl:|2xl:)/,
          ];

          const SEMANTIC_ATTRS = [
            'data-testid',
            'data-test',
            'data-cy',
            'name',
            'aria-label',
            'aria-labelledby',
            'role',
            'type',
            'placeholder',
            'title',
            'alt',
          ];

          function isHighEntropyClassName(className: string): boolean {
            if (!className || className.length < 4 || className.length > 15) return false;
            if (/^[a-zA-Z]+_[a-zA-Z]+_{2}[a-zA-Z0-9]+$/.test(className)) return true;
            if (/^sc-[a-zA-Z0-9]+$/.test(className)) return true;
            const hasUpper = /[A-Z]/.test(className);
            const hasLower = /[a-z]/.test(className);
            const hasDigit = /[0-9]/.test(className);
            const hasSeparator = /[-_]/.test(className);
            if (hasSeparator) return false;
            if (hasUpper && hasLower && hasDigit) return true;
            if (/^[A-Z][a-z0-9]+[A-Z]/.test(className) && className.length <= 12) return true;
            if (/^[a-z]/.test(className) && /[a-z][A-Z][a-z][A-Z]/.test(className)) return true;
            return false;
          }

          function isUniqueSelector(selector: string): boolean {
            try {
              return document.querySelectorAll(selector).length === 1;
            } catch {
              return false;
            }
          }

          function filterUsefulClasses(element: Element): string[] {
            const htmlEl = element as HTMLElement;
            if (!htmlEl.className || typeof htmlEl.className !== 'string') return [];
            return htmlEl.className
              .trim()
              .split(/\s+/)
              .filter((c: string) => {
                if (!c) return false;
                if (UTILITY_CLASS_PATTERNS.some((p) => p.test(c))) return false;
                if (isHighEntropyClassName(c)) return false;
                return true;
              });
          }

          function tryIdSelector(element: Element): string | null {
            const htmlEl = element as HTMLElement;
            if (htmlEl.id) {
              const sel = '#' + CSS.escape(htmlEl.id);
              if (isUniqueSelector(sel)) return sel;
            }
            return null;
          }

          function getMultiAttributeSelector(element: Element): string | null {
            const tag = element.tagName.toLowerCase();
            const attrs: { attr: string; value: string }[] = [];
            for (const attr of SEMANTIC_ATTRS) {
              const value = element.getAttribute(attr);
              if (value) attrs.push({ attr, value });
            }
            if (attrs.length === 0) return null;
            for (const { attr, value } of attrs) {
              const sel = tag + '[' + attr + '="' + CSS.escape(value) + '"]';
              if (isUniqueSelector(sel)) return sel;
            }
            if (attrs.length >= 2) {
              for (let i = 0; i < attrs.length; i++) {
                for (let j = i + 1; j < attrs.length; j++) {
                  const sel =
                    tag +
                    '[' +
                    attrs[i].attr +
                    '="' +
                    CSS.escape(attrs[i].value) +
                    '"]' +
                    '[' +
                    attrs[j].attr +
                    '="' +
                    CSS.escape(attrs[j].value) +
                    '"]';
                  if (isUniqueSelector(sel)) return sel;
                }
              }
            }
            return null;
          }

          function getAttributeClassComboSelector(element: Element): string | null {
            const tag = element.tagName.toLowerCase();
            const classes = filterUsefulClasses(element);
            if (classes.length === 0) return null;
            classes.sort((a, b) => b.length - a.length);
            const bestClass = classes[0];
            for (const attr of SEMANTIC_ATTRS) {
              const value = element.getAttribute(attr);
              if (value) {
                const sel =
                  tag + '.' + CSS.escape(bestClass) + '[' + attr + '="' + CSS.escape(value) + '"]';
                if (isUniqueSelector(sel)) return sel;
              }
            }
            return null;
          }

          function getBestClassSelector(element: Element): string | null {
            const classes = filterUsefulClasses(element);
            if (classes.length === 0) return null;
            classes.sort((a, b) => b.length - a.length);
            const tag = element.tagName.toLowerCase();
            for (const cls of classes) {
              const sel = tag + '.' + CSS.escape(cls);
              if (isUniqueSelector(sel)) return sel;
            }
            for (let i = 2; i <= Math.min(3, classes.length); i++) {
              const sel =
                tag +
                '.' +
                classes
                  .slice(0, i)
                  .map((c) => CSS.escape(c))
                  .join('.');
              if (isUniqueSelector(sel)) return sel;
            }
            return null;
          }

          function getFeatureSelector(element: Element): string | null {
            if (!element || element === document.body) return null;
            const htmlEl = element as HTMLElement;
            if (htmlEl.id) return '#' + CSS.escape(htmlEl.id);
            for (const attr of ['data-testid', 'data-test', 'name', 'role', 'aria-label']) {
              const value = element.getAttribute(attr);
              if (value)
                return element.tagName.toLowerCase() + '[' + attr + '="' + CSS.escape(value) + '"]';
            }
            const classes = filterUsefulClasses(element);
            if (classes.length > 0) {
              classes.sort((a, b) => b.length - a.length);
              const sel = element.tagName.toLowerCase() + '.' + CSS.escape(classes[0]);
              if (isUniqueSelector(sel)) return sel;
            }
            return null;
          }

          function getBaseSelector(element: Element): string {
            let sel = element.tagName.toLowerCase();
            const classes = filterUsefulClasses(element);
            if (classes.length > 0) {
              classes.sort((a, b) => b.length - a.length);
              sel +=
                '.' +
                classes
                  .slice(0, 2)
                  .map((c) => CSS.escape(c))
                  .join('.');
            }
            return sel;
          }

          function makeUniqueWithNth(element: Element, baseSelector: string): string {
            const parent = element.parentElement;
            if (!parent) return baseSelector;
            const siblings = Array.from(parent.children);
            const sameTagSiblings = siblings.filter((s) => s.tagName === element.tagName);
            if (sameTagSiblings.length === 1) return baseSelector;
            const index = siblings.indexOf(element) + 1;
            return baseSelector + ':nth-child(' + index + ')';
          }

          function getSiblingBasedSelector(element: Element): string | null {
            let prevSibling = element.previousElementSibling;
            let attempts = 0;
            while (prevSibling && attempts < 3) {
              const siblingSelector = getFeatureSelector(prevSibling);
              if (siblingSelector && isUniqueSelector(siblingSelector)) {
                const elementSelector = getBaseSelector(element);
                const combined = siblingSelector + ' + ' + elementSelector;
                if (isUniqueSelector(combined)) return combined;
              }
              prevSibling = prevSibling.previousElementSibling;
              attempts++;
            }
            return null;
          }

          function buildComposedSelector(element: Element): string | null {
            const selfSelector = getBestClassSelector(element);
            if (selfSelector && isUniqueSelector(selfSelector)) return selfSelector;

            const parts: string[] = [];
            let current: Element | null = element;
            let depth = 0;
            const maxDepth = 3;

            while (current && current !== document.body && depth < maxDepth) {
              const featureSelector = getFeatureSelector(current);
              if (featureSelector) {
                parts.unshift(featureSelector);
                const elementSelector =
                  depth === 0 ? getBaseSelector(element) : getBaseSelector(current);
                const fullSelector = parts.join(' > ') + (depth > 0 ? '' : ' > ' + elementSelector);
                if (isUniqueSelector(fullSelector)) return fullSelector;
              } else {
                const baseSelector = getBaseSelector(current);
                const selector = makeUniqueWithNth(current, baseSelector);
                parts.unshift(selector);
                const fullSelector = parts.join(' > ');
                if (isUniqueSelector(fullSelector)) return fullSelector;
              }
              current = current.parentElement;
              depth++;
            }
            return parts.length > 0 ? parts.join(' > ') : null;
          }

          function tryNthChild(element: Element): string | null {
            const baseSelector = getBaseSelector(element);
            const uniqueSelector = makeUniqueWithNth(element, baseSelector);
            try {
              if (document.querySelectorAll(uniqueSelector).length === 1) return uniqueSelector;
            } catch {}
            return null;
          }

          function buildUniquePath(element: Element): string | null {
            const parts: string[] = [];
            let current: Element | null = element;
            let depth = 0;
            while (current && current !== document.body && depth < 5) {
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

          function generateXPath(element: Element): string {
            const htmlEl = element as HTMLElement;
            if (htmlEl.id) return '//*[@id="' + htmlEl.id + '"]';
            const testId = element.getAttribute('data-testid');
            if (testId) return '//*[@data-testid="' + testId + '"]';
            const nameAttr = element.getAttribute('name');
            if (nameAttr)
              return '//' + element.tagName.toLowerCase() + '[@name="' + nameAttr + '"]';
            const parts: string[] = [];
            let current: Element | null = element;
            let depth = 0;
            while (current && depth < 5) {
              const curHtml = current as HTMLElement;
              if (curHtml.id) {
                parts.unshift('//*[@id="' + curHtml.id + '"]');
                break;
              }
              const testId = current.getAttribute('data-testid');
              if (testId) {
                parts.unshift('//*[@data-testid="' + testId + '"]');
                break;
              }
              const tagName = current.tagName.toLowerCase();
              const parent = current.parentElement;
              if (parent) {
                const siblings = Array.from(parent.children).filter(
                  (c) => c.tagName === (current as Element).tagName
                );
                const index = siblings.indexOf(current) + 1;
                parts.unshift(tagName + '[' + index + ']');
              } else {
                parts.unshift(tagName);
              }
              current = current.parentElement;
              depth++;
            }
            if (parts.length > 0 && !parts[0].startsWith('//')) parts.unshift('//');
            return parts.join('/');
          }

          let cssSelector: string | null = null;

          cssSelector = tryIdSelector(el);
          if (!cssSelector) cssSelector = getMultiAttributeSelector(el);
          if (!cssSelector) cssSelector = getAttributeClassComboSelector(el);
          if (!cssSelector) cssSelector = getBestClassSelector(el);
          if (!cssSelector) cssSelector = getSiblingBasedSelector(el);
          if (!cssSelector) cssSelector = buildComposedSelector(el);
          if (!cssSelector) cssSelector = tryNthChild(el);
          if (!cssSelector) cssSelector = buildUniquePath(el);

          if (!cssSelector) cssSelector = el.tagName.toLowerCase();

          const xpath = generateXPath(el);

          return { cssSelector, xpath };
        })
        .catch(() => null);

      if (selectorData) {
        result[ref] = {
          cssSelector: selectorData.cssSelector,
          xpath: selectorData.xpath,
        };
      }
    } catch {}
  }

  return result;
}

async function buildCompactSelectors(
  page: Page | Frame,
  refs: RefMap,
  options?: { all?: boolean }
): Promise<string> {
  const entries = Object.entries(refs);
  const parts: string[] = [];
  const includeAll = options?.all ?? false;

  for (const [ref, data] of entries) {
    if (data.role === 'clickable' || data.role === 'focusable') continue;

    try {
      let locator;
      if (data.name) {
        locator = page.getByRole(data.role as Parameters<typeof page.getByRole>[0], {
          name: data.name,
          exact: true,
        });
      } else {
        locator = page.getByRole(data.role as Parameters<typeof page.getByRole>[0]);
      }
      if (data.nth !== undefined) locator = locator.nth(data.nth);

      if (!includeAll) {
        const isReallyVisible = await locator
          .evaluate((el: Element) => {
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return !(
              style.display === 'none' ||
              style.visibility === 'hidden' ||
              parseFloat(style.opacity) === 0 ||
              (rect.width === 0 && rect.height === 0) ||
              rect.x + rect.width < 0 ||
              rect.y + rect.height < 0
            );
          })
          .catch(() => false);
        if (!isReallyVisible) continue;
      }

      const attrs = await locator
        .evaluate((el: Element) => {
          const htmlEl = el as HTMLElement;
          const r: Record<string, string> = {};
          if (htmlEl.dataset.testid) r['testid'] = `[data-testid="${htmlEl.dataset.testid}"]`;
          if (htmlEl.id && !htmlEl.id.match(/^[:]/)) r['id'] = '#' + CSS.escape(htmlEl.id);
          const nameAttr = htmlEl.getAttribute('name');
          if (nameAttr) r['name'] = `${htmlEl.tagName.toLowerCase()}[name="${nameAttr}"]`;
          return r;
        })
        .catch(() => null);

      if (!attrs) continue;

      let bestSelector = '';
      if (attrs.testid) bestSelector = attrs.testid;
      else if (attrs.id) bestSelector = attrs.id;
      else if (attrs.name) bestSelector = attrs.name;

      if (bestSelector) {
        parts.push(`${ref}: ${bestSelector}`);
      }
    } catch {}
  }

  return parts.join(' | ');
}

export { buildCompactSelectors };

export function getSemanticClass(element: Element): string | null {
  const className = element.getAttribute('class');
  if (!className) return null;

  const classes = className.split(/\s+/).filter((cls) => {
    return !STYLE_CLASS_PATTERNS.some((p) => p.test(cls));
  });

  if (classes.length === 0) return null;

  const selectedClasses = classes.slice(0, 2);
  return selectedClasses.map((cls) => `contains(@class, "${cls}")`).join(' and ');
}

export function generateXPath(element: Element, maxDepth: number = 5): string {
  const elemId = (element as HTMLElement).id;
  if (elemId) {
    return `//*[@id="${elemId}"]`;
  }

  const testId = element.getAttribute('data-testid');
  if (testId) {
    return `//*[@data-testid="${testId}"]`;
  }

  const dataId = element.getAttribute('data-id');
  if (dataId) {
    return `//*[@data-id="${dataId}"]`;
  }

  const semanticClass = getSemanticClass(element);
  if (semanticClass) {
    return `//${element.tagName.toLowerCase()}[${semanticClass}]`;
  }

  return buildRelativeXPath(element, maxDepth);
}

function buildRelativeXPath(element: Element, maxDepth: number): string {
  const path: string[] = [];
  let current: Element | null = element;
  let depth = 0;

  while (current && depth < maxDepth) {
    const currentId = (current as HTMLElement).id;
    if (currentId) {
      path.unshift(`//*[@id="${currentId}"]`);
      break;
    }

    const testId = current.getAttribute('data-testid');
    if (testId) {
      path.unshift(`//*[@data-testid="${testId}"]`);
      break;
    }

    const tagName = current.tagName.toLowerCase();

    if (SEMANTIC_TAGS.has(tagName)) {
      const index = getElementIndex(current);
      path.unshift(`//${tagName}[${index}]`);
      break;
    }

    const index = getElementIndex(current);
    path.unshift(`${tagName}[${index}]`);

    current = current.parentElement;
    depth++;
  }

  if (path.length > 0 && !path[0].startsWith('//')) {
    path.unshift('//');
  }

  return path.join('/');
}

function getElementIndex(element: Element): number {
  const parent = element.parentElement;
  if (!parent) return 1;

  const siblings = Array.from(parent.children).filter((child) => child.tagName === element.tagName);

  return siblings.indexOf(element) + 1;
}

export function generateCSSPath(element: Element, maxDepth: number = 5): string {
  const elemId = (element as HTMLElement).id;
  if (elemId) {
    return `#${elemId}`;
  }

  const testId = element.getAttribute('data-testid');
  if (testId) {
    return `[data-testid="${testId}"]`;
  }

  const path: string[] = [];
  let current: Element | null = element;
  let depth = 0;

  while (current && depth < maxDepth) {
    const currentId = (current as HTMLElement).id;
    if (currentId) {
      path.unshift(`#${currentId}`);
      break;
    }

    const testId = current.getAttribute('data-testid');
    if (testId) {
      path.unshift(`[data-testid="${testId}"]`);
      break;
    }

    const tagName = current.tagName.toLowerCase();

    if (SEMANTIC_TAGS.has(tagName)) {
      path.unshift(tagName);
      break;
    }

    const selector = buildElementSelector(current);
    path.unshift(selector);

    current = current.parentElement;
    depth++;
  }

  return path.join(' > ');
}

function buildElementSelector(element: Element): string {
  const tagName = element.tagName.toLowerCase();
  const className = element.getAttribute('class');

  if (className) {
    const classes = className.split(/\s+/).filter((cls) => {
      return !STYLE_CLASS_PATTERNS.some((p) => p.test(cls));
    });

    if (classes.length > 0) {
      return `${tagName}.${classes.slice(0, 2).join('.')}`;
    }
  }

  const parent = element.parentElement;
  if (parent) {
    const index = Array.from(parent.children).indexOf(element) + 1;
    return `${tagName}:nth-child(${index})`;
  }

  return tagName;
}

export function collectAttributes(element: Element): Record<string, string> {
  const attrs: Record<string, string> = {};

  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i];
    attrs[attr.name] = attr.value;
  }

  return attrs;
}
