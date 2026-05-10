import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('scroll command', () => {
  describe('default scroll', () => {
    it('should parse scroll with defaults', () => {
      const cmd = parseCliArgs(['scroll']);
      expect(cmd.action).toBe('scroll');
      expect(cmd.direction).toBe('down');
      expect(cmd.amount).toBe(300);
    });
  });

  describe('scroll with direction', () => {
    it('should parse scroll up', () => {
      const cmd = parseCliArgs(['scroll', 'up']);
      expect(cmd.action).toBe('scroll');
      expect(cmd.direction).toBe('up');
      expect(cmd.amount).toBe(300);
    });

    it('should parse scroll down', () => {
      const cmd = parseCliArgs(['scroll', 'down']);
      expect(cmd.action).toBe('scroll');
      expect(cmd.direction).toBe('down');
      expect(cmd.amount).toBe(300);
    });

    it('should parse scroll left', () => {
      const cmd = parseCliArgs(['scroll', 'left']);
      expect(cmd.action).toBe('scroll');
      expect(cmd.direction).toBe('left');
      expect(cmd.amount).toBe(300);
    });

    it('should parse scroll right', () => {
      const cmd = parseCliArgs(['scroll', 'right']);
      expect(cmd.action).toBe('scroll');
      expect(cmd.direction).toBe('right');
      expect(cmd.amount).toBe(300);
    });
  });

  describe('scroll with amount', () => {
    it('should parse scroll with custom amount', () => {
      const cmd = parseCliArgs(['scroll', 'down', '500']);
      expect(cmd.action).toBe('scroll');
      expect(cmd.direction).toBe('down');
      expect(cmd.amount).toBe(500);
    });

    it('should parse scroll up with amount', () => {
      const cmd = parseCliArgs(['scroll', 'up', '1000']);
      expect(cmd.action).toBe('scroll');
      expect(cmd.direction).toBe('up');
      expect(cmd.amount).toBe(1000);
    });

    it('should parse scroll with small amount', () => {
      const cmd = parseCliArgs(['scroll', 'down', '50']);
      expect(cmd.action).toBe('scroll');
      expect(cmd.amount).toBe(50);
    });
  });

  describe('scroll with --in-frame', () => {
    it('should parse scroll with --in-frame', () => {
      const cmd = parseCliArgs(['scroll', '--in-frame', '1', 'down', '300']);
      expect(cmd.action).toBe('scroll');
      expect(cmd.direction).toBe('down');
      expect(cmd.amount).toBe(300);
      expect(cmd.inFrame).toBe('1');
    });

    it('should parse scroll defaults with --in-frame', () => {
      const cmd = parseCliArgs(['scroll', '--in-frame', 'iframe-0']);
      expect(cmd.action).toBe('scroll');
      expect(cmd.direction).toBe('down');
      expect(cmd.amount).toBe(300);
      expect(cmd.inFrame).toBe('iframe-0');
    });

    it('should not include --in-frame as direction', () => {
      const cmd = parseCliArgs(['scroll', '--in-frame', '1', 'up']);
      expect(cmd.direction).not.toBe('--in-frame');
      expect(cmd.direction).toBe('up');
      expect(cmd.inFrame).toBe('1');
    });
  });
});

describe('scrollintoview command', () => {
  describe('basic scrollintoview', () => {
    it('should parse scrollintoview with selector', () => {
      const cmd = parseCliArgs(['scrollintoview', '#element']);
      expect(cmd.action).toBe('scrollintoview');
      expect(cmd.selector).toBe('#element');
    });

    it('should parse scrollintoview with class selector', () => {
      const cmd = parseCliArgs(['scrollintoview', '.section']);
      expect(cmd.action).toBe('scrollintoview');
      expect(cmd.selector).toBe('.section');
    });

    it('should parse scrollintoview with ref selector', () => {
      const cmd = parseCliArgs(['scrollintoview', '@e10']);
      expect(cmd.action).toBe('scrollintoview');
      expect(cmd.selector).toBe('@e10');
    });
  });

  describe('scrollinto alias', () => {
    it('should parse scrollinto as scrollintoview', () => {
      const cmd = parseCliArgs(['scrollinto', '#element']);
      expect(cmd.action).toBe('scrollintoview');
      expect(cmd.selector).toBe('#element');
    });
  });

  describe('scrollintoview with --in-frame', () => {
    it('should parse scrollintoview with --in-frame', () => {
      const cmd = parseCliArgs(['scrollintoview', '--in-frame', '1', '#element']);
      expect(cmd.action).toBe('scrollintoview');
      expect(cmd.selector).toBe('#element');
      expect(cmd.inFrame).toBe('1');
    });

    it('should not include --in-frame as selector', () => {
      const cmd = parseCliArgs(['scrollintoview', '--in-frame', '1', '#element']);
      expect(cmd.selector).not.toBe('--in-frame');
      expect(cmd.selector).toBe('#element');
    });
  });

  describe('scrollintoview errors', () => {
    it('should throw error when selector is missing', () => {
      expect(() => parseCliArgs(['scrollintoview'])).toThrow(CliError);
      try {
        parseCliArgs(['scrollintoview']);
      } catch (e) {
        expect((e as CliError).message).toBe('Missing selector');
        expect((e as CliError).usage).toBe(
          'agent-browser scrollintoview <selector> [--in-frame <path>]'
        );
      }
    });
  });
});
