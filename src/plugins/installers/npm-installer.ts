import type { PluginInstaller, InstallResult } from '../types.js';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const NPM_PREFIX = 'agent-browser-plugin-';

export const npmInstaller: PluginInstaller = {
  type: 'npm',

  detect(source: string): boolean {
    if (source.startsWith(NPM_PREFIX)) return true;
    if (source.startsWith('@') && source.includes('/' + NPM_PREFIX)) return true;
    return false;
  },

  async install(source: string, pluginsDir: string): Promise<InstallResult> {
    const packageName = source;
    const pluginDir = path.join(pluginsDir, 'node_modules', packageName);

    fs.mkdirSync(pluginsDir, { recursive: true });

    try {
      execSync(
        `npm install --prefix "${pluginsDir}" "${packageName}" --no-save --no-package-lock 2>&1`,
        {
          stdio: 'pipe',
          timeout: 60000,
        }
      );
    } catch (e: unknown) {
      throw new Error(`npm install failed: ${(e as Error).message}`);
    }

    const pkgJsonPath = path.join(pluginDir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) {
      throw new Error(`Package installed but no package.json found at ${pkgJsonPath}`);
    }
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));

    const name = packageName.replace(NPM_PREFIX, '').replace(/^@[^/]+\//, '');
    return {
      name,
      version: pkg.version || '0.0.0',
      path: path.join(pluginDir, pkg.main || 'index.js'),
    };
  },

  async uninstall(name: string, pluginsDir: string): Promise<void> {
    const packageName = `${NPM_PREFIX}${name}`;
    try {
      execSync(`npm uninstall --prefix "${pluginsDir}" "${packageName}" --no-save 2>&1`, {
        stdio: 'pipe',
        timeout: 30000,
      });
    } catch {
      const pluginDir = path.join(pluginsDir, 'node_modules', packageName);
      if (fs.existsSync(pluginDir)) fs.rmSync(pluginDir, { recursive: true });
    }
  },
};
