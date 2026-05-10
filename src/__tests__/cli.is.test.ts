import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('is command', () => {
  describe('is visible', () => {
    it('should parse is visible with selector', () => {
      const cmd = parseCliArgs(['is', 'visible', '#element']);
      expect(cmd.action).toBe('isvisible');
      expect(cmd.selector).toBe('#element');
    });

    it('should parse is visible with class selector', () => {
      const cmd = parseCliArgs(['is', 'visible', '.modal']);
      expect(cmd.action).toBe('isvisible');
      expect(cmd.selector).toBe('.modal');
    });

    it('should throw error when selector is missing', () => {
      expect(() => parseCliArgs(['is', 'visible'])).toThrow(CliError);
    });
  });

  describe('is enabled', () => {
    it('should parse is enabled with selector', () => {
      const cmd = parseCliArgs(['is', 'enabled', '#button']);
      expect(cmd.action).toBe('isenabled');
      expect(cmd.selector).toBe('#button');
    });

    it('should throw error when selector is missing', () => {
      expect(() => parseCliArgs(['is', 'enabled'])).toThrow(CliError);
    });
  });

  describe('is checked', () => {
    it('should parse is checked with selector', () => {
      const cmd = parseCliArgs(['is', 'checked', '#checkbox']);
      expect(cmd.action).toBe('ischecked');
      expect(cmd.selector).toBe('#checkbox');
    });

    it('should throw error when selector is missing', () => {
      expect(() => parseCliArgs(['is', 'checked'])).toThrow(CliError);
    });
  });

  describe('is errors', () => {
    it('should throw error when subcommand is missing', () => {
      expect(() => parseCliArgs(['is'])).toThrow(CliError);
    });

    it('should throw error for unknown subcommand', () => {
      expect(() => parseCliArgs(['is', 'unknown', '#element'])).toThrow(CliError);
      try {
        parseCliArgs(['is', 'unknown', '#element']);
      } catch (e) {
        expect((e as CliError).message).toContain('Unknown is subcommand');
      }
    });
  });

  describe('is with --in-frame', () => {
    it('should parse is visible with --in-frame', () => {
      const cmd = parseCliArgs(['is', '--in-frame', '1', 'visible', '#element']);
      expect(cmd.action).toBe('isvisible');
      expect(cmd.selector).toBe('#element');
      expect(cmd.inFrame).toBe('1');
    });

    it('should parse is enabled with --in-frame', () => {
      const cmd = parseCliArgs(['is', '--in-frame', '1', 'enabled', '#button']);
      expect(cmd.action).toBe('isenabled');
      expect(cmd.selector).toBe('#button');
      expect(cmd.inFrame).toBe('1');
    });

    it('should parse is checked with --in-frame', () => {
      const cmd = parseCliArgs(['is', '--in-frame', '1', 'checked', '#checkbox']);
      expect(cmd.action).toBe('ischecked');
      expect(cmd.selector).toBe('#checkbox');
      expect(cmd.inFrame).toBe('1');
    });

    it('should not include --in-frame as subcommand (regression)', () => {
      const cmd = parseCliArgs(['is', '--in-frame', '1', 'visible', '.modal']);
      expect(cmd.selector).not.toBe('--in-frame');
      expect(cmd.selector).toBe('.modal');
    });
  });
});
