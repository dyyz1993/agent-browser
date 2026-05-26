const UTILITY_CLASS_PATTERNS: RegExp[] = [
  /^_/,
  /^css-/,
  /^[a-z]{1,2}$/,
  /^(active|disabled|hidden|visible|selected|hover|focus|current|open|closed)$/i,
  /^(text-|font-|bg-|p-|m-|w-|h-|flex|grid|border|rounded|shadow|opacity|z-)/,
  /^(sm:|md:|lg:|xl:|2xl:)/,
  /^(mt|mb|ml|mr|mx|my|pt|pb|pl|pr|px|py)-?\d*$/,
  /^(w|h|min|max|gap|space)-/,
  /^(hover|focus|active):/,
  /^(items|justify|gap|space)-/,
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

function isUniqueSelector(element: Element, selector: string): boolean {
  try {
    const root = element.getRootNode();
    if (root instanceof ShadowRoot) {
      return root.querySelectorAll(selector).length === 1;
    }
    return (root as Document).querySelectorAll(selector).length === 1;
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
    .filter((c) => {
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
    if (isUniqueSelector(element, sel)) return sel;
  }
  return null;
}

function getSemanticAttributeSelector(element: Element): string | null {
  const tag = element.tagName.toLowerCase();
  for (const attr of SEMANTIC_ATTRS) {
    const value = element.getAttribute(attr);
    if (value) {
      const sel = tag + '[' + attr + '="' + CSS.escape(value) + '"]';
      if (isUniqueSelector(element, sel)) return sel;
    }
  }
  return null;
}

function getDualAttributeSelector(element: Element): string | null {
  const tag = element.tagName.toLowerCase();
  const attrs: { attr: string; value: string }[] = [];
  for (const attr of SEMANTIC_ATTRS) {
    const value = element.getAttribute(attr);
    if (value) attrs.push({ attr, value });
  }
  if (attrs.length < 2) return null;
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
      if (isUniqueSelector(element, sel)) return sel;
    }
  }
  return null;
}

function getAttributeClassComboSelector(element: Element): string | null {
  const tag = element.tagName.toLowerCase();
  const classes = filterUsefulClasses(element);
  if (classes.length === 0) return null;
  const bestClass = classes.reduce((a, b) => (a.length <= b.length ? a : b));
  for (const attr of SEMANTIC_ATTRS) {
    const value = element.getAttribute(attr);
    if (value) {
      const sel = tag + '.' + CSS.escape(bestClass) + '[' + attr + '="' + CSS.escape(value) + '"]';
      if (isUniqueSelector(element, sel)) return sel;
    }
  }
  return null;
}

function getBestClassSelector(element: Element): string | null {
  const classes = filterUsefulClasses(element);
  if (classes.length === 0) return null;
  classes.sort((a, b) => a.length - b.length);
  const tag = element.tagName.toLowerCase();
  for (const cls of classes) {
    const sel = tag + '.' + CSS.escape(cls);
    if (isUniqueSelector(element, sel)) return sel;
  }
  for (let i = 2; i <= Math.min(3, classes.length); i++) {
    const sel =
      tag +
      '.' +
      classes
        .slice(0, i)
        .map((c) => CSS.escape(c))
        .join('.');
    if (isUniqueSelector(element, sel)) return sel;
  }
  return null;
}

function makeUniqueWithNth(element: Element, baseSelector: string): string {
  const parent = element.parentElement;
  if (!parent) return baseSelector;
  const siblings = Array.from(parent.children);
  const sameTagSiblings = siblings.filter((s) => s.tagName === element.tagName);
  if (sameTagSiblings.length <= 1) return baseSelector;
  const index = siblings.indexOf(element) + 1;
  return baseSelector + ':nth-child(' + index + ')';
}

function tryNthChild(element: Element): string | null {
  const tag = element.tagName.toLowerCase();
  const classes = filterUsefulClasses(element);
  let sel = tag;
  if (classes.length > 0) {
    classes.sort((a, b) => a.length - b.length);
    sel +=
      '.' +
      classes
        .slice(0, 2)
        .map((c) => CSS.escape(c))
        .join('.');
  }
  const uniqueSelector = makeUniqueWithNth(element, sel);
  try {
    if (isUniqueSelector(element, uniqueSelector)) return uniqueSelector;
  } catch {
    /* ignored */
  }
  return null;
}

function getBaseSelector(element: Element): string {
  let sel = element.tagName.toLowerCase();
  const classes = filterUsefulClasses(element);
  if (classes.length > 0) {
    classes.sort((a, b) => a.length - b.length);
    sel +=
      '.' +
      classes
        .slice(0, 2)
        .map((c) => CSS.escape(c))
        .join('.');
  }
  return sel;
}

function getSiblingBasedSelector(element: Element): string | null {
  let prevSibling = element.previousElementSibling;
  let attempts = 0;
  while (prevSibling && attempts < 3) {
    const siblingSel =
      tryIdSelector(prevSibling) ||
      getSemanticAttributeSelector(prevSibling) ||
      getBestClassSelector(prevSibling);
    if (siblingSel && isUniqueSelector(element, siblingSel)) {
      const elementSel = getBaseSelector(element);
      const combined = siblingSel + ' + ' + elementSel;
      if (isUniqueSelector(element, combined)) return combined;
    }
    prevSibling = prevSibling.previousElementSibling;
    attempts++;
  }
  return null;
}

function getFeatureSelector(element: Element): string | null {
  if (!element || element === element.ownerDocument?.body) return null;
  const htmlEl = element as HTMLElement;
  if (htmlEl.id) return '#' + CSS.escape(htmlEl.id);
  for (const attr of ['data-testid', 'data-test', 'name', 'role', 'aria-label']) {
    const value = element.getAttribute(attr);
    if (value) return element.tagName.toLowerCase() + '[' + attr + '="' + CSS.escape(value) + '"]';
  }
  const classes = filterUsefulClasses(element);
  if (classes.length > 0) {
    classes.sort((a, b) => a.length - b.length);
    const sel = element.tagName.toLowerCase() + '.' + CSS.escape(classes[0]);
    if (isUniqueSelector(element, sel)) return sel;
  }
  return null;
}

function buildComposedSelector(element: Element): string | null {
  const selfSelector = getBestClassSelector(element);
  if (selfSelector && isUniqueSelector(element, selfSelector)) return selfSelector;

  const parts: string[] = [];
  let current: Element | null = element;
  let depth = 0;
  const maxDepth = 3;

  while (
    current &&
    current !== (element.ownerDocument?.body || document.body) &&
    depth < maxDepth
  ) {
    const featureSelector = getFeatureSelector(current);
    if (featureSelector) {
      parts.unshift(featureSelector);
      if (depth === 0) {
        const fullSelector = parts.join(' > ');
        if (isUniqueSelector(element, fullSelector)) return fullSelector;
      }
    } else {
      const baseSelector = getBaseSelector(current);
      const sel = makeUniqueWithNth(current, baseSelector);
      parts.unshift(sel);
      const fullSelector = parts.join(' > ');
      if (isUniqueSelector(element, fullSelector)) return fullSelector;
    }
    current = current.parentElement;
    depth++;
  }

  return parts.length > 0 ? parts.join(' > ') : null;
}

function buildUniquePath(element: Element): string | null {
  const parts: string[] = [];
  let current: Element | null = element;
  let depth = 0;
  const maxDepth = 20;
  while (
    current &&
    current !== (element.ownerDocument?.body || document.body) &&
    depth < maxDepth
  ) {
    const baseSelector = getBaseSelector(current);
    const sel = makeUniqueWithNth(current, baseSelector);
    parts.unshift(sel);
    const fullSelector = parts.join(' > ');
    if (isUniqueSelector(element, fullSelector)) return fullSelector;
    current = current.parentElement;
    depth++;
  }
  return null;
}

export function generateShortSelector(element: Element): string | null {
  let selector: string | null = null;

  selector = tryIdSelector(element);
  if (selector) return selector;

  selector = getSemanticAttributeSelector(element);
  if (selector) return selector;

  selector = getDualAttributeSelector(element);
  if (selector) return selector;

  selector = getAttributeClassComboSelector(element);
  if (selector) return selector;

  selector = getBestClassSelector(element);
  if (selector) return selector;

  selector = getSiblingBasedSelector(element);
  if (selector) return selector;

  selector = buildComposedSelector(element);
  if (selector) return selector;

  selector = tryNthChild(element);
  if (selector) return selector;

  return buildUniquePath(element);
}
