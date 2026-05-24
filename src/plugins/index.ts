import './builtins/index.js';

export type {
  AgentBrowserPlugin,
  PluginContext,
  PluginMeta,
  PluginCommandMeta,
  PluginCommandHandler,
  PluginRegistryEntry,
  PluginSource,
  PluginSourceType,
  PluginPermission,
} from './types.js';
export { createPluginContext } from './context.js';
export { createPermissionCheckedContext } from './permission-check.js';
export { PluginRegistry, pluginRegistry } from './registry.js';
export { builtinInstaller } from './installers/builtin-installer.js';
