import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const srcDir = path.join(rootDir, 'src', 'recorder');
const distDir = path.join(rootDir, 'dist', 'recorder');

// Ensure dist/recorder directory exists
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Copy inject.js
copyFileSync(
  path.join(srcDir, 'inject.js'),
  path.join(distDir, 'inject.js')
);

console.log('Copied recorder/inject.js to dist/recorder/inject.js');
