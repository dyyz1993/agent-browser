import type { Command } from './shared.js';
import { error } from './shared.js';

export function handlePlugin(rest: string[], id: string): Command {
  const subcmd = rest[0];
  if (!subcmd)
    error(
      'Missing subcommand',
      'agent-browser plugin <install|uninstall|update|list|info|search|run|create|publish> [args...]'
    );
  switch (subcmd) {
    case 'install': {
      const source = rest[1];
      if (!source) error('Missing source', 'agent-browser plugin install <source>');
      return { id, action: 'plugin_install' as const, source };
    }
    case 'uninstall': {
      const name = rest[1];
      if (!name) error('Missing name', 'agent-browser plugin uninstall <name>');
      return { id, action: 'plugin_uninstall' as const, name };
    }
    case 'update': {
      const name = rest[1];
      return { id, action: 'plugin_update' as const, name };
    }
    case 'list': {
      const json = rest.includes('--json');
      return { id, action: 'plugin_list' as const, json: json || undefined };
    }
    case 'info': {
      const name = rest[1];
      if (!name) error('Missing name', 'agent-browser plugin info <name>');
      return { id, action: 'plugin_info' as const, name };
    }
    case 'browse': {
      const tagIdx = rest.indexOf('--tag');
      const tag = tagIdx !== -1 && rest[tagIdx + 1] ? rest[tagIdx + 1] : undefined;
      const sortIdx = rest.indexOf('--sort');
      const sortVal = sortIdx !== -1 && rest[sortIdx + 1] ? rest[sortIdx + 1] : undefined;
      const sort =
        sortVal === 'downloads' || sortVal === 'stars' || sortVal === 'updated'
          ? sortVal
          : undefined;
      const json = rest.includes('--json');
      return {
        id,
        action: 'plugin_browse' as const,
        tag,
        sort,
        json: json || undefined,
      };
    }
    case 'search': {
      const keyword = rest[1];
      if (!keyword) error('Missing keyword', 'agent-browser plugin search <keyword>');
      return { id, action: 'plugin_search' as const, keyword };
    }
    case 'run': {
      const pluginName = rest[1];
      const commandName = rest[2] || '';
      if (!pluginName)
        error('Missing plugin name', 'agent-browser plugin run <name> <command> [args...]');
      const runArgs: string[] = [];
      const runFlags: Record<string, string | boolean> = {};
      for (let i = 3; i < rest.length; i++) {
        if (rest[i].startsWith('--')) {
          const key = rest[i];
          const val = rest[i + 1];
          if (val && !val.startsWith('--')) {
            runFlags[key.slice(2)] = val;
            i++;
          } else {
            runFlags[key.slice(2)] = true;
          }
        } else {
          runArgs.push(rest[i]);
        }
      }
      return {
        id,
        action: 'plugin_run' as const,
        pluginName,
        commandName,
        args: runArgs,
        flags: runFlags,
      };
    }
    case 'create': {
      const name = rest[1];
      if (!name)
        error('Missing name', 'agent-browser plugin create <name> [--dir <dir>] [--minimal]');
      const createDirIdx = rest.indexOf('--dir');
      const createDir =
        createDirIdx !== -1 && rest[createDirIdx + 1] ? rest[createDirIdx + 1] : undefined;
      const minimal = rest.includes('--minimal');
      return {
        id,
        action: 'plugin_create' as const,
        name,
        dir: createDir,
        minimal: minimal || undefined,
      };
    }
    case 'publish': {
      const pubDirIdx = rest.indexOf('--dir');
      const pubDir = pubDirIdx !== -1 && rest[pubDirIdx + 1] ? rest[pubDirIdx + 1] : undefined;
      return { id, action: 'plugin_publish' as const, dir: pubDir };
    }
    default:
      error(
        `Unknown plugin subcommand: ${subcmd}`,
        'agent-browser plugin <install|uninstall|update|list|info|search|run|create|publish> [args...]'
      );
  }
}
