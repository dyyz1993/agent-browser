import type {
  AgentBrowserPlugin,
  PluginContext,
  PluginRegistryEntry,
  PluginRegistryFile,
  PluginSource,
  PluginInstaller,
} from './types.js';
import type { BrowserManager } from '../browser/index.js';
import type { InstallResult } from './types.js';
import { createPluginContext } from './context.js';
import { localInstaller } from './installers/local-installer.js';
import { npmInstaller } from './installers/npm-installer.js';
import { gitInstaller } from './installers/git-installer.js';
import { urlInstaller } from './installers/url-installer.js';
import { builtinInstaller } from './installers/builtin-installer.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createJiti } from 'jiti';

const REGISTRY_FILE = 'plugin-registry.json';

const installers: PluginInstaller[] = [
  builtinInstaller as PluginInstaller,
  localInstaller,
  npmInstaller,
  gitInstaller,
  urlInstaller,
];

function getPluginsDirs(): string[] {
  return [
    path.join(process.cwd(), '.agent-browser', 'plugins'),
    path.join(os.homedir(), '.agent-browser', 'plugins'),
  ];
}

function getRegistryPath(pluginsDir: string): string {
  return path.join(pluginsDir, REGISTRY_FILE);
}

function loadRegistry(pluginsDir: string): PluginRegistryFile {
  const registryPath = getRegistryPath(pluginsDir);
  if (!fs.existsSync(registryPath)) return { plugins: {} };
  try {
    return JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  } catch {
    return { plugins: {} };
  }
}

function saveRegistry(pluginsDir: string, registry: PluginRegistryFile): void {
  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.writeFileSync(getRegistryPath(pluginsDir), JSON.stringify(registry, null, 2), 'utf-8');
}

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
});

const pluginCache = new Map<string, { plugin: AgentBrowserPlugin; mtime: number }>();

async function loadPluginFromFile(filePath: string): Promise<AgentBrowserPlugin> {
  const resolved = path.resolve(filePath);

  const stat = fs.statSync(resolved);
  const cached = pluginCache.get(resolved);
  if (cached && cached.mtime === stat.mtimeMs) {
    return cached.plugin;
  }

  const mod = await jiti(resolved);
  const plugin = (mod as Record<string, unknown>)?.default ?? mod;

  if (
    !(plugin as Record<string, unknown>)?.meta ||
    !(plugin as Record<string, unknown>)?.handlers
  ) {
    throw new Error(`Invalid plugin: missing meta or handlers in ${resolved}`);
  }

  pluginCache.set(resolved, { plugin: plugin as AgentBrowserPlugin, mtime: stat.mtimeMs });
  return plugin as AgentBrowserPlugin;
}

const initializedPlugins = new Set<string>();

export class PluginRegistry {
  async install(source: string): Promise<InstallResult & { pluginsDir: string }> {
    for (const installer of installers) {
      if (installer.detect(source)) {
        const pluginsDir = getPluginsDirs()[1];
        const result = await installer.install(source, pluginsDir);
        const sourceType = installer.type;

        const registry = loadRegistry(pluginsDir);
        registry.plugins[result.name] = {
          name: result.name,
          version: result.version,
          source: { type: sourceType as PluginSource['type'], ref: source },
          installedAt: new Date().toISOString(),
          path: result.path,
        };
        saveRegistry(pluginsDir, registry);

        return { ...result, pluginsDir };
      }
    }
    throw new Error(`Cannot detect plugin source type for: ${source}`);
  }

  async uninstall(name: string): Promise<void> {
    if (builtinInstaller.listBuiltins().includes(name)) {
      throw new Error(`Cannot uninstall builtin plugin "${name}"`);
    }

    for (const pluginsDir of getPluginsDirs()) {
      const registry = loadRegistry(pluginsDir);
      const entry = registry.plugins[name];
      if (entry) {
        const installer = installers.find((i) => i.type === entry.source.type);
        if (installer) await installer.uninstall(name, pluginsDir);
        delete registry.plugins[name];
        saveRegistry(pluginsDir, registry);
        return;
      }

      if (fs.existsSync(path.join(pluginsDir, name))) {
        await localInstaller.uninstall(name, pluginsDir);
        return;
      }
    }
    throw new Error(`Plugin "${name}" not found`);
  }

