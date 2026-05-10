import type { PluginInstaller, InstallResult } from '../types.js';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const gitInstaller: PluginInstaller = {
  type: 'git',

  detect(source: string): boolean {
    return (
      source.endsWith('.git') ||
      source.includes('github.com/') ||
      source.includes('gitlab.com/') ||
      source.startsWith('git+') ||
      source.startsWith('git://')
    );
  },

  async install(source: string, pluginsDir: string): Promise<InstallResult> {
    const url = source.replace(/^git\+/, '');

    const baseName =
      url
        .replace(/\.git$/, '')
        .split('/')
        .pop() || 'unknown';
    const name = baseName
      .replace(/^agent-browser-plugin-/, '')
      .replace(/^ab-plugin-/, '')
      .replace(/^plugin-/, '');

    const targetDir = path.join(pluginsDir, name);
    fs.mkdirSync(pluginsDir, { recursive: true });
    if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true });

    try {
      execSync(`git clone --depth 1 "${url}" "${targetDir}" 2>&1`, {
        stdio: 'pipe',
        timeout: 60000,
      });
    } catch (e: unknown) {
      throw new Error(`git clone failed: ${(e as Error).message}`);
    }

    let version = '0.0.0';
    const pkgJson = path.join(targetDir, 'package.json');
    if (fs.existsSync(pkgJson)) {
      const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf-8'));
      version = pkg.version || version;
    }

    let entryPath = path.join(targetDir, 'index.ts');
    if (!fs.existsSync(entryPath)) entryPath = path.join(targetDir, 'index.js');
    if (fs.existsSync(pkgJson)) {
      const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf-8'));
      if (pkg.main) entryPath = path.join(targetDir, pkg.main);
    }

    return { name, version, path: entryPath };
  },

  async uninstall(name: string, pluginsDir: string): Promise<void> {
    const targetDir = path.join(pluginsDir, name);
    if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true });
  },
};
