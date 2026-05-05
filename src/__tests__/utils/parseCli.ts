import fs from 'fs';
import type { LooseCommand } from '../../types.js';

export type Command = LooseCommand;

export class CliError extends Error {
  constructor(
    message: string,
    public usage?: string
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export function error(message: string, usage?: string): never {
  throw new CliError(message, usage);
}

export function readStdin(): string {
  const fd = process.stdin.fd;
  const buffer = Buffer.allocUnsafe(1024);
  const chunks: Buffer[] = [];
  let bytesRead: number;
  while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
    chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function parseInFrame(args: string[]): { inFrame?: string; remaining: string[] } {
  let inFrame: string | undefined;
  const remaining: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--in-frame') {
      inFrame = args[i + 1];
      i++;
    } else {
      remaining.push(args[i]);
    }
  }

  return { inFrame, remaining };
}

type DiffScope = number | 'full' | string;

export function parseDiff(args: string[]): { diffScope?: DiffScope; remaining: string[] } {
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

export function genId(): string {
  return `n${Date.now() % 1000000}`;
}

function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function findSimilar(input: string, candidates: string[]): string | null {
  const inputLower = input.toLowerCase();
  let best: string | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const cLower = c.toLowerCase();
    if (cLower.startsWith(inputLower) || inputLower.startsWith(cLower)) {
      return c;
    }
    const d = levenshtein(inputLower, cLower);
    if (d < bestDist && d <= Math.max(2, Math.floor(input.length / 2))) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

export function parseCliArgs(args: string[]): Command {
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
      return { id, action: 'navigate', url: formattedUrl };
    }
    case 'back':
      return { id, action: 'back' };
    case 'forward':
      return { id, action: 'forward' };
    case 'reload':
      return { id, action: 'reload' };

    case 'click': {
      const { inFrame, remaining: r1 } = parseInFrame(rest);
      const { diffScope, remaining } = parseDiff(r1);
      const selector = remaining[0];
      if (!selector)
        error(
          'Missing selector',
          'agent-browser click <selector> [--diff [scope]] [--in-frame <path>]'
        );
      const cmd: Command = { id, action: 'click', selector, inFrame };
      if (diffScope !== undefined) cmd.diffScope = diffScope;
      return cmd;
    }
    case 'dblclick': {
      const { inFrame, remaining: r1 } = parseInFrame(rest);
      const { diffScope, remaining } = parseDiff(r1);
      const selector = remaining[0];
      if (!selector)
        error(
          'Missing selector',
          'agent-browser dblclick <selector> [--diff [scope]] [--in-frame <path>]'
        );
      const cmd: Command = { id, action: 'dblclick', selector, inFrame };
      if (diffScope !== undefined) cmd.diffScope = diffScope;
      return cmd;
    }
    case 'fill': {
      const { inFrame, remaining: r1 } = parseInFrame(rest);
      const { diffScope, remaining } = parseDiff(r1);
      const selector = remaining[0];
      const value = remaining.slice(1).join(' ');
      if (!selector || !value)
        error(
          'Missing selector or value',
          'agent-browser fill <selector> <text> [--diff [scope]] [--in-frame <path>]'
        );
      const cmd: Command = { id, action: 'fill', selector, value, inFrame };
      if (diffScope !== undefined) cmd.diffScope = diffScope;
      return cmd;
    }
    case 'type': {
      const { inFrame, remaining: r1 } = parseInFrame(rest);
      const { diffScope, remaining } = parseDiff(r1);
      const selector = remaining[0];
      const text = remaining.slice(1).join(' ');
      if (!selector || !text)
        error(
          'Missing selector or text',
          'agent-browser type <selector> <text> [--diff [scope]] [--in-frame <path>]'
        );
      const cmd: Command = { id, action: 'type', selector, text, inFrame };
      if (diffScope !== undefined) cmd.diffScope = diffScope;
      return cmd;
    }
    case 'hover': {
      const { inFrame, remaining: r1 } = parseInFrame(rest);
      const { diffScope, remaining } = parseDiff(r1);
      const selector = remaining[0];
      if (!selector)
        error(
          'Missing selector',
          'agent-browser hover <selector> [--diff [scope]] [--in-frame <path>]'
        );
      const cmd: Command = { id, action: 'hover', selector, inFrame };
      if (diffScope !== undefined) cmd.diffScope = diffScope;
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
      const cmd: Command = { id, action: 'focus', selector, inFrame };
      if (diffScope !== undefined) cmd.diffScope = diffScope;
      return cmd;
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
      const cmd: Command = { id, action: 'check', selector, inFrame };
      if (diffScope !== undefined) cmd.diffScope = diffScope;
      return cmd;
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
      const cmd: Command = { id, action: 'uncheck', selector, inFrame };
      if (diffScope !== undefined) cmd.diffScope = diffScope;
      return cmd;
    }
    case 'select': {
      const { inFrame, remaining: r1 } = parseInFrame(rest);
      const { diffScope, remaining } = parseDiff(r1);
      const selector = remaining[0];
      const values = remaining.slice(1);
      if (!selector)
        error(
          'Missing selector',
          'agent-browser select <selector> <value...> [--diff [scope]] [--in-frame <path>]'
        );
      if (values.length === 0)
        error(
          'Missing values',
          'agent-browser select <selector> <value...> [--diff [scope]] [--in-frame <path>]'
        );
      const cmd: Command = {
        id,
        action: 'select',
        selector,
        values: values.length === 1 ? values[0] : values,
        inFrame,
      };
      if (diffScope !== undefined) cmd.diffScope = diffScope;
      return cmd;
    }
    case 'drag': {
      const { inFrame, remaining } = parseInFrame(rest);
      const source = remaining[0];
      const target = remaining[1];
      if (!source)
        error(
          'Missing source selector',
          'agent-browser drag <source> <target> [--in-frame <path>]'
        );
      if (!target)
        error(
          'Missing target selector',
          'agent-browser drag <source> <target> [--in-frame <path>]'
        );
      return { id, action: 'drag', source, target, inFrame };
    }
    case 'upload': {
      const { inFrame, remaining } = parseInFrame(rest);
      const selector = remaining[0];
      const files = remaining.slice(1);
      if (!selector)
        error('Missing selector', 'agent-browser upload <selector> <files...> [--in-frame <path>]');
      if (files.length === 0)
        error('Missing files', 'agent-browser upload <selector> <files...> [--in-frame <path>]');
      return { id, action: 'upload', selector, files, inFrame };
    }
    case 'download': {
      const { inFrame, remaining } = parseInFrame(rest);
      const selector = remaining[0];
      const path = remaining[1];
      if (!selector)
        error('Missing selector', 'agent-browser download <selector> <path> [--in-frame <path>]');
      if (!path)
        error('Missing path', 'agent-browser download <selector> <path> [--in-frame <path>]');
      return { id, action: 'download', selector, path, inFrame };
    }

    case 'press':
    case 'key': {
      const { inFrame, remaining } = parseInFrame(rest);
      const key = remaining[0];
      if (!key) error('Missing key', 'agent-browser press <key> [--in-frame <path>]');
      return { id, action: 'press', key, inFrame };
    }
    case 'keydown': {
      const { inFrame, remaining } = parseInFrame(rest);
      const key = remaining[0];
      if (!key) error('Missing key', 'agent-browser keydown <key> [--in-frame <path>]');
      return { id, action: 'keydown', key, inFrame };
    }
    case 'keyup': {
      const { inFrame, remaining } = parseInFrame(rest);
      const key = remaining[0];
      if (!key) error('Missing key', 'agent-browser keyup <key> [--in-frame <path>]');
      return { id, action: 'keyup', key, inFrame };
    }

    case 'scroll': {
      const { inFrame, remaining } = parseInFrame(rest);
      const direction = remaining[0] || 'down';
      const amount = remaining[1] ? parseInt(remaining[1], 10) : 300;
      return { id, action: 'scroll', direction, amount, inFrame };
    }
    case 'scrollintoview':
    case 'scrollinto': {
      const { inFrame, remaining } = parseInFrame(rest);
      const selector = remaining[0];
      if (!selector)
        error('Missing selector', 'agent-browser scrollintoview <selector> [--in-frame <path>]');
      return { id, action: 'scrollintoview', selector, inFrame };
    }

    case 'wait': {
      const { inFrame, remaining } = parseInFrame(rest);
      if (remaining.includes('--url') || remaining.includes('-u')) {
        const urlIdx = remaining.includes('--url')
          ? remaining.indexOf('--url')
          : remaining.indexOf('-u');
        const url = remaining[urlIdx + 1];
        if (!url)
          error('Missing URL pattern', 'agent-browser wait --url <pattern> [--in-frame <path>]');
        return { id, action: 'waitforurl', url, inFrame };
      }
      if (remaining.includes('--load') || remaining.includes('-l')) {
        const loadIdx = remaining.includes('--load')
          ? remaining.indexOf('--load')
          : remaining.indexOf('-l');
        const state = remaining[loadIdx + 1];
        if (!state)
          error('Missing load state', 'agent-browser wait --load <state> [--in-frame <path>]');
        return { id, action: 'waitforloadstate', state, inFrame };
      }
      if (remaining.includes('--fn') || remaining.includes('-f')) {
        const fnIdx = remaining.includes('--fn')
          ? remaining.indexOf('--fn')
          : remaining.indexOf('-f');
        const expression = remaining[fnIdx + 1];
        if (!expression)
          error('Missing expression', 'agent-browser wait --fn <expression> [--in-frame <path>]');
        return { id, action: 'waitforfunction', expression, inFrame };
      }
      if (remaining.includes('--text') || remaining.includes('-t')) {
        const textIdx = remaining.includes('--text')
          ? remaining.indexOf('--text')
          : remaining.indexOf('-t');
        const text = remaining[textIdx + 1];
        if (!text) error('Missing text', 'agent-browser wait --text <text> [--in-frame <path>]');
        return { id, action: 'wait', selector: `text=${text}`, inFrame };
      }
      if (remaining.includes('--download') || remaining.includes('-d')) {
        const cmd: Command = { id, action: 'waitfordownload', inFrame };
        const dlIdx = remaining.includes('--download')
          ? remaining.indexOf('--download')
          : remaining.indexOf('-d');
        if (remaining[dlIdx + 1] && !remaining[dlIdx + 1].startsWith('--'))
          cmd.path = remaining[dlIdx + 1];
        const timeoutIdx = remaining.indexOf('--timeout');
        if (timeoutIdx !== -1 && remaining[timeoutIdx + 1])
          cmd.timeout = parseInt(remaining[timeoutIdx + 1], 10);
        return cmd;
      }
      if (remaining[0]) {
        const timeout = parseInt(remaining[0], 10);
        if (!isNaN(timeout)) return { id, action: 'wait', timeout, inFrame };
        return { id, action: 'wait', selector: remaining[0], inFrame };
      }
      error(
        'Missing arguments',
        'agent-browser wait <selector|ms|--url|--load|--fn|--text|--download> [--in-frame <path>]'
      );
    }

    case 'screenshot': {
      const { inFrame, remaining } = parseInFrame(rest);
      const fullPage = remaining.includes('--full') || remaining.includes('-f');
      const filtered = remaining.filter((r) => r !== '--full' && r !== '-f');
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
      return {
        id,
        action: 'screenshot',
        selector,
        path,
        fullPage: fullPage ? true : undefined,
        inFrame,
      };
    }
    case 'pdf': {
      const { inFrame, remaining } = parseInFrame(rest);
      const path = remaining[0];
      if (!path) error('Missing path', 'agent-browser pdf <path> [--in-frame <path>]');
      return { id, action: 'pdf', path, inFrame };
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
          case '--in-frame':
            if (rest[i + 1]) {
              command.inFrame = rest[i + 1];
              i++;
            }
            break;
          case '--selector-for': {
            if (rest[i + 1]) {
              command.action = 'selector-for';
              (command as any).target = rest[++i];
            }
            break;
          }
          case '--selectors-of': {
            if (rest[i + 1]) {
              command.action = 'selectors-of';
              (command as any).target = rest[++i];
            }
            break;
          }
          case '--validate': {
            if (rest[i + 1]) {
              command.action = 'validate';
              (command as any).target = rest[++i];
            }
            break;
          }
          case '-p':
          case '--path':
            (command as any).path = true;
            break;
          case '-a':
          case '--attrs':
            (command as any).attrs = true;
            break;
          case '--selectors':
            (command as any).selectors = true;
            break;
          case '--all':
            (command as any).all = true;
            break;
        }
      }
      return command;
    }

