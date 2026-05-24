import type { BrowserManager } from '../browser/index.js';
import type { AnyCommand, Response } from '../types.js';
import { successResponse, errorResponse } from '../protocol.js';
import { pluginRegistry } from '../plugins/index.js';
import { publishPlugin } from '../plugins/marketplace/publish.js';
import { MarketplaceRegistry } from '../plugins/marketplace/index.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export async function handlePluginCommand(
  command: AnyCommand,
  browser: BrowserManager
): Promise<Response> {
  switch (command.action) {
    case 'plugin_install': {
      try {
        const result = await pluginRegistry.install(command.source as string);
        return successResponse(command.id, {
          installed: true,
          name: result.name,
          version: result.version,
          path: result.path,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return errorResponse(command.id, `Install failed: ${msg}`);
      }
    }

    case 'plugin_uninstall': {
      try {
        await pluginRegistry.uninstall(command.name as string);
        return successResponse(command.id, { uninstalled: true, name: command.name });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return errorResponse(command.id, `Uninstall failed: ${msg}`);
      }
    }

    case 'plugin_update': {
      try {
        const updated = await pluginRegistry.update(command.name as string | undefined);
        return successResponse(command.id, {
          updated: updated.length,
          plugins: updated,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return errorResponse(command.id, `Update failed: ${msg}`);
      }
    }

    case 'plugin_list': {
      const plugins = pluginRegistry.list();
      if (command.json) {
        return successResponse(command.id, { plugins });
      }
      const lines = ['INSTALLED PLUGINS', ''];
      if (plugins.length === 0) {
        lines.push('  (none)');
      } else {
        for (const p of plugins) {
          const src = p.source.type;
          const tag = src === 'builtin' ? ' (builtin, cannot uninstall)' : '';
          lines.push(`  ${p.name.padEnd(16)} v${p.version.padEnd(8)} ${src.padEnd(8)}${tag}`);
        }
      }
      return successResponse(command.id, { text: lines.join('\n'), plugins });
    }

    case 'plugin_info': {
      const info = await pluginRegistry.info(command.name as string);
      if (!info) {
        try {
          const registry = new MarketplaceRegistry();
          const mp = await registry.getPlugin(command.name as string);
          if (mp) {
            const lines = [
              `Plugin: ${mp.name} (from marketplace, not installed)`,
              `Version: ${mp.version}`,
              `Author: ${mp.author}`,
              `Description: ${mp.description}`,
              `Repository: ${mp.repository}`,
              `Tags: ${mp.tags.join(', ')}`,
              '',
              'Commands:',
            ];
            for (const [cmd, meta] of Object.entries(mp.commands)) {
              lines.push(
                `  ${cmd.padEnd(16)} ${(meta as { description?: string }).description ?? ''}`
              );
            }
            lines.push('', `Install with: agent-browser plugin install ${mp.installSource}`);
            return successResponse(command.id, {
              text: lines.join('\n'),
              marketplace: true,
              ...mp,
            });
          }
        } catch {
          /* marketplace unavailable */
        }
        return errorResponse(command.id, `Plugin "${command.name}" not found`);
      }
      const lines = [
        `Plugin: ${info.name}`,
        `Version: ${info.version}`,
        `Source:  ${info.source.type} (${info.source.ref})`,
        `Installed: ${info.installedAt || 'builtin'}`,
      ];
      if (info.plugin?.meta?.commands) {
        lines.push('', 'Commands:');
        for (const [cmd, meta] of Object.entries(info.plugin.meta.commands)) {
          const m = meta as { description?: string; usage?: string };
          lines.push(`  ${cmd.padEnd(12)} ${m.description ?? ''}`);
          if (m.usage) lines.push(`  ${''.padEnd(12)} ${m.usage}`);
        }
      }
      return successResponse(command.id, { text: lines.join('\n'), ...info });
    }

    case 'plugin_search': {
      const results = pluginRegistry.search(command.keyword as string);
      if (results.length > 0) {
        return successResponse(command.id, {
          keyword: command.keyword,
          found: results.length,
          plugins: results,
        });
      }
      try {
        const registry = new MarketplaceRegistry();
        const searchResult = await registry.search(command.keyword as string);
        const lines = ['SEARCH RESULTS (from marketplace)', ''];
        if (searchResult.results.length === 0) {
          lines.push('  (no results)');
        } else {
          for (const p of searchResult.results) {
            const tags = p.tags.length > 0 ? ` [${p.tags.join(', ')}]` : '';
            const stars = p.stars != null ? ` \u2605 ${p.stars}` : '';
            lines.push(
              `  ${p.name.padEnd(16)} v${p.version.padEnd(8)} ${p.description}${tags}${stars}`
            );
          }
          lines.push('', 'Install with: agent-browser plugin install <name>');
        }
        return successResponse(command.id, {
          keyword: command.keyword,
          found: searchResult.total,
          plugins: searchResult.results,
          marketplace: true,
          text: lines.join('\n'),
        });
      } catch {
        return successResponse(command.id, {
          keyword: command.keyword,
          found: 0,
          plugins: [],
          marketplaceError: 'Marketplace unavailable. Check your network connection.',
        });
      }
    }

    case 'plugin_browse': {
      try {
        const registry = new MarketplaceRegistry();
        const plugins = await registry.list({
          tag: command.tag as string | undefined,
          sort: command.sort as 'downloads' | 'stars' | 'updated' | undefined,
        });
        if (command.json) {
          return successResponse(command.id, { plugins });
        }
        const lines = ['Available Plugins (from marketplace)', ''];
        if (plugins.length === 0) {
          lines.push('  (no plugins found)');
        } else {
          for (const p of plugins) {
            const tags = p.tags.length > 0 ? ` [${p.tags.join(', ')}]` : '';
            const stars = p.stars != null ? ` \u2605 ${p.stars}` : '';
            lines.push(
              `  ${p.name.padEnd(16)} v${p.version.padEnd(8)} ${p.description}${tags}${stars}`
            );
          }
          lines.push('', 'Install with: agent-browser plugin install <name>');
        }
        return successResponse(command.id, { text: lines.join('\n'), plugins });
      } catch {
        return errorResponse(command.id, 'Marketplace unavailable. Check your network connection.');
      }
    }

    case 'plugin_run': {
      try {
        const result = await pluginRegistry.execute(
          command.pluginName as string,
          command.commandName as string,
          browser,
          command.args as string[],
          command.flags as Record<string, string | boolean>
        );
        return successResponse(command.id, {
          plugin: command.pluginName,
          command: command.commandName,
          result,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return errorResponse(command.id, `Plugin run failed: ${msg}`);
      }
    }

    case 'plugin_create': {
      try {
        const result = createPluginTemplate(
          command.name as string,
          command.dir as string | undefined,
          command.minimal as boolean | undefined
        );
        return successResponse(command.id, {
          created: true,
          name: command.name,
          path: result.path,
          files: result.files,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return errorResponse(command.id, `Create failed: ${msg}`);
      }
    }

    case 'plugin_publish': {
      try {
        const { prUrl, entry } = await publishPlugin(command.dir as string | undefined);
        const isGhPr = prUrl.includes('github.com') && !prUrl.includes('compare');
        if (isGhPr) {
          return successResponse(command.id, {
            submitted: true,
            prUrl,
            plugin: entry.name,
            version: entry.version,
            text: `Plugin submitted! PR: ${prUrl}`,
          });
        }
        return successResponse(command.id, {
          submitted: false,
          prUrl,
          plugin: entry.name,
          version: entry.version,
          text: `Open this URL to submit: ${prUrl}`,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return errorResponse(command.id, `Publish failed: ${msg}`);
      }
    }

    default:
      return errorResponse(command.id, `Unknown plugin action: ${command.action}`);
  }
}

function createPluginTemplate(
  name: string,
  dir?: string,
  minimal?: boolean
): { path: string; files: string[] } {
  const pluginsDir = dir ?? path.join(os.homedir(), '.agent-browser', 'plugins');
  const pluginDir = path.join(pluginsDir, name);

  if (fs.existsSync(pluginDir)) {
    throw new Error(`Plugin directory already exists: ${pluginDir}`);
  }

  fs.mkdirSync(pluginDir, { recursive: true });
  const files: string[] = [];

  const indexPath = path.join(pluginDir, 'index.ts');
  const template = minimal ? generateMinimalTemplate(name) : generateFullTemplate(name);
  fs.writeFileSync(indexPath, template, 'utf-8');
  files.push(indexPath);

  const pkgPath = path.join(pluginDir, 'package.json');
  fs.writeFileSync(
    pkgPath,
    JSON.stringify(
      {
        name: `agent-browser-plugin-${name}`,
        version: '0.1.0',
        type: 'module',
        main: 'index.ts',
        description: `${name} plugin for agent-browser`,
      },
      null,
      2
    ),
    'utf-8'
  );
  files.push(pkgPath);

  const readmePath = path.join(pluginDir, 'README.md');
  fs.writeFileSync(
    readmePath,
    `# agent-browser-plugin-${name}\n\n${name} plugin for agent-browser.\n\n## Usage\n\n\`\`\`bash\nagent-browser ${name} <command> [args]\n\`\`\`\n\n## Commands\n\nSee plugin meta for available commands.\n`,
    'utf-8'
  );
  files.push(readmePath);

  return { path: pluginDir, files };
}

function generateFullTemplate(pluginName: string): string {
  return `import type { AgentBrowserPlugin } from '@dyyz1993/agent-browser/plugins';

export default {
  meta: {
    name: '${pluginName}',
    version: '0.1.0',
    description: '${pluginName} plugin for agent-browser',
    commands: {
      hello: {
        description: 'Say hello',
        usage: 'agent-browser ${pluginName} hello [--name <name>]',
        options: {
          '--name': 'Name to greet (default: World)',
        },
      },
      scrape: {
        description: 'Scrape a URL',
        usage: 'agent-browser ${pluginName} scrape <url> [--format markdown|html|text]',
        options: {
          '--format': 'Output format (default: markdown)',
        },
      },
    },
  },

  async init(ctx) {
    console.log('[${pluginName}] Plugin initialized');
  },

  async cleanup() {
    console.log('[${pluginName}] Plugin cleaned up');
  },

  handlers: {
    async hello(ctx, args, flags) {
      const name = typeof flags.name === 'string' ? flags.name : 'World';
      return { message: \`Hello, \${name}!\` };
    },

    async scrape(ctx, args, flags) {
      const url = args[0];
      if (!url) throw new Error('URL is required. Usage: agent-browser ${pluginName} scrape <url>');

      const format = typeof flags.format === 'string' ? flags.format : 'markdown';
      const content = await ctx.scrape(url, { format });

      return {
        url,
        format,
        content: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
        length: content.length,
      };
    },
  },
} satisfies AgentBrowserPlugin;
`;
}

function generateMinimalTemplate(pluginName: string): string {
  return `import type { AgentBrowserPlugin } from '@dyyz1993/agent-browser/plugins';

export default {
  meta: {
    name: '${pluginName}',
    version: '0.1.0',
    commands: {
      run: {
        description: 'Run ${pluginName}',
        usage: 'agent-browser ${pluginName} run [args]',
      },
    },
  },
  handlers: {
    async run(ctx, args, flags) {
      return { message: '${pluginName} plugin running', args };
    },
  },
} satisfies AgentBrowserPlugin;
`;
}
