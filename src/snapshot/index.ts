export type { RefMap, EnhancedSnapshot, SnapshotOptions } from './types.js';
export { resetRefs } from './refs.js';
export { getEnhancedSnapshot, parseRef, getSnapshotStats } from './snapshot.js';
export { generateShortSelector } from './generate-short-selector.js';
export {
  generateStableSelectors,
  getSemanticClass,
  generateXPath,
  generateCSSPath,
  collectAttributes,
} from './selectors.js';
export {
  INTERACTIVE_ROLES,
  CONTENT_ROLES,
  STRUCTURAL_ROLES,
  STYLE_CLASS_PATTERNS,
  SEMANTIC_TAGS,
} from './constants.js';
