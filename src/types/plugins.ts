import type { BaseCommand } from './base.js';

export interface PluginInstallCommand extends BaseCommand {
  action: 'plugin_install';
  source: string;
}

export interface PluginUninstallCommand extends BaseCommand {
  action: 'plugin_uninstall';
  name: string;
}

export interface PluginUpdateCommand extends BaseCommand {
  action: 'plugin_update';
  name?: string;
}

export interface PluginListCommand extends BaseCommand {
  action: 'plugin_list';
  json?: boolean;
}

export interface PluginInfoCommand extends BaseCommand {
  action: 'plugin_info';
  name: string;
}

export interface PluginSearchCommand extends BaseCommand {
  action: 'plugin_search';
  keyword: string;
}

export interface PluginRunCommand extends BaseCommand {
  action: 'plugin_run';
  pluginName: string;
  commandName: string;
  args: string[];
  flags: Record<string, string | boolean>;
}

export interface PluginCreateCommand extends BaseCommand {
  action: 'plugin_create';
  name: string;
  dir?: string;
  minimal?: boolean;
}
