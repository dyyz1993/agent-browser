import type { Command } from './shared.js';
import { error, parseInFrame } from './shared.js';

export function handleGet(rest: string[], id: string): Command {
  const { inFrame, remaining: getRest } = parseInFrame(rest);
  const subcmd = getRest[0];
  if (!subcmd)
    error(
      'Missing subcommand',
      'agent-browser get <text|html|value|attr|url|title|count|box|styles> [args...] [--in-frame <path>]'
    );
  switch (subcmd) {
    case 'text': {
      const selector = getRest[1];
      if (!selector) error('Missing selector', 'agent-browser get text <selector>');
      return { id, action: 'gettext', selector, inFrame };
    }
    case 'html': {
      const selector = getRest[1];
      if (!selector) error('Missing selector', 'agent-browser get html <selector>');
      return { id, action: 'innerhtml', selector, inFrame };
    }
    case 'value': {
      const selector = getRest[1];
      if (!selector) error('Missing selector', 'agent-browser get value <selector>');
      return { id, action: 'inputvalue', selector, inFrame };
    }
    case 'attr': {
      const selector = getRest[1];
      const attribute = getRest[2];
      if (!selector || !attribute)
        error('Missing selector or attribute', 'agent-browser get attr <selector> <attribute>');
      return { id, action: 'getattribute', selector, attribute, inFrame };
    }
    case 'url':
      return { id, action: 'url' };
    case 'title':
      return { id, action: 'title' };
    case 'count': {
      const selector = getRest[1];
      if (!selector) error('Missing selector', 'agent-browser get count <selector>');
      return { id, action: 'count', selector, inFrame };
    }
    case 'box': {
      const selector = getRest[1];
      if (!selector) error('Missing selector', 'agent-browser get box <selector>');
      return { id, action: 'boundingbox', selector, inFrame };
    }
    case 'styles': {
      const selector = getRest[1];
      if (!selector) error('Missing selector', 'agent-browser get styles <selector>');
      return { id, action: 'styles', selector, inFrame };
    }
    default:
      error(
        `Unknown get subcommand: ${subcmd}`,
        'agent-browser get <text|html|value|attr|url|title|count|box|styles> [args...] [--in-frame <path>]'
      );
  }
}

export function handleIs(rest: string[], id: string): Command {
  const { inFrame, remaining: isRest } = parseInFrame(rest);
  const subcmd = isRest[0];
  if (!subcmd)
    error(
      'Missing subcommand',
      'agent-browser is <visible|enabled|checked> <selector> [--in-frame <path>]'
    );
  const selector = isRest[1];
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

export function handleFind(rest: string[], id: string): Command {
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

export function handleMouse(rest: string[], id: string, flags: any): Command {
  const subcmd = rest[0];
  if (!subcmd)
    error(
      'Missing subcommand',
      'agent-browser mouse <move|down|up|wheel|wander|trajectory> [args...]'
    );
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
      const wRest = rest.slice(1);
      const duration = wRest[0] ? parseInt(wRest[0], 10) : 2000;
      const cmd: Command = { id, action: 'wander', duration };
      if (flags.human.enabled) cmd.human = flags.human;
      return cmd;
    }
    case 'trajectory': {
      const data = rest.slice(1).join(' ');
      if (!data)
        error('Missing trajectory data', 'agent-browser mouse trajectory "x:y:d;x:y:d;..."');
      const cmd: Command = { id, action: 'mousetrajectory', data };
      if (flags.human.enabled) cmd.human = flags.human;
      return cmd;
    }
    default:
      error(
        `Unknown mouse subcommand: ${subcmd}`,
        'agent-browser mouse <move|down|up|wheel|wander|trajectory> [args...]'
      );
  }
}

export function handleSet(rest: string[], id: string): Command {
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
      const username = rest[1] || process.env.AGENT_BROWSER_AUTH_USER;
      const password = rest[2] || process.env.AGENT_BROWSER_AUTH_PASS;
      if (!username || !password)
        error(
          'Missing credentials',
          'agent-browser set credentials <username> <password>\n' +
            'Or set environment variables: AGENT_BROWSER_AUTH_USER, AGENT_BROWSER_AUTH_PASS'
        );
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
