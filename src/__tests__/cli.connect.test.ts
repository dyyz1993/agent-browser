import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('connect command', () => {
  describe('connect with port', () => {
    it('should parse connect with port', () => {
      const cmd = parseCliArgs(['connect', '9222']);
      expect(cmd.action).toBe('launch');
      expect(cmd.cdpPort).toBe(9222);
      expect(cmd.cdpUrl).toBeUndefined();
    });

    it('should parse connect with port 1 (min valid)', () => {
      const cmd = parseCliArgs(['connect', '1']);
      expect(cmd.action).toBe('launch');
      expect(cmd.cdpPort).toBe(1);
    });

    it('should parse connect with port 65535 (max valid)', () => {
      const cmd = parseCliArgs(['connect', '65535']);
      expect(cmd.action).toBe('launch');
      expect(cmd.cdpPort).toBe(65535);
    });
  });

  describe('connect with WebSocket URL', () => {
    it('should parse connect with ws:// URL', () => {
      const cmd = parseCliArgs(['connect', 'ws://localhost:9222/devtools/browser/abc123']);
      expect(cmd.action).toBe('launch');
      expect(cmd.cdpUrl).toBe('ws://localhost:9222/devtools/browser/abc123');
      expect(cmd.cdpPort).toBeUndefined();
    });

    it('should parse connect with wss:// URL', () => {
      const cmd = parseCliArgs(['connect', 'wss://remote-browser.example.com/cdp?token=xyz']);
      expect(cmd.action).toBe('launch');
      expect(cmd.cdpUrl).toBe('wss://remote-browser.example.com/cdp?token=xyz');
    });
  });

  describe('connect with HTTP URL', () => {
    it('should parse connect with http:// URL', () => {
      const cmd = parseCliArgs(['connect', 'http://localhost:9222']);
      expect(cmd.action).toBe('launch');
      expect(cmd.cdpUrl).toBe('http://localhost:9222');
    });

    it('should parse connect with https:// URL', () => {
      const cmd = parseCliArgs(['connect', 'https://browser.example.com']);
      expect(cmd.action).toBe('launch');
      expect(cmd.cdpUrl).toBe('https://browser.example.com');
    });
  });

  describe('connect errors', () => {
    it('should throw error when endpoint is missing', () => {
      expect(() => parseCliArgs(['connect'])).toThrow(CliError);
    });

    it('should throw error for port 0', () => {
      expect(() => parseCliArgs(['connect', '0'])).toThrow(CliError);
      try {
        parseCliArgs(['connect', '0']);
      } catch (e) {
        expect((e as CliError).message).toContain('greater than 0');
      }
    });

    it('should throw error for port out of range', () => {
      expect(() => parseCliArgs(['connect', '65536'])).toThrow(CliError);
      try {
        parseCliArgs(['connect', '65536']);
      } catch (e) {
        expect((e as CliError).message).toContain('range');
      }
    });

    it('should throw error for invalid port (not a number)', () => {
      expect(() => parseCliArgs(['connect', 'notanumber'])).toThrow(CliError);
      try {
        parseCliArgs(['connect', 'notanumber']);
      } catch (e) {
        expect((e as CliError).message).toContain('Invalid port or URL');
      }
    });
  });
});
