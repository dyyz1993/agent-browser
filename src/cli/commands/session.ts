import type { Command, Flags } from './shared.js';
import { error, parseInFrame, parseSingleStep } from './shared.js';

export function handleSession(
  cmd: string,
  rest: string[],
  id: string,
  flags: Flags
): Command | undefined {
  switch (cmd) {
    case 'close':
    case 'quit':
    case 'exit':
      return { id, action: 'close' };

    case 'tab': {
      const subcmd = rest[0];
      if (!subcmd || subcmd === 'list') return { id, action: 'tab_list' };
      if (subcmd === 'new') {
        const cmd: Command = { id, action: 'tab_new' };
        if (rest[1]) cmd.url = rest[1];
        return cmd;
      }
      if (subcmd === 'close') {
        const cmd: Command = { id, action: 'tab_close' };
        if (rest[1]) cmd.index = parseInt(rest[1], 10);
        return cmd;
      }
      const index = parseInt(subcmd, 10);
      if (!isNaN(index)) return { id, action: 'tab_switch', index };
      error('Unknown tab command', 'agent-browser tab <list|new|close|index>');
    }

    case 'window': {
      if (rest[0] === 'new') return { id, action: 'window_new' };
      error('Unknown window command', 'agent-browser window new');
    }

    case 'frame': {
      if (rest[0] === 'main') return { id, action: 'mainframe' };
      if (rest[0] === 'list' || rest.length === 0) return { id, action: 'frames' };
      const urlIdx = rest.indexOf('--url');
      const nameIdx = rest.indexOf('--name');
      if (urlIdx !== -1) {
        return { id, action: 'frame', url: rest[urlIdx + 1] };
      }
      if (nameIdx !== -1) {
        return { id, action: 'frame', name: rest[nameIdx + 1] };
      }
      const selector = rest.find((r) => !r.startsWith('--'));
      if (selector) return { id, action: 'frame', selector };
      error(
        'Missing frame selector',
        'agent-browser frame <selector|main> [--url <url>] [--name <name>]'
      );
    }

    case 'dialog': {
      const subcmd = rest[0];
      if (!subcmd) error('Missing subcommand', 'agent-browser dialog <accept|dismiss> [text]');
      if (subcmd === 'accept') {
        const cmd: Command = { id, action: 'dialog', response: 'accept' };
        if (rest[1]) cmd.promptText = rest[1];
        return cmd;
      }
      if (subcmd === 'dismiss') return { id, action: 'dialog', response: 'dismiss' };
      error('Unknown dialog command', 'agent-browser dialog <accept|dismiss> [text]');
    }

    case 'trace': {
      const subcmd = rest[0];
      if (!subcmd) error('Missing subcommand', 'agent-browser trace <start|stop> [path]');
      if (subcmd === 'start') return { id, action: 'trace_start' };
      if (subcmd === 'stop') {
        const path = rest[1];
        if (!path) error('Missing path', 'agent-browser trace stop <path>');
        return { id, action: 'trace_stop', path };
      }
      error('Unknown trace command', 'agent-browser trace <start|stop> [path]');
    }

    case 'record': {
      const subcmd = rest[0];
      if (!subcmd)
        error('Missing subcommand', 'agent-browser record <start|stop|restart> [path] [url]');
      if (subcmd === 'start') {
        const path = rest[1];
        if (!path) error('Missing path', 'agent-browser record start <output.webm> [url]');
        const cmd: Command = { id, action: 'recording_start', path };
        if (rest[2]) cmd.url = rest[2].startsWith('http') ? rest[2] : `https://${rest[2]}`;
        return cmd;
      }
      if (subcmd === 'stop') return { id, action: 'recording_stop' };
      if (subcmd === 'restart') {
        const path = rest[1];
        if (!path) error('Missing path', 'agent-browser record restart <output.webm> [url]');
        const cmd: Command = { id, action: 'recording_restart', path };
        if (rest[2]) cmd.url = rest[2].startsWith('http') ? rest[2] : `https://${rest[2]}`;
        return cmd;
      }
      error('Unknown record command', 'agent-browser record <start|stop|restart> [path] [url]');
    }

    case 'recorder': {
      const subcmd = rest[0];
      if (!subcmd)
        error('Missing subcommand', 'agent-browser recorder <start|stop|status> [options]');
      if (subcmd === 'start') {
        const cmd: Command = { id, action: 'recorder_start' };
        const hide = rest.includes('--hide');
        if (hide) cmd.hide = true;
        const urlIdx = rest.findIndex((r, i) => i > 0 && !r.startsWith('-'));
        const url = urlIdx !== -1 ? rest[urlIdx] : undefined;
        if (
          url &&
          (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('about:'))
        ) {
          cmd.url = url;
        } else if (url && !url.startsWith('-')) {
          cmd.url = `https://${url}`;
        }
        return cmd;
      }
      if (subcmd === 'stop') {
        const outputIdx = rest.indexOf('--output');
        const output = outputIdx !== -1 ? rest[outputIdx + 1] : undefined;
        return { id, action: 'recorder_stop', output };
      }
      if (subcmd === 'status') {
        return { id, action: 'recorder_status' };
      }
      if (subcmd === 'replay') {
        const path = rest[1];
        return { id, action: 'recorder_replay', path };
      }
      error(
        'Unknown recorder command',
        'agent-browser recorder <start [url]|stop [--output file.yaml]|status|replay [file.yaml]>'
      );
    }

    case 'console':
      return { id, action: 'console', clear: rest.includes('--clear') };

    case 'errors':
      return { id, action: 'errors', clear: rest.includes('--clear') };

    case 'state': {
      const subcmd = rest[0];
      if (!subcmd) error('Missing subcommand', 'agent-browser state <save|load> <path>');
      const path = rest[1];
      if (!path) error('Missing path', `agent-browser state ${subcmd} <path>`);
      if (subcmd === 'save') return { id, action: 'state_save', path };
      if (subcmd === 'load') return { id, action: 'state_load', path };
      error('Unknown state command', 'agent-browser state <save|load> <path>');
    }

    case 'frames':
    case 'iframes':
      return { id, action: 'frames' };

    case 'viewer':
    case 'preview':
      return { id, action: 'viewer' };

    case 'ask': {
      const question = rest.join(' ');
      if (!question) error('Missing question', 'agent-browser ask <question>');
      return { id, action: 'ask', question };
    }

    case 'config': {
      const json = rest.includes('--json');
      return { id, action: 'config', json };
    }

    case 'devices': {
      return { id, action: 'devices', filter: rest[0] };
    }

    case 'history': {
      const clear = rest.includes('--clear');
      const filterIdx = rest.indexOf('--filter');
      const filter = filterIdx !== -1 ? rest[filterIdx + 1] : undefined;
      return { id, action: 'history', clear, filter };
    }

    case 'pdf': {
      const path = rest[0];
      if (!path) error('Missing path', 'agent-browser pdf <path>');
      return { id, action: 'pdf', path };
    }

    case 'flow': {
      const subcmd = rest[0];
      if (!subcmd)
        error(
          'Missing subcommand',
          'agent-browser flow <run|list|show|validate|register|unregister> [args...]'
        );
      switch (subcmd) {
        case 'run': {
          const siteFlow = rest[1];
          if (!siteFlow)
            error(
              'Missing site.flow reference',
              'agent-browser flow run <site.flow> [--param key=value]'
            );
          const params: Record<string, string> = {};
          let sitesDir: string | undefined;
          let outputFormat: string | undefined;
          let outputFile: string | undefined;
          for (let i = 2; i < rest.length; i++) {
            if (rest[i] === '--param' && rest[i + 1]) {
              const [key, ...valParts] = rest[i + 1].split('=');
              if (key) params[key] = valParts.join('=');
              i++;
            } else if (rest[i] === '--sites-dir' && rest[i + 1]) {
              sitesDir = rest[i + 1];
              i++;
            } else if (rest[i] === '--output' && rest[i + 1]) {
              outputFormat = rest[i + 1];
              i++;
            } else if (rest[i] === '--output-file' && rest[i + 1]) {
              outputFile = rest[i + 1];
              i++;
            }
          }
          const cmd: Command = { id, action: 'flow' };
          cmd.subcommand = 'run';
          cmd.siteFlow = siteFlow;
          cmd.params = params;
          if (sitesDir) cmd.sitesDir = sitesDir;
          if (outputFormat) cmd.outputFormat = outputFormat;
          if (outputFile) cmd.outputFile = outputFile;
          return cmd;
        }
        case 'list': {
          const cmd: Command = { id, action: 'flow' };
          cmd.subcommand = 'list';
          cmd.json = rest.includes('--json');
          const sitesDirIdx = rest.indexOf('--sites-dir');
          if (sitesDirIdx !== -1 && rest[sitesDirIdx + 1]) {
            cmd.sitesDir = rest[sitesDirIdx + 1];
          }
          return cmd;
        }
        case 'show': {
          const siteFlow = rest[1];
          if (!siteFlow)
            error('Missing site.flow reference', 'agent-browser flow show <site.flow>');
          const cmd: Command = { id, action: 'flow' };
          cmd.subcommand = 'show';
          cmd.siteFlow = siteFlow;
          const sitesDirIdx = rest.indexOf('--sites-dir');
          if (sitesDirIdx !== -1 && rest[sitesDirIdx + 1]) {
            cmd.sitesDir = rest[sitesDirIdx + 1];
          }
          return cmd;
        }
        case 'validate': {
          const filePath = rest[1];
          if (!filePath) error('Missing file path', 'agent-browser flow validate <file.yaml>');
          const cmd: Command = { id, action: 'flow' };
          cmd.subcommand = 'validate';
          cmd.filePath = filePath;
          return cmd;
        }
        case 'register': {
          const cmd: Command = { id, action: 'flow' };
          cmd.subcommand = 'register';
          const fileIdx = rest.indexOf('--file');
          const urlIdx = rest.indexOf('--url');
          const nameIdx = rest.indexOf('--name');
          if (fileIdx !== -1 && rest[fileIdx + 1]) {
            cmd.sourceFile = rest[fileIdx + 1];
          } else if (urlIdx !== -1 && rest[urlIdx + 1]) {
            cmd.sourceUrl = rest[urlIdx + 1];
          } else {
            error(
              'Missing --file or --url',
              'agent-browser flow register --file <path>|--url <url> [--name <name>]'
            );
          }
          if (nameIdx !== -1 && rest[nameIdx + 1]) {
            cmd.siteName = rest[nameIdx + 1];
          }
          return cmd;
        }
        case 'unregister': {
          const name = rest[1];
          if (!name) error('Missing site name', 'agent-browser flow unregister <name>');
          const cmd: Command = { id, action: 'flow' };
          cmd.subcommand = 'unregister';
          cmd.siteName = name;
          return cmd;
        }
        case 'from-recorder': {
          const recorderFile = rest[1];
          if (!recorderFile)
            error(
              'Missing recorder YAML file',
              'agent-browser flow from-recorder <recorder-yaml-file> [options]'
            );
          const fromRecCmd: Command = { id, action: 'flow' };
          fromRecCmd.subcommand = 'from-recorder';
          fromRecCmd.recorderFile = recorderFile;
          const nameIdx = rest.indexOf('--name');
          if (nameIdx !== -1 && rest[nameIdx + 1]) fromRecCmd.siteName = rest[nameIdx + 1];
          const flowIdx = rest.indexOf('--flow-id');
          if (flowIdx !== -1 && rest[flowIdx + 1]) fromRecCmd.flowId = rest[flowIdx + 1];
          const baseIdx = rest.indexOf('--base-url');
          if (baseIdx !== -1 && rest[baseIdx + 1]) fromRecCmd.baseUrl = rest[baseIdx + 1];
          const descIdx = rest.indexOf('--description');
          if (descIdx !== -1 && rest[descIdx + 1]) fromRecCmd.description = rest[descIdx + 1];
          const outIdx = rest.indexOf('--output');
          if (outIdx !== -1 && rest[outIdx + 1]) fromRecCmd.outputFile = rest[outIdx + 1];
          const maxIdx = rest.indexOf('--max-pages');
          if (maxIdx !== -1 && rest[maxIdx + 1])
            fromRecCmd.maxPaginateIterations = parseInt(rest[maxIdx + 1], 10);
          return fromRecCmd;
        }
        case 'export': {
          const filePath = rest[1];
          if (!filePath)
            error('Missing file path', 'agent-browser flow export <file.yaml> --format <format>');
          const formatIdx = rest.indexOf('--format');
          const format =
            formatIdx !== -1 && rest[formatIdx + 1] ? rest[formatIdx + 1] : 'playwright';
          const cmd: Command = { id, action: 'flow' };
          cmd.subcommand = 'export';
          cmd.filePath = filePath;
          cmd.format = format;
          const headlessIdx = rest.indexOf('--headless');
          if (headlessIdx !== -1 && rest[headlessIdx + 1])
            cmd.headless = rest[headlessIdx + 1] !== 'false';
          const baseUrlIdx = rest.indexOf('--base-url');
          if (baseUrlIdx !== -1 && rest[baseUrlIdx + 1]) cmd.baseUrl = rest[baseUrlIdx + 1];
          return cmd;
        }
        default:
          error(
            `Unknown flow subcommand: ${subcmd}`,
            'agent-browser flow <run|list|show|validate|register|unregister|from-recorder|export> [args...]'
          );
      }
    }

    case 'interact': {
      const cmd: Command = { id, action: 'interact' };

      const fileIndex = rest.indexOf('--file');
      if (fileIndex >= 0 && rest[fileIndex + 1]) {
        cmd.file = rest[fileIndex + 1];
      } else if (rest[0]) {
        try {
          const steps = JSON.parse(rest[0]);
          cmd.steps = steps as any;
        } catch {
          const stepAction = rest[0];
          if (stepAction) {
            cmd.steps = parseSingleStep(stepAction, rest.slice(1));
          }
        }
      }

      const timeoutIndex = rest.indexOf('--timeout');
      if (timeoutIndex >= 0 && rest[timeoutIndex + 1]) {
        cmd.timeout = parseInt(rest[timeoutIndex + 1], 10);
      }

      cmd.headless = !rest.includes('--headed');

      return cmd;
    }

    default:
      return undefined;
  }
}
