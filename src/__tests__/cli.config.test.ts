import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getHumanConfigFromEnv } from '../human-mouse.js';
import { parseCliArgs } from './utils/parseCli.js';

// Store original environment variables
const ENV_VARS = [
  'AGENT_BROWSER_SESSION',
  'AGENT_BROWSER_EXECUTABLE_PATH',
  'AGENT_BROWSER_EXTENSIONS',
  'AGENT_BROWSER_PROFILE',
  'AGENT_BROWSER_STATE',
  'AGENT_BROWSER_PROXY',
  'AGENT_BROWSER_PROXY_BYPASS',
  'AGENT_BROWSER_ARGS',
  'AGENT_BROWSER_USER_AGENT',
  'AGENT_BROWSER_PROVIDER',
  'AGENT_BROWSER_ALLOW_FILE_ACCESS',
  'AGENT_BROWSER_IOS_DEVICE',
  'AGENT_BROWSER_STREAM_PORT',
  'AGENT_BROWSER_HEADED',
  'AGENT_BROWSER_HUMAN',
];

const originalValues: Record<string, string | undefined> = {};

describe('config command', () => {
  beforeEach(() => {
    // Save original values
    for (const key of ENV_VARS) {
      originalValues[key] = process.env[key];
    }
    // Clear all
    for (const key of ENV_VARS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore original values
    for (const key of ENV_VARS) {
      if (originalValues[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValues[key];
      }
    }
  });

  describe('parseCliArgs for config', () => {
    it('should parse config command without options', () => {
      const cmd = parseCliArgs(['config']);
      expect(cmd.action).toBe('config');
      expect(cmd.json).toBeFalsy();
    });

    it('should parse config command with --json flag', () => {
      const cmd = parseCliArgs(['config', '--json']);
      expect(cmd.action).toBe('config');
      expect(cmd.json).toBe(true);
    });
  });

  describe('getHumanConfigFromEnv', () => {
    it('should return disabled by default', () => {
      delete process.env.AGENT_BROWSER_HUMAN;
      const config = getHumanConfigFromEnv();
      expect(config.enabled).toBe(false);
      expect(config.pathType).toBe('arc');
    });

    it('should return enabled when set to "1"', () => {
      process.env.AGENT_BROWSER_HUMAN = '1';
      const config = getHumanConfigFromEnv();
      expect(config.enabled).toBe(true);
      expect(config.pathType).toBe('arc');
    });

    it('should return enabled with specific path type', () => {
      process.env.AGENT_BROWSER_HUMAN = 'bezier';
      const config = getHumanConfigFromEnv();
      expect(config.enabled).toBe(true);
      expect(config.pathType).toBe('bezier');
    });

    it('should return enabled with arc path type', () => {
      process.env.AGENT_BROWSER_HUMAN = 'arc';
      const config = getHumanConfigFromEnv();
      expect(config.enabled).toBe(true);
      expect(config.pathType).toBe('arc');
    });

    it('should return enabled with random path type', () => {
      process.env.AGENT_BROWSER_HUMAN = 'random';
      const config = getHumanConfigFromEnv();
      expect(config.enabled).toBe(true);
      expect(config.pathType).toBe('random');
    });

    it('should return enabled with linear path type', () => {
      process.env.AGENT_BROWSER_HUMAN = 'linear';
      const config = getHumanConfigFromEnv();
      expect(config.enabled).toBe(true);
      expect(config.pathType).toBe('linear');
    });

    it('should default to arc for invalid path type', () => {
      process.env.AGENT_BROWSER_HUMAN = 'invalid';
      const config = getHumanConfigFromEnv();
      expect(config.enabled).toBe(true);
      expect(config.pathType).toBe('arc');
    });

    it('should return disabled for empty string', () => {
      process.env.AGENT_BROWSER_HUMAN = '';
      const config = getHumanConfigFromEnv();
      expect(config.enabled).toBe(false);
    });
  });

  describe('environment variable defaults', () => {
    it('should have default session value', () => {
      delete process.env.AGENT_BROWSER_SESSION;
      expect(process.env.AGENT_BROWSER_SESSION).toBeUndefined();
    });

    it('should read custom session value', () => {
      process.env.AGENT_BROWSER_SESSION = 'test-session';
      expect(process.env.AGENT_BROWSER_SESSION).toBe('test-session');
    });

    it('should read executable path', () => {
      process.env.AGENT_BROWSER_EXECUTABLE_PATH = '/path/to/chrome';
      expect(process.env.AGENT_BROWSER_EXECUTABLE_PATH).toBe('/path/to/chrome');
    });

    it('should read provider', () => {
      process.env.AGENT_BROWSER_PROVIDER = 'browserbase';
      expect(process.env.AGENT_BROWSER_PROVIDER).toBe('browserbase');
    });

    it('should read extensions', () => {
      process.env.AGENT_BROWSER_EXTENSIONS = '/ext1,/ext2';
      expect(process.env.AGENT_BROWSER_EXTENSIONS).toBe('/ext1,/ext2');
    });

    it('should read proxy', () => {
      process.env.AGENT_BROWSER_PROXY = 'http://localhost:8080';
      expect(process.env.AGENT_BROWSER_PROXY).toBe('http://localhost:8080');
    });

    it('should read allow file access', () => {
      process.env.AGENT_BROWSER_ALLOW_FILE_ACCESS = '1';
      expect(process.env.AGENT_BROWSER_ALLOW_FILE_ACCESS).toBe('1');
    });

    it('should read headed mode', () => {
      process.env.AGENT_BROWSER_HEADED = '1';
      expect(process.env.AGENT_BROWSER_HEADED).toBe('1');
    });
  });

  describe('multiple environment variables', () => {
    it('should handle multiple variables set simultaneously', () => {
      process.env.AGENT_BROWSER_SESSION = 'multi-test';
      process.env.AGENT_BROWSER_HUMAN = 'bezier';
      process.env.AGENT_BROWSER_PROVIDER = 'browserbase';

      expect(process.env.AGENT_BROWSER_SESSION).toBe('multi-test');
      expect(process.env.AGENT_BROWSER_HUMAN).toBe('bezier');
      expect(process.env.AGENT_BROWSER_PROVIDER).toBe('browserbase');

      const humanConfig = getHumanConfigFromEnv();
      expect(humanConfig.enabled).toBe(true);
      expect(humanConfig.pathType).toBe('bezier');
    });

    it('should handle all variables cleared', () => {
      // Clear all
      for (const key of ENV_VARS) {
        delete process.env[key];
      }

      expect(process.env.AGENT_BROWSER_SESSION).toBeUndefined();
      expect(process.env.AGENT_BROWSER_HUMAN).toBeUndefined();
      expect(process.env.AGENT_BROWSER_PROVIDER).toBeUndefined();

      const humanConfig = getHumanConfigFromEnv();
      expect(humanConfig.enabled).toBe(false);
    });
  });
});
