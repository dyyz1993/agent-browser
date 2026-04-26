import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('navigation commands', () => {
  it('should parse open with https url', () => {
    const cmd = parseCliArgs(['open', 'https://example.com']);
    expect(cmd.action).toBe('navigate');
    expect(cmd.url).toBe('https://example.com');
  });

  it('should parse open with query params', () => {
    const cmd = parseCliArgs(['open', 'https://example.com/search?q=hello']);
    expect(cmd.action).toBe('navigate');
    expect(cmd.url).toBe('https://example.com/search?q=hello');
  });

  it('should parse goto as navigate alias', () => {
    const cmd = parseCliArgs(['goto', 'https://example.com']);
    expect(cmd.action).toBe('navigate');
    expect(cmd.url).toBe('https://example.com');
  });

  it('should parse navigate as navigate alias', () => {
    const cmd = parseCliArgs(['navigate', 'https://example.com']);
    expect(cmd.action).toBe('navigate');
    expect(cmd.url).toBe('https://example.com');
  });

  it('should throw CliError when open has no url', () => {
    expect(() => parseCliArgs(['open'])).toThrow(CliError);
    try {
      parseCliArgs(['open']);
    } catch (e) {
      expect((e as CliError).message).toBe('Missing URL');
      expect((e as CliError).usage).toBe('agent-browser open <url>');
    }
  });
});

describe('keyboard commands', () => {
  it('should parse press Enter', () => {
    const cmd = parseCliArgs(['press', 'Enter']);
    expect(cmd.action).toBe('press');
    expect(cmd.key).toBe('Enter');
  });

  it('should parse press Control+A', () => {
    const cmd = parseCliArgs(['press', 'Control+A']);
    expect(cmd.action).toBe('press');
    expect(cmd.key).toBe('Control+A');
  });

  it('should parse press Tab', () => {
    const cmd = parseCliArgs(['press', 'Tab']);
    expect(cmd.action).toBe('press');
    expect(cmd.key).toBe('Tab');
  });

  it('should parse press Escape', () => {
    const cmd = parseCliArgs(['press', 'Escape']);
    expect(cmd.action).toBe('press');
    expect(cmd.key).toBe('Escape');
  });

  it('should throw CliError when press has no key', () => {
    expect(() => parseCliArgs(['press'])).toThrow(CliError);
    try {
      parseCliArgs(['press']);
    } catch (e) {
      expect((e as CliError).message).toBe('Missing key');
      expect((e as CliError).usage).toBe('agent-browser press <key> [--in-frame <path>]');
    }
  });
});

describe('mouse commands', () => {
  it('should parse mouse move with x and y', () => {
    const cmd = parseCliArgs(['mouse', 'move', '100', '200']);
    expect(cmd.action).toBe('mousemove');
    expect(cmd.x).toBe(100);
    expect(cmd.y).toBe(200);
  });

  it('should parse mouse down with button', () => {
    const cmd = parseCliArgs(['mouse', 'down', 'left']);
    expect(cmd.action).toBe('mousedown');
    expect(cmd.button).toBe('left');
  });

  it('should parse mouse up with button', () => {
    const cmd = parseCliArgs(['mouse', 'up', 'right']);
    expect(cmd.action).toBe('mouseup');
    expect(cmd.button).toBe('right');
  });

  it('should parse mouse wheel with deltaY and deltaX', () => {
    const cmd = parseCliArgs(['mouse', 'wheel', '50', '0']);
    expect(cmd.action).toBe('wheel');
    expect(cmd.deltaY).toBe(50);
    expect(cmd.deltaX).toBe(0);
  });

  it('should parse mouse wander with duration', () => {
    const cmd = parseCliArgs(['mouse', 'wander', '500']);
    expect(cmd.action).toBe('wander');
    expect(cmd.duration).toBe(500);
  });
});

describe('scroll commands', () => {
  it('should parse scroll down with defaults', () => {
    const cmd = parseCliArgs(['scroll', 'down']);
    expect(cmd.action).toBe('scroll');
    expect(cmd.direction).toBe('down');
    expect(cmd.amount).toBe(300);
  });

  it('should parse scroll up with custom amount', () => {
    const cmd = parseCliArgs(['scroll', 'up', '200']);
    expect(cmd.action).toBe('scroll');
    expect(cmd.direction).toBe('up');
    expect(cmd.amount).toBe(200);
  });

  it('should parse scroll left with custom amount', () => {
    const cmd = parseCliArgs(['scroll', 'left', '100']);
    expect(cmd.action).toBe('scroll');
    expect(cmd.direction).toBe('left');
    expect(cmd.amount).toBe(100);
  });

  it('should parse scroll right with defaults', () => {
    const cmd = parseCliArgs(['scroll', 'right']);
    expect(cmd.action).toBe('scroll');
    expect(cmd.direction).toBe('right');
    expect(cmd.amount).toBe(300);
  });

  it('should parse scroll with no args as default down', () => {
    const cmd = parseCliArgs(['scroll']);
    expect(cmd.action).toBe('scroll');
    expect(cmd.direction).toBe('down');
    expect(cmd.amount).toBe(300);
  });
});