    case 'eval': {
      const { inFrame, remaining } = parseInFrame(rest);
      let script: string | undefined;
      let file: string | undefined;
      if (remaining.includes('--file')) {
        const fileIdx = remaining.indexOf('--file');
        file = remaining[fileIdx + 1];
        if (!file)
          error('Missing file path', 'agent-browser eval --file <path> [--in-frame <path>]');
      } else if (remaining.includes('-f') && !remaining.includes('--fn')) {
        const fIdx = remaining.indexOf('-f');
        if (fIdx + 1 < remaining.length && !remaining[fIdx + 1].startsWith('-')) {
          file = remaining[fIdx + 1];
        }
        if (!file) error('Missing file path', 'agent-browser eval -f <path> [--in-frame <path>]');
      } else if (remaining.includes('--stdin')) {
        script = readStdin();
      } else if (remaining.includes('-b') || remaining.includes('--base64')) {
        const bIdx = remaining.includes('-b')
          ? remaining.indexOf('-b')
          : remaining.indexOf('--base64');
        const encoded = remaining[bIdx + 1];
        if (!encoded)
          error(
            'Missing base64 script',
            'agent-browser eval -b <base64-script> [--in-frame <path>]'
          );
        try {
          script = Buffer.from(encoded, 'base64').toString('utf8');
        } catch {
          error('Invalid base64', 'agent-browser eval -b <base64-script> [--in-frame <path>]');
        }
      } else {
        script = remaining.join(' ');
        if (!script) error('Missing script', 'agent-browser eval <script> [--in-frame <path>]');
      }
      return { id, action: 'evaluate', script, file, inFrame };
    }

