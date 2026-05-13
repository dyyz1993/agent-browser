import type { Page, Frame, FrameLocator } from 'playwright-core';
import type { RefMap, SnapshotOptions } from './types.js';

export async function findCursorInteractiveElements(
  page: Page | Frame,
  selector?: string
): Promise<
  Array<{
    selector: string;
    text: string;
    tagName: string;
    hasOnClick: boolean;
    hasCursorPointer: boolean;
    hasTabIndex: boolean;
  }>
> {
  const rootSelector = selector || 'body';

  const scriptBody = `(rootSel) => {
    const results = [];

    const interactiveRoles = new Set([
      'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox',
      'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'searchbox',
      'slider', 'spinbutton', 'switch', 'tab', 'treeitem'
    ]);

    const interactiveTags = new Set([
      'a', 'button', 'input', 'select', 'textarea', 'details', 'summary'
    ]);

    const root = document.querySelector(rootSel) || document.body;
    const allElements = root.querySelectorAll('*');

    const buildSelector = (el) => {
      const testId = el.getAttribute('data-testid');
      if (testId) return '[data-testid="' + testId + '"]';
      if (el.id) return '#' + CSS.escape(el.id);

      const path = [];
      let current = el;
      while (current && current !== document.body) {
        let sel = current.tagName.toLowerCase();
        const classes = Array.from(current.classList).filter(c => c.trim());
        if (classes.length > 0) sel += '.' + CSS.escape(classes[0]);

        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children);
          const matching = siblings.filter(s => {
            if (s.tagName !== current.tagName) return false;
            if (classes.length > 0 && !s.classList.contains(classes[0])) return false;
            return true;
          });
          if (matching.length > 1) {
            const idx = matching.indexOf(current) + 1;
            sel += ':nth-of-type(' + idx + ')';
          }
        }
        path.unshift(sel);
        current = current.parentElement;
        if (path.length >= 3) break;
      }
      return path.join(' > ');
    };

    const clickableClassPatterns = [
      /tab/i,
      /btn/i,
      /button/i,
      /clickable/i,
      /action/i,
      /menuitem/i,
      /navitem/i,
      /listitem/i,
      /card/i,
      /toggle/i,
      /switch/i,
      /dropdown/i,
      /modal/i,
      /popup/i,
      /close/i,
      /dismiss/i,
      /expand/i,
      /collapse/i,
    ];

    const hasClickableClassName = (el) => {
      const className = el.getAttribute('class') || '';
      const classes = className.split(/\s+/);
      return classes.some(cls => clickableClassPatterns.some(p => p.test(cls)));
    };

    const hasFrameworkEventHandler = (el) => {
      const attrs = el.attributes;
      for (let i = 0; i < attrs.length; i++) {
        const name = attrs[i].name;
        if (name.startsWith('data-v-')) return true;
        if (name.startsWith('data-reactid')) return true;
      }
      return false;
    };

    for (const el of allElements) {
      const tagName = el.tagName.toLowerCase();
      if (interactiveTags.has(tagName)) continue;

      const role = el.getAttribute('role');
      if (role && interactiveRoles.has(role.toLowerCase())) continue;

      const computedStyle = getComputedStyle(el);
      const hasCursorPointer = computedStyle.cursor === 'pointer';
      const hasOnClick = el.hasAttribute('onclick') || el.onclick !== null;
      const tabIndex = el.getAttribute('tabindex');
      const hasTabIndex = tabIndex !== null && tabIndex !== '-1';

      const looksClickable = hasClickableClassName(el);
      const hasFrameworkEvent = hasFrameworkEventHandler(el);

      const isClickable = hasCursorPointer || hasOnClick || hasTabIndex || looksClickable;
      if (!isClickable) continue;

      let text = '';
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent || '';
        }
      }
      text = text.trim();

      if (!text && el.children.length === 1) {
        const child = el.children[0];
        if (child.tagName === 'SPAN' || child.tagName === 'A' || child.tagName === 'LABEL') {
          text = (child.textContent || '').trim();
        }
      }

      if (!text) continue;

      if (text.length > 30) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const trulyClickable = hasCursorPointer || hasOnClick || hasTabIndex || looksClickable;

      results.push({
        selector: buildSelector(el),
        text,
        tagName,
        hasOnClick,
        hasCursorPointer: trulyClickable,
        hasTabIndex
      });
    }
    return results;
  }`;

  const fn = new Function('return ' + scriptBody)();
  return page.evaluate(fn, rootSelector);
}

