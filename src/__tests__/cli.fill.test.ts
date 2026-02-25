import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('fill command', () => {
  describe('basic fill', () => {
    it('should parse fill with selector and value', () => {
      const cmd = parseCliArgs(['fill', '#input', 'hello']);
      expect(cmd.action).toBe('fill');
      expect(cmd.selector).toBe('#input');
      expect(cmd.value).toBe('hello');
    });

    it('should parse fill with multi-word value', () => {
      const cmd = parseCliArgs(['fill', '#input', 'hello', 'world']);
      expect(cmd.action).toBe('fill');
      expect(cmd.selector).toBe('#input');
      expect(cmd.value).toBe('hello world');
    });

    it('should parse fill with long text', () => {
      const cmd = parseCliArgs(['fill', '#textarea', 'This', 'is', 'a', 'long', 'text']);
      expect(cmd.action).toBe('fill');
      expect(cmd.selector).toBe('#textarea');
      expect(cmd.value).toBe('This is a long text');
    });
  });

  describe('fill with different selectors', () => {
    it('should parse fill with class selector', () => {
      const cmd = parseCliArgs(['fill', '.email-input', 'test@example.com']);
      expect(cmd.action).toBe('fill');
      expect(cmd.selector).toBe('.email-input');
      expect(cmd.value).toBe('test@example.com');
    });

    it('should parse fill with ref selector', () => {
      const cmd = parseCliArgs(['fill', '@e3', 'test@example.com']);
      expect(cmd.action).toBe('fill');
      expect(cmd.selector).toBe('@e3');
      expect(cmd.value).toBe('test@example.com');
    });

    it('should parse fill with attribute selector', () => {
      const cmd = parseCliArgs(['fill', '[name="email"]', 'user@test.com']);
      expect(cmd.action).toBe('fill');
      expect(cmd.selector).toBe('[name="email"]');
      expect(cmd.value).toBe('user@test.com');
    });
  });

  describe('fill with special values', () => {
    it('should parse fill with email', () => {
      const cmd = parseCliArgs(['fill', '#email', 'user@example.com']);
      expect(cmd.action).toBe('fill');
      expect(cmd.value).toBe('user@example.com');
    });

    it('should parse fill with URL', () => {
      const cmd = parseCliArgs(['fill', '#url', 'https://example.com']);
      expect(cmd.action).toBe('fill');
      expect(cmd.value).toBe('https://example.com');
    });

    it('should parse fill with numbers', () => {
      const cmd = parseCliArgs(['fill', '#amount', '12345']);
      expect(cmd.action).toBe('fill');
      expect(cmd.value).toBe('12345');
    });
  });

  describe('fill errors', () => {
    it('should throw error when selector is missing', () => {
      expect(() => parseCliArgs(['fill'])).toThrow(CliError);
      try {
        parseCliArgs(['fill']);
      } catch (e) {
        expect((e as CliError).message).toBe('Missing selector or value');
      }
    });

    it('should throw error when value is missing', () => {
      expect(() => parseCliArgs(['fill', '#input'])).toThrow(CliError);
      try {
        parseCliArgs(['fill', '#input']);
      } catch (e) {
        expect((e as CliError).message).toBe('Missing selector or value');
        expect((e as CliError).usage).toBe('agent-browser fill <selector> <text> [--diff [scope]] [--in-frame <path>]');
      }
    });
  });
});