    case 'addinitscript': {
      let script: string | undefined;
      let file: string | undefined;
      if (rest.includes('--file')) {
        const fileIdx = rest.indexOf('--file');
        file = rest[fileIdx + 1];
        if (!file) error('Missing file path', 'agent-browser addinitscript --file <path>');
      } else if (rest.includes('-f')) {
        const fIdx = rest.indexOf('-f');
        if (fIdx + 1 < rest.length && !rest[fIdx + 1].startsWith('-')) {
          file = rest[fIdx + 1];
        }
        if (!file) error('Missing file path', 'agent-browser addinitscript -f <path>');
      } else if (rest.includes('--stdin')) {
        script = readStdin();
      } else if (rest.includes('-b') || rest.includes('--base64')) {
        const bIdx = rest.includes('-b') ? rest.indexOf('-b') : rest.indexOf('--base64');
        const encoded = rest[bIdx + 1];
        if (!encoded)
          error('Missing base64 script', 'agent-browser addinitscript -b <base64-script>');
        try {
          script = Buffer.from(encoded, 'base64').toString('utf8');
        } catch {
          error('Invalid base64', 'agent-browser addinitscript -b <base64-script>');
        }
      } else {
        script = rest.join(' ');
        if (!script) error('Missing script', 'agent-browser addinitscript <script>');
      }
      return { id, action: 'addinitscript', script, file };
    }

    case 'close':
    case 'quit':
    case 'exit':
      return { id, action: 'close' };

