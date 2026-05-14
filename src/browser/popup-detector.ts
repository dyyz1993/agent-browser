import type { ElementInfo } from '../diff.js';

export interface PopupCandidate {
  role: string;
  name?: string;
  ref?: string;
  value?: string;
}

export type PopupType = 'modal' | 'dropdown' | 'tooltip' | 'alert' | 'popup';

export interface PopupInfo {
  type: PopupType;
  role: string;
  name?: string;
  ref?: string;
  childCount?: number;
}

export interface PopupTip {
  text: string;
  popup: PopupInfo;
}

const POPUP_NAME_PATTERN =
  /confirm|delete|submit|save|close|dismiss|warning|error|success|notice|notification|message|modal|overlay|popup/i;

const SILENT_TYPES = new Set<PopupType>(['tooltip']);

const POPUP_ROLES: Record<string, PopupType> = {
  dialog: 'modal',
  alertdialog: 'alert',
  menu: 'dropdown',
  listbox: 'dropdown',
  tooltip: 'tooltip',
  alert: 'alert',
};

const NOISE_ROLES = new Set([
  'text',
  'paragraph',
  'img',
  'link',
  'navigation',
  'main',
  'header',
  'footer',
  'banner',
  'complementary',
]);

const CHILD_ROLES = new Set(['option', 'menuitem', 'listitem', 'treeitem', 'gridcell']);

const MAX_TIPS = 3;
const MAX_TIP_LENGTH = 100;

function classifyByRole(role: string): PopupType | null {
  return POPUP_ROLES[role] ?? null;
}

function classifyByName(name: string | undefined): PopupType | null {
  if (name && POPUP_NAME_PATTERN.test(name)) return 'popup';
  return null;
}

function classifyByHeuristic(role: string, name?: string): PopupType | null {
  if ((role === 'generic' || role === 'text') && name) return 'popup';
  return null;
}

function classify(role: string, name?: string): PopupType | null {
  return classifyByRole(role) ?? classifyByName(name) ?? classifyByHeuristic(role, name);
}

function isNoise(candidate: PopupCandidate, parentType?: PopupType): boolean {
  if (NOISE_ROLES.has(candidate.role) && !(candidate.role in POPUP_ROLES)) return true;
  if (!candidate.name && !candidate.ref) return true;
  if (candidate.name === '' && candidate.role === 'generic') return true;
  if (parentType) {
    const INTERACTIVE_ROLES = new Set([
      'button',
      'link',
      'textbox',
      'searchbox',
      'combobox',
      'checkbox',
      'radio',
      'switch',
      'slider',
      'spinbutton',
      'heading',
      'paragraph',
    ]);
    if (INTERACTIVE_ROLES.has(candidate.role)) return true;
  }
  return false;
}

function countChildren(added: PopupCandidate[], startIndex: number): number {
  let count = 0;
  for (let i = startIndex + 1; i < added.length; i++) {
    if (CHILD_ROLES.has(added[i].role)) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + '...';
}

function formatTip(
  type: PopupType,
  name: string | undefined,
  role: string,
  childCount?: number
): string {
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  const subject = name || null;

  let tip: string;
  if (subject) {
    tip = `[popup] ${label} appeared: "${subject}"`;
  } else {
    tip = `[popup] ${label} appeared (${role}, no label)`;
  }

  if (childCount !== undefined && childCount > 0) {
    tip += ` with ${childCount} options`;
  }

  return truncate(tip, MAX_TIP_LENGTH);
}

export function detectContainerExpansion(added: PopupCandidate[]): PopupTip[] {
  const tips: PopupTip[] = [];
  const visited = new Set<number>();

  for (let i = 0; i < added.length && tips.length < MAX_TIPS; i++) {
    if (visited.has(i)) continue;
    if (!CHILD_ROLES.has(added[i].role)) continue;

    let clusterSize = 0;
    let clusterStart = i;
    let firstName: string | undefined;

    for (let j = i; j < added.length; j++) {
      if (!CHILD_ROLES.has(added[j].role)) break;
      visited.add(j);
      clusterSize++;
      if (clusterSize === 1) {
        firstName = added[j].name;
        clusterStart = j;
      }
    }

    if (clusterSize < 2) continue;

    const inferredRole = added[clusterStart].role;
    const info: PopupInfo = {
      type: 'dropdown',
      role: inferredRole,
      name: firstName,
      childCount: clusterSize,
    };

    tips.push({
      text: formatTip('dropdown', firstName, inferredRole, clusterSize),
      popup: info,
    });
  }

  return tips;
}

export function detectPopups(added: PopupCandidate[]): PopupTip[] {
  const tips: PopupTip[] = [];
  let lastParentType: PopupType | undefined;
  const detectedParentIndices = new Set<number>();

  for (let i = 0; i < added.length && tips.length < MAX_TIPS; i++) {
    const candidate = added[i];

    if (isNoise(candidate, lastParentType)) continue;
    if (CHILD_ROLES.has(candidate.role)) continue;

    const type = classify(candidate.role, candidate.name);
    if (!type) continue;

    lastParentType = type;
    if (SILENT_TYPES.has(type)) continue;

    const isDropdown = type === 'dropdown';
    const childCount = isDropdown ? countChildren(added, i) : undefined;

    if (isDropdown && childCount && childCount > 0) {
      for (let j = i + 1; j <= i + childCount && j < added.length; j++) {
        detectedParentIndices.add(j);
      }
    }

    const info: PopupInfo = {
      type,
      role: candidate.role,
      name: candidate.name,
      ref: candidate.ref,
      childCount,
    };

    tips.push({
      text: formatTip(type, candidate.name, candidate.role, childCount),
      popup: info,
    });
  }

  if (tips.length < MAX_TIPS) {
    const filtered = added.map((c, idx) => {
      const isChildOfDetected =
        detectedParentIndices.has(idx) ||
        (CHILD_ROLES.has(c.role) && idx > 0 && detectedParentIndices.has(idx - 1));
      return isChildOfDetected ? { ...c, role: '__filtered__' } : c;
    });

    const expansionTips = detectContainerExpansion(filtered);
    for (const tip of expansionTips) {
      if (tips.length >= MAX_TIPS) break;
      if (SILENT_TYPES.has(tip.popup.type)) continue;
      tips.push(tip);
    }
  }

  return tips;
}

export function detectPopupsFromDiff(
  added: ElementInfo[],
  _existingContainers?: ElementInfo[]
): PopupTip[] {
  const candidates: PopupCandidate[] = added.map((el) => ({
    role: el.role,
    name: el.name,
    ref: el.ref,
    value: el.value,
  }));
  return detectPopups(candidates);
}
