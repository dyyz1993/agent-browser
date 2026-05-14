import type { Command, Flags } from './shared.js';
import { CliError, error, genId, findSimilar } from './shared.js';
import { handleNavigate, handleConnect } from './navigate.js';
import {
  handleInteract,
  handleWait,
  handleScreenshot,
  handleSnapshot,
  handleEval,
} from './interact.js';
import { handleGet, handleIs, handleFind, handleMouse, handleSet } from './query.js';
import { handleNetwork } from './network.js';
import { handleSession } from './session.js';
import { handlePlugin } from './plugin.js';

export { CliError };

export function parseCommand(args: string[], flags: Flags): Command {
  if (args.length === 0) {
    error('No command provided', 'agent-browser <command> [args...]');
  }

  const cmd = args[0];
  const rest = args.slice(1);
  const id = genId();

  switch (cmd) {
    case 'open':
    case 'goto':
    case 'navigate':
      return handleNavigate(cmd, rest, id, flags);
    case 'back':
      return { id, action: 'back' };
    case 'forward':
      return { id, action: 'forward' };
    case 'reload':
      return { id, action: 'reload' };

    case 'click':
    case 'dblclick':
    case 'fill':
    case 'type':
    case 'hover':
    case 'focus':
    case 'check':
    case 'uncheck':
    case 'select':
    case 'drag':
    case 'upload':
    case 'download':
    case 'press':
    case 'key':
    case 'keydown':
    case 'keyup':
    case 'scroll':
    case 'scrollintoview':
    case 'scrollinto':
    case 'highlight':
    case 'tap':
    case 'swipe': {
      const result = handleInteract(cmd, rest, id, flags);
      if (result !== undefined) return result;
      break;
    }

    case 'wait':
      return handleWait(rest, id);

    case 'screenshot':
      return handleScreenshot(rest, id);

    case 'snapshot':
      return handleSnapshot(rest, id);

    case 'eval':
      return handleEval(rest, id);

    case 'pdf':
      return {
        id,
        action: 'pdf',
        path: rest[0] || error('Missing path', 'agent-browser pdf <path>'),
      };

    case 'get':
      return handleGet(rest, id);

    case 'is':
      return handleIs(rest, id);

    case 'find':
      return handleFind(rest, id);

    case 'mouse':
      return handleMouse(rest, id, flags);

    case 'set':
      return handleSet(rest, id);

    case 'network':
    case 'storage':
    case 'cookies':
    case 'scrape':
    case 'crawl':
    case 'map':
    case 'search': {
      const result = handleNetwork(cmd, rest, id, flags);
      if (result !== undefined) return result;
      break;
    }

    case 'close':
    case 'quit':
    case 'exit':
    case 'tab':
    case 'window':
    case 'frame':
    case 'dialog':
    case 'trace':
    case 'record':
    case 'recorder':
    case 'console':
    case 'errors':
    case 'state':
    case 'frames':
    case 'iframes':
    case 'viewer':
    case 'preview':
    case 'ask':
    case 'config':
    case 'devices':
    case 'history':
    case 'flow':
    case 'interact': {
      const result = handleSession(cmd, rest, id, flags);
      if (result !== undefined) return result;
      break;
    }

    case 'connect':
      return handleConnect(rest, id);

    case 'plugin':
      return handlePlugin(rest, id);

    default:
      break;
  }

  const allCommands = [
    'open',
    'goto',
    'navigate',
    'click',
    'dblclick',
    'type',
    'fill',
    'press',
    'hover',
    'focus',
    'check',
    'uncheck',
    'select',
    'drag',
    'upload',
    'download',
    'scroll',
    'scrollintoview',
    'wait',
    'screenshot',
    'pdf',
    'snapshot',
    'eval',
    'connect',
    'scrape',
    'search',
    'crawl',
    'map',
    'close',
    'back',
    'forward',
    'reload',
    'get',
    'is',
    'find',
    'mouse',
    'set',
    'network',
    'cookies',
    'storage',
    'tab',
    'trace',
    'record',
    'recorder',
    'console',
    'errors',
    'highlight',
    'state',
    'session',
    'kill',
    'update',
    'restart',
    'viewer',
    'ask',
    'config',
    'devices',
    'install',
    'dialog',
    'window',
    'history',
    'frames',
    'flow',
    'plugin',
    'interact',
  ];
  const subCommand = rest[0] || '';
  const pluginArgs: string[] = [];
  const pluginFlags: Record<string, string | boolean> = {};
  for (let i = subCommand ? 1 : 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      const key = rest[i];
      const val = rest[i + 1];
      if (val && !val.startsWith('--')) {
        pluginFlags[key.slice(2)] = val;
        i++;
      } else {
        pluginFlags[key.slice(2)] = true;
      }
    } else {
      pluginArgs.push(rest[i]);
    }
  }
  return {
    id,
    action: 'plugin_run',
    pluginName: cmd,
    commandName: subCommand,
    args: pluginArgs,
    flags: pluginFlags,
  };
}