describe('get commands', () => {
  it('should parse get title', () => {
    const cmd = parseCliArgs(['get', 'title']);
    expect(cmd.action).toBe('title');
  });

  it('should parse get url', () => {
    const cmd = parseCliArgs(['get', 'url']);
    expect(cmd.action).toBe('url');
  });

  it('should parse get text with selector', () => {
    const cmd = parseCliArgs(['get', 'text', '#content']);
    expect(cmd.action).toBe('gettext');
    expect(cmd.selector).toBe('#content');
  });

  it('should parse get value with selector', () => {
    const cmd = parseCliArgs(['get', 'value', '#input']);
    expect(cmd.action).toBe('inputvalue');
    expect(cmd.selector).toBe('#input');
  });

  it('should parse get count with selector', () => {
    const cmd = parseCliArgs(['get', 'count', 'button']);
    expect(cmd.action).toBe('count');
    expect(cmd.selector).toBe('button');
  });
});

describe('is commands', () => {
  it('should parse is visible with selector', () => {
    const cmd = parseCliArgs(['is', 'visible', '#el']);
    expect(cmd.action).toBe('isvisible');
    expect(cmd.selector).toBe('#el');
  });

  it('should parse is enabled with selector', () => {
    const cmd = parseCliArgs(['is', 'enabled', '#btn']);
    expect(cmd.action).toBe('isenabled');
    expect(cmd.selector).toBe('#btn');
  });

  it('should parse is checked with selector', () => {
    const cmd = parseCliArgs(['is', 'checked', '#cb']);
    expect(cmd.action).toBe('ischecked');
    expect(cmd.selector).toBe('#cb');
  });

  it('should throw CliError when is visible has no selector', () => {
    expect(() => parseCliArgs(['is', 'visible'])).toThrow(CliError);
    try {
      parseCliArgs(['is', 'visible']);
    } catch (e) {
      expect((e as CliError).message).toBe('Missing selector');
    }
  });
});

describe('wait commands', () => {
  it('should parse wait with numeric timeout', () => {
    const cmd = parseCliArgs(['wait', '500']);
    expect(cmd.action).toBe('wait');
    expect(cmd.timeout).toBe(500);
  });

  it('should parse wait with selector', () => {
    const cmd = parseCliArgs(['wait', '#element']);
    expect(cmd.action).toBe('wait');
    expect(cmd.selector).toBe('#element');
  });

  it('should parse wait --text as text selector', () => {
    const cmd = parseCliArgs(['wait', '--text', 'Hello']);
    expect(cmd.action).toBe('wait');
    expect(cmd.selector).toBe('text=Hello');
  });

  it('should parse wait --load with state', () => {
    const cmd = parseCliArgs(['wait', '--load', 'networkidle']);
    expect(cmd.action).toBe('waitforloadstate');
    expect(cmd.state).toBe('networkidle');
  });
});

describe('check/uncheck commands', () => {
  it('should parse check with selector', () => {
    const cmd = parseCliArgs(['check', '#cb1']);
    expect(cmd.action).toBe('check');
    expect(cmd.selector).toBe('#cb1');
  });

  it('should parse uncheck with selector', () => {
    const cmd = parseCliArgs(['uncheck', '#cb1']);
    expect(cmd.action).toBe('uncheck');
    expect(cmd.selector).toBe('#cb1');
  });

  it('should throw CliError when check has no selector', () => {
    expect(() => parseCliArgs(['check'])).toThrow(CliError);
    try {
      parseCliArgs(['check']);
    } catch (e) {
      expect((e as CliError).message).toBe('Missing selector');
    }
  });
});

describe('hover/focus commands', () => {
  it('should parse hover with selector', () => {
    const cmd = parseCliArgs(['hover', '#el']);
    expect(cmd.action).toBe('hover');
    expect(cmd.selector).toBe('#el');
  });

  it('should parse focus with selector', () => {
    const cmd = parseCliArgs(['focus', '#input']);
    expect(cmd.action).toBe('focus');
    expect(cmd.selector).toBe('#input');
  });

  it('should parse hover with ref selector', () => {
    const cmd = parseCliArgs(['hover', '@e5']);
    expect(cmd.action).toBe('hover');
    expect(cmd.selector).toBe('@e5');
  });
});

describe('recorder commands', () => {
  it('should parse recorder start', () => {
    const cmd = parseCliArgs(['recorder', 'start']);
    expect(cmd.action).toBe('recorder_start');
  });

  it('should parse recorder start with url', () => {
    const cmd = parseCliArgs(['recorder', 'start', 'https://example.com']);
    expect(cmd.action).toBe('recorder_start');
    expect(cmd.url).toBe('https://example.com');
  });

  it('should parse recorder start with bare domain adding https', () => {
    const cmd = parseCliArgs(['recorder', 'start', 'example.com']);
    expect(cmd.action).toBe('recorder_start');
    expect(cmd.url).toBe('https://example.com');
  });

  it('should parse recorder stop', () => {
    const cmd = parseCliArgs(['recorder', 'stop']);
    expect(cmd.action).toBe('recorder_stop');
  });

  it('should parse recorder status', () => {
    const cmd = parseCliArgs(['recorder', 'status']);
    expect(cmd.action).toBe('recorder_status');
  });
});

describe('eval commands', () => {
  it('should parse eval with inline script', () => {
    const cmd = parseCliArgs(['eval', 'document.title']);
    expect(cmd.action).toBe('evaluate');
    expect(cmd.script).toBe('document.title');
  });

  it('should parse eval --file with file path', () => {
    const cmd = parseCliArgs(['eval', '--file', 'script.js']);
    expect(cmd.action).toBe('evaluate');
    expect(cmd.file).toBe('script.js');
  });

  it('should throw CliError when eval has no args', () => {
    expect(() => parseCliArgs(['eval'])).toThrow(CliError);
    try {
      parseCliArgs(['eval']);
    } catch (e) {
      expect((e as CliError).message).toBe('Missing script');
    }
  });
});
