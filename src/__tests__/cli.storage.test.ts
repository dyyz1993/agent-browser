import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('storage command', () => {
  describe('storage local', () => {
    it('should parse storage local', () => {
      const cmd = parseCliArgs(['storage', 'local']);
      expect(cmd.action).toBe('storage_get');
      expect(cmd.type).toBe('local');
    });

    it('should parse storage local get key', () => {
      const cmd = parseCliArgs(['storage', 'local', 'mykey']);
      expect(cmd.action).toBe('storage_get');
      expect(cmd.type).toBe('local');
      expect(cmd.key).toBe('mykey');
    });

    it('should parse storage local set', () => {
      const cmd = parseCliArgs(['storage', 'local', 'set', 'mykey', 'myvalue']);
      expect(cmd.action).toBe('storage_set');
      expect(cmd.type).toBe('local');
      expect(cmd.key).toBe('mykey');
      expect(cmd.value).toBe('myvalue');
    });

    it('should parse storage local clear', () => {
      const cmd = parseCliArgs(['storage', 'local', 'clear']);
      expect(cmd.action).toBe('storage_clear');
      expect(cmd.type).toBe('local');
    });
  });

  describe('storage session', () => {
    it('should parse storage session', () => {
      const cmd = parseCliArgs(['storage', 'session']);
      expect(cmd.action).toBe('storage_get');
      expect(cmd.type).toBe('session');
    });

    it('should parse storage session set', () => {
      const cmd = parseCliArgs(['storage', 'session', 'set', 'skey', 'svalue']);
      expect(cmd.action).toBe('storage_set');
      expect(cmd.type).toBe('session');
      expect(cmd.key).toBe('skey');
      expect(cmd.value).toBe('svalue');
    });

    it('should parse storage session clear', () => {
      const cmd = parseCliArgs(['storage', 'session', 'clear']);
      expect(cmd.action).toBe('storage_clear');
      expect(cmd.type).toBe('session');
    });
  });

  describe('storage errors', () => {
    it('should throw error when type is missing', () => {
      expect(() => parseCliArgs(['storage'])).toThrow(CliError);
    });

    it('should throw error for invalid type', () => {
      expect(() => parseCliArgs(['storage', 'invalid'])).toThrow(CliError);
    });

    it('should throw error when set value is missing', () => {
      expect(() => parseCliArgs(['storage', 'local', 'set', 'key'])).toThrow(CliError);
    });
  });
});
