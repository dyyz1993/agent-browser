import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('network command', () => {
  describe('network route', () => {
    it('should parse network route', () => {
      const cmd = parseCliArgs(['network', 'route', '**/api/**']);
      expect(cmd.action).toBe('route');
      expect(cmd.url).toBe('**/api/**');
      expect(cmd.abort).toBe(false);
    });

    it('should parse network route with --abort', () => {
      const cmd = parseCliArgs(['network', 'route', '**/ads/**', '--abort']);
      expect(cmd.action).toBe('route');
      expect(cmd.url).toBe('**/ads/**');
      expect(cmd.abort).toBe(true);
    });

    it('should parse network route with --body', () => {
      const cmd = parseCliArgs(['network', 'route', '**/api/**', '--body', '{"status":200}']);
      expect(cmd.action).toBe('route');
      expect(cmd.url).toBe('**/api/**');
      expect(cmd.body).toBe('{"status":200}');
    });

    it('should throw error when URL is missing', () => {
      expect(() => parseCliArgs(['network', 'route'])).toThrow(CliError);
    });
  });

  describe('network unroute', () => {
    it('should parse network unroute', () => {
      const cmd = parseCliArgs(['network', 'unroute', '**/api/**']);
      expect(cmd.action).toBe('unroute');
      expect(cmd.url).toBe('**/api/**');
    });
  });

  describe('network requests', () => {
    it('should parse network requests', () => {
      const cmd = parseCliArgs(['network', 'requests']);
      expect(cmd.action).toBe('requests');
      expect(cmd.clear).toBe(false);
    });

    it('should parse network requests --clear', () => {
      const cmd = parseCliArgs(['network', 'requests', '--clear']);
      expect(cmd.action).toBe('requests');
      expect(cmd.clear).toBe(true);
    });

    it('should parse network requests --filter', () => {
      const cmd = parseCliArgs(['network', 'requests', '--filter', '**/api/**']);
      expect(cmd.action).toBe('requests');
      expect(cmd.filter).toBe('**/api/**');
    });
  });

  describe('network errors', () => {
    it('should throw error when subcommand is missing', () => {
      expect(() => parseCliArgs(['network'])).toThrow(CliError);
    });

    it('should throw error for unknown subcommand', () => {
      expect(() => parseCliArgs(['network', 'unknown'])).toThrow(CliError);
    });
  });
});
