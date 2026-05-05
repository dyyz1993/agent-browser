import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const PRESETS: Record<string, { script: string; description: string }> = {
  'fetch-capture': {
    script: readFileSync(resolve(__dirname, 'fetch-capture.js'), 'utf-8'),
    description: 'Intercept fetch/XHR/SSE responses with closure-protected storage',
  },
  'xhr-only': {
    script: readFileSync(resolve(__dirname, 'xhr-only.js'), 'utf-8'),
    description: 'Intercept XMLHttpRequest only (minimal overhead)',
  },
  'sse-stream': {
    script: readFileSync(resolve(__dirname, 'sse-stream.js'), 'utf-8'),
    description: 'Capture Server-Sent Events (EventSource) messages',
  },
  'console-capture': {
    script: readFileSync(resolve(__dirname, 'console-capture.js'), 'utf-8'),
    description: 'Capture console.log/warn/error output',
  },
};

export function getPreset(name: string): string | null {
  return PRESETS[name]?.script || null;
}

export function listPresets(): Array<{ name: string; description: string }> {
  return Object.entries(PRESETS).map(([name, { description }]) => ({ name, description }));
}
