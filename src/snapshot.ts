/**
 * Enhanced snapshot with element refs for deterministic element selection.
 *
 * This module generates accessibility snapshots with embedded refs that can be
 * used to click/fill/interact with elements without re-querying the DOM.
 *
 * Example output:
 *   - heading "Example Domain" [ref=e1] [level=1]
 *   - paragraph: Some text content
 *   - button "Submit" [ref=e2]
 *   - textbox "Email" [ref=e3]
 *
 * Usage:
 *   agent-browser snapshot              # Full snapshot
 *   agent-browser snapshot -i           # Interactive elements only
 *   agent-browser snapshot --depth 3    # Limit depth
 *   agent-browser click @e2             # Click element by ref
 */

import type { Page, Frame, Locator, FrameLocator } from 'playwright-core';

export interface RefMap {
  [ref: string]: {
    selector: string;
    role: string;
    name?: string;
    /** Index for disambiguation when multiple elements have same role+name */
    nth?: number;
    /** XPath path (only when path=true) */
    xpath?: string;
    /** CSS selector path (only when path=true) */
    cssPath?: string;
    /** Element attributes (only when attrs=true) */
    attributes?: Record<string, string>;
  };
}

export interface EnhancedSnapshot {
  tree: string;
  refs: RefMap;
}

export interface SnapshotOptions {
  /** Only include interactive elements (buttons, links, inputs, etc.) */
  interactive?: boolean;
  /** Include cursor-interactive elements (cursor:pointer, onclick, tabindex) */
  cursor?: boolean;
  /** Maximum depth of tree to include (0 = root only) */
  maxDepth?: number;
  /** Remove structural elements without meaningful content */
  compact?: boolean;
  /** CSS selector to scope the snapshot */
  selector?: string;
  /** Include xpath and cssPath in refs (requires selector) */
  path?: boolean;
  /** Include element attributes in refs (requires selector) */
  attrs?: boolean;
}

// Counter for generating refs
let refCounter = 0;

/**
 * Reset ref counter (call at start of each snapshot)
 */
export function resetRefs(): void {
  refCounter = 0;
}

/**
 * Generate next ref ID
 */
function nextRef(): string {
  return `e${++refCounter}`;
}

/**
 * Roles that are interactive and should get refs
 */
const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'treeitem',
]);

/**
 * Roles that provide structure/context (get refs for text extraction)
 */
const CONTENT_ROLES = new Set([
  'heading',
  'cell',
  'gridcell',
  'columnheader',
  'rowheader',
  'listitem',
  'article',
  'region',
  'main',
  'navigation',
]);

/**
 * Roles that are purely structural (can be filtered in compact mode)
 */
const STRUCTURAL_ROLES = new Set([
  'generic',
  'group',
  'list',
  'table',
  'row',
  'rowgroup',
  'grid',
  'treegrid',
  'menu',
  'menubar',
  'toolbar',
  'tablist',
  'tree',
  'directory',
  'document',
  'application',
  'presentation',
  'none',
]);

/**
 * Build a selector string for storing in ref map
 */
function buildSelector(role: string, name?: string): string {
  if (name) {
    const escapedName = name.replace(/"/g, '\\"');
    return `getByRole('${role}', { name: "${escapedName}", exact: true })`;
  }
  return `getByRole('${role}')`;
}

/**
 * Query the page for clickable elements that might not have proper ARIA roles.
 * This finds elements with cursor: pointer or onclick handlers.
 */
async function findCursorInteractiveElements(
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

  // Use a string function body to avoid TypeScript transpilation issues
  const scriptBody = `(rootSel) => {
    const results = [];

    // Elements that already have interactive ARIA roles - skip these
    const interactiveRoles = new Set([
      'button', 'link', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox',
      'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'searchbox',
      'slider', 'spinbutton', 'switch', 'tab', 'treeitem'
    ]);

    // Tags that are already interactive by default
    const interactiveTags = new Set([
      'a', 'button', 'input', 'select', 'textarea', 'details', 'summary'
    ]);

    const root = document.querySelector(rootSel) || document.body;
    const allElements = root.querySelectorAll('*');

    // Build a unique selector for an element
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

      if (!hasCursorPointer && !hasOnClick && !hasTabIndex) continue;

      const text = (el.textContent || '').trim().slice(0, 100);
      if (!text) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      results.push({
        selector: buildSelector(el),
        text,
        tagName,
        hasOnClick,
        hasCursorPointer,
        hasTabIndex
      });
    }
    return results;
  }`;

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fn = new Function('return ' + scriptBody)();
  return page.evaluate(fn, rootSelector);
}

/**
 * Suggest common selectors for the current page
 */
async function suggestSelectors(page: Page | Frame): Promise<string[]> {
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
      } catch {
        // Ignore errors
      }
    }

    if (selectors.length === 0) {
      selectors.push('body');
    }
  } catch {
    selectors.push('body');
  }

  return selectors;
}

