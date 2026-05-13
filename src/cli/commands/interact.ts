import type { Command, Flags } from './shared.js';
import { error, parseInFrame, parseDiff, fs } from './shared.js';

export function handleInteract(
  cmd: string,
  rest: string[],
  id: string,
  flags: Flags
): Command | undefined {
  switch (cmd) {
    case 'click': {
      const { inFrame, remaining: r1 } = parseInFrame(rest);
      const { diffScope, remaining } = parseDiff(r1);
      const selector = remaining[0];
      if (!selector)
        error(
          'Missing selector',
          'agent-browser click <selector> [--diff [scope]] [--in-frame <path>]'
        );
      const cmd: Command = { id, action: 'click', selector, inFrame, diffScope };
      if (flags.human.enabled) cmd.human = flags.human;
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
      const cmd: Command = { id, action: 'dblclick', selector, inFrame, diffScope };
      if (flags.human.enabled) cmd.human = flags.human;
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
      const cmd: Command = { id, action: 'fill', selector, value, inFrame, diffScope };
      if (flags.human.enabled) cmd.human = flags.human;
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
      const cmd: Command = { id, action: 'type', selector, text, inFrame, diffScope };
      if (flags.human.enabled) cmd.human = flags.human;
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
      const cmd: Command = { id, action: 'hover', selector, inFrame, diffScope };
      if (flags.human.enabled) cmd.human = flags.human;
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
      const { inFrame, remaining } = parseInFrame(rest);
      const source = remaining[0];
      const target = remaining[1];
      if (!source || !target)
        error(
          'Missing source or target',
          'agent-browser drag <source> <target> [--in-frame <path>]'
        );
      return { id, action: 'drag', source, target, inFrame };
    }
    case 'upload': {
      const { inFrame, remaining } = parseInFrame(rest);
      const selector = remaining[0];
      const files = remaining.slice(1);
      if (!selector || files.length === 0)
        error(
          'Missing selector or files',
          'agent-browser upload <selector> <files...> [--in-frame <path>]'
        );
      return { id, action: 'upload', selector, files, inFrame };
    }
    case 'download': {
      const { inFrame, remaining } = parseInFrame(rest);
      const selector = remaining[0];
      const path = remaining[1];
      if (!selector || !path)
        error(
          'Missing selector or path',
          'agent-browser download <selector> <path> [--in-frame <path>]'
        );
      return { id, action: 'download', selector, path, inFrame };
    }
    case 'press':
    case 'key': {
      const { inFrame, remaining: r1 } = parseInFrame(rest);
      const { diffScope, remaining } = parseDiff(r1);
      const key = remaining[0];
      if (!key)
        error('Missing key', 'agent-browser press <key> [--diff [scope]] [--in-frame <path>]');
      return { id, action: 'press', key, diffScope, inFrame };
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
      const { inFrame, remaining: scrollRest } = parseInFrame(rest);
      const direction = scrollRest[0] || 'down';
      const amount = scrollRest[1] ? parseInt(scrollRest[1], 10) : 300;
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
    case 'highlight': {
      const selector = rest[0];
      if (!selector) error('Missing selector', 'agent-browser highlight <selector>');
      return { id, action: 'highlight', selector };
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
    default:
      return undefined;
  }
}

export function handleWait(rest: string[], id: string): Command {
  const inFrameIdx = rest.indexOf('--in-frame');
  const inFrame = inFrameIdx !== -1 && rest[inFrameIdx + 1] ? rest[inFrameIdx + 1] : undefined;
  const waitRest = rest.filter(
    (_, i) => i !== inFrameIdx && i !== (inFrameIdx !== -1 ? inFrameIdx + 1 : -1)
  );
  if (waitRest.includes('--url') || waitRest.includes('-u')) {
    const urlIdx = waitRest.includes('--url') ? waitRest.indexOf('--url') : waitRest.indexOf('-u');
    const url = waitRest[urlIdx + 1];
    if (!url) error('Missing URL pattern', 'agent-browser wait --url <pattern>');
    return { id, action: 'waitforurl', url, inFrame };
  }
  if (waitRest.includes('--load') || waitRest.includes('-l')) {
    const loadIdx = waitRest.includes('--load')
      ? waitRest.indexOf('--load')
      : waitRest.indexOf('-l');
    const state = waitRest[loadIdx + 1];
    if (!state) error('Missing load state', 'agent-browser wait --load <state>');
    return { id, action: 'waitforloadstate', state, inFrame };
  }
  if (waitRest.includes('--fn') || waitRest.includes('-f')) {
    const fnIdx = waitRest.includes('--fn') ? waitRest.indexOf('--fn') : waitRest.indexOf('-f');
    const expression = waitRest[fnIdx + 1];
    if (!expression) error('Missing expression', 'agent-browser wait --fn <expression>');
    return { id, action: 'waitforfunction', expression, inFrame };
  }
  if (waitRest.includes('--text') || waitRest.includes('-t')) {
    const textIdx = waitRest.includes('--text')
      ? waitRest.indexOf('--text')
      : waitRest.indexOf('-t');
    const text = waitRest[textIdx + 1];
    if (!text) error('Missing text', 'agent-browser wait --text <text>');
    return { id, action: 'wait', selector: `text=${text}`, inFrame };
  }
  if (waitRest.includes('--download') || waitRest.includes('-d')) {
    const cmd: Command = { id, action: 'waitfordownload', inFrame };
    const dlIdx = waitRest.includes('--download')
      ? waitRest.indexOf('--download')
      : waitRest.indexOf('-d');
    if (waitRest[dlIdx + 1] && !waitRest[dlIdx + 1].startsWith('--'))
      cmd.path = waitRest[dlIdx + 1];
    const timeoutIdx = waitRest.indexOf('--timeout');
    if (timeoutIdx !== -1 && waitRest[timeoutIdx + 1])
      cmd.timeout = parseInt(waitRest[timeoutIdx + 1], 10);
    return cmd;
  }
  if (waitRest.includes('--request') || waitRest.includes('-r')) {
    const reqIdx = waitRest.includes('--request')
      ? waitRest.indexOf('--request')
      : waitRest.indexOf('-r');
    const url = waitRest[reqIdx + 1];
    if (!url) error('Missing URL pattern', 'agent-browser wait --request <pattern>');
    const cmd: Command = { id, action: 'responsebody', url, inFrame };
    const timeoutIdx = waitRest.indexOf('--timeout');
    if (timeoutIdx !== -1 && waitRest[timeoutIdx + 1])
      cmd.timeout = parseInt(waitRest[timeoutIdx + 1], 10);
    return cmd;
  }
  if (waitRest[0]) {
    const timeout = parseInt(waitRest[0], 10);
    if (!isNaN(timeout)) return { id, action: 'wait', timeout, inFrame };
    return { id, action: 'wait', selector: waitRest[0], inFrame };
  }
  error(
    'Missing arguments',
    'agent-browser wait <selector|ms|--url|--load|--fn|--text|--download|--request> [--in-frame <path>]'
  );
}

export function handleScreenshot(rest: string[], id: string): Command {
  const fullPage = rest.includes('--full') || rest.includes('-f');
  const inFrameIdx = rest.indexOf('--in-frame');
  const inFrame = inFrameIdx !== -1 && rest[inFrameIdx + 1] ? rest[inFrameIdx + 1] : undefined;
  const filtered = rest.filter(
    (r, i) =>
      r !== '--full' &&
      r !== '-f' &&
      r !== '--in-frame' &&
      i !== (inFrameIdx !== -1 ? inFrameIdx + 1 : -1)
  );
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
  return { id, action: 'screenshot', selector, path, fullPage: fullPage || undefined, inFrame };
}

export function handleSnapshot(rest: string[], id: string): Command {
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
      case '--selectors':
        command.selectors = true;
        break;
      case '--all':
        command.all = true;
        break;
    }
  }
  return command;
}

