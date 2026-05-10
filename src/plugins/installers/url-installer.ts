import type { PluginInstaller, InstallResult } from '../types.js';
import fs from 'node:fs';
import path from 'node:path';

export const urlInstaller: PluginInstaller = {
  type: 'url',

  detect(source: string): boolean {
    return source.startsWith('https://') || source.startsWith('http://');
  },

  async install(source: string, pluginsDir: string): Promise<InstallResult> {
    if (source.startsWith('http://') && !source.startsWith('http://localhost')) {
      throw new Error(
        'Only HTTPS URLs are allowed for security. Use local install for local files.'
      );
    }

    const url = new URL(source);
    const baseName = path.basename(url.pathname);
    const name = baseName.replace(/\.(ts|js|mjs)$/, '') || 'unknown';
    const ext = path.extname(baseName) || '.js';

    fs.mkdirSync(pluginsDir, { recursive: true });

    const targetPath = path.join(pluginsDir, `${name}${ext}`);

    const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
    }
    const content = await response.text();
    fs.writeFileSync(targetPath, content, 'utf-8');

    return { name, version: '0.0.0', path: targetPath };
  },

  async uninstall(name: string, pluginsDir: string): Promise<void> {
    for (const ext of ['.ts', '.js', '.mjs']) {
      const filePath = path.join(pluginsDir, `${name}${ext}`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  },
};