    case 'get': {
      const { inFrame, remaining } = parseInFrame(rest);
      const subcmd = remaining[0];
      if (!subcmd)
        error(
          'Missing subcommand',
          'agent-browser get <text|html|value|attr|url|title|count|box|styles> [args...] [--in-frame <path>]'
        );
      switch (subcmd) {
        case 'text': {
          const selector = remaining[1];
          if (!selector)
            error('Missing selector', 'agent-browser get text <selector> [--in-frame <path>]');
          return { id, action: 'gettext', selector, inFrame };
        }
        case 'html': {
          const selector = remaining[1];
          if (!selector)
            error('Missing selector', 'agent-browser get html <selector> [--in-frame <path>]');
          return { id, action: 'innerhtml', selector, inFrame };
        }
        case 'value': {
          const selector = remaining[1];
          if (!selector)
            error('Missing selector', 'agent-browser get value <selector> [--in-frame <path>]');
          return { id, action: 'inputvalue', selector, inFrame };
        }
        case 'attr': {
          const selector = remaining[1];
          const attribute = remaining[2];
          if (!selector)
            error(
              'Missing selector',
              'agent-browser get attr <selector> <attribute> [--in-frame <path>]'
            );
          if (!attribute)
            error(
              'Missing attribute',
              'agent-browser get attr <selector> <attribute> [--in-frame <path>]'
            );
          return { id, action: 'getattribute', selector, attribute, inFrame };
        }
        case 'url':
          return { id, action: 'url', inFrame };
        case 'title':
          return { id, action: 'title', inFrame };
        case 'count': {
          const selector = remaining[1];
          if (!selector)
            error('Missing selector', 'agent-browser get count <selector> [--in-frame <path>]');
          return { id, action: 'count', selector, inFrame };
        }
        case 'box': {
          const selector = remaining[1];
          if (!selector)
            error('Missing selector', 'agent-browser get box <selector> [--in-frame <path>]');
          return { id, action: 'boundingbox', selector, inFrame };
        }
        case 'styles': {
          const selector = remaining[1];
          if (!selector)
            error('Missing selector', 'agent-browser get styles <selector> [--in-frame <path>]');
          return { id, action: 'styles', selector, inFrame };
        }
        default:
          error(
            `Unknown get subcommand: ${subcmd}`,
            'agent-browser get <text|html|value|attr|url|title|count|box|styles> [args...] [--in-frame <path>]'
          );
      }
    }

    case 'is': {
      const { inFrame, remaining } = parseInFrame(rest);
      const subcmd = remaining[0];
      if (!subcmd)
        error(
          'Missing subcommand',
          'agent-browser is <visible|enabled|checked> <selector> [--in-frame <path>]'
        );
      const selector = remaining[1];
      if (!selector)
        error('Missing selector', `agent-browser is ${subcmd} <selector> [--in-frame <path>]`);
      switch (subcmd) {
        case 'visible':
          return { id, action: 'isvisible', selector, inFrame };
        case 'enabled':
          return { id, action: 'isenabled', selector, inFrame };
        case 'checked':
          return { id, action: 'ischecked', selector, inFrame };
        default:
          error(
            `Unknown is subcommand: ${subcmd}`,
            'agent-browser is <visible|enabled|checked> <selector> [--in-frame <path>]'
          );
      }
    }

