import fs from 'fs';
import type { Command } from '../connection.js';
import type { Flags } from '../flags.js';

export class CliError extends Error {
  constructor(
    message: string,
    public usage?: string
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export function error(message: string, usage?: string): never {
  throw new CliError(message, usage);
}

export function genId(): string {
  return `n${Date.now() % 1000000}`;
}

export function parseSingleStep(action: string, args: string[]): any[] {
  switch (action) {
    case 'navigate':
      return [{ action: 'navigate', url: args[0] }];
    case 'click':
      return [{ action: 'click', selector: args[0] }];
    case 'fill':
      return [{ action: 'fill', selector: args[0], value: args[1] }];
    case 'type':
      return [{ action: 'type', selector: args[0], text: args[1] }];
    case 'press':
      return [{ action: 'press', key: args[0] }];
    case 'get':
      return [{ action: 'get', type: args[0] as any, selector: args[1] }];
    case 'wait': {
      const waitStep: any = { action: 'wait', selector: args[0] };
      if (args[1]) waitStep.timeout = parseInt(args[1], 10);
      return [waitStep];
    }
    case 'screenshot':
      return [{ action: 'screenshot', path: args[0] }];
    default:
      throw new CliError(`Unknown step action: ${action}`);
  }
}

export function parseInFrame(args: string[]): { inFrame?: string; remaining: string[] } {
  let inFrame: string | undefined;
  const remaining: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--in-frame' || args[i] === '-f') {
      inFrame = args[i + 1];
      i++;
    } else {
      remaining.push(args[i]);
    }
  }

  return { inFrame, remaining };
}

export type DiffScope = number | 'full' | string;

export function parseDiff(args: string[]): { diffScope?: DiffScope; remaining: string[] } {
  const diffIdx = args.indexOf('--diff');
  if (diffIdx === -1) {
    return { remaining: args };
  }

  const remaining = [...args];
  remaining.splice(diffIdx, 1);

  const nextArg = remaining[diffIdx];
  if (nextArg === 'full') {
    remaining.splice(diffIdx, 1);
    return { diffScope: 'full', remaining };
  }

  if (nextArg && /^\d+$/.test(nextArg)) {
    remaining.splice(diffIdx, 1);
    return { diffScope: parseInt(nextArg, 10), remaining };
  }

  if (nextArg && !nextArg.startsWith('-') && !nextArg.startsWith('@')) {
    remaining.splice(diffIdx, 1);
    return { diffScope: nextArg, remaining };
  }

  return { diffScope: 3, remaining };
}

export function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function findSimilar(input: string, candidates: string[]): string | null {
  const inputLower = input.toLowerCase();
  let best: string | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const cLower = c.toLowerCase();
    if (cLower.startsWith(inputLower) || inputLower.startsWith(cLower)) {
      return c;
    }
    const d = levenshtein(inputLower, cLower);
    if (d < bestDist && d <= Math.max(2, Math.floor(input.length / 2))) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

export { fs };
export type { Command, Flags };
