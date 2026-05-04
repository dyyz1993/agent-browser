import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('click command', () => {
  describe('basic click', () => {
    it('should parse click with CSS selector', () => {
      const cmd = parseCliArgs(['click', '#button']);
      expect(cmd.action).toBe('click');
      expect(cmd.selector).toBe('#button');
    });

    it('should parse click with class selector', () => {
      const cmd = parseCliArgs(['click', '.btn-primary']);
      expect(cmd.action).toBe('click');
      expect(cmd.selector).toBe('.btn-primary');
    });

    it('should parse click with element selector', () => {
      const cmd = parseCliArgs(['click', 'button']);
      expect(cmd.action).toBe('click');
      expect(cmd.selector).toBe('button');
    });

    it('should parse click with attribute selector', () => {
      const cmd = parseCliArgs(['click', '[data-testid="submit"]']);
      expect(cmd.action).toBe('click');
      expect(cmd.selector).toBe('[data-testid="submit"]');
    });
  });

  describe('click with ref selector', () => {
    it('should parse click with @e1 ref', () => {
      const cmd = parseCliArgs(['click', '@e1']);
      expect(cmd.action).toBe('click');
      expect(cmd.selector).toBe('@e1');
    });

    it('should parse click with @e10 ref', () => {
      const cmd = parseCliArgs(['click', '@e10']);
      expect(cmd.action).toBe('click');
      expect(cmd.selector).toBe('@e10');
    });

    it('should parse click with [ref=e16] bracketed ref', () => {
      const cmd = parseCliArgs(['click', '[ref=e16]']);
      expect(cmd.action).toBe('click');
      expect(cmd.selector).toBe('[ref=e16]');
    });
  });

  describe('click with text selector', () => {
    it('should parse click with text selector', () => {
      const cmd = parseCliArgs(['click', 'text=Submit']);
      expect(cmd.action).toBe('click');
      expect(cmd.selector).toBe('text=Submit');
    });

    it('should parse click with text contains selector', () => {
      const cmd = parseCliArgs(['click', 'text=/submit/i']);
      expect(cmd.action).toBe('click');
      expect(cmd.selector).toBe('text=/submit/i');
    });
  });

  describe('click with complex selectors', () => {
    it('should parse click with nested selector', () => {
      const cmd = parseCliArgs(['click', 'div > button.submit']);
      expect(cmd.action).toBe('click');
      expect(cmd.selector).toBe('div > button.submit');
    });

    it('should parse click with multiple classes', () => {
      const cmd = parseCliArgs(['click', '.btn.btn-primary.large']);
      expect(cmd.action).toBe('click');
      expect(cmd.selector).toBe('.btn.btn-primary.large');
    });

    it('should parse click with nth-child', () => {
      const cmd = parseCliArgs(['click', 'li:nth-child(2)']);
      expect(cmd.action).toBe('click');
      expect(cmd.selector).toBe('li:nth-child(2)');
    });
  });

  describe('click errors', () => {
    it('should throw error when selector is missing', () => {
      expect(() => parseCliArgs(['click'])).toThrow(CliError);
      try {
        parseCliArgs(['click']);
      } catch (e) {
        expect((e as CliError).message).toBe('Missing selector');
        expect((e as CliError).usage).toBe(
          'agent-browser click <selector> [--diff [scope]] [--in-frame <path>]'
        );
      }
    });
  });
});

describe('dblclick command', () => {
  describe('basic dblclick', () => {
    it('should parse dblclick with CSS selector', () => {
      const cmd = parseCliArgs(['dblclick', '#button']);
      expect(cmd.action).toBe('dblclick');
      expect(cmd.selector).toBe('#button');
    });

    it('should parse dblclick with class selector', () => {
      const cmd = parseCliArgs(['dblclick', '.item']);
      expect(cmd.action).toBe('dblclick');
      expect(cmd.selector).toBe('.item');
    });

    it('should parse dblclick with ref selector', () => {
      const cmd = parseCliArgs(['dblclick', '@e5']);
      expect(cmd.action).toBe('dblclick');
      expect(cmd.selector).toBe('@e5');
    });
  });

  describe('dblclick errors', () => {
    it('should throw error when selector is missing', () => {
      expect(() => parseCliArgs(['dblclick'])).toThrow(CliError);
      try {
        parseCliArgs(['dblclick']);
      } catch (e) {
        expect((e as CliError).message).toBe('Missing selector');
        expect((e as CliError).usage).toBe(
          'agent-browser dblclick <selector> [--diff [scope]] [--in-frame <path>]'
        );
      }
    });
  });
});
