import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('type command', () => {
  describe('basic type', () => {
    it('should parse type with selector and text', () => {
      const cmd = parseCliArgs(['type', '#input', 'hello']);
      expect(cmd.action).toBe('type');
      expect(cmd.selector).toBe('#input');
      expect(cmd.text).toBe('hello');
    });

    it('should parse type with multi-word text', () => {
      const cmd = parseCliArgs(['type', '#input', 'hello', 'world']);
      expect(cmd.action).toBe('type');
      expect(cmd.selector).toBe('#input');
      expect(cmd.text).toBe('hello world');
    });

    it('should parse type with ref selector', () => {
      const cmd = parseCliArgs(['type', '@e2', 'test']);
      expect(cmd.action).toBe('type');
      expect(cmd.selector).toBe('@e2');
      expect(cmd.text).toBe('test');
    });
  });

  describe('type errors', () => {
    it('should throw error when selector is missing', () => {
      expect(() => parseCliArgs(['type'])).toThrow(CliError);
    });

    it('should throw error when text is missing', () => {
      expect(() => parseCliArgs(['type', '#input'])).toThrow(CliError);
      try {
        parseCliArgs(['type', '#input']);
      } catch (e) {
        expect((e as CliError).message).toBe('Missing selector or text');
        expect((e as CliError).usage).toBe('agent-browser type <selector> <text> [--diff [scope]] [--in-frame <path>]');
      }
    });
  });
});

describe('select command', () => {
  describe('select single value', () => {
    it('should parse select with single value', () => {
      const cmd = parseCliArgs(['select', '#menu', 'option1']);
      expect(cmd.action).toBe('select');
      expect(cmd.selector).toBe('#menu');
      expect(cmd.values).toBe('option1');
    });

    it('should parse select with ref selector', () => {
      const cmd = parseCliArgs(['select', '@e5', 'opt1']);
      expect(cmd.action).toBe('select');
      expect(cmd.selector).toBe('@e5');
      expect(cmd.values).toBe('opt1');
    });
  });

  describe('select multiple values', () => {
    it('should parse select with two values', () => {
      const cmd = parseCliArgs(['select', '#menu', 'opt1', 'opt2']);
      expect(cmd.action).toBe('select');
      expect(cmd.selector).toBe('#menu');
      expect(cmd.values).toEqual(['opt1', 'opt2']);
    });

    it('should parse select with three values', () => {
      const cmd = parseCliArgs(['select', '#menu', 'opt1', 'opt2', 'opt3']);
      expect(cmd.action).toBe('select');
      expect(cmd.selector).toBe('#menu');
      expect(cmd.values).toEqual(['opt1', 'opt2', 'opt3']);
    });
  });

  describe('select errors', () => {
    it('should throw error when selector is missing', () => {
      expect(() => parseCliArgs(['select'])).toThrow(CliError);
      try {
        parseCliArgs(['select']);
      } catch (e) {
        expect((e as CliError).message).toBe('Missing selector');
      }
    });

    it('should throw error when values are missing', () => {
      expect(() => parseCliArgs(['select', '#menu'])).toThrow(CliError);
      try {
        parseCliArgs(['select', '#menu']);
      } catch (e) {
        expect((e as CliError).message).toBe('Missing values');
      }
    });
  });
});

describe('drag command', () => {
  describe('basic drag', () => {
    it('should parse drag with source and target', () => {
      const cmd = parseCliArgs(['drag', '#source', '#target']);
      expect(cmd.action).toBe('drag');
      expect(cmd.source).toBe('#source');
      expect(cmd.target).toBe('#target');
    });

    it('should parse drag with ref selectors', () => {
      const cmd = parseCliArgs(['drag', '@e1', '@e2']);
      expect(cmd.action).toBe('drag');
      expect(cmd.source).toBe('@e1');
      expect(cmd.target).toBe('@e2');
    });

    it('should parse drag with class selectors', () => {
      const cmd = parseCliArgs(['drag', '.draggable', '.dropzone']);
      expect(cmd.action).toBe('drag');
      expect(cmd.source).toBe('.draggable');
      expect(cmd.target).toBe('.dropzone');
    });
  });

  describe('drag errors', () => {
    it('should throw error when source is missing', () => {
      expect(() => parseCliArgs(['drag'])).toThrow(CliError);
      try {
        parseCliArgs(['drag']);
      } catch (e) {
        expect((e as CliError).message).toBe('Missing source selector');
      }
    });

    it('should throw error when target is missing', () => {
      expect(() => parseCliArgs(['drag', '#source'])).toThrow(CliError);
      try {
        parseCliArgs(['drag', '#source']);
      } catch (e) {
        expect((e as CliError).message).toBe('Missing target selector');
      }
    });
  });
});

describe('upload command', () => {
  describe('basic upload', () => {
    it('should parse upload with single file', () => {
      const cmd = parseCliArgs(['upload', '#file', 'file.txt']);
      expect(cmd.action).toBe('upload');
      expect(cmd.selector).toBe('#file');
      expect(cmd.files).toEqual(['file.txt']);
    });

    it('should parse upload with multiple files', () => {
      const cmd = parseCliArgs(['upload', '#file', 'file1.txt', 'file2.txt']);
      expect(cmd.action).toBe('upload');
      expect(cmd.selector).toBe('#file');
      expect(cmd.files).toEqual(['file1.txt', 'file2.txt']);
    });

    it('should parse upload with paths', () => {
      const cmd = parseCliArgs(['upload', '#file', './docs/file.pdf', './images/img.png']);
      expect(cmd.action).toBe('upload');
      expect(cmd.selector).toBe('#file');
      expect(cmd.files).toEqual(['./docs/file.pdf', './images/img.png']);
    });
  });

  describe('upload errors', () => {
    it('should throw error when selector is missing', () => {
      expect(() => parseCliArgs(['upload'])).toThrow(CliError);
    });

    it('should throw error when files are missing', () => {
      expect(() => parseCliArgs(['upload', '#file'])).toThrow(CliError);
      try {
        parseCliArgs(['upload', '#file']);
      } catch (e) {
        expect((e as CliError).message).toBe('Missing files');
      }
    });
  });
});

describe('download command', () => {
  describe('basic download', () => {
    it('should parse download with selector and path', () => {
      const cmd = parseCliArgs(['download', '#btn', './file.pdf']);
      expect(cmd.action).toBe('download');
      expect(cmd.selector).toBe('#btn');
      expect(cmd.path).toBe('./file.pdf');
    });

    it('should parse download with ref selector', () => {
      const cmd = parseCliArgs(['download', '@e5', './report.xlsx']);
      expect(cmd.action).toBe('download');
      expect(cmd.selector).toBe('@e5');
      expect(cmd.path).toBe('./report.xlsx');
    });

    it('should parse download with absolute path', () => {
      const cmd = parseCliArgs(['download', '#link', '/Users/test/Downloads/file.pdf']);
      expect(cmd.action).toBe('download');
      expect(cmd.selector).toBe('#link');
      expect(cmd.path).toBe('/Users/test/Downloads/file.pdf');
    });
  });

  describe('download errors', () => {
    it('should throw error when selector is missing', () => {
      expect(() => parseCliArgs(['download'])).toThrow(CliError);
      try {
        parseCliArgs(['download']);
      } catch (e) {
        expect((e as CliError).message).toBe('Missing selector');
      }
    });

    it('should throw error when path is missing', () => {
      expect(() => parseCliArgs(['download', '#btn'])).toThrow(CliError);
      try {
        parseCliArgs(['download', '#btn']);
      } catch (e) {
        expect((e as CliError).message).toBe('Missing path');
      }
    });
  });
});
