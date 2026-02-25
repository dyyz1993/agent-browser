import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('error handling', () => {
  describe('empty arguments', () => {
    it('should throw error when no command provided', () => {
      expect(() => parseCliArgs([])).toThrow(CliError);
      try {
        parseCliArgs([]);
      } catch (e) {
        expect((e as CliError).message).toBe('No command provided');
        expect((e as CliError).usage).toBe('agent-browser <command> [args...]');
      }
    });
  });

  describe('unknown command', () => {
    it('should throw error for unknown command', () => {
      expect(() => parseCliArgs(['unknowncommand'])).toThrow(CliError);
      try {
        parseCliArgs(['unknowncommand']);
      } catch (e) {
        expect((e as CliError).message).toContain('Unknown command');
      }
    });

    it('should throw error for typo command', () => {
      expect(() => parseCliArgs(['clik', '#btn'])).toThrow(CliError);
    });
  });

  describe('missing arguments', () => {
    it('should throw error for click without selector', () => {
      expect(() => parseCliArgs(['click'])).toThrow(CliError);
    });

    it('should throw error for fill without arguments', () => {
      expect(() => parseCliArgs(['fill'])).toThrow(CliError);
    });

    it('should throw error for fill without value', () => {
      expect(() => parseCliArgs(['fill', '#input'])).toThrow(CliError);
    });

    it('should throw error for get without subcommand', () => {
      expect(() => parseCliArgs(['get'])).toThrow(CliError);
    });

    it('should throw error for wait without arguments', () => {
      expect(() => parseCliArgs(['wait'])).toThrow(CliError);
    });
  });

  describe('error message format', () => {
    it('should include usage in error when available', () => {
      try {
        parseCliArgs(['click']);
      } catch (e) {
        expect((e as CliError).usage).toBeDefined();
        expect((e as CliError).usage).toContain('agent-browser');
      }
    });

    it('should have descriptive error message', () => {
      try {
        parseCliArgs(['open']);
      } catch (e) {
        expect((e as CliError).message).toBe('Missing URL');
      }
    });
  });

  describe('error type', () => {
    it('should throw CliError instance', () => {
      expect(() => parseCliArgs(['unknown'])).toThrow(CliError);
    });

    it('should have correct name', () => {
      try {
        parseCliArgs(['unknown']);
      } catch (e) {
        expect((e as CliError).name).toBe('CliError');
      }
    });
  });
});