  async update(name?: string): Promise<string[]> {
    const updated: string[] = [];

    for (const pluginsDir of getPluginsDirs()) {
      const registry = loadRegistry(pluginsDir);
      const entries = name ? { [name]: registry.plugins[name] } : registry.plugins;

      for (const [pluginName, entry] of Object.entries(entries)) {
        if (!entry) continue;
        try {
          const installer = installers.find((i) => i.type === entry.source.type);
          if (installer && installer.type !== 'builtin' && installer.type !== 'local') {
            const result = await installer.install(entry.source.ref, pluginsDir);
            registry.plugins[pluginName] = {
              ...registry.plugins[pluginName],
              version: result.version,
              installedAt: new Date().toISOString(),
              path: result.path,
            };
            updated.push(pluginName);
          }
        } catch {
          // skip failed updates
        }
      }
      saveRegistry(pluginsDir, registry);
    }

    for (const n of updated) {
      for (const key of pluginCache.keys()) {
        if (key.includes(n)) pluginCache.delete(key);
      }
    }

    return updated;
  }

  list(): Array<PluginRegistryEntry & { pluginsDir: string }> {
    const all: Array<PluginRegistryEntry & { pluginsDir: string }> = [];

    for (const name of builtinInstaller.listBuiltins()) {
      all.push({
        name,
        version: 'builtin',
        source: { type: 'builtin', ref: 'builtin' },
        installedAt: '',
        path: '',
        pluginsDir: '',
      });
    }

    for (const pluginsDir of getPluginsDirs()) {
      const registry = loadRegistry(pluginsDir);
      for (const entry of Object.values(registry.plugins)) {
        all.push({ ...entry, pluginsDir });
      }
    }

    return all;
  }

  async info(
    name: string
  ): Promise<(PluginRegistryEntry & { pluginsDir: string; plugin: AgentBrowserPlugin }) | null> {
    const builtin = await builtinInstaller.resolve(name);
    if (builtin) {
      return {
        name,
        version: 'builtin',
        source: { type: 'builtin', ref: 'builtin' },
        installedAt: '',
        path: '',
        pluginsDir: '',
        plugin: builtin,
      };
    }

    for (const pluginsDir of getPluginsDirs()) {
      const registry = loadRegistry(pluginsDir);
      const entry = registry.plugins[name];
      if (entry) {
        try {
          const plugin = await loadPluginFromFile(entry.path);
          return { ...entry, pluginsDir, plugin };
        } catch {
          return { ...entry, pluginsDir, plugin: null as unknown as AgentBrowserPlugin };
        }
      }
    }
    return null;
  }

  search(keyword: string): Array<PluginRegistryEntry & { pluginsDir: string }> {
    const lower = keyword.toLowerCase();
    return this.list().filter((e) => e.name.toLowerCase().includes(lower));
  }

  async find(name: string): Promise<AgentBrowserPlugin | null> {
    const builtin = await builtinInstaller.resolve(name);
    if (builtin) return builtin;

    for (const pluginsDir of getPluginsDirs()) {
      const registry = loadRegistry(pluginsDir);
      const entry = registry.plugins[name];
      if (entry) {
        try {
          return await loadPluginFromFile(entry.path);
        } catch {
          continue;
        }
      }
    }

    for (const pluginsDir of getPluginsDirs()) {
      for (const ext of ['.ts', '.js', '.mjs']) {
        const filePath = path.join(pluginsDir, `${name}${ext}`);
        if (fs.existsSync(filePath)) {
          try {
            return await loadPluginFromFile(filePath);
          } catch {
            continue;
          }
        }
      }
      const dirPath = path.join(pluginsDir, name);
      if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        for (const entry of ['index.ts', 'index.js']) {
          const indexPath = path.join(dirPath, entry);
          if (fs.existsSync(indexPath)) {
            try {
              return await loadPluginFromFile(indexPath);
            } catch {
              continue;
            }
          }
        }
      }
    }

    return null;
  }

  async execute(
    pluginName: string,
    commandName: string,
    browser: BrowserManager,
    args: string[],
    flags: Record<string, string | boolean>
  ): Promise<unknown> {
    const plugin = await this.find(pluginName);
    if (!plugin) throw new Error(`Plugin "${pluginName}" not found`);

    const handler = plugin.handlers[commandName];
    if (!handler) {
      const available = Object.keys(plugin.handlers).join(', ');
      throw new Error(
        `Plugin "${pluginName}" has no command "${commandName}". Available: ${available}`
      );
    }

    const ctx: PluginContext = createPluginContext(browser);

    if (plugin.init && !initializedPlugins.has(pluginName)) {
      initializedPlugins.add(pluginName);
      await plugin.init(ctx);
    }

    return handler(ctx, args, flags);
  }
}

export const pluginRegistry = new PluginRegistry();
