import type { AgentBrowserPlugin, PluginInstaller, InstallResult } from '../types.js';

const BUILTIN_LOADERS: Record<string, () => Promise<AgentBrowserPlugin>> = {};

export const builtinInstaller: PluginInstaller & {
  resolve(name: string): Promise<AgentBrowserPlugin | null>;
  register(name: string, loader: () => Promise<AgentBrowserPlugin>): void;
  listBuiltins(): string[];
} = {
  type: 'builtin',

  detect(): boolean {
    return false;
  },

  async install(): Promise<InstallResult> {
    throw new Error('Builtin plugins cannot be installed. They are always available.');
  },

  async uninstall(name: string): Promise<void> {
    throw new Error(
      `Cannot uninstall builtin plugin "${name}". Builtin plugins are always available.`
    );
  },

  async resolve(name: string): Promise<AgentBrowserPlugin | null> {
    const loader = BUILTIN_LOADERS[name];
    if (!loader) return null;
    const mod = await loader();
    return mod;
  },

  register(name: string, loader: () => Promise<AgentBrowserPlugin>): void {
    BUILTIN_LOADERS[name] = loader;
  },

  listBuiltins(): string[] {
    return Object.keys(BUILTIN_LOADERS);
  },
};
