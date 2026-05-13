import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

let _cachedVersion: string | undefined;

export function getVersion(): string {
  if (_cachedVersion) return _cachedVersion;
  try {
    const __filename = fileURLToPath(import.meta.url);
    let dir = dirname(__filename);
    for (let i = 0; i < 5; i++) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
        if (pkg.version) {
          _cachedVersion = pkg.version;
          return pkg.version;
        }
      } catch {
        /* keep going up */
      }
      dir = join(dir, '..');
    }
  } catch {
    /* ignored */
  }
  _cachedVersion = '0.0.0';
  return '0.0.0';
}
