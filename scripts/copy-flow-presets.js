import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const srcDir = path.join(rootDir, 'src', 'flow', 'presets');
const distDir = path.join(rootDir, 'dist', 'flow', 'presets');

// Ensure dist/flow/presets directory exists
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Copy all .js files from src/flow/presets to dist/flow/presets
const files = readdirSync(srcDir);
for (const file of files) {
  if (file.endsWith('.js')) {
    copyFileSync(
      path.join(srcDir, file),
      path.join(distDir, file)
    );
    console.log(`Copied flow/presets/${file}`);
  }
}
