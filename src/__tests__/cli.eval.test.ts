import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('eval command', () => {
  describe('basic eval', () => {
    it('should parse eval with script', () => {
      const cmd = parseCliArgs(['eval', 'document.title']);
      expect(cmd.action).toBe('evaluate');
      expect(cmd.script).toBe('document.title');
    });

    it('should parse eval with complex script', () => {
      const cmd = parseCliArgs(['eval', 'document.querySelector(".btn").click()']);
      expect(cmd.action).toBe('evaluate');
      expect(cmd.script).toBe('document.querySelector(".btn").click()');
    });

    it('should parse eval with multi-word script', () => {
      const cmd = parseCliArgs(['eval', 'return', '1', '+', '2']);
      expect(cmd.action).toBe('evaluate');
      expect(cmd.script).toBe('return 1 + 2');
    });
  });

  describe('eval base64', () => {
    it('should parse eval -b with base64', () => {
      const cmd = parseCliArgs(['eval', '-b', 'ZG9jdW1lbnQudGl0bGU=']);
      expect(cmd.action).toBe('evaluate');
      expect(cmd.script).toBe('document.title');
    });

    it('should parse eval --base64 with base64', () => {
      const cmd = parseCliArgs(['eval', '--base64', 'ZG9jdW1lbnQudGl0bGU=']);
      expect(cmd.action).toBe('evaluate');
      expect(cmd.script).toBe('document.title');
    });

    it('should parse eval with special chars in base64', () => {
      const cmd = parseCliArgs(['eval', '-b', 'ZG9jdW1lbnQucXVlcnlTZWxlY3RvcignW3NyYyo9Il9uZXh0Il0nKQ==']);
      expect(cmd.action).toBe('evaluate');
      expect(cmd.script).toBe('document.querySelector(\'[src*="_next"]\')');
    });
  });

  describe('eval file', () => {
    it('should parse eval --file', () => {
      const cmd = parseCliArgs(['eval', '--file', 'script.js']);
      expect(cmd.action).toBe('evaluate');
      expect(cmd.file).toBe('script.js');
    });

    it('should parse eval -f (file)', () => {
      const cmd = parseCliArgs(['eval', '-f', 'script.js']);
      expect(cmd.action).toBe('evaluate');
      expect(cmd.file).toBe('script.js');
    });

    it('should parse eval --file with path', () => {
      const cmd = parseCliArgs(['eval', '--file', './scripts/helper.js']);
      expect(cmd.action).toBe('evaluate');
      expect(cmd.file).toBe('./scripts/helper.js');
    });
  });

  describe('eval errors', () => {
    it('should throw error when script is missing', () => {
      expect(() => parseCliArgs(['eval'])).toThrow(CliError);
      try {
        parseCliArgs(['eval']);
      } catch (e) {
        expect((e as CliError).message).toBe('Missing script');
      }
    });

    it('should throw error when file is missing', () => {
      expect(() => parseCliArgs(['eval', '--file'])).toThrow(CliError);
    });

    it('should throw error when base64 is missing', () => {
      expect(() => parseCliArgs(['eval', '-b'])).toThrow(CliError);
    });
  });
});
