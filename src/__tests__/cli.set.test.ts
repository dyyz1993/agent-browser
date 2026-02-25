import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('set command', () => {
  describe('set viewport', () => {
    it('should parse set viewport', () => {
      const cmd = parseCliArgs(['set', 'viewport', '1920', '1080']);
      expect(cmd.action).toBe('viewport');
      expect(cmd.width).toBe(1920);
      expect(cmd.height).toBe(1080);
    });

    it('should parse set viewport with small values', () => {
      const cmd = parseCliArgs(['set', 'viewport', '320', '480']);
      expect(cmd.action).toBe('viewport');
      expect(cmd.width).toBe(320);
      expect(cmd.height).toBe(480);
    });

    it('should throw error when dimensions are missing', () => {
      expect(() => parseCliArgs(['set', 'viewport'])).toThrow(CliError);
    });

    it('should throw error when height is missing', () => {
      expect(() => parseCliArgs(['set', 'viewport', '1920'])).toThrow(CliError);
    });
  });

  describe('set device', () => {
    it('should parse set device', () => {
      const cmd = parseCliArgs(['set', 'device', 'iPhone 14']);
      expect(cmd.action).toBe('device');
      expect(cmd.device).toBe('iPhone 14');
    });

    it('should throw error when device is missing', () => {
      expect(() => parseCliArgs(['set', 'device'])).toThrow(CliError);
    });
  });

  describe('set geo/geolocation', () => {
    it('should parse set geo', () => {
      const cmd = parseCliArgs(['set', 'geo', '37.7749', '-122.4194']);
      expect(cmd.action).toBe('geolocation');
      expect(cmd.latitude).toBe(37.7749);
      expect(cmd.longitude).toBe(-122.4194);
    });

    it('should parse set geolocation (long form)', () => {
      const cmd = parseCliArgs(['set', 'geolocation', '51.5074', '-0.1278']);
      expect(cmd.action).toBe('geolocation');
      expect(cmd.latitude).toBe(51.5074);
      expect(cmd.longitude).toBe(-0.1278);
    });

    it('should throw error when coordinates are missing', () => {
      expect(() => parseCliArgs(['set', 'geo'])).toThrow(CliError);
    });
  });

  describe('set offline', () => {
    it('should parse set offline (enable)', () => {
      const cmd = parseCliArgs(['set', 'offline']);
      expect(cmd.action).toBe('offline');
      expect(cmd.offline).toBe(true);
    });

    it('should parse set offline off', () => {
      const cmd = parseCliArgs(['set', 'offline', 'off']);
      expect(cmd.action).toBe('offline');
      expect(cmd.offline).toBe(false);
    });

    it('should parse set offline false', () => {
      const cmd = parseCliArgs(['set', 'offline', 'false']);
      expect(cmd.action).toBe('offline');
      expect(cmd.offline).toBe(false);
    });
  });

  describe('set headers', () => {
    it('should parse set headers with JSON', () => {
      const cmd = parseCliArgs(['set', 'headers', '{"Authorization":"Bearer-token"}']);
      expect(cmd.action).toBe('headers');
      expect(cmd.headers).toEqual({ Authorization: 'Bearer-token' });
    });

    it('should parse set headers with multiple values', () => {
      const cmd = parseCliArgs(['set', 'headers', '{"Authorization":"Bearer-token","X-Custom":"value"}']);
      expect(cmd.action).toBe('headers');
      expect(cmd.headers).toEqual({ Authorization: 'Bearer-token', 'X-Custom': 'value' });
    });

    it('should throw error when headers are missing', () => {
      expect(() => parseCliArgs(['set', 'headers'])).toThrow(CliError);
    });

    it('should throw error for invalid JSON', () => {
      expect(() => parseCliArgs(['set', 'headers', 'not-json'])).toThrow(CliError);
    });
  });

  describe('set credentials/auth', () => {
    it('should parse set credentials', () => {
      const cmd = parseCliArgs(['set', 'credentials', 'user', 'pass']);
      expect(cmd.action).toBe('credentials');
      expect(cmd.username).toBe('user');
      expect(cmd.password).toBe('pass');
    });

    it('should parse set auth (alias)', () => {
      const cmd = parseCliArgs(['set', 'auth', 'admin', 'secret']);
      expect(cmd.action).toBe('credentials');
      expect(cmd.username).toBe('admin');
      expect(cmd.password).toBe('secret');
    });

    it('should throw error when credentials are missing', () => {
      expect(() => parseCliArgs(['set', 'credentials'])).toThrow(CliError);
    });

    it('should throw error when password is missing', () => {
      expect(() => parseCliArgs(['set', 'credentials', 'user'])).toThrow(CliError);
    });
  });

  describe('set media', () => {
    it('should parse set media dark', () => {
      const cmd = parseCliArgs(['set', 'media', 'dark']);
      expect(cmd.action).toBe('emulatemedia');
      expect(cmd.colorScheme).toBe('dark');
      expect(cmd.reducedMotion).toBe('no-preference');
    });

    it('should parse set media light', () => {
      const cmd = parseCliArgs(['set', 'media', 'light']);
      expect(cmd.action).toBe('emulatemedia');
      expect(cmd.colorScheme).toBe('light');
      expect(cmd.reducedMotion).toBe('no-preference');
    });

    it('should parse set media with reduced-motion', () => {
      const cmd = parseCliArgs(['set', 'media', 'light', 'reduced-motion']);
      expect(cmd.action).toBe('emulatemedia');
      expect(cmd.colorScheme).toBe('light');
      expect(cmd.reducedMotion).toBe('reduce');
    });

    it('should parse set media dark with reduced-motion', () => {
      const cmd = parseCliArgs(['set', 'media', 'dark', 'reduced-motion']);
      expect(cmd.action).toBe('emulatemedia');
      expect(cmd.colorScheme).toBe('dark');
      expect(cmd.reducedMotion).toBe('reduce');
    });
  });

  describe('set errors', () => {
    it('should throw error when subcommand is missing', () => {
      expect(() => parseCliArgs(['set'])).toThrow(CliError);
    });

    it('should throw error for unknown subcommand', () => {
      expect(() => parseCliArgs(['set', 'unknown'])).toThrow(CliError);
    });
  });
});
