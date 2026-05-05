import type { FlowPlugin } from '../plugin-system.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { formatOutput } from '../output.js';
import type { OutputFormat } from '../output.js';

export function createFileOutputPlugin(options: {
  outputDir: string;
  format?: OutputFormat;
  pretty?: boolean;
}): FlowPlugin {
  return {
    name: 'file-output',
    version: '1.0.0',
    description: 'Automatically saves extracted data to files',

    dataHandlers: [
      async (data) => {
        const outputDir = resolve(options.outputDir);
        if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

        const format = options.format || 'json';

        for (const [key, value] of Object.entries(data)) {
          if (value === undefined || value === null) continue;

          const content = formatOutput(value, {
            format,
            pretty: options.pretty !== false,
          });

          const ext = format === 'jsonl' ? 'jsonl' : format === 'csv' ? 'csv' : format;
          const filePath = join(outputDir, `${key}.${ext}`);
          writeFileSync(filePath, content, 'utf-8');
          console.log(`[file-output] Saved ${key} to ${filePath}`);
        }
      },
    ],
  };
}