    case 'find': {
      const { inFrame, remaining } = parseInFrame(rest);
      const locator = remaining[0];
      if (!locator)
        error(
          'Missing locator type',
          'agent-browser find <locator> <value> [action] [text] [--in-frame <path>]'
        );
      const nameIdx = remaining.indexOf('--name');
      const name = nameIdx !== -1 ? remaining[nameIdx + 1] : undefined;
      const exact = remaining.includes('--exact');
      switch (locator) {
        case 'role': {
          const role = remaining[1];
          if (!role)
            error(
              'Missing role',
              'agent-browser find role <role> [action] [--name <name>] [--exact] [--in-frame <path>]'
            );
          const subaction = remaining[2] && !remaining[2].startsWith('--') ? remaining[2] : 'click';
          const valueIdx = remaining.findIndex((r, i) => i > 2 && !r.startsWith('--'));
          const value =
            valueIdx !== -1
              ? remaining
                  .slice(valueIdx)
                  .filter((a) => !a.startsWith('--'))
                  .join(' ')
              : undefined;
          const cmd: Command = { id, action: 'getbyrole', role, subaction, name, exact, inFrame };
          if (value) cmd.value = value;
          return cmd;
        }
        case 'text': {
          const text = remaining[1];
          if (!text)
            error(
              'Missing text',
              'agent-browser find text <text> [action] [--exact] [--in-frame <path>]'
            );
          const subaction = remaining[2] && !remaining[2].startsWith('--') ? remaining[2] : 'click';
          return { id, action: 'getbytext', text, subaction, exact, inFrame };
        }
        case 'label': {
          const label = remaining[1];
          if (!label)
            error(
              'Missing label',
              'agent-browser find label <label> [action] [text] [--exact] [--in-frame <path>]'
            );
          const subaction = remaining[2] && !remaining[2].startsWith('--') ? remaining[2] : 'click';
          const value = remaining
            .slice(3)
            .filter((a) => !a.startsWith('--'))
            .join(' ');
          const cmd: Command = { id, action: 'getbylabel', label, subaction, exact, inFrame };
          if (value) cmd.value = value;
          return cmd;
        }
        case 'placeholder': {
          const placeholder = remaining[1];
          if (!placeholder)
            error(
              'Missing placeholder',
              'agent-browser find placeholder <text> [action] [text] [--exact] [--in-frame <path>]'
            );
          const subaction = remaining[2] && !remaining[2].startsWith('--') ? remaining[2] : 'click';
          const value = remaining
            .slice(3)
            .filter((a) => !a.startsWith('--'))
            .join(' ');
          const cmd: Command = {
            id,
            action: 'getbyplaceholder',
            placeholder,
            subaction,
            exact,
            inFrame,
          };
          if (value) cmd.value = value;
          return cmd;
        }
        case 'alt': {
          const text = remaining[1];
          if (!text)
            error(
              'Missing alt text',
              'agent-browser find alt <text> [action] [--exact] [--in-frame <path>]'
            );
          const subaction = remaining[2] && !remaining[2].startsWith('--') ? remaining[2] : 'click';
          return { id, action: 'getbyalttext', text, subaction, exact, inFrame };
        }
        case 'title': {
          const text = remaining[1];
          if (!text)
            error(
              'Missing title text',
              'agent-browser find title <text> [action] [--exact] [--in-frame <path>]'
            );
          const subaction = remaining[2] && !remaining[2].startsWith('--') ? remaining[2] : 'click';
          return { id, action: 'getbytitle', text, subaction, exact, inFrame };
        }
        case 'testid': {
          const testId = remaining[1];
          if (!testId)
            error(
              'Missing testid',
              'agent-browser find testid <id> [action] [text] [--in-frame <path>]'
            );
          const subaction = remaining[2] && !remaining[2].startsWith('--') ? remaining[2] : 'click';
          const value = remaining.slice(3).join(' ');
          const cmd: Command = { id, action: 'getbytestid', testId, subaction, inFrame };
          if (value) cmd.value = value;
          return cmd;
        }
        case 'first': {
          const selector = remaining[1];
          if (!selector)
            error(
              'Missing selector',
              'agent-browser find first <selector> [action] [text] [--in-frame <path>]'
            );
          const subaction = remaining[2] && !remaining[2].startsWith('--') ? remaining[2] : 'click';
          const value = remaining.slice(3).join(' ');
          const cmd: Command = { id, action: 'nth', selector, index: 0, subaction, inFrame };
          if (value) cmd.value = value;
          return cmd;
        }
        case 'last': {
          const selector = remaining[1];
          if (!selector)
            error(
              'Missing selector',
              'agent-browser find last <selector> [action] [text] [--in-frame <path>]'
            );
          const subaction = remaining[2] && !remaining[2].startsWith('--') ? remaining[2] : 'click';
          const value = remaining.slice(3).join(' ');
          const cmd: Command = { id, action: 'nth', selector, index: -1, subaction, inFrame };
          if (value) cmd.value = value;
          return cmd;
        }
        case 'nth': {
          const idxStr = remaining[1];
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
          const selector = remaining[2];
          if (!selector)
            error(
              'Missing selector',
              'agent-browser find nth <index> <selector> [action] [text] [--in-frame <path>]'
            );
          const subaction = remaining[3] && !remaining[3].startsWith('--') ? remaining[3] : 'click';
          const value = remaining.slice(4).join(' ');
          const cmd: Command = { id, action: 'nth', selector, index: idx, subaction, inFrame };
          if (value) cmd.value = value;
          return cmd;
        }
        default:
          error(
            `Unknown find locator: ${locator}`,
            'agent-browser find <role|text|label|placeholder|alt|title|testid|first|last|nth> ... [--in-frame <path>]'
          );
      }
    }

    case 'mouse': {
      const { inFrame, remaining } = parseInFrame(rest);
      const subcmd = remaining[0];
      if (!subcmd)
        error(
          'Missing subcommand',
          'agent-browser mouse <move|down|up|wheel|wander> [args...] [--in-frame <path>]'
        );
      switch (subcmd) {
        case 'move': {
          const x = remaining[1] ? parseInt(remaining[1], 10) : NaN;
          const y = remaining[2] ? parseInt(remaining[2], 10) : NaN;
          if (isNaN(x) || isNaN(y))
            error(
              'Missing or invalid coordinates',
              'agent-browser mouse move <x> <y> [--in-frame <path>]'
            );
          return { id, action: 'mousemove', x, y, inFrame };
        }
        case 'down':
          return { id, action: 'mousedown', button: remaining[1] || 'left', inFrame };
        case 'up':
          return { id, action: 'mouseup', button: remaining[1] || 'left', inFrame };
        case 'wheel': {
          const deltaY = remaining[1] ? parseInt(remaining[1], 10) : 100;
          const deltaX = remaining[2] ? parseInt(remaining[2], 10) : 0;
          return { id, action: 'wheel', deltaX, deltaY, inFrame };
        }
        case 'wander': {
          const duration = remaining[1] ? parseInt(remaining[1], 10) : 2000;
          return { id, action: 'wander', duration, inFrame };
        }
        case 'trajectory': {
          // Format: mouse trajectory "x:y:delay;x:y:delay;..."
          const data = remaining[1] || '';
          return { id, action: 'mousetrajectory', data, inFrame };
        }
        default:
          error(
            `Unknown mouse subcommand: ${subcmd}`,
            'agent-browser mouse <move|down|up|wheel|wander|trajectory> [args...] [--in-frame <path>]'
          );
      }
    }

