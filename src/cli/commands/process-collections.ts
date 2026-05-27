import type { Flags } from '../flags.js';
import { processAndOutput } from '../../processor/collection-processor.js';

export function handleProcessCollections(args: string[], flags: Flags): void {
  let outputPath: string | undefined;
  let inputDir: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[i + 1];
      i++;
    } else if (args[i] === '--dir' && args[i + 1]) {
      inputDir = args[i + 1];
      i++;
    }
  }

  const { rules, stats } = processAndOutput(inputDir, outputPath);

  if (flags.json) {
    console.log(JSON.stringify({ success: true, stats, rules }, null, 2));
    return;
  }

  if (outputPath) {
    console.log(`Written to ${outputPath}`);
  }

  console.log(`Processed ${stats.sessions} sessions, ${stats.entries} entries`);
  console.log(`Generated ${stats.rules} rules:`);
  console.log('');

  if (rules.length === 0) {
    console.log('  (no rules generated)');
    return;
  }

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const num = i + 1;
    console.log(`${num}. [${rule.type}:${rule.subType}] ${rule.name}`);
    console.log(`   Domains: ${rule.domains.length > 0 ? rule.domains.join(', ') : '(none)'}`);
    console.log(
      `   Selectors: ${rule.selectors.length} pattern${rule.selectors.length !== 1 ? 's' : ''}`
    );
    console.log(`   Confidence: ${rule.confidence.toFixed(2)}`);
    console.log('');
  }
}
