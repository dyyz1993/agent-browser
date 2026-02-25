import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('cookies command', () => {
  describe('cookies get', () => {
    it('should parse cookies (implicit get)', () => {
      const cmd = parseCliArgs(['cookies']);
      expect(cmd.action).toBe('cookies_get');
    });

    it('should parse cookies get (explicit)', () => {
      const cmd = parseCliArgs(['cookies', 'get']);
      expect(cmd.action).toBe('cookies_get');
    });
  });

  describe('cookies set', () => {
    it('should parse cookies set with name and value', () => {
      const cmd = parseCliArgs(['cookies', 'set', 'mycookie', 'myvalue']);
      expect(cmd.action).toBe('cookies_set');
      expect(cmd.cookies).toEqual([{ name: 'mycookie', value: 'myvalue' }]);
    });

    it('should parse cookies set with --url', () => {
      const cmd = parseCliArgs(['cookies', 'set', 'mycookie', 'myvalue', '--url', 'https://example.com']);
      expect(cmd.action).toBe('cookies_set');
      expect(cmd.cookies).toEqual([{ name: 'mycookie', value: 'myvalue', url: 'https://example.com' }]);
    });

    it('should parse cookies set with --domain', () => {
      const cmd = parseCliArgs(['cookies', 'set', 'mycookie', 'myvalue', '--domain', 'example.com']);
      expect(cmd.action).toBe('cookies_set');
      expect(cmd.cookies).toEqual([{ name: 'mycookie', value: 'myvalue', domain: 'example.com' }]);
    });

    it('should parse cookies set with --path', () => {
      const cmd = parseCliArgs(['cookies', 'set', 'mycookie', 'myvalue', '--path', '/api']);
      expect(cmd.action).toBe('cookies_set');
      expect(cmd.cookies).toEqual([{ name: 'mycookie', value: 'myvalue', path: '/api' }]);
    });

    it('should parse cookies set with --httpOnly', () => {
      const cmd = parseCliArgs(['cookies', 'set', 'mycookie', 'myvalue', '--httpOnly']);
      expect(cmd.action).toBe('cookies_set');
      expect(cmd.cookies).toEqual([{ name: 'mycookie', value: 'myvalue', httpOnly: true }]);
    });

    it('should parse cookies set with --secure', () => {
      const cmd = parseCliArgs(['cookies', 'set', 'mycookie', 'myvalue', '--secure']);
      expect(cmd.action).toBe('cookies_set');
      expect(cmd.cookies).toEqual([{ name: 'mycookie', value: 'myvalue', secure: true }]);
    });

    it('should parse cookies set with --sameSite', () => {
      const cmd = parseCliArgs(['cookies', 'set', 'mycookie', 'myvalue', '--sameSite', 'Strict']);
      expect(cmd.action).toBe('cookies_set');
      expect(cmd.cookies).toEqual([{ name: 'mycookie', value: 'myvalue', sameSite: 'Strict' }]);
    });

    it('should parse cookies set with --expires', () => {
      const cmd = parseCliArgs(['cookies', 'set', 'mycookie', 'myvalue', '--expires', '1234567890']);
      expect(cmd.action).toBe('cookies_set');
      expect(cmd.cookies).toEqual([{ name: 'mycookie', value: 'myvalue', expires: 1234567890 }]);
    });

    it('should parse cookies set with multiple flags', () => {
      const cmd = parseCliArgs([
        'cookies', 'set', 'mycookie', 'myvalue',
        '--url', 'https://example.com',
        '--httpOnly',
        '--secure',
        '--sameSite', 'Lax'
      ]);
      expect(cmd.action).toBe('cookies_set');
      expect(cmd.cookies).toEqual([{
        name: 'mycookie',
        value: 'myvalue',
        url: 'https://example.com',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax'
      }]);
    });

    it('should parse cookies set with all flags', () => {
      const cmd = parseCliArgs([
        'cookies', 'set', 'mycookie', 'myvalue',
        '--url', 'https://example.com',
        '--domain', 'example.com',
        '--path', '/api',
        '--httpOnly',
        '--secure',
        '--sameSite', 'None',
        '--expires', '9999999999'
      ]);
      expect(cmd.action).toBe('cookies_set');
      expect(cmd.cookies).toEqual([{
        name: 'mycookie',
        value: 'myvalue',
        url: 'https://example.com',
        domain: 'example.com',
        path: '/api',
        httpOnly: true,
        secure: true,
        sameSite: 'None',
        expires: 9999999999
      }]);
    });
  });

  describe('cookies clear', () => {
    it('should parse cookies clear', () => {
      const cmd = parseCliArgs(['cookies', 'clear']);
      expect(cmd.action).toBe('cookies_clear');
    });
  });

  describe('cookies errors', () => {
    it('should throw error when name is missing', () => {
      expect(() => parseCliArgs(['cookies', 'set'])).toThrow(CliError);
    });

    it('should throw error when value is missing', () => {
      expect(() => parseCliArgs(['cookies', 'set', 'mycookie'])).toThrow(CliError);
    });
  });
});
