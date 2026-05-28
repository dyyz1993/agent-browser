import type {
  CollectionEntry,
  CollectionSession,
  InterruptionRule,
  InterruptionType,
} from '../types/interruption.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const COLLECT_DIR = path.join(os.homedir(), '.agent-browser', 'collections');

function isNonNullable<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

export function loadCollections(dir?: string): CollectionEntry[] {
  const targetDir = dir ?? COLLECT_DIR;

  if (!fs.existsSync(targetDir)) {
    return [];
  }

  let files: string[];
  try {
    files = fs
      .readdirSync(targetDir)
      .filter((f) => f.startsWith('session_') && f.endsWith('.json'));
  } catch {
    return [];
  }

  const entries: CollectionEntry[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(targetDir, file), 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'collections' in parsed &&
        Array.isArray((parsed as CollectionSession).collections)
      ) {
        const session = parsed as CollectionSession;
        for (const entry of session.collections) {
          if (
            typeof entry === 'object' &&
            entry !== null &&
            'id' in entry &&
            'type' in entry &&
            'subType' in entry &&
            'page' in entry &&
            'element' in entry
          ) {
            entries.push(entry);
          }
        }
      }
    } catch {
      continue;
    }
  }

  return entries;
}

export function groupEntriesByType(entries: CollectionEntry[]): Map<string, CollectionEntry[]> {
  const groups = new Map<string, CollectionEntry[]>();

  for (const entry of entries) {
    const key = `${entry.type}:${entry.subType}`;
    const group = groups.get(key);
    if (group) {
      group.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }

  return groups;
}

export function extractDomainPatterns(entries: CollectionEntry[]): string[] {
  const rawDomains = new Set<string>();

  for (const entry of entries) {
    if (entry.page?.domain) {
      rawDomains.add(entry.page.domain);
    }
  }

  if (rawDomains.size === 0) {
    return [];
  }

  if (rawDomains.size > 5) {
    return ['*'];
  }

  const normalized = new Map<string, string>();
  for (const domain of rawDomains) {
    const bare = domain.startsWith('www.') ? domain.slice(4) : domain;
    const existing = normalized.get(bare);
    if (existing === undefined) {
      normalized.set(bare, domain);
    }
  }

  return Array.from(normalized.keys()).sort();
}

export function extractPathPatterns(entries: CollectionEntry[]): string[] | undefined {
  const rawPaths = new Set<string>();

  for (const entry of entries) {
    if (entry.page?.path) {
      rawPaths.add(entry.page.path);
    }
  }

  if (rawPaths.size === 0) {
    return undefined;
  }

  const allRootOrEmpty = Array.from(rawPaths).every((p) => p === '/' || p === '');
  if (allRootOrEmpty) {
    return undefined;
  }

  if (rawPaths.size <= 10) {
    return Array.from(rawPaths).sort();
  }

  const prefixes = new Map<string, number>();
  for (const p of rawPaths) {
    const segments = p.split('/').filter(Boolean);
    if (segments.length > 0) {
      const prefix = '/' + segments[0];
      prefixes.set(prefix, (prefixes.get(prefix) ?? 0) + 1);
    }
  }

  const common = Array.from(prefixes.entries())
    .filter(([, count]) => count >= 2)
    .map(([prefix]) => prefix)
    .sort();

  return common.length > 0 ? common : undefined;
}

export function extractSelectors(entries: CollectionEntry[]): string[] {
  if (entries.length === 0) {
    return [];
  }

  const frequency = new Map<string, number>();
  for (const entry of entries) {
    const sel = entry.element?.selector;
    if (sel) {
      frequency.set(sel, (frequency.get(sel) ?? 0) + 1);
    }
  }

  const threshold = Math.max(1, Math.ceil(entries.length * 0.3));

  return Array.from(frequency.entries())
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([selector]) => selector);
}

export function extractIframePatterns(entries: CollectionEntry[]): string[] {
  const patterns: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (!entry.element?.isIframe || !entry.element.iframeSrc) {
      continue;
    }

    try {
      const url = new URL(entry.element.iframeSrc);
      const hostname = url.hostname;
      const pathname = url.pathname === '/' ? '' : url.pathname;
      const pattern = pathname ? `iframe[src*='${hostname}']` : `iframe[src*='${hostname}']`;

      if (!seen.has(pattern)) {
        seen.add(pattern);
        patterns.push(pattern);
      }
    } catch {
      continue;
    }
  }

  return patterns;
}

export function computeConfidence(entries: CollectionEntry[], selectors: string[]): number {
  let score = 0.5;

  const entryBonus = Math.min(entries.length * 0.1, 0.3);
  score += entryBonus;

  if (selectors.length > 0 && entries.length > 1) {
    score += 0.1;
  }

  return Math.min(score, 0.95);
}

export function processCollections(entries: CollectionEntry[]): InterruptionRule[] {
  if (entries.length === 0) {
    return [];
  }

  const groups = groupEntriesByType(entries);
  const rules: InterruptionRule[] = [];

  for (const [key, groupEntries] of groups) {
    const [typeStr, subType] = key.split(':') as [string, string];

    const domains = extractDomainPatterns(groupEntries);
    const paths = extractPathPatterns(groupEntries);
    const selectors = extractSelectors(groupEntries);
    const iframeSelectors = extractIframePatterns(groupEntries);

    const mergedSelectors = Array.from(new Set([...selectors, ...iframeSelectors]));

    const confidence = computeConfidence(groupEntries, mergedSelectors);

    const name = `${typeStr}: ${subType} (collected)`;

    const rule: InterruptionRule = {
      name,
      domains,
      selectors: mergedSelectors,
      type: typeStr as InterruptionType,
      subType,
      confidence,
    };

    if (paths !== undefined) {
      rule.paths = paths;
    }

    rules.push(rule);
  }

  return rules.sort((a, b) => b.confidence - a.confidence);
}

export function processAndOutput(
  inputDir?: string,
  outputPath?: string
): { rules: InterruptionRule[]; stats: { sessions: number; entries: number; rules: number } } {
  const targetDir = inputDir ?? COLLECT_DIR;
  let sessionCount = 0;

  if (fs.existsSync(targetDir)) {
    try {
      const files = fs
        .readdirSync(targetDir)
        .filter((f) => f.startsWith('session_') && f.endsWith('.json'));
      sessionCount = files.length;
    } catch {
      sessionCount = 0;
    }
  }

  const entries = loadCollections(targetDir);
  const rules = processCollections(entries);

  const result = {
    rules,
    stats: {
      sessions: sessionCount,
      entries: entries.length,
      rules: rules.length,
    },
  };

  if (outputPath) {
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
  }

  if (!outputPath && rules.length > 0) {
    const rulesDir = path.join(os.homedir(), '.agent-browser', 'rules');
    if (!fs.existsSync(rulesDir)) {
      fs.mkdirSync(rulesDir, { recursive: true });
    }
    const defaultPath = path.join(rulesDir, 'collected-rules.json');
    fs.writeFileSync(defaultPath, JSON.stringify(rules, null, 2));
  }

  return result;
}