    case 'set': {
      const { inFrame, remaining } = parseInFrame(rest);
      const subcmd = remaining[0];
      if (!subcmd)
        error(
          'Missing subcommand',
          'agent-browser set <viewport|device|geo|offline|headers|credentials|media> ... [--in-frame <path>]'
        );
      switch (subcmd) {
        case 'viewport': {
          const width = remaining[1] ? parseInt(remaining[1], 10) : NaN;
          const height = remaining[2] ? parseInt(remaining[2], 10) : NaN;
          if (isNaN(width) || isNaN(height))
            error(
              'Missing or invalid dimensions',
              'agent-browser set viewport <width> <height> [--in-frame <path>]'
            );
          return { id, action: 'viewport', width, height, inFrame };
        }
        case 'device': {
          const device = remaining[1];
          if (!device)
            error('Missing device name', 'agent-browser set device <name> [--in-frame <path>]');
          return { id, action: 'device', device, inFrame };
        }
        case 'geo':
        case 'geolocation': {
          const latitude = remaining[1] ? parseFloat(remaining[1]) : NaN;
          const longitude = remaining[2] ? parseFloat(remaining[2]) : NaN;
          if (isNaN(latitude) || isNaN(longitude))
            error(
              'Missing or invalid coordinates',
              'agent-browser set geo <latitude> <longitude> [--in-frame <path>]'
            );
          return { id, action: 'geolocation', latitude, longitude, inFrame };
        }
        case 'offline': {
          const off = remaining[1] !== 'off' && remaining[1] !== 'false';
          return { id, action: 'offline', offline: off, inFrame };
        }
        case 'headers': {
          const json = remaining[1];
          if (!json)
            error('Missing headers JSON', 'agent-browser set headers <json> [--in-frame <path>]');
          try {
            const headers = JSON.parse(json);
            return { id, action: 'headers', headers, inFrame };
          } catch {
            error('Invalid JSON', 'agent-browser set headers <json> [--in-frame <path>]');
          }
        }
        case 'credentials':
        case 'auth': {
          const username = remaining[1];
          const password = remaining[2];
          if (!username || !password)
            error(
              'Missing credentials',
              'agent-browser set credentials <username> <password> [--in-frame <path>]'
            );
          return { id, action: 'credentials', username, password, inFrame };
        }
        case 'media': {
          const color = remaining.includes('dark')
            ? 'dark'
            : remaining.includes('light')
              ? 'light'
              : 'no-preference';
          const reduced = remaining.includes('reduced-motion') ? 'reduce' : 'no-preference';
          return {
            id,
            action: 'emulatemedia',
            colorScheme: color,
            reducedMotion: reduced,
            inFrame,
          };
        }
        default:
          error(
            `Unknown set subcommand: ${subcmd}`,
            'agent-browser set <viewport|device|geo|offline|headers|credentials|media> ... [--in-frame <path>]'
          );
      }
    }