export async function enrichRefsWithPathsAndAttrs(
  page: Page | Frame | FrameLocator,
  refs: RefMap,
  options: SnapshotOptions
): Promise<void> {
  if (Object.keys(refs).length === 0) {
    return;
  }

  const injectScript = `
    window.__AGENT_BROWSER_REFS__ = ${JSON.stringify(refs)};
  `;
  if ('evaluate' in page) {
    await page.evaluate(injectScript);
  }

  const elementData = await (page as Page).evaluate<
    Record<string, { xpath: string; cssPath: string; attributes: Record<string, string> }>
  >(() => {
    const STYLE_CLASS_PATTERNS = [
      /^(flex|grid|block|inline|hidden)$/,
      /^(mt|mb|ml|mr|mx|my|pt|pb|pl|pr|px|py)-?\d*$/,
      /^(w|h|min|max)-/,
      /^(text|font|bg|border)-/,
      /^(rounded|shadow|opacity)-/,
      /^(hover|focus|active):/,
      /^(items|justify|gap|space)-/,
      /^(p|m)-\d*$/,
      /^transition/,
      /^duration/,
      /^ease/,
      /^transform/,
      /^scale|rotate|translate/,
    ];

    const SEMANTIC_TAGS = new Set([
      'main',
      'nav',
      'header',
      'footer',
      'article',
      'section',
      'aside',
      'form',
    ]);

    function getSemanticClass(element: Element): string | null {
      const className = element.getAttribute('class');
      if (!className) return null;
      const classes = className.split(/\s+/).filter((cls: string) => {
        return !STYLE_CLASS_PATTERNS.some((p) => p.test(cls));
      });
      if (classes.length === 0) return null;
      const selectedClasses = classes.slice(0, 2);
      return selectedClasses.map((cls: string) => 'contains(@class, "' + cls + '")').join(' and ');
    }

    function getElementIndex(element: Element): number {
      const parent = element.parentElement;
      if (!parent) return 1;
      const siblings = Array.from(parent.children).filter(
        (child: Element) => child.tagName === element.tagName
      );
      return siblings.indexOf(element) + 1;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function buildRelativeXPath(element: any, maxDepth: number): string {
      const path: string[] = [];
      let current = element;
      let depth = 0;
      while (current && depth < maxDepth) {
        if (current.id) {
          path.unshift('//*[@id="' + current.id + '"]');
          break;
        }
        const testId = current.getAttribute('data-testid');
        if (testId) {
          path.unshift('//*[@data-testid="' + testId + '"]');
          break;
        }
        const tagName = current.tagName.toLowerCase();
        if (SEMANTIC_TAGS.has(tagName)) {
          const index = getElementIndex(current);
          path.unshift('//' + tagName + '[' + index + ']');
          break;
        }
        const index = getElementIndex(current);
        path.unshift(tagName + '[' + index + ']');
        current = current.parentElement;
        depth++;
      }
      if (path.length > 0 && !path[0].startsWith('//')) {
        path.unshift('//');
      }
      return path.join('/');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function generateXPath(element: any, maxDepth: number): string {
      if (element.id) return '//*[@id="' + element.id + '"]';
      const testId = element.getAttribute('data-testid');
      if (testId) return '//*[@data-testid="' + testId + '"]';
      const dataId = element.getAttribute('data-id');
      if (dataId) return '//*[@data-id="' + dataId + '"]';
      const semanticClass = getSemanticClass(element);
      if (semanticClass) return '//' + element.tagName.toLowerCase() + '[' + semanticClass + ']';
      return buildRelativeXPath(element, maxDepth);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function buildElementSelector(element: any): string {
      const tagName = element.tagName.toLowerCase();
      const className = element.getAttribute('class');
      if (className) {
        const classes = className.split(/\s+/).filter((cls: string) => {
          return !STYLE_CLASS_PATTERNS.some((p) => p.test(cls));
        });
        if (classes.length > 0) {
          return tagName + '.' + classes.slice(0, 2).join('.');
        }
      }
      const parent = element.parentElement;
      if (parent) {
        const index = Array.from(parent.children).indexOf(element) + 1;
        return tagName + ':nth-child(' + index + ')';
      }
      return tagName;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function generateCSSPath(element: any, maxDepth: number): string {
      if (element.id) return '#' + element.id;
      const testId = element.getAttribute('data-testid');
      if (testId) return '[data-testid="' + testId + '"]';
      const path: string[] = [];
      let current = element;
      let depth = 0;
      while (current && depth < maxDepth) {
        if (current.id) {
          path.unshift('#' + current.id);
          break;
        }
        const testId = current.getAttribute('data-testid');
        if (testId) {
          path.unshift('[data-testid="' + testId + '"]');
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function collectAttributes(element: any): Record<string, string> {
      const attrs: Record<string, string> = {};
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        attrs[attr.name] = attr.value;
      }
      return attrs;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function getImplicitRole(element: any): string | null {
      const tag = element.tagName.toLowerCase();
      const type = element.getAttribute('type');

      const explicitRole = element.getAttribute('role');
      if (explicitRole) return explicitRole.toLowerCase();

      if (tag === 'a' && element.hasAttribute('href')) return 'link';
      if (tag === 'button') return 'button';
      if (tag === 'input') {
        if (type === 'button' || type === 'submit' || type === 'reset') return 'button';
        if (type === 'checkbox') return 'checkbox';
        if (type === 'radio') return 'radio';
        if (type === 'file') return 'button';
        if (type === 'range') return 'slider';
        if (type === 'number') return 'spinbutton';
        return 'textbox';
      }
      if (tag === 'textarea') return 'textbox';
      if (tag === 'select') return 'combobox';
      if (tag === 'img' && element.hasAttribute('alt')) return 'img';
      if (/^h[1-6]$/.test(tag)) return 'heading';
      if (tag === 'nav') return 'navigation';
      if (tag === 'main') return 'main';
      if (tag === 'article') return 'article';
      if (tag === 'section') return 'section';
      if (tag === 'form') return 'form';
      if (tag === 'ul' || tag === 'ol') return 'list';
      if (tag === 'li') return 'listitem';

      return null;
    }

    const results: Record<
      string,
      { xpath: string; cssPath: string; attributes: Record<string, string> }
    > = {};
    const refEntries = Object.entries(
      (window as unknown as Record<string, unknown>).__AGENT_BROWSER_REFS__ || {}
    ) as [string, { role: string; name: string; nth?: number }][];

    for (const [ref, data] of refEntries) {
      const targetRole = data.role;
      const targetName = data.name;
      const nth = data.nth;

      const elements: Element[] = [];
      const allElements = Array.from(document.querySelectorAll('*'));

      for (const el of allElements) {
        const elRole = getImplicitRole(el);
        if (elRole !== targetRole && targetRole !== 'clickable' && targetRole !== 'focusable')
          continue;

        let elName =
          el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt') || '';

        if (!elName) {
          if (targetRole === 'heading') {
            elName = el.textContent?.trim() || '';
          } else if (targetRole === 'link' || el.tagName.toLowerCase() === 'a') {
            elName = el.textContent?.trim() || '';
            if (!elName) {
              const img = el.querySelector('img[alt]');
              if (img) elName = img.getAttribute('alt') || '';
            }
          } else if (targetRole === 'button') {
            elName = el.textContent?.trim() || el.getAttribute('value') || '';
            if (
              !elName &&
              el.tagName.toLowerCase() === 'input' &&
              el.getAttribute('type') === 'file'
            ) {
              elName = 'choose file';
            }
          } else if (targetRole === 'textbox') {
            elName = el.getAttribute('placeholder') || '';
            const label = (el as HTMLInputElement).labels?.[0]?.textContent?.trim();
            if (label) elName = label;
          } else {
            elName = el.textContent?.trim().slice(0, 100) || '';
          }
        }

        if (targetName) {
          const normalizedElName = elName.toLowerCase().trim();
          const normalizedTargetName = targetName.toLowerCase().trim();
          if (
            normalizedElName !== normalizedTargetName &&
            !normalizedElName.includes(normalizedTargetName)
          ) {
            continue;
          }
        }

        elements.push(el);
      }

      if (elements.length > 0) {
        const element = nth !== undefined ? elements[nth] : elements[0];
        if (element) {
          results[ref] = {
            xpath: generateXPath(element, 5),
            cssPath: generateCSSPath(element, 5),
            attributes: collectAttributes(element),
          };
        }
      }
    }

    return results;
  });

  if (!elementData || typeof elementData !== 'object') {
    return;
  }

  for (const [ref, data] of Object.entries(elementData)) {
    const typedData = data as {
      xpath?: string;
      cssPath?: string;
      attributes?: Record<string, string>;
    };
    if (refs[ref] && data) {
      if (options.path) {
        refs[ref].xpath = typedData.xpath;
        refs[ref].cssPath = typedData.cssPath;
      }
      if (options.attrs) {
        refs[ref].attributes = typedData.attributes;
      }
    }
  }
}
