import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('get command', () => {
  describe('get text', () => {
    it('should parse get text with selector', () => {
      const cmd = parseCliArgs(['get', 'text', '#element']);
      expect(cmd.action).toBe('gettext');
      expect(cmd.selector).toBe('#element');
    });

    it('should parse get text with class selector', () => {
      const cmd = parseCliArgs(['get', 'text', '.content']);
      expect(cmd.action).toBe('gettext');
      expect(cmd.selector).toBe('.content');
    });

    it('should throw error when selector is missing', () => {
      expect(() => parseCliArgs(['get', 'text'])).toThrow(CliError);
    });
  });

  describe('get html', () => {
    it('should parse get html with selector', () => {
      const cmd = parseCliArgs(['get', 'html', '#element']);
      expect(cmd.action).toBe('innerhtml');
      expect(cmd.selector).toBe('#element');
    });

    it('should throw error when selector is missing', () => {
      expect(() => parseCliArgs(['get', 'html'])).toThrow(CliError);
    });
  });

  describe('get value', () => {
    it('should parse get value with selector', () => {
      const cmd = parseCliArgs(['get', 'value', '#input']);
      expect(cmd.action).toBe('inputvalue');
      expect(cmd.selector).toBe('#input');
    });

    it('should throw error when selector is missing', () => {
      expect(() => parseCliArgs(['get', 'value'])).toThrow(CliError);
    });
  });

  describe('get attr', () => {
    it('should parse get attr with selector and attribute', () => {
      const cmd = parseCliArgs(['get', 'attr', '#link', 'href']);
      expect(cmd.action).toBe('getattribute');
      expect(cmd.selector).toBe('#link');
      expect(cmd.attribute).toBe('href');
    });

    it('should parse get attr with data attribute', () => {
      const cmd = parseCliArgs(['get', 'attr', '#element', 'data-id']);
      expect(cmd.action).toBe('getattribute');
      expect(cmd.selector).toBe('#element');
      expect(cmd.attribute).toBe('data-id');
    });

    it('should throw error when selector is missing', () => {
      expect(() => parseCliArgs(['get', 'attr'])).toThrow(CliError);
    });

    it('should throw error when attribute is missing', () => {
      expect(() => parseCliArgs(['get', 'attr', '#element'])).toThrow(CliError);
    });
  });

  describe('get url', () => {
    it('should parse get url', () => {
      const cmd = parseCliArgs(['get', 'url']);
      expect(cmd.action).toBe('url');
    });
  });

  describe('get title', () => {
    it('should parse get title', () => {
      const cmd = parseCliArgs(['get', 'title']);
      expect(cmd.action).toBe('title');
    });
  });

  describe('get count', () => {
    it('should parse get count with selector', () => {
      const cmd = parseCliArgs(['get', 'count', '.item']);
      expect(cmd.action).toBe('count');
      expect(cmd.selector).toBe('.item');
    });

    it('should throw error when selector is missing', () => {
      expect(() => parseCliArgs(['get', 'count'])).toThrow(CliError);
    });
  });

  describe('get box', () => {
    it('should parse get box with selector', () => {
      const cmd = parseCliArgs(['get', 'box', '#element']);
      expect(cmd.action).toBe('boundingbox');
      expect(cmd.selector).toBe('#element');
    });

    it('should throw error when selector is missing', () => {
      expect(() => parseCliArgs(['get', 'box'])).toThrow(CliError);
    });
  });

  describe('get styles', () => {
    it('should parse get styles with selector', () => {
      const cmd = parseCliArgs(['get', 'styles', '#element']);
      expect(cmd.action).toBe('styles');
      expect(cmd.selector).toBe('#element');
    });

    it('should throw error when selector is missing', () => {
      expect(() => parseCliArgs(['get', 'styles'])).toThrow(CliError);
    });
  });

  describe('get errors', () => {
    it('should throw error when subcommand is missing', () => {
      expect(() => parseCliArgs(['get'])).toThrow(CliError);
      try {
        parseCliArgs(['get']);
      } catch (e) {
        expect((e as CliError).message).toBe('Missing subcommand');
      }
    });

    it('should throw error for unknown subcommand', () => {
      expect(() => parseCliArgs(['get', 'unknown'])).toThrow(CliError);
      try {
        parseCliArgs(['get', 'unknown']);
      } catch (e) {
        expect((e as CliError).message).toContain('Unknown get subcommand');
      }
    });
  });
});
