import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('wait command', () => {
  describe('wait for selector', () => {
    it('should parse wait with selector', () => {
      const cmd = parseCliArgs(['wait', '#element']);
      expect(cmd.action).toBe('wait');
      expect(cmd.selector).toBe('#element');
    });

    it('should parse wait with class selector', () => {
      const cmd = parseCliArgs(['wait', '.loading']);
      expect(cmd.action).toBe('wait');
      expect(cmd.selector).toBe('.loading');
    });

    it('should parse wait with ref selector', () => {
      const cmd = parseCliArgs(['wait', '@e5']);
      expect(cmd.action).toBe('wait');
      expect(cmd.selector).toBe('@e5');
    });
  });

  describe('wait for timeout', () => {
    it('should parse wait with timeout', () => {
      const cmd = parseCliArgs(['wait', '5000']);
      expect(cmd.action).toBe('wait');
      expect(cmd.timeout).toBe(5000);
    });

    it('should parse wait with short timeout', () => {
      const cmd = parseCliArgs(['wait', '100']);
      expect(cmd.action).toBe('wait');
      expect(cmd.timeout).toBe(100);
    });

    it('should parse wait with long timeout', () => {
      const cmd = parseCliArgs(['wait', '60000']);
      expect(cmd.action).toBe('wait');
      expect(cmd.timeout).toBe(60000);
    });
  });

  describe('wait for URL', () => {
    it('should parse wait --url', () => {
      const cmd = parseCliArgs(['wait', '--url', '**/dashboard']);
      expect(cmd.action).toBe('waitforurl');
      expect(cmd.url).toBe('**/dashboard');
    });

    it('should parse wait -u (short flag)', () => {
      const cmd = parseCliArgs(['wait', '-u', '**/dashboard']);
      expect(cmd.action).toBe('waitforurl');
      expect(cmd.url).toBe('**/dashboard');
    });

    it('should parse wait --url with full URL', () => {
      const cmd = parseCliArgs(['wait', '--url', 'https://example.com/success']);
      expect(cmd.action).toBe('waitforurl');
      expect(cmd.url).toBe('https://example.com/success');
    });

    it('should throw error when URL is missing', () => {
      expect(() => parseCliArgs(['wait', '--url'])).toThrow(CliError);
      try {
        parseCliArgs(['wait', '--url']);
      } catch (e) {
        expect((e as CliError).message).toBe('Missing URL pattern');
      }
    });
  });

  describe('wait for load state', () => {
    it('should parse wait --load networkidle', () => {
      const cmd = parseCliArgs(['wait', '--load', 'networkidle']);
      expect(cmd.action).toBe('waitforloadstate');
      expect(cmd.state).toBe('networkidle');
    });

    it('should parse wait -l domcontentloaded', () => {
      const cmd = parseCliArgs(['wait', '-l', 'domcontentloaded']);
      expect(cmd.action).toBe('waitforloadstate');
      expect(cmd.state).toBe('domcontentloaded');
    });

    it('should parse wait --load load', () => {
      const cmd = parseCliArgs(['wait', '--load', 'load']);
      expect(cmd.action).toBe('waitforloadstate');
      expect(cmd.state).toBe('load');
    });

    it('should throw error when state is missing', () => {
      expect(() => parseCliArgs(['wait', '--load'])).toThrow(CliError);
      try {
        parseCliArgs(['wait', '--load']);
      } catch (e) {
        expect((e as CliError).message).toBe('Missing load state');
      }
    });
  });

  describe('wait for function', () => {
    it('should parse wait --fn', () => {
      const cmd = parseCliArgs(['wait', '--fn', 'window.ready']);
      expect(cmd.action).toBe('waitforfunction');
      expect(cmd.expression).toBe('window.ready');
    });

    it('should parse wait -f (short flag)', () => {
      const cmd = parseCliArgs(['wait', '-f', 'window.ready']);
      expect(cmd.action).toBe('waitforfunction');
      expect(cmd.expression).toBe('window.ready');
    });

    it('should parse wait --fn with complex expression', () => {
      const cmd = parseCliArgs(['wait', '--fn', 'document.querySelector(".loaded")']);
      expect(cmd.action).toBe('waitforfunction');
      expect(cmd.expression).toBe('document.querySelector(".loaded")');
    });

    it('should throw error when expression is missing', () => {
      expect(() => parseCliArgs(['wait', '--fn'])).toThrow(CliError);
    });
  });

  describe('wait for text', () => {
    it('should parse wait --text', () => {
      const cmd = parseCliArgs(['wait', '--text', 'Welcome']);
      expect(cmd.action).toBe('wait');
      expect(cmd.selector).toBe('text=Welcome');
    });

    it('should parse wait -t (short flag)', () => {
      const cmd = parseCliArgs(['wait', '-t', 'Success']);
      expect(cmd.action).toBe('wait');
      expect(cmd.selector).toBe('text=Success');
    });

    it('should throw error when text is missing', () => {
      expect(() => parseCliArgs(['wait', '--text'])).toThrow(CliError);
    });
  });

  describe('wait for download', () => {
    it('should parse wait --download', () => {
      const cmd = parseCliArgs(['wait', '--download']);
      expect(cmd.action).toBe('waitfordownload');
      expect(cmd.path).toBeUndefined();
    });

    it('should parse wait -d (short flag)', () => {
      const cmd = parseCliArgs(['wait', '-d']);
      expect(cmd.action).toBe('waitfordownload');
    });

    it('should parse wait --download with path', () => {
      const cmd = parseCliArgs(['wait', '--download', './file.pdf']);
      expect(cmd.action).toBe('waitfordownload');
      expect(cmd.path).toBe('./file.pdf');
    });

    it('should parse wait -d with path', () => {
      const cmd = parseCliArgs(['wait', '-d', './file.pdf']);
      expect(cmd.action).toBe('waitfordownload');
      expect(cmd.path).toBe('./file.pdf');
    });

    it('should parse wait --download with timeout', () => {
      const cmd = parseCliArgs(['wait', '--download', '--timeout', '30000']);
      expect(cmd.action).toBe('waitfordownload');
      expect(cmd.timeout).toBe(30000);
    });

    it('should parse wait --download with path and timeout', () => {
      const cmd = parseCliArgs(['wait', '--download', './file.pdf', '--timeout', '30000']);
      expect(cmd.action).toBe('waitfordownload');
      expect(cmd.path).toBe('./file.pdf');
      expect(cmd.timeout).toBe(30000);
    });
  });

  describe('wait errors', () => {
    it('should throw error when no arguments', () => {
      expect(() => parseCliArgs(['wait'])).toThrow(CliError);
    });
  });
});