    case 'network': {
      const { inFrame, remaining } = parseInFrame(rest);
      const subcmd = remaining[0];
      if (!subcmd)
        error(
          'Missing subcommand',
          'agent-browser network <route|unroute|requests> ... [--in-frame <path>]'
        );
      switch (subcmd) {
        case 'route': {
          const url = remaining[1];
          if (!url)
            error(
              'Missing URL pattern',
              'agent-browser network route <url> [--abort] [--body <json>] [--in-frame <path>]'
            );
          const abort = remaining.includes('--abort');
          const bodyIdx = remaining.indexOf('--body');
          const body = bodyIdx !== -1 ? remaining[bodyIdx + 1] : undefined;
          const contentTypeIdx = remaining.indexOf('--content-type');
          const contentType = contentTypeIdx !== -1 ? remaining[contentTypeIdx + 1] : undefined;
          const response =
            body || contentType
              ? {
                  ...(body ? { body } : {}),
                  ...(contentType ? { contentType } : {}),
                }
              : undefined;
          return { id, action: 'route', url, abort, response, inFrame };
        }
        case 'unroute':
          return { id, action: 'unroute', url: remaining[1], inFrame };
        case 'requests': {
          const clear = remaining.includes('--clear');
          const filterIdx = remaining.indexOf('--filter');
          const filter = filterIdx !== -1 ? remaining[filterIdx + 1] : undefined;
          const captureResponse = remaining.includes('--capture-response');
          const typeIdx = remaining.indexOf('--type');
          const type = typeIdx !== -1 ? (remaining[typeIdx + 1] as 'json') : undefined;
          const outputIdx = remaining.indexOf('--output');
          const output = outputIdx !== -1 ? remaining[outputIdx + 1] : undefined;
          return { id, action: 'requests', clear, filter, captureResponse, type, output, inFrame };
        }
        default:
          error(
            `Unknown network subcommand: ${subcmd}`,
            'agent-browser network <route|unroute|requests> ... [--in-frame <path>]'
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
      const { inFrame, remaining } = parseInFrame(rest);
      const subcmd = remaining[0] || 'get';
      switch (subcmd) {
        case 'set': {
          const name = remaining[1];
          const value = remaining[2];
          if (!name || !value)
            error(
              'Missing name or value',
              'agent-browser cookies set <name> <value> [options] [--in-frame <path>]'
            );
          const cookie: {
            name: string;
            value: string;
            url?: string;
            domain?: string;
            path?: string;
            expires?: number;
            httpOnly?: boolean;
            secure?: boolean;
            sameSite?: string;
          } = { name, value };
          for (let i = 3; i < remaining.length; i++) {
            switch (remaining[i]) {
              case '--url':
                cookie.url = remaining[++i];
                break;
              case '--domain':
                cookie.domain = remaining[++i];
                break;
              case '--path':
                cookie.path = remaining[++i];
                break;
              case '--httpOnly':
                cookie.httpOnly = true;
                break;
              case '--secure':
                cookie.secure = true;
                break;
              case '--sameSite':
                cookie.sameSite = remaining[++i];
                break;
              case '--expires':
                cookie.expires = parseInt(remaining[++i], 10);
                break;
            }
          }
          return { id, action: 'cookies_set', cookies: [cookie], inFrame };
        }
        case 'clear':
          return { id, action: 'cookies_clear', inFrame };
        default:
          return {
            id,
            action: 'cookies_get',
            urls: subcmd !== 'get' ? [subcmd, ...remaining.slice(1)] : undefined,
            inFrame,
          };
      }
    }

    case 'tab': {
      const { inFrame, remaining } = parseInFrame(rest);
      const subcmd = remaining[0];
      if (!subcmd || subcmd === 'list') return { id, action: 'tab_list', inFrame };
      if (subcmd === 'new') {
        const cmd: Command = { id, action: 'tab_new', inFrame };
        if (remaining[1]) cmd.url = remaining[1];
        return cmd;
      }
      if (subcmd === 'close') {
        const cmd: Command = { id, action: 'tab_close', inFrame };
        if (remaining[1]) cmd.index = parseInt(remaining[1], 10);
        return cmd;
      }
      const index = parseInt(subcmd, 10);
      if (!isNaN(index)) return { id, action: 'tab_switch', index, inFrame };
      error('Unknown tab command', 'agent-browser tab <list|new|close|index> [--in-frame <path>]');
    }

    case 'window': {
      const { inFrame, remaining } = parseInFrame(rest);
      if (remaining[0] === 'new') return { id, action: 'window_new', inFrame };
      error('Unknown window command', 'agent-browser window new [--in-frame <path>]');
    }

    case 'frame': {
      const { inFrame, remaining } = parseInFrame(rest);
      if (remaining[0] === 'main') return { id, action: 'mainframe', inFrame };
      let urlOpt: string | undefined;
      let nameOpt: string | undefined;
      let selectorOpt: string | undefined;
      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i] === '--url') {
          urlOpt = remaining[i + 1];
          i++;
        } else if (remaining[i] === '--name') {
          nameOpt = remaining[i + 1];
          i++;
        } else if (!remaining[i].startsWith('--') && !selectorOpt) {
          selectorOpt = remaining[i];
        }
      }
      if (urlOpt) return { id, action: 'frame', url: urlOpt, inFrame };
      if (nameOpt) return { id, action: 'frame', name: nameOpt, inFrame };
      if (selectorOpt) return { id, action: 'frame', selector: selectorOpt, inFrame };
      error(
        'Missing selector',
        'agent-browser frame <selector|main> [--url <url>] [--name <name>] [--in-frame <path>]'
      );
    }

    case 'dialog': {
      const { inFrame, remaining } = parseInFrame(rest);
      const subcmd = remaining[0];
      if (!subcmd)
        error(
          'Missing subcommand',
          'agent-browser dialog <accept|dismiss> [text] [--in-frame <path>]'
        );
      if (subcmd === 'accept') {
        const cmd: Command = { id, action: 'dialog', response: 'accept', inFrame };
        if (remaining[1]) cmd.promptText = remaining[1];
        return cmd;
      }
      if (subcmd === 'dismiss') return { id, action: 'dialog', response: 'dismiss', inFrame };
      error(
        'Unknown dialog command',
        'agent-browser dialog <accept|dismiss> [text] [--in-frame <path>]'
      );
    }

    case 'trace': {
      const { inFrame, remaining } = parseInFrame(rest);
      const subcmd = remaining[0];
      if (!subcmd)
        error('Missing subcommand', 'agent-browser trace <start|stop> [path] [--in-frame <path>]');
      if (subcmd === 'start') return { id, action: 'trace_start', inFrame };
      if (subcmd === 'stop') {
        const path = remaining[1];
        if (!path) error('Missing path', 'agent-browser trace stop <path> [--in-frame <path>]');
        return { id, action: 'trace_stop', path, inFrame };
      }
      error('Unknown trace command', 'agent-browser trace <start|stop> [path] [--in-frame <path>]');
    }

    case 'record': {
      const { inFrame, remaining } = parseInFrame(rest);
      const subcmd = remaining[0];
      if (!subcmd)
        error(
          'Missing subcommand',
          'agent-browser record <start|stop|restart> [path] [url] [--in-frame <path>]'
        );
      if (subcmd === 'start') {
        const path = remaining[1];
        if (!path)
          error(
            'Missing path',
            'agent-browser record start <output.webm> [url] [--in-frame <path>]'
          );
        const cmd: Command = { id, action: 'recording_start', path, inFrame };
        if (remaining[2])
          cmd.url = remaining[2].startsWith('http') ? remaining[2] : `https://${remaining[2]}`;
        return cmd;
      }
      if (subcmd === 'stop') return { id, action: 'recording_stop', inFrame };
      if (subcmd === 'restart') {
        const path = remaining[1];
        if (!path)
          error(
            'Missing path',
            'agent-browser record restart <output.webm> [url] [--in-frame <path>]'
          );
        const cmd: Command = { id, action: 'recording_restart', path, inFrame };
        if (remaining[2])
          cmd.url = remaining[2].startsWith('http') ? remaining[2] : `https://${remaining[2]}`;
        return cmd;
      }
      error(
        'Unknown record command',
        'agent-browser record <start|stop|restart> [path] [url] [--in-frame <path>]'
      );
    }

    case 'recorder': {
      const subcmd = rest[0];
      const remaining = rest.slice(1);

      if (!subcmd)
        error('Missing subcommand', 'agent-browser recorder <start|stop|status> [--output file]');

      if (subcmd === 'start') {
        const url = remaining[0];
        const cmd: Command = { id, action: 'recorder_start' };
        if (url) cmd.url = url.startsWith('http') ? url : `https://${url}`;
        return cmd;
      }

      if (subcmd === 'stop') {
        let output: string | undefined;
        const outputIdx = remaining.indexOf('--output');
        if (outputIdx !== -1) {
          output = remaining[outputIdx + 1];
        }
        const cmd: Command = { id, action: 'recorder_stop', output };
        return cmd;
      }

      if (subcmd === 'status') {
        return { id, action: 'recorder_status' };
      }

      if (subcmd === 'replay') {
        const path = remaining[0];
        const cmd: Command = { id, action: 'recorder_replay' };
        if (path) cmd.path = path;
        return cmd;
      }

      error(
        'Unknown recorder command',
        'agent-browser recorder <start|stop|status|replay> [--output file] [path]'
      );
    }

    case 'console': {
      const { inFrame, remaining } = parseInFrame(rest);
      return { id, action: 'console', clear: remaining.includes('--clear'), inFrame };
    }

    case 'errors': {
      const { inFrame, remaining } = parseInFrame(rest);
      return { id, action: 'errors', clear: remaining.includes('--clear'), inFrame };
    }

    case 'highlight': {
      const { inFrame, remaining } = parseInFrame(rest);
      const selector = remaining[0];
      if (!selector)
        error('Missing selector', 'agent-browser highlight <selector> [--in-frame <path>]');
      return { id, action: 'highlight', selector, inFrame };
    }

    case 'state': {
      const { inFrame, remaining } = parseInFrame(rest);
      const subcmd = remaining[0];
      if (!subcmd)
        error('Missing subcommand', 'agent-browser state <save|load> <path> [--in-frame <path>]');
      const path = remaining[1];
      if (!path) error('Missing path', `agent-browser state ${subcmd} <path> [--in-frame <path>]`);
      if (subcmd === 'save') return { id, action: 'state_save', path, inFrame };
      if (subcmd === 'load') return { id, action: 'state_load', path, inFrame };
      error('Unknown state command', 'agent-browser state <save|load> <path> [--in-frame <path>]');
    }

    case 'connect': {
      const { inFrame, remaining } = parseInFrame(rest);
      const endpoint = remaining[0];
      if (!endpoint)
        error('Missing endpoint', 'agent-browser connect <port|url> [--in-frame <path>]');
      if (
        endpoint.startsWith('ws://') ||
        endpoint.startsWith('wss://') ||
        endpoint.startsWith('http://') ||
        endpoint.startsWith('https://')
      ) {
        return { id, action: 'launch', cdpUrl: endpoint, inFrame };
      }
      const port = parseInt(endpoint, 10);
      if (isNaN(port))
        error('Invalid port or URL', 'agent-browser connect <port|url> [--in-frame <path>]');
      if (port <= 0)
        error(
          'Port must be greater than 0',
          'agent-browser connect <port|url> [--in-frame <path>]'
        );
      if (port > 65535)
        error(
          'Port out of range (1-65535)',
          'agent-browser connect <port|url> [--in-frame <path>]'
        );
      return { id, action: 'launch', cdpPort: port, inFrame };
    }

    case 'tap': {
      const { inFrame, remaining } = parseInFrame(rest);
      const selector = remaining[0];
      if (!selector) error('Missing selector', 'agent-browser tap <selector> [--in-frame <path>]');
      return { id, action: 'tap', selector, inFrame };
    }

    case 'swipe': {
      const { inFrame, remaining } = parseInFrame(rest);
      const direction = remaining[0];
      if (!direction || !['up', 'down', 'left', 'right'].includes(direction))
        error(
          'Invalid direction',
          'agent-browser swipe <up|down|left|right> [distance] [--in-frame <path>]'
        );
      const cmd: Command = { id, action: 'swipe', direction, inFrame };
      if (remaining[1]) cmd.distance = parseInt(remaining[1], 10);
      return cmd;
    }

    case 'device': {
      const { inFrame, remaining } = parseInFrame(rest);
      const subcmd = remaining[0];
      if (!subcmd || subcmd === 'list') return { id, action: 'device_list', inFrame };
      error('Unknown device command', 'agent-browser device [list] [--in-frame <path>]');
    }

    case 'config': {
      const json = rest.includes('--json');
      return { id, action: 'config', json };
    }

    default: {
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
        'viewer',
        'ask',
        'config',
        'install',
        'device',
        'dialog',
        'window',
      ];
      const suggestion = findSimilar(cmd, allCommands);
      let msg = `Unknown command: ${cmd}`;
      if (suggestion) {
        msg += `. Did you mean "${suggestion}"?`;
      }
      error(msg);
    }
  }
}