export function handleEval(rest: string[], id: string): Command {
  const { inFrame, remaining: evalRest } = parseInFrame(rest);
  let script: string | undefined;
  let file: string | undefined;
  if (evalRest.includes('--file')) {
    const fileIdx = evalRest.indexOf('--file');
    file = evalRest[fileIdx + 1];
    if (!file) error('Missing file path', 'agent-browser eval --file <path>');
  } else if (evalRest.includes('--stdin')) {
    const fd = process.stdin.fd;
    const buffer = Buffer.allocUnsafe(1024);
    const chunks: Buffer[] = [];
    let bytesRead: number;
    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
    }
    script = Buffer.concat(chunks).toString('utf8');
  } else if (evalRest.includes('-b') || evalRest.includes('--base64')) {
    const bIdx = evalRest.includes('-b') ? evalRest.indexOf('-b') : evalRest.indexOf('--base64');
    const encoded = evalRest[bIdx + 1];
    if (!encoded) error('Missing base64 script', 'agent-browser eval -b <base64-script>');
    script = Buffer.from(encoded, 'base64').toString('utf8');
  } else {
    script = evalRest.join(' ');
    if (!script) error('Missing script', 'agent-browser eval <script>');
  }
  return { id, action: 'evaluate', script, file, inFrame };
}
