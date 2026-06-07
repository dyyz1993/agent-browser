#!/usr/bin/env node

/**
 * Copies viewer frontend files (CSS, HTML, JS) from src/viewer/ to dist/viewer/.
 * These files are read at runtime by viewer-html.ts / viewer-script.ts.
 * Run after `tsc` since tsc does not copy non-TypeScript files.
 */

import { cpSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'src', 'viewer');
const dest = join(root, 'dist', 'viewer');

if (!existsSync(src)) {
  console.error('[copy-viewer] Source directory not found:', src);
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log('[copy-viewer] Copied viewer files to dist/viewer/');
