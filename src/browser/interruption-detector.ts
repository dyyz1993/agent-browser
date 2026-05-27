import type { Page, Frame } from 'playwright-core';
import type { InterruptionRule, InterruptionType } from '../types/interruption.js';
import rules from '../builtins/interruption-rules.json' with { type: 'json' };
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CUSTOM_RULES_DIR = path.join(os.homedir(), '.agent-browser', 'rules');

function isValidRule(r: unknown): r is InterruptionRule {
  return (
    typeof r === 'object' &&
    r !== null &&
    typeof (r as Record<string, unknown>).name === 'string' &&
    Array.isArray((r as Record<string, unknown>).domains) &&
    Array.isArray((r as Record<string, unknown>).selectors) &&
    typeof (r as Record<string, unknown>).type === 'string'
  );
}

function loadAllRules(): InterruptionRule[] {
  const builtin: InterruptionRule[] = rules as InterruptionRule[];
  const custom: InterruptionRule[] = [];

  try {
    if (fs.existsSync(CUSTOM_RULES_DIR)) {
      const files = fs.readdirSync(CUSTOM_RULES_DIR).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(CUSTOM_RULES_DIR, file), 'utf-8');
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            custom.push(...parsed.filter(isValidRule));
          } else if (isValidRule(parsed)) {
            custom.push(parsed);
          }
        } catch {
          // skip
        }
      }
    }
  } catch {
    // skip
  }

  return [...builtin, ...custom];
}

let cachedRules: InterruptionRule[] | null = null;
let rulesLoadedAt = 0;
const RULES_CACHE_TTL = 30_000;

function getRules(): InterruptionRule[] {
  const now = Date.now();
  if (!cachedRules || now - rulesLoadedAt > RULES_CACHE_TTL) {
    cachedRules = loadAllRules();
    rulesLoadedAt = now;
  }
  return cachedRules;
}

interface DetectedInterruption {
  ruleName: string;
  type: InterruptionType;
  subType: string;
  selector: string;
  confidence: number;
}

export async function scanForInterruptions(page: Page | Frame): Promise<DetectedInterruption[]> {
  const url = page.url();
  let domain = '';
  let path = '';
  try {
    const u = new URL(url);
    domain = u.hostname;
    path = u.pathname;
  } catch {
    return [];
  }

  const allRules = getRules();
  const matchingRules = allRules.filter((rule) => {
    const domainMatch = rule.domains.some(
      (d) => d === '*' || d === domain || domain.endsWith('.' + d)
    );
    if (!domainMatch) return false;
    if (rule.paths && rule.paths.length > 0) {
      return rule.paths.some((p) => path === p || path.startsWith(p));
    }
    return true;
  });

  if (matchingRules.length === 0) return [];

  const results: DetectedInterruption[] = [];

  for (const rule of matchingRules) {
    for (const selector of rule.selectors) {
      try {
        const count = await page.locator(selector).count();
        if (count > 0) {
          results.push({
            ruleName: rule.name,
            type: rule.type,
            subType: rule.subType,
            selector,
            confidence: rule.confidence,
          });
          break;
        }
      } catch {
        continue;
      }
    }
  }

  return results;
}

export function formatInterruptionTip(detected: DetectedInterruption): string {
  const typeLabel = detected.type.replace(/_/g, ' ');
  if (detected.subType) {
    return `[!] ${typeLabel} detected: ${detected.subType.replace(/_/g, ' ')} (${detected.ruleName})`;
  }
  return `[!] ${typeLabel} detected (${detected.ruleName})`;
}

export function getInterruptionRules(): InterruptionRule[] {
  return getRules();
}