/**
 * Get enhanced snapshot with refs and optional filtering
 */
export async function getEnhancedSnapshot(
  page: Page | Frame | FrameLocator,
  options: SnapshotOptions = {}
): Promise<EnhancedSnapshot> {
  if ((options.path || options.attrs) && !options.selector) {
    throw new Error('由于内容可能过大，请使用 selector 参数限定范围');
  }

  resetRefs();
  const refs: RefMap = {};

  const locator = options.selector ? page.locator(options.selector) : page.locator(':root');

  let ariaTree: string | null;
  try {
    ariaTree = await locator.ariaSnapshot({ timeout: 2000 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('Timeout') && options.selector) {
      const suggestedSelectors = await suggestSelectors(page as Page | Frame);
      return {
        tree: `(no elements found for selector: ${options.selector})\n\nSuggested selectors: ${suggestedSelectors.join(', ')}`,
        refs: {},
      };
    }
    throw error;
  }

  if (!ariaTree) {
    return {
      tree: '(empty)',
      refs: {},
    };
  }

  const enhancedTree = processAriaTree(ariaTree, refs, options);

  if (options.cursor) {
    const cursorElements = await findCursorInteractiveElements(
      page as Page | Frame,
      options.selector
    );

    const existingTexts = new Set(Object.values(refs).map((r) => r.name?.toLowerCase()));

    const additionalLines: string[] = [];
    for (const el of cursorElements) {
      if (existingTexts.has(el.text.toLowerCase())) continue;

      const ref = nextRef();
      const role = el.hasCursorPointer ? 'clickable' : el.hasOnClick ? 'clickable' : 'focusable';

      refs[ref] = {
        selector: el.selector,
        role: role,
        name: el.text,
      };

      const hints: string[] = [];
      if (el.hasCursorPointer) hints.push('cursor:pointer');
      if (el.hasOnClick) hints.push('onclick');
      if (el.hasTabIndex) hints.push('tabindex');

      additionalLines.push(`- ${role} "${el.text}" [ref=${ref}] [${hints.join(', ')}]`);
    }

    if (additionalLines.length > 0) {
      const separator =
        enhancedTree === '(no interactive elements)' ? '' : '\n# Cursor-interactive elements:\n';
      const base = enhancedTree === '(no interactive elements)' ? '' : enhancedTree;
      return {
        tree: base + separator + additionalLines.join('\n'),
        refs,
      };
    }
  }

  if (options.path || options.attrs) {
    await enrichRefsWithPathsAndAttrs(page, refs, options);
  }

  return { tree: enhancedTree, refs };
}

async function enrichRefsWithPathsAndAttrs(
  page: Page | Frame | FrameLocator,
  refs: RefMap,
  options: SnapshotOptions
): Promise<void> {
  if (Object.keys(refs).length === 0) {
    return;
  }

  const scriptBody = `
    () => {
      const STYLE_CLASS_PATTERNS = [
        /^(flex|grid|block|inline|hidden)$/,
        /^(mt|mb|ml|mr|mx|my|pt|pb|pl|pr|px|py)-?\\d*$/,
        /^(w|h|min|max)-/,
        /^(text|font|bg|border)-/,
        /^(rounded|shadow|opacity)-/,
        /^(hover|focus|active):/,
        /^(items|justify|gap|space)-/,
        /^(p|m)-\\d*$/,
        /^transition/,
        /^duration/,
        /^ease/,
        /^transform/,
        /^scale|rotate|translate/,
      ];

      const SEMANTIC_TAGS = new Set([
        'main', 'nav', 'header', 'footer', 'article', 'section', 'aside', 'form'
      ]);

      function getSemanticClass(element) {
        const className = element.getAttribute('class');
        if (!className) return null;
        const classes = className.split(/\\s+/).filter(cls => {
          return !STYLE_CLASS_PATTERNS.some(p => p.test(cls));
        });
        if (classes.length === 0) return null;
        const selectedClasses = classes.slice(0, 2);
        return selectedClasses.map(cls => 'contains(@class, "' + cls + '")').join(' and ');
      }

      function getElementIndex(element) {
        const parent = element.parentElement;
        if (!parent) return 1;
        const siblings = Array.from(parent.children).filter(
          child => child.tagName === element.tagName
        );
        return siblings.indexOf(element) + 1;
      }

      function buildRelativeXPath(element, maxDepth) {
        const path = [];
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

      function generateXPath(element, maxDepth) {
        if (element.id) return '//*[@id="' + element.id + '"]';
        const testId = element.getAttribute('data-testid');
        if (testId) return '//*[@data-testid="' + testId + '"]';
        const dataId = element.getAttribute('data-id');
        if (dataId) return '//*[@data-id="' + dataId + '"]';
        const semanticClass = getSemanticClass(element);
        if (semanticClass) return '//' + element.tagName.toLowerCase() + '[' + semanticClass + ']';
        return buildRelativeXPath(element, maxDepth);
      }

      function buildElementSelector(element) {
        const tagName = element.tagName.toLowerCase();
        const className = element.getAttribute('class');
        if (className) {
          const classes = className.split(/\\s+/).filter(cls => {
            return !STYLE_CLASS_PATTERNS.some(p => p.test(cls));
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

      function generateCSSPath(element, maxDepth) {
        if (element.id) return '#' + element.id;
        const testId = element.getAttribute('data-testid');
        if (testId) return '[data-testid="' + testId + '"]';
        const path = [];
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

      function collectAttributes(element) {
        const attrs = {};
        for (let i = 0; i < element.attributes.length; i++) {
          const attr = element.attributes[i];
          attrs[attr.name] = attr.value;
        }
        return attrs;
      }

      // Map role to implicit tag names
      const roleToTag = {
        'heading': ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
        'link': ['a'],
        'button': ['button', 'input[type="button"]', 'input[type="submit"]'],
        'textbox': ['input[type="text"]', 'input:not([type])', 'textarea'],
        'checkbox': ['input[type="checkbox"]'],
        'radio': ['input[type="radio"]'],
        'listitem': ['li'],
        'list': ['ul', 'ol'],
        'navigation': ['nav'],
        'main': ['main'],
        'article': ['article'],
        'section': ['section'],
        'form': ['form'],
      };

      function getImplicitRole(element) {
        const tag = element.tagName.toLowerCase();
        const type = element.getAttribute('type');
        
        // Check explicit role first
        const explicitRole = element.getAttribute('role');
        if (explicitRole) return explicitRole.toLowerCase();
        
        // Check implicit roles
        if (tag === 'a' && element.hasAttribute('href')) return 'link';
        if (tag === 'button') return 'button';
        if (tag === 'input') {
          if (type === 'button' || type === 'submit' || type === 'reset') return 'button';
          if (type === 'checkbox') return 'checkbox';
          if (type === 'radio') return 'radio';
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

      const results = {};
      const refEntries = Object.entries(window.__AGENT_BROWSER_REFS__ || {});
      
      for (const [ref, data] of refEntries) {
        const targetRole = data.role;
        const targetName = data.name;
        const nth = data.nth;
        
        // Find matching elements
        let elements = [];
        const allElements = document.querySelectorAll('*');
        
        for (const el of allElements) {
          const elRole = getImplicitRole(el);
          if (elRole !== targetRole && targetRole !== 'clickable' && targetRole !== 'focusable') continue;
          
          // Get accessible name
          let elName = el.getAttribute('aria-label') || 
                       el.getAttribute('title') || 
                       el.getAttribute('alt') || '';
          
          if (!elName) {
            // For heading, use text content
            if (targetRole === 'heading') {
              elName = el.textContent?.trim() || '';
            }
            // For link, use text content
            else if (targetRole === 'link' || el.tagName.toLowerCase() === 'a') {
              elName = el.textContent?.trim() || '';
              // Also check img alt inside link
              if (!elName) {
                const img = el.querySelector('img[alt]');
                if (img) elName = img.getAttribute('alt') || '';
              }
            }
            // For button, use text or value
            else if (targetRole === 'button') {
              elName = el.textContent?.trim() || el.getAttribute('value') || '';
            }
            // For textbox, use label or placeholder
            else if (targetRole === 'textbox') {
              elName = el.getAttribute('placeholder') || '';
              const label = el.labels?.[0]?.textContent?.trim();
              if (label) elName = label;
            }
            else {
              elName = el.textContent?.trim().slice(0, 100) || '';
            }
          }
          
          // Match name
          if (targetName) {
            const normalizedElName = elName.toLowerCase().trim();
            const normalizedTargetName = targetName.toLowerCase().trim();
            if (normalizedElName !== normalizedTargetName && !normalizedElName.includes(normalizedTargetName)) {
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
    }
  `;

  const injectScript = `
    window.__AGENT_BROWSER_REFS__ = ${JSON.stringify(refs)};
  `;
  await (page as any).evaluate(injectScript);

  // Evaluate the function in the browser context
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elementData = await (page as any).evaluate(() => {
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function getSemanticClass(element: any): string | null {
      const className = element.getAttribute('class');
      if (!className) return null;
      const classes = className.split(/\s+/).filter((cls: string) => {
        return !STYLE_CLASS_PATTERNS.some((p) => p.test(cls));
      });
      if (classes.length === 0) return null;
      const selectedClasses = classes.slice(0, 2);
      return selectedClasses.map((cls: string) => 'contains(@class, "' + cls + '")').join(' and ');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function getElementIndex(element: any): number {
      const parent = element.parentElement;
      if (!parent) return 1;
      const siblings = Array.from(parent.children).filter(
        (child: any) => child.tagName === element.tagName
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

    const results: Record<string, any> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refEntries = Object.entries((window as any).__AGENT_BROWSER_REFS__ || {});

    for (const [ref, data] of refEntries) {
      const targetRole = (data as any).role;
      const targetName = (data as any).name;
      const nth = (data as any).nth;

      const elements: any[] = [];
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
          } else if (targetRole === 'textbox') {
            elName = el.getAttribute('placeholder') || '';
            const label = (el as any).labels?.[0]?.textContent?.trim();
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
    if (refs[ref] && data) {
      if (options.path) {
        refs[ref].xpath = (data as any).xpath;
        refs[ref].cssPath = (data as any).cssPath;
      }
      if (options.attrs) {
        refs[ref].attributes = (data as any).attributes;
      }
    }
  }
}

/**
 * Track role+name combinations to detect duplicates
 */
interface RoleNameTracker {
  counts: Map<string, number>;
  /** Maps role+name key to array of ref IDs that use it */
  refsByKey: Map<string, string[]>;
  getKey(role: string, name?: string): string;
  getNextIndex(role: string, name?: string): number;
  trackRef(role: string, name: string | undefined, ref: string): void;
  /** Get all role+name keys that have duplicates */
  getDuplicateKeys(): Set<string>;
}

function createRoleNameTracker(): RoleNameTracker {
  const counts = new Map<string, number>();
  const refsByKey = new Map<string, string[]>();
  return {
    counts,
    refsByKey,
    getKey(role: string, name?: string): string {
      return `${role}:${name ?? ''}`;
    },
    getNextIndex(role: string, name?: string): number {
      const key = this.getKey(role, name);
      const current = counts.get(key) ?? 0;
      counts.set(key, current + 1);
      return current;
    },
    trackRef(role: string, name: string | undefined, ref: string): void {
      const key = this.getKey(role, name);
      const refs = refsByKey.get(key) ?? [];
      refs.push(ref);
      refsByKey.set(key, refs);
    },
    getDuplicateKeys(): Set<string> {
      const duplicates = new Set<string>();
      for (const [key, refs] of refsByKey) {
        if (refs.length > 1) {
          duplicates.add(key);
        }
      }
      return duplicates;
    },
  };
}

/**
 * Process ARIA snapshot: add refs and apply filters
 */
function processAriaTree(ariaTree: string, refs: RefMap, options: SnapshotOptions): string {
  const lines = ariaTree.split('\n');
  const result: string[] = [];
  const tracker = createRoleNameTracker();

  // For interactive-only mode, we collect just interactive elements
  if (options.interactive) {
    for (const line of lines) {
      const match = line.match(/^(\s*-\s*)(\w+)(?:\s+"([^"]*)")?(.*)$/);
      if (!match) continue;

      const [, , role, name, suffix] = match;
      const roleLower = role.toLowerCase();

      if (INTERACTIVE_ROLES.has(roleLower)) {
        const ref = nextRef();
        const nth = tracker.getNextIndex(roleLower, name);
        tracker.trackRef(roleLower, name, ref);
        refs[ref] = {
          selector: buildSelector(roleLower, name),
          role: roleLower,
          name,
          nth, // Always store nth, we'll use it for duplicates
        };

        let enhanced = `- ${role}`;
        if (name) enhanced += ` "${name}"`;
        enhanced += ` [ref=${ref}]`;
        // Only show nth in output if it's > 0 (for readability)
        if (nth > 0) enhanced += ` [nth=${nth}]`;
        if (suffix && suffix.includes('[')) enhanced += suffix;

        result.push(enhanced);
      }
    }

    // Post-process: remove nth from refs that don't have duplicates
    removeNthFromNonDuplicates(refs, tracker);

    return result.join('\n') || '(no interactive elements)';
  }

  // Normal processing with depth/compact filters
  for (const line of lines) {
    const processed = processLine(line, refs, options, tracker);
    if (processed !== null) {
      result.push(processed);
    }
  }

  // Post-process: remove nth from refs that don't have duplicates
  removeNthFromNonDuplicates(refs, tracker);

  // If compact mode, remove empty structural elements
  if (options.compact) {
    return compactTree(result.join('\n'));
  }

  return result.join('\n');
}

/**
 * Remove nth from refs that ended up not having duplicates
 * This keeps single-element locators simple (no unnecessary .nth(0))
 */
function removeNthFromNonDuplicates(refs: RefMap, tracker: RoleNameTracker): void {
  const duplicateKeys = tracker.getDuplicateKeys();

  for (const [ref, data] of Object.entries(refs)) {
    const key = tracker.getKey(data.role, data.name);
    if (!duplicateKeys.has(key)) {
      // Not a duplicate, remove nth to keep locator simple
      delete refs[ref].nth;
    }
  }
}

/**
 * Get indentation level (number of spaces / 2)
 */
function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? Math.floor(match[1].length / 2) : 0;
}

/**
 * Process a single line: add ref if needed, filter if requested
 */
function processLine(
  line: string,
  refs: RefMap,
  options: SnapshotOptions,
  tracker: RoleNameTracker
): string | null {
  const depth = getIndentLevel(line);

  // Check max depth
  if (options.maxDepth !== undefined && depth > options.maxDepth) {
    return null;
  }

  // Match lines like:
  //   - button "Submit"
  //   - heading "Title" [level=1]
  //   - link "Click me":
  const match = line.match(/^(\s*-\s*)(\w+)(?:\s+"([^"]*)")?(.*)$/);

  if (!match) {
    // Metadata lines (like /url:) or text content
    if (options.interactive) {
      // In interactive mode, only keep metadata under interactive elements
      return null;
    }
    return line;
  }

  const [, prefix, role, name, suffix] = match;
  const roleLower = role.toLowerCase();

  // Skip metadata lines (like /url:)
  if (role.startsWith('/')) {
    return line;
  }

  const isInteractive = INTERACTIVE_ROLES.has(roleLower);
  const isContent = CONTENT_ROLES.has(roleLower);
  const isStructural = STRUCTURAL_ROLES.has(roleLower);

  // In interactive-only mode, filter non-interactive elements
  if (options.interactive && !isInteractive) {
    return null;
  }

  // In compact mode, skip unnamed structural elements
  if (options.compact && isStructural && !name) {
    return null;
  }

  // Add ref for interactive or named content elements
  const shouldHaveRef = isInteractive || (isContent && name);

  if (shouldHaveRef) {
    const ref = nextRef();
    const nth = tracker.getNextIndex(roleLower, name);
    tracker.trackRef(roleLower, name, ref);

    refs[ref] = {
      selector: buildSelector(roleLower, name),
      role: roleLower,
      name,
      nth, // Always store nth, we'll clean up non-duplicates later
    };

    // Build enhanced line with ref
    let enhanced = `${prefix}${role}`;
    if (name) enhanced += ` "${name}"`;
    enhanced += ` [ref=${ref}]`;
    // Only show nth in output if it's > 0 (for readability)
    if (nth > 0) enhanced += ` [nth=${nth}]`;
    if (suffix) enhanced += suffix;

    return enhanced;
  }

  return line;
}

/**
 * Remove empty structural branches in compact mode
 */
function compactTree(tree: string): string {
  const lines = tree.split('\n');
  const result: string[] = [];

  // Simple pass: keep lines that have content or refs
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Always keep lines with refs
    if (line.includes('[ref=')) {
      result.push(line);
      continue;
    }

    // Keep lines with text content (after :)
    if (line.includes(':') && !line.endsWith(':')) {
      result.push(line);
      continue;
    }

    // Check if this structural element has children with refs
    const currentIndent = getIndentLevel(line);
    let hasRelevantChildren = false;

    for (let j = i + 1; j < lines.length; j++) {
      const childIndent = getIndentLevel(lines[j]);
      if (childIndent <= currentIndent) break;
      if (lines[j].includes('[ref=')) {
        hasRelevantChildren = true;
        break;
      }
    }

    if (hasRelevantChildren) {
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * Parse a ref from command argument (e.g., "@e1" -> "e1")
 */
export function parseRef(arg: string): string | null {
  if (arg.startsWith('@')) {
    return arg.slice(1);
  }
  if (arg.startsWith('[ref=') && arg.endsWith(']')) {
    return arg.slice(5, -1);
  }
  if (arg.startsWith('ref=')) {
    return arg.slice(4);
  }
  if (/^e\d+$/.test(arg)) {
    return arg;
  }
  return null;
}

/**
 * Get snapshot statistics
 */
export function getSnapshotStats(
  tree: string,
  refs: RefMap
): {
  lines: number;
  chars: number;
  tokens: number;
  refs: number;
  interactive: number;
} {
  const interactive = Object.values(refs).filter((r) => INTERACTIVE_ROLES.has(r.role)).length;

  return {
    lines: tree.split('\n').length,
    chars: tree.length,
    tokens: Math.ceil(tree.length / 4),
    refs: Object.keys(refs).length,
    interactive,
  };
}

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
  if ((element as any).id) {
    return `//*[@id="${(element as any).id}"]`;
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
    if ((current as any).id) {
      path.unshift(`//*[@id="${(current as any).id}"]`);
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
  if ((element as any).id) {
    return `#${(element as any).id}`;
  }

  const testId = element.getAttribute('data-testid');
  if (testId) {
    return `[data-testid="${testId}"]`;
  }

  const path: string[] = [];
  let current: Element | null = element;
  let depth = 0;

  while (current && depth < maxDepth) {
    if ((current as any).id) {
      path.unshift(`#${(current as any).id}`);
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
