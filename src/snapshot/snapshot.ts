import type { Page, Frame, FrameLocator } from 'playwright-core';
import type { RefMap, EnhancedSnapshot, SnapshotOptions } from './types.js';
import { INTERACTIVE_ROLES } from './constants.js';
import { resetRefs, nextRef } from './refs.js';
import { buildSelector, suggestSelectors, buildCompactSelectors } from './selectors.js';
import { findCursorInteractiveElements, enrichRefsWithPathsAndAttrs } from './dom-scripts.js';
import { processAriaTree } from './format.js';

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
        tree: `(no elements found for selector: ${
          options.selector
        })\n\nSuggested selectors: ${suggestedSelectors.join(', ')}`,
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

  let finalTree = enhancedTree;

  if (options.selectors && Object.keys(refs).length > 0) {
    const selectorMap = await buildCompactSelectors(page as Page | Frame, refs, options);
    if (selectorMap) {
      finalTree += '\n## Selectors\n' + selectorMap;
    }
  }

  return { tree: finalTree, refs };
}

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
