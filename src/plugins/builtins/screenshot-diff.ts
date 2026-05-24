import type { PluginCommandHandler } from '../types.js';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const screenshotDiffHandler: PluginCommandHandler = async (ctx, _args, flags) => {
  const baselinePath = resolve(
    typeof flags.baseline === 'string' ? flags.baseline : 'baseline.png'
  );
  const outputPath = resolve(typeof flags.output === 'string' ? flags.output : 'diff-result.png');
  const threshold = typeof flags.threshold === 'number' ? flags.threshold : 0.1;

  const screenshotBuffer = await ctx.page.screenshot({ fullPage: true });

  if (!existsSync(baselinePath)) {
    writeFileSync(baselinePath, screenshotBuffer);
    return { ok: true, match: true, reason: 'baseline_created', baselinePath };
  }

  const baselineBuffer = readFileSync(baselinePath);

  const match =
    baselineBuffer.length === screenshotBuffer.length && baselineBuffer.equals(screenshotBuffer);

  if (!match) {
    writeFileSync(outputPath, screenshotBuffer);
  }

  return { ok: true, match, baselinePath, diffPath: match ? null : outputPath };
};
