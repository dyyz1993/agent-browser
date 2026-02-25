import type { Locator, Page, Frame, FrameLocator } from 'playwright-core';
import { getEnhancedSnapshot, resetRefs } from './snapshot.js';
import type { DiffScope } from './types.js';

export interface SnapshotDiff {
  added: ElementInfo[];
  removed: ElementInfo[];
  changed: ElementChange[];
  scope: string;
}

export interface ElementInfo {
  role: string;
  name?: string;
  value?: string;
  ref?: string;
}

export interface ElementChange {
  role: string;
  name?: string;
  ref?: string;
  before: { value?: string; name?: string };
  after: { value?: string; name?: string };
}

export interface DiffResult {
  diff: SnapshotDiff;
  output: string;
}

export async function getDiffTarget(
  locator: Locator,
  scope: DiffScope
): Promise<{ target: Page | Frame | FrameLocator; description: string }> {
  if (scope === 'full') {
    return { target: locator.page(), description: 'full page' };
  }

  if (typeof scope === 'string') {
    return { target: locator.page(), description: scope };
  }

  return { target: locator.page(), description: `${scope} levels up` };
}

export async function getSnapshotText(target: Page | Frame | FrameLocator): Promise<string> {
  resetRefs();
  const result = await getEnhancedSnapshot(target, { interactive: false, compact: true });
  return result.tree;
}

function parseSnapshotLine(line: string): ElementInfo | null {
  const match = line.match(/-\s+(\w+)\s+"([^"]*)"(?:\s+\[ref=(\w+)\])?(?:\s+\[value:\s*"([^"]*)"\])?/);
  if (match) {
    return {
      role: match[1],
      name: match[2],
      ref: match[3],
      value: match[4],
    };
  }
  
  const textMatch = line.match(/-\s+(\w+):\s*"([^"]*)"/);
  if (textMatch) {
    return {
      role: textMatch[1],
      name: '',
      value: textMatch[2],
    };
  }
  
  const plainTextMatch = line.match(/-\s+(\w+):\s*(.+)$/);
  if (plainTextMatch) {
    return {
      role: plainTextMatch[1],
      name: '',
      value: plainTextMatch[2].trim(),
    };
  }
  
  return null;
}

export function parseSnapshot(text: string): Map<number, ElementInfo> {
  const elements = new Map<number, ElementInfo>();
  const lines = text.split('\n');
  
  let index = 0;
  for (const line of lines) {
    const info = parseSnapshotLine(line.trim());
    if (info) {
      elements.set(index, info);
      index++;
    }
  }
  
  return elements;
}

export function elementsMatch(a: ElementInfo, b: ElementInfo): boolean {
  if (a.ref && b.ref && a.ref === b.ref) return true;
  if (a.role === b.role && a.name === b.name) return true;
  return false;
}

export function computeDiff(beforeText: string, afterText: string): SnapshotDiff {
  const beforeElements = parseSnapshot(beforeText);
  const afterElements = parseSnapshot(afterText);
  
  const added: ElementInfo[] = [];
  const removed: ElementInfo[] = [];
  const changed: ElementChange[] = [];
  
  const beforeArray = Array.from(beforeElements.values());
  const afterArray = Array.from(afterElements.values());
  
  const matchedBefore = new Set<number>();
  const matchedAfter = new Set<number>();
  
  for (let i = 0; i < beforeArray.length; i++) {
    const before = beforeArray[i];
    for (let j = 0; j < afterArray.length; j++) {
      if (matchedAfter.has(j)) continue;
      const after = afterArray[j];
      if (elementsMatch(before, after)) {
        matchedBefore.add(i);
        matchedAfter.add(j);
        if (before.value !== after.value || before.name !== after.name) {
          changed.push({
            role: after.role,
            name: after.name,
            ref: after.ref,
            before: { value: before.value, name: before.name },
            after: { value: after.value, name: after.name },
          });
        }
        break;
      }
    }
  }
  
  for (let i = 0; i < beforeArray.length; i++) {
    if (!matchedBefore.has(i)) {
      removed.push(beforeArray[i]);
    }
  }
  
  for (let j = 0; j < afterArray.length; j++) {
    if (!matchedAfter.has(j)) {
      added.push(afterArray[j]);
    }
  }
  
  return { added, removed, changed, scope: '' };
}

export function formatDiff(diff: SnapshotDiff): string {
  const lines: string[] = [];
  
  for (const el of diff.added) {
    const name = el.name ? ` "${el.name}"` : '';
    const ref = el.ref ? ` [ref=${el.ref}]` : '';
    lines.push(`+ ${el.role}${name}${ref}`);
  }
  
  for (const el of diff.removed) {
    const name = el.name ? ` "${el.name}"` : '';
    const ref = el.ref ? ` [ref=${el.ref}]` : '';
    lines.push(`- ${el.role}${name}${ref}`);
  }
  
  for (const ch of diff.changed) {
    const ref = ch.ref ? ` [ref=${ch.ref}]` : '';
    
    const hasValueChange = ch.before.value !== ch.after.value;
    const hasNameChange = ch.before.name !== ch.after.name;
    
    if (hasNameChange && !hasValueChange) {
      lines.push(`- ${ch.role} "${ch.before.name || ''}"${ref}`);
      lines.push(`+ ${ch.role} "${ch.after.name || ''}"${ref}`);
    } else if (hasValueChange && !hasNameChange) {
      const name = ch.name ? ` "${ch.name}"` : '';
      lines.push(`- ${ch.role}${name}${ref}: "${ch.before.value || ''}"`);
      lines.push(`+ ${ch.role}${name}${ref}: "${ch.after.value || ''}"`);
    } else if (hasValueChange && hasNameChange) {
      lines.push(`- ${ch.role} "${ch.before.name || ''}"${ref}: "${ch.before.value || ''}"`);
      lines.push(`+ ${ch.role} "${ch.after.name || ''}"${ref}: "${ch.after.value || ''}"`);
    }
  }
  
  if (lines.length === 0) {
    return '(no changes detected)';
  }
  
  return lines.join('\n');
}

export async function performDiff(
  locator: Locator,
  scope: DiffScope | undefined,
  action: () => Promise<void>
): Promise<DiffResult | undefined> {
  if (scope === undefined) {
    await action();
    return undefined;
  }
  
  const { target, description } = await getDiffTarget(locator, scope);
  const beforeText = await getSnapshotText(target);
  
  await action();
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const afterText = await getSnapshotText(target);
  
  if (beforeText === afterText) {
    return {
      diff: { added: [], removed: [], changed: [], scope: description },
      output: '(no changes detected)',
    };
  }
  
  const diff = computeDiff(beforeText, afterText);
  diff.scope = description;
  
  return {
    diff,
    output: formatDiff(diff),
  };
}
