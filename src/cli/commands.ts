import { Command } from './connection.js';
import { Flags } from './flags.js';
import { parseHumanFlag } from '../human-mouse.js';

export class CliError extends Error {
  constructor(
    message: string,
    public usage?: string
  ) {
    super(message);
    this.name = 'CliError';
  }
}

function error(message: string, usage?: string): never {
  throw new CliError(message, usage);
}

function genId(): string {
  return `n${Date.now() % 1000000}`;
}

function parseInFrame(args: string[]): { inFrame?: string; remaining: string[] } {
  let inFrame: string | undefined;
  const remaining: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--in-frame' || args[i] === '-f') {
      inFrame = args[i + 1];
      i++;
    } else {
      remaining.push(args[i]);
    }
  }

  return { inFrame, remaining };
}

type DiffScope = number | 'full' | string;

function parseDiff(args: string[]): { diffScope?: DiffScope; remaining: string[] } {
  const diffIdx = args.indexOf('--diff');
  if (diffIdx === -1) {
    return { remaining: args };
  }

  const remaining = [...args];
  remaining.splice(diffIdx, 1);

  const nextArg = remaining[diffIdx];
  if (nextArg === 'full') {
    remaining.splice(diffIdx, 1);
    return { diffScope: 'full', remaining };
  }

  if (nextArg && /^\d+$/.test(nextArg)) {
    remaining.splice(diffIdx, 1);
    return { diffScope: parseInt(nextArg, 10), remaining };
  }

  if (nextArg && !nextArg.startsWith('-') && !nextArg.startsWith('@')) {
    remaining.splice(diffIdx, 1);
    return { diffScope: nextArg, remaining };
  }

  return { diffScope: 3, remaining };
}

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
    case 'navigate': {
      const url = rest[0];
      if (!url) error('Missing URL', 'agent-browser open <url>');
      const urlLower = url.toLowerCase();
      const formattedUrl =
        urlLower.startsWith('http://') ||
        urlLower.startsWith('https://') ||
        urlLower.startsWith('about:') ||
        urlLower.startsWith('data:') ||
        urlLower.startsWith('file:')
          ? url
          : `https://${url}`;
      const navCmd: Command = { id, action: 'navigate', url: formattedUrl };
      if (flags.headers) {
        try {
          navCmd.headers = JSON.parse(flags.headers);
        } catch {}
      }
      if (flags.provider === 'ios' && flags.device) {
        navCmd.iosDevice = flags.device;
      }
      return navCmd;
    }
    case 'back':
      return { id, action: 'back' };
    case 'forward':
      return { id, action: 'forward' };
    case 'reload':
      return { id, action: 'reload' };

    case 'click': {
      const { inFrame, remaining: r1 } = parseInFrame(rest);
      const { diffScope, remaining: r2 } = parseDiff(r1);
      const { config: human, remaining } = parseHumanFlag(r2);
      const selector = remaining[0];
      if (!selector)
        error(
          'Missing selector',
          'agent-browser click <selector> [--diff [scope]] [--in-frame <path>] [--human [bezier|arc|random|linear]]'
        );
      const cmd: Command = { id, action: 'click', selector, inFrame, diffScope };
      if (human.enabled) cmd.human = human;
      return cmd;
    }
    case 'dblclick': {
      const { inFrame, remaining: r1 } = parseInFrame(rest);
      const { diffScope, remaining: r2 } = parseDiff(r1);
      const { config: human, remaining } = parseHumanFlag(r2);
      const selector = remaining[0];
      if (!selector)
        error(
          'Missing selector',
          'agent-browser dblclick <selector> [--diff [scope]] [--in-frame <path>] [--human [bezier|arc|random|linear]]'
        );
      const cmd: Command = { id, action: 'dblclick', selector, inFrame, diffScope };
      if (human.enabled) cmd.human = human;
      return cmd;
    }
    case 'fill': {
      const { inFrame, remaining: r1 } = parseInFrame(rest);
      const { diffScope, remaining: r2 } = parseDiff(r1);
      const { config: human, remaining } = parseHumanFlag(r2);
      const selector = remaining[0];
      const value = remaining.slice(1).join(' ');
      if (!selector || !value)
        error(
          'Missing selector or value',
          'agent-browser fill <selector> <text> [--diff [scope]] [--in-frame <path>] [--human [bezier|arc|random|linear]]'
        );
      const cmd: Command = { id, action: 'fill', selector, value, inFrame, diffScope };
      if (human.enabled) cmd.human = human;
      return cmd;
    }
    case 'type': {
      const { inFrame, remaining: r1 } = parseInFrame(rest);
      const { diffScope, remaining: r2 } = parseDiff(r1);
      const { config: human, remaining } = parseHumanFlag(r2);
      const selector = remaining[0];
      const text = remaining.slice(1).join(' ');
      if (!selector || !text)
        error(
          'Missing selector or text',
          'agent-browser type <selector> <text> [--diff [scope]] [--in-frame <path>] [--human [bezier|arc|random|linear]]'
        );
      const cmd: Command = { id, action: 'type', selector, text, inFrame, diffScope };
      if (human.enabled) cmd.human = human;
      return cmd;
    }
    case 'hover': {
      const { inFrame, remaining: r1 } = parseInFrame(rest);
      const { diffScope, remaining: r2 } = parseDiff(r1);
      const { config: human, remaining } = parseHumanFlag(r2);
      const selector = remaining[0];
      if (!selector)
        error(
          'Missing selector',
          'agent-browser hover <selector> [--diff [scope]] [--in-frame <path>] [--human [bezier|arc|random|linear]]'
        );
      const cmd: Command = { id, action: 'hover', selector, inFrame, diffScope };
      if (human.enabled) cmd.human = human;
      return cmd;
    }
    case 'focus': {
      const { inFrame, remaining: r1 } = parseInFrame(rest);
      const { diffScope, remaining } = parseDiff(r1);
      const selector = remaining[0];
      if (!selector)
        error(
          'Missing selector',
          'agent-browser focus <selector> [--diff [scope]] [--in-frame <path>]'
        );
      return { id, action: 'focus', selector, inFrame, diffScope };
    }
    case 'check': {
      const { inFrame, remaining: r1 } = parseInFrame(rest);
      const { diffScope, remaining } = parseDiff(r1);
      const selector = remaining[0];
      if (!selector)
        error(
          'Missing selector',
          'agent-browser check <selector> [--diff [scope]] [--in-frame <path>]'
        );
      return { id, action: 'check', selector, inFrame, diffScope };
    }
    case 'uncheck': {
      const { inFrame, remaining: r1 } = parseInFrame(rest);
      const { diffScope, remaining } = parseDiff(r1);
      const selector = remaining[0];
      if (!selector)
        error(
          'Missing selector',
          'agent-browser uncheck <selector> [--diff [scope]] [--in-frame <path>]'
        );
      return { id, action: 'uncheck', selector, inFrame, diffScope };
    }
    case 'select': {
      const { inFrame, remaining: r1 } = parseInFrame(rest);
      const { diffScope, remaining } = parseDiff(r1);
      const selector = remaining[0];
      const values = remaining.slice(1);
      if (!selector || values.length === 0)
        error(
          'Missing selector or values',
          'agent-browser select <selector> <value...> [--diff [scope]] [--in-frame <path>]'
        );
      return {
        id,
        action: 'select',
        selector,
        values: values.length === 1 ? values[0] : values,
        inFrame,
        diffScope,
      };
    }
    case 'drag': {
      const source = rest[0];
      const target = rest[1];
      if (!source || !target)
        error('Missing source or target', 'agent-browser drag <source> <target>');
      return { id, action: 'drag', source, target };
    }
    case 'upload': {
      const selector = rest[0];
      const files = rest.slice(1);
      if (!selector || files.length === 0)
        error('Missing selector or files', 'agent-browser upload <selector> <files...>');
      return { id, action: 'upload', selector, files };
    }
    case 'download': {
      const selector = rest[0];
      const path = rest[1];
      if (!selector || !path)
        error('Missing selector or path', 'agent-browser download <selector> <path>');
      return { id, action: 'download', selector, path };
    }

    case 'press':
    case 'key': {
      const { diffScope, remaining } = parseDiff(rest);
      const key = remaining[0];
      if (!key) error('Missing key', 'agent-browser press <key> [--diff [scope]]');
      return { id, action: 'press', key, diffScope };
    }
    case 'keydown': {
      const key = rest[0];
      if (!key) error('Missing key', 'agent-browser keydown <key>');
      return { id, action: 'keydown', key };
    }
    case 'keyup': {
      const key = rest[0];
      if (!key) error('Missing key', 'agent-browser keyup <key>');
      return { id, action: 'keyup', key };
    }

    case 'scroll': {
      const direction = rest[0] || 'down';
      const amount = rest[1] ? parseInt(rest[1], 10) : 300;
      return { id, action: 'scroll', direction, amount };
    }
    case 'scrollintoview':
    case 'scrollinto': {
      const selector = rest[0];
      if (!selector) error('Missing selector', 'agent-browser scrollintoview <selector>');
      return { id, action: 'scrollintoview', selector };
    }

    case 'wait': {
      if (rest.includes('--url') || rest.includes('-u')) {
        const urlIdx = rest.includes('--url') ? rest.indexOf('--url') : rest.indexOf('-u');
        const url = rest[urlIdx + 1];
        if (!url) error('Missing URL pattern', 'agent-browser wait --url <pattern>');
        return { id, action: 'waitforurl', url };
      }
      if (rest.includes('--load') || rest.includes('-l')) {
        const loadIdx = rest.includes('--load') ? rest.indexOf('--load') : rest.indexOf('-l');
        const state = rest[loadIdx + 1];
        if (!state) error('Missing load state', 'agent-browser wait --load <state>');
        return { id, action: 'waitforloadstate', state };
      }
      if (rest.includes('--fn') || rest.includes('-f')) {
        const fnIdx = rest.includes('--fn') ? rest.indexOf('--fn') : rest.indexOf('-f');
        const expression = rest[fnIdx + 1];
        if (!expression) error('Missing expression', 'agent-browser wait --fn <expression>');
        return { id, action: 'waitforfunction', expression };
      }
      if (rest.includes('--text') || rest.includes('-t')) {
        const textIdx = rest.includes('--text') ? rest.indexOf('--text') : rest.indexOf('-t');
        const text = rest[textIdx + 1];
        if (!text) error('Missing text', 'agent-browser wait --text <text>');
        return { id, action: 'wait', selector: `text=${text}` };
      }
      if (rest.includes('--download') || rest.includes('-d')) {
        const cmd: Command = { id, action: 'waitfordownload' };
        const dlIdx = rest.includes('--download') ? rest.indexOf('--download') : rest.indexOf('-d');
        if (rest[dlIdx + 1] && !rest[dlIdx + 1].startsWith('--')) cmd.path = rest[dlIdx + 1];
        const timeoutIdx = rest.indexOf('--timeout');
        if (timeoutIdx !== -1 && rest[timeoutIdx + 1])
          cmd.timeout = parseInt(rest[timeoutIdx + 1], 10);
        return cmd;
      }
      if (rest.includes('--request') || rest.includes('-r')) {
        const reqIdx = rest.includes('--request') ? rest.indexOf('--request') : rest.indexOf('-r');
        const url = rest[reqIdx + 1];
        if (!url) error('Missing URL pattern', 'agent-browser wait --request <pattern>');
        const cmd: Command = { id, action: 'responsebody', url };
        const timeoutIdx = rest.indexOf('--timeout');
        if (timeoutIdx !== -1 && rest[timeoutIdx + 1])
          cmd.timeout = parseInt(rest[timeoutIdx + 1], 10);
        return cmd;
      }
      if (rest[0]) {
        const timeout = parseInt(rest[0], 10);
        if (!isNaN(timeout)) return { id, action: 'wait', timeout };
        return { id, action: 'wait', selector: rest[0] };
      }
      error(
        'Missing arguments',
        'agent-browser wait <selector|ms|--url|--load|--fn|--text|--download|--request>'
      );
    }

    case 'screenshot': {
      const fullPage = rest.includes('--full') || rest.includes('-f');
      const filtered = rest.filter((r) => r !== '--full' && r !== '-f');
      let selector: string | undefined;
      let path: string | undefined;
      if (filtered.length === 2) {
        selector = filtered[0];
        path = filtered[1];
      } else if (filtered.length === 1) {
        const arg = filtered[0];
        const isPath =
          arg.includes('/') ||
          arg.endsWith('.png') ||
          arg.endsWith('.jpg') ||
          arg.endsWith('.jpeg') ||
          arg.endsWith('.webp');
        if (isPath) path = arg;
        else selector = arg;
      }
      return { id, action: 'screenshot', selector, path, fullPage: fullPage || undefined };
    }
    case 'pdf': {
      const path = rest[0];
      if (!path) error('Missing path', 'agent-browser pdf <path>');
      return { id, action: 'pdf', path };
    }

    case 'snapshot': {
      const command: Command = { id, action: 'snapshot' };
      for (let i = 0; i < rest.length; i++) {
        switch (rest[i]) {
          case '-i':
          case '--interactive':
            command.interactive = true;
            break;
          case '-c':
          case '--compact':
            command.compact = true;
            break;
          case '-C':
          case '--cursor':
            command.cursor = true;
            break;
          case '-d':
          case '--depth':
            if (rest[i + 1]) {
              command.maxDepth = parseInt(rest[i + 1], 10);
              i++;
            }
            break;
          case '-s':
          case '--selector':
            if (rest[i + 1]) {
              command.selector = rest[i + 1];
              i++;
            }
            break;
          case '-f':
          case '--in-frame':
            if (rest[i + 1]) {
              command.inFrame = rest[i + 1];
              i++;
            }
            break;
          case '--path':
            command.path = true;
            break;
          case '--attrs':
            command.attrs = true;
            break;
        }
      }
      return command;
    }

    case 'eval': {
      let script: string | undefined;
      let file: string | undefined;
      if (rest.includes('--file')) {
        const fileIdx = rest.indexOf('--file');
        file = rest[fileIdx + 1];
        if (!file) error('Missing file path', 'agent-browser eval --file <path>');
      } else if (rest.includes('--stdin')) {
        const fd = process.stdin.fd;
        const buffer = Buffer.allocUnsafe(1024);
        const chunks: Buffer[] = [];
        const fs = require('fs');
        let bytesRead: number;
        while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length)) > 0) {
          chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
        }
        script = Buffer.concat(chunks).toString('utf8');
      } else if (rest.includes('-b') || rest.includes('--base64')) {
        const bIdx = rest.includes('-b') ? rest.indexOf('-b') : rest.indexOf('--base64');
        const encoded = rest[bIdx + 1];
        if (!encoded) error('Missing base64 script', 'agent-browser eval -b <base64-script>');
        script = Buffer.from(encoded!, 'base64').toString('utf8');
      } else {
        script = rest.join(' ');
        if (!script) error('Missing script', 'agent-browser eval <script>');
      }
      return { id, action: 'evaluate', script, file };
    }

    case 'close':
    case 'quit':
    case 'exit':
      return { id, action: 'close' };

    case 'get': {
      const subcmd = rest[0];
      if (!subcmd)
        error(
          'Missing subcommand',
          'agent-browser get <text|html|value|attr|url|title|count|box|styles> [args...]'
        );
      switch (subcmd) {
        case 'text': {
          const selector = rest[1];
          if (!selector) error('Missing selector', 'agent-browser get text <selector>');
          return { id, action: 'gettext', selector };
        }
        case 'html': {
          const selector = rest[1];
          if (!selector) error('Missing selector', 'agent-browser get html <selector>');
          return { id, action: 'innerhtml', selector };
        }
        case 'value': {
          const selector = rest[1];
          if (!selector) error('Missing selector', 'agent-browser get value <selector>');
          return { id, action: 'inputvalue', selector };
        }
        case 'attr': {
          const selector = rest[1];
          const attribute = rest[2];
          if (!selector || !attribute)
            error('Missing selector or attribute', 'agent-browser get attr <selector> <attribute>');
          return { id, action: 'getattribute', selector, attribute };
        }
        case 'url':
          return { id, action: 'url' };
        case 'title':
          return { id, action: 'title' };
        case 'count': {
          const selector = rest[1];
          if (!selector) error('Missing selector', 'agent-browser get count <selector>');
          return { id, action: 'count', selector };
        }
        case 'box': {
          const selector = rest[1];
          if (!selector) error('Missing selector', 'agent-browser get box <selector>');
          return { id, action: 'boundingbox', selector };
        }
        case 'styles': {
          const selector = rest[1];
          if (!selector) error('Missing selector', 'agent-browser get styles <selector>');
          return { id, action: 'styles', selector };
        }
        default:
          error(
            `Unknown get subcommand: ${subcmd}`,
            'agent-browser get <text|html|value|attr|url|title|count|box|styles> [args...]'
          );
      }
    }

    case 'is': {
      const subcmd = rest[0];
      if (!subcmd)
        error('Missing subcommand', 'agent-browser is <visible|enabled|checked> <selector>');
      const selector = rest[1];
      if (!selector) error('Missing selector', `agent-browser is ${subcmd} <selector>`);
      switch (subcmd) {
        case 'visible':
          return { id, action: 'isvisible', selector };
        case 'enabled':
          return { id, action: 'isenabled', selector };
        case 'checked':
          return { id, action: 'ischecked', selector };
        default:
          error(
            `Unknown is subcommand: ${subcmd}`,
            'agent-browser is <visible|enabled|checked> <selector>'
          );
      }
    }

    case 'find': {
      const { inFrame, remaining: findRest } = parseInFrame(rest);
      const locator = findRest[0];
      if (!locator)
        error(
          'Missing locator type',
          'agent-browser find <locator> <value> [action] [text] [--in-frame <path>]'
        );
      const nameIdx = findRest.indexOf('--name');
      const name = nameIdx !== -1 ? findRest[nameIdx + 1] : undefined;
      const exact = findRest.includes('--exact');
      switch (locator) {
        case 'role': {
          const role = findRest[1];
          if (!role)
            error(
              'Missing role',
              'agent-browser find role <role> [action] [--name <name>] [--exact] [--in-frame <path>]'
            );
          const subaction = findRest[2] || 'click';
          const value = findRest
            .slice(3)
            .filter((a) => !a.startsWith('--'))
            .join(' ');
          const cmd: Command = { id, action: 'getbyrole', role, subaction, name, exact };
          if (value) cmd.value = value;
          if (inFrame) cmd.inFrame = inFrame;
          return cmd;
        }
        case 'text': {
          const text = findRest[1];
          if (!text)
            error(
              'Missing text',
              'agent-browser find text <text> [action] [--exact] [--in-frame <path>]'
            );
          const subaction = findRest[2] || 'click';
          const cmd: Command = { id, action: 'getbytext', text, subaction, exact };
          if (inFrame) cmd.inFrame = inFrame;
          return cmd;
        }
        case 'label': {
          const label = findRest[1];
          if (!label)
            error(
              'Missing label',
              'agent-browser find label <label> [action] [text] [--exact] [--in-frame <path>]'
            );
          const subaction = findRest[2] || 'click';
          const value = findRest
            .slice(3)
            .filter((a) => !a.startsWith('--'))
            .join(' ');
          const cmd: Command = { id, action: 'getbylabel', label, subaction, exact };
          if (value) cmd.value = value;
          if (inFrame) cmd.inFrame = inFrame;
          return cmd;
        }
        case 'placeholder': {
          const placeholder = findRest[1];
          if (!placeholder)
            error(
              'Missing placeholder',
              'agent-browser find placeholder <text> [action] [text] [--exact] [--in-frame <path>]'
            );
          const subaction = findRest[2] || 'click';
          const value = findRest
            .slice(3)
            .filter((a) => !a.startsWith('--'))
            .join(' ');
          const cmd: Command = { id, action: 'getbyplaceholder', placeholder, subaction, exact };
          if (value) cmd.value = value;
          if (inFrame) cmd.inFrame = inFrame;
          return cmd;
        }
        case 'alt': {
          const text = findRest[1];
          if (!text)
            error(
              'Missing alt text',
              'agent-browser find alt <text> [action] [--exact] [--in-frame <path>]'
            );
          const subaction = findRest[2] || 'click';
          const cmd: Command = { id, action: 'getbyalttext', text, subaction, exact };
          if (inFrame) cmd.inFrame = inFrame;
          return cmd;
        }
        case 'title': {
          const text = findRest[1];
          if (!text)
            error(
              'Missing title text',
              'agent-browser find title <text> [action] [--exact] [--in-frame <path>]'
            );
          const subaction = findRest[2] || 'click';
          const cmd: Command = { id, action: 'getbytitle', text, subaction, exact };
          if (inFrame) cmd.inFrame = inFrame;
          return cmd;
        }
        case 'testid': {
          const testId = findRest[1];
          if (!testId)
            error(
              'Missing testid',
              'agent-browser find testid <id> [action] [text] [--in-frame <path>]'
            );
          const subaction = findRest[2] || 'click';
          const value = findRest.slice(3).join(' ');
          const cmd: Command = { id, action: 'getbytestid', testId, subaction };
          if (value) cmd.value = value;
          if (inFrame) cmd.inFrame = inFrame;
          return cmd;
        }
        case 'first': {
          const selector = findRest[1];
          if (!selector)
            error(
              'Missing selector',
              'agent-browser find first <selector> [action] [text] [--in-frame <path>]'
            );
          const subaction = findRest[2] || 'click';
          const value = findRest.slice(3).join(' ');
          const cmd: Command = { id, action: 'nth', selector, index: 0, subaction };
          if (value) cmd.value = value;
          if (inFrame) cmd.inFrame = inFrame;
          return cmd;
        }
        case 'last': {
          const selector = findRest[1];
          if (!selector)
            error(
              'Missing selector',
              'agent-browser find last <selector> [action] [text] [--in-frame <path>]'
            );
          const subaction = findRest[2] || 'click';
          const value = findRest.slice(3).join(' ');
          const cmd: Command = { id, action: 'nth', selector, index: -1, subaction };
          if (value) cmd.value = value;
          if (inFrame) cmd.inFrame = inFrame;
          return cmd;
        }
        case 'nth': {
          const idxStr = findRest[1];
          if (!idxStr)
            error(
              'Missing index',
              'agent-browser find nth <index> <selector> [action] [text] [--in-frame <path>]'
            );
          const idx = parseInt(idxStr, 10);
          if (isNaN(idx))
            error(
              'Invalid index',
              'agent-browser find nth <index> <selector> [action] [text] [--in-frame <path>]'
            );
          const selector = findRest[2];
          if (!selector)
            error(
              'Missing selector',
              'agent-browser find nth <index> <selector> [action] [text] [--in-frame <path>]'
            );
          const subaction = findRest[3] || 'click';
          const value = findRest.slice(4).join(' ');
          const cmd: Command = { id, action: 'nth', selector, index: idx, subaction };
          if (value) cmd.value = value;
          if (inFrame) cmd.inFrame = inFrame;
          return cmd;
        }
        default:
          error(
            `Unknown find locator: ${locator}`,
            'agent-browser find <role|text|label|placeholder|alt|title|testid|first|last|nth> ...'
          );
      }
    }

    case 'mouse': {
      const subcmd = rest[0];
      if (!subcmd)
        error('Missing subcommand', 'agent-browser mouse <move|down|up|wheel|wander> [args...]');
      switch (subcmd) {
        case 'move': {
          const x = rest[1] ? parseInt(rest[1], 10) : NaN;
          const y = rest[2] ? parseInt(rest[2], 10) : NaN;
          if (isNaN(x) || isNaN(y))
            error('Missing or invalid coordinates', 'agent-browser mouse move <x> <y>');
          return { id, action: 'mousemove', x, y };
        }
        case 'down':
          return { id, action: 'mousedown', button: rest[1] || 'left' };
        case 'up':
          return { id, action: 'mouseup', button: rest[1] || 'left' };
        case 'wheel': {
          const deltaY = rest[1] ? parseInt(rest[1], 10) : 100;
          const deltaX = rest[2] ? parseInt(rest[2], 10) : 0;
          return { id, action: 'wheel', deltaX, deltaY };
        }
        case 'wander': {
          const { config: human, remaining: wRest } = parseHumanFlag(rest.slice(1));
          const duration = wRest[0] ? parseInt(wRest[0], 10) : 2000;
          const cmd: Command = { id, action: 'wander', duration };
          if (human.enabled) cmd.human = human;
          return cmd;
        }
        default:
          error(
            `Unknown mouse subcommand: ${subcmd}`,
            'agent-browser mouse <move|down|up|wheel|wander> [args...]'
          );
      }
    }

    case 'set': {
      const subcmd = rest[0];
      if (!subcmd)
        error(
          'Missing subcommand',
          'agent-browser set <viewport|device|geo|offline|headers|credentials|media> ...'
        );
      switch (subcmd) {
        case 'viewport': {
          const width = rest[1] ? parseInt(rest[1], 10) : NaN;
          const height = rest[2] ? parseInt(rest[2], 10) : NaN;
          if (isNaN(width) || isNaN(height))
            error('Missing or invalid dimensions', 'agent-browser set viewport <width> <height>');
          return { id, action: 'viewport', width, height };
        }
        case 'device': {
          const device = rest[1];
          if (!device) error('Missing device name', 'agent-browser set device <name>');
          return { id, action: 'device', device };
        }
        case 'geo':
        case 'geolocation': {
          const latitude = rest[1] ? parseFloat(rest[1]) : NaN;
          const longitude = rest[2] ? parseFloat(rest[2]) : NaN;
          if (isNaN(latitude) || isNaN(longitude))
            error('Missing or invalid coordinates', 'agent-browser set geo <latitude> <longitude>');
          return { id, action: 'geolocation', latitude, longitude };
        }
        case 'offline': {
          const off = rest[1] !== 'off' && rest[1] !== 'false';
          return { id, action: 'offline', offline: off };
        }
        case 'headers': {
          const json = rest[1];
          if (!json) error('Missing headers JSON', 'agent-browser set headers <json>');
          try {
            const headers = JSON.parse(json);
            return { id, action: 'headers', headers };
          } catch {
            error('Invalid JSON', 'agent-browser set headers <json>');
          }
        }
        case 'credentials':
        case 'auth': {
          const username = rest[1];
          const password = rest[2];
          if (!username || !password)
            error('Missing credentials', 'agent-browser set credentials <username> <password>');
          return { id, action: 'credentials', username, password };
        }
        case 'media': {
          const color = rest.includes('dark')
            ? 'dark'
            : rest.includes('light')
              ? 'light'
              : 'no-preference';
          const reduced = rest.includes('reduced-motion') ? 'reduce' : 'no-preference';
          return { id, action: 'emulatemedia', colorScheme: color, reducedMotion: reduced };
        }
        default:
          error(
            `Unknown set subcommand: ${subcmd}`,
            'agent-browser set <viewport|device|geo|offline|headers|credentials|media> ...'
          );
      }
    }

    case 'network': {
      const subcmd = rest[0];
      if (!subcmd)
        error('Missing subcommand', 'agent-browser network <route|unroute|requests> ...');
      switch (subcmd) {
        case 'route': {
          const url = rest[1];
          if (!url)
            error(
              'Missing URL pattern',
              'agent-browser network route <url> [--abort] [--body <json>]'
            );
          const abort = rest.includes('--abort');
          const bodyIdx = rest.indexOf('--body');
          const body = bodyIdx !== -1 ? rest[bodyIdx + 1] : undefined;
          return { id, action: 'route', url, abort, body };
        }
        case 'unroute':
          return { id, action: 'unroute', url: rest[1] };
        case 'requests': {
          const clear = rest.includes('--clear');
          const filterIdx = rest.indexOf('--filter');
          const filter = filterIdx !== -1 ? rest[filterIdx + 1] : undefined;
          return { id, action: 'requests', clear, filter };
        }
        default:
          error(
            `Unknown network subcommand: ${subcmd}`,
            'agent-browser network <route|unroute|requests> ...'
          );
      }
    }

    case 'storage': {
      const type = rest[0] as 'local' | 'session';
      if (!type || (type !== 'local' && type !== 'session'))
        error('Missing storage type', 'agent-browser storage <local|session> [key] [value]');
      const subcmd = rest[1];
      if (!subcmd) return { id, action: 'storage_get', type };
      if (subcmd === 'set') {
        const key = rest[2];
        const value = rest[3];
        if (!key || !value)
          error('Missing key or value', 'agent-browser storage <local|session> set <key> <value>');
        return { id, action: 'storage_set', type, key, value };
      }
      if (subcmd === 'clear') return { id, action: 'storage_clear', type };
      return { id, action: 'storage_get', type, key: subcmd };
    }

    case 'cookies': {
      const subcmd = rest[0] || 'get';
      switch (subcmd) {
        case 'set': {
          const name = rest[1];
          const value = rest[2];
          if (!name || !value)
            error('Missing name or value', 'agent-browser cookies set <name> <value> [options]');
          const cookie: Record<string, unknown> = { name, value };
          for (let i = 3; i < rest.length; i++) {
            switch (rest[i]) {
              case '--url':
                cookie.url = rest[++i];
                break;
              case '--domain':
                cookie.domain = rest[++i];
                break;
              case '--path':
                cookie.path = rest[++i];
                break;
              case '--httpOnly':
                cookie.httpOnly = true;
                break;
              case '--secure':
                cookie.secure = true;
                break;
              case '--sameSite':
                cookie.sameSite = rest[++i];
                break;
              case '--expires':
                cookie.expires = parseInt(rest[++i], 10);
                break;
            }
          }
          return { id, action: 'cookies_set', cookies: [cookie] };
        }
        case 'clear':
          return { id, action: 'cookies_clear' };
        default:
          return {
            id,
            action: 'cookies_get',
            urls: subcmd !== 'get' ? [subcmd, ...rest.slice(1)] : undefined,
          };
      }
    }

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
        const url = rest[1];
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
      error(
        'Unknown recorder command',
        'agent-browser recorder <start [url]|stop [--output file.yaml]|status>'
      );
    }

    case 'console':
      return { id, action: 'console', clear: rest.includes('--clear') };

    case 'errors':
      return { id, action: 'errors', clear: rest.includes('--clear') };

    case 'highlight': {
      const selector = rest[0];
      if (!selector) error('Missing selector', 'agent-browser highlight <selector>');
      return { id, action: 'highlight', selector };
    }

    case 'state': {
      const subcmd = rest[0];
      if (!subcmd) error('Missing subcommand', 'agent-browser state <save|load> <path>');
      const path = rest[1];
      if (!path) error('Missing path', `agent-browser state ${subcmd} <path>`);
      if (subcmd === 'save') return { id, action: 'state_save', path };
      if (subcmd === 'load') return { id, action: 'state_load', path };
      error('Unknown state command', 'agent-browser state <save|load> <path>');
    }

    case 'connect': {
      const endpoint = rest[0];
      if (!endpoint) error('Missing endpoint', 'agent-browser connect <port|url>');
      if (
        endpoint.startsWith('ws://') ||
        endpoint.startsWith('wss://') ||
        endpoint.startsWith('http://') ||
        endpoint.startsWith('https://')
      ) {
        return { id, action: 'launch', cdpUrl: endpoint };
      }
      const port = parseInt(endpoint, 10);
      if (isNaN(port) || port <= 0 || port > 65535)
        error('Invalid port', 'agent-browser connect <port|url>');
      return { id, action: 'launch', cdpPort: port };
    }

    case 'tap': {
      const selector = rest[0];
      if (!selector) error('Missing selector', 'agent-browser tap <selector>');
      return { id, action: 'tap', selector };
    }

    case 'swipe': {
      const direction = rest[0];
      if (!direction || !['up', 'down', 'left', 'right'].includes(direction))
        error('Invalid direction', 'agent-browser swipe <up|down|left|right> [distance]');
      const cmd: Command = { id, action: 'swipe', direction };
      if (rest[1]) cmd.distance = parseInt(rest[1], 10);
      return cmd;
    }

    case 'device': {
      const subcmd = rest[0];
      if (!subcmd || subcmd === 'list') return { id, action: 'device_list' };
      error('Unknown device command', 'agent-browser device [list]');
    }

    case 'viewer':
    case 'preview': {
      return { id, action: 'viewer' };
    }

    case 'ask': {
      const question = rest.join(' ');
      if (!question) error('Missing question', 'agent-browser ask <question>');
      return { id, action: 'ask', question };
    }

    default:
      error(`Unknown command: ${cmd}`);
  }
}
