import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('screenshot command', () => {
  describe('basic screenshot', () => {
    it('should parse screenshot without arguments', () => {
      const cmd = parseCliArgs(['screenshot']);
      expect(cmd.action).toBe('screenshot');
      expect(cmd.selector).toBeUndefined();
      expect(cmd.path).toBeUndefined();
    });
  });

  describe('screenshot with path', () => {
    it('should parse screenshot with path', () => {
      const cmd = parseCliArgs(['screenshot', 'out.png']);
      expect(cmd.action).toBe('screenshot');
      expect(cmd.path).toBe('out.png');
      expect(cmd.selector).toBeUndefined();
    });

    it('should parse screenshot with relative path', () => {
      const cmd = parseCliArgs(['screenshot', './output.png']);
      expect(cmd.action).toBe('screenshot');
      expect(cmd.path).toBe('./output.png');
    });

    it('should parse screenshot with absolute path', () => {
      const cmd = parseCliArgs(['screenshot', '/Users/test/screenshot.png']);
      expect(cmd.action).toBe('screenshot');
      expect(cmd.path).toBe('/Users/test/screenshot.png');
    });

    it('should parse screenshot with jpg extension', () => {
      const cmd = parseCliArgs(['screenshot', 'output.jpg']);
      expect(cmd.action).toBe('screenshot');
      expect(cmd.path).toBe('output.jpg');
    });

    it('should parse screenshot with webp extension', () => {
      const cmd = parseCliArgs(['screenshot', 'output.webp']);
      expect(cmd.action).toBe('screenshot');
      expect(cmd.path).toBe('output.webp');
    });
  });

  describe('screenshot with selector', () => {
    it('should parse screenshot with ref selector', () => {
      const cmd = parseCliArgs(['screenshot', '@e1']);
      expect(cmd.action).toBe('screenshot');
      expect(cmd.selector).toBe('@e1');
      expect(cmd.path).toBeUndefined();
    });

    it('should parse screenshot with class selector', () => {
      const cmd = parseCliArgs(['screenshot', '.my-button']);
      expect(cmd.action).toBe('screenshot');
      expect(cmd.selector).toBe('.my-button');
      expect(cmd.path).toBeUndefined();
    });

    it('should parse screenshot with id selector', () => {
      const cmd = parseCliArgs(['screenshot', '#header']);
      expect(cmd.action).toBe('screenshot');
      expect(cmd.selector).toBe('#header');
      expect(cmd.path).toBeUndefined();
    });
  });

  describe('screenshot with selector and path', () => {
    it('should parse screenshot with selector and path', () => {
      const cmd = parseCliArgs(['screenshot', '.btn', './button.png']);
      expect(cmd.action).toBe('screenshot');
      expect(cmd.selector).toBe('.btn');
      expect(cmd.path).toBe('./button.png');
    });

    it('should parse screenshot with ref and path', () => {
      const cmd = parseCliArgs(['screenshot', '@e1', 'element.png']);
      expect(cmd.action).toBe('screenshot');
      expect(cmd.selector).toBe('@e1');
      expect(cmd.path).toBe('element.png');
    });
  });

  describe('screenshot with full page', () => {
    it('should parse screenshot --full', () => {
      const cmd = parseCliArgs(['screenshot', '--full']);
      expect(cmd.action).toBe('screenshot');
      expect(cmd.fullPage).toBe(true);
    });

    it('should parse screenshot -f (short flag)', () => {
      const cmd = parseCliArgs(['screenshot', '-f']);
      expect(cmd.action).toBe('screenshot');
      expect(cmd.fullPage).toBe(true);
    });

    it('should parse screenshot with path and --full', () => {
      const cmd = parseCliArgs(['screenshot', 'out.png', '--full']);
      expect(cmd.action).toBe('screenshot');
      expect(cmd.path).toBe('out.png');
      expect(cmd.fullPage).toBe(true);
    });
  });

  describe('screenshot with --in-frame', () => {
    it('should parse screenshot with --in-frame', () => {
      const cmd = parseCliArgs(['screenshot', '--in-frame', '1', '@e1']);
      expect(cmd.action).toBe('screenshot');
      expect(cmd.selector).toBe('@e1');
      expect(cmd.inFrame).toBe('1');
    });

    it('should parse screenshot with --in-frame and path', () => {
      const cmd = parseCliArgs(['screenshot', '--in-frame', '1', '@e1', 'out.png']);
      expect(cmd.action).toBe('screenshot');
      expect(cmd.selector).toBe('@e1');
      expect(cmd.path).toBe('out.png');
      expect(cmd.inFrame).toBe('1');
    });

    it('should parse screenshot with --in-frame and --full', () => {
      const cmd = parseCliArgs(['screenshot', '--in-frame', '2', '--full', 'out.png']);
      expect(cmd.action).toBe('screenshot');
      expect(cmd.fullPage).toBe(true);
      expect(cmd.path).toBe('out.png');
      expect(cmd.inFrame).toBe('2');
    });

    it('should not include --in-frame as selector', () => {
      const cmd = parseCliArgs(['screenshot', '--in-frame', '1', '.btn']);
      expect(cmd.selector).not.toBe('--in-frame');
      expect(cmd.selector).toBe('.btn');
    });
  });
});

describe('pdf command', () => {
  describe('basic pdf', () => {
    it('should parse pdf with path', () => {
      const cmd = parseCliArgs(['pdf', 'output.pdf']);
      expect(cmd.action).toBe('pdf');
      expect(cmd.path).toBe('output.pdf');
    });

    it('should parse pdf with relative path', () => {
      const cmd = parseCliArgs(['pdf', './document.pdf']);
      expect(cmd.action).toBe('pdf');
      expect(cmd.path).toBe('./document.pdf');
    });

    it('should parse pdf with absolute path', () => {
      const cmd = parseCliArgs(['pdf', '/Users/test/document.pdf']);
      expect(cmd.action).toBe('pdf');
      expect(cmd.path).toBe('/Users/test/document.pdf');
    });
  });

  describe('pdf errors', () => {
    it('should throw error when path is missing', () => {
      expect(() => parseCliArgs(['pdf'])).toThrow(CliError);
      try {
        parseCliArgs(['pdf']);
      } catch (e) {
        expect((e as CliError).message).toBe('Missing path');
        expect((e as CliError).usage).toBe('agent-browser pdf <path> [--in-frame <path>]');
      }
    });
  });
});
