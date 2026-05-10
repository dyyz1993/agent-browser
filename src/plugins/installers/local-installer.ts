import type { PluginInstaller, InstallResult } from '../types.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const localInstaller: PluginInstaller = {
  type: 'local',

  detect(source: string): boolean {
    if (source.startsWith('./') || source.startsWith('../') || source.startsWith('/')) return true;
    if (source.startsWith('~')) return true;
    const expanded = source.replace(/^~/, os.homedir());
    return (
      fs.existsSync(expanded) &&
      (expanded.endsWith('.ts') || expanded.endsWith('.js') || fs.statSync(expanded).isDirectory())
    );
  },

  async install(source: string, pluginsDir: string): Promise<InstallResult> {
    const expanded = source.replace(/^~/, os.homedir());
    const resolved = path.resolve(expanded);

    if (!fs.existsSync(resolved)) {
      throw new Error(`Local path not found: ${resolved}`);
    }

    const stat = fs.statSync(resolved);
    let pluginDir: string;

    if (stat.isDirectory()) {
      const dirName = path.basename(resolved);
      pluginDir = path.join(pluginsDir, dirName);
      if (fs.existsSync(pluginDir)) fs.rmSync(pluginDir, { recursive: true });
      fs.cpSync(resolved, pluginDir, { recursive: true });
      return {
        name: dirName,
        version: '0.0.0',
        path: path.join(pluginDir, 'index.ts'),
      };
    }

    const pluginFileName = path.basename(resolved);
    const name = pluginFileName.replace(/\.(ts|js|mjs)$/, '');
    pluginDir = pluginsDir;
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.copyFileSync(resolved, path.join(pluginDir, pluginFileName));

    return {
      name,
      version: '0.0.0',
      path: path.join(pluginDir, pluginFileName),
    };
  },

  async uninstall(name: string, pluginsDir: string): Promise<void> {
    const pluginPath = path.join(pluginsDir, name);
    if (fs.existsSync(pluginPath)) {
      fs.rmSync(pluginPath, { recursive: true });
    }
    for (const ext of ['.ts', '.js']) {
      const f = path.join(pluginsDir, `${name}${ext}`);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  },
};
