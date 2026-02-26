import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getHumanConfigFromEnv } from '../human-mouse.js';
import { parseCliArgs } from './utils/parseCli';

describe('AGENT_BROWSER_HUMAN environment variable', () => {
  const originalEnv = process.env.AGENT_BROWSER_HUMAN;

  beforeEach(() => {
    // Clean up before each test
    delete process.env.AGENT_BROWSER_HUMAN;
  });

  afterEach(() => {
    // Restore original value
    if (originalEnv === undefined) {
      delete process.env.AGENT_BROWSER_HUMAN;
    } else {
      process.env.AGENT_BROWSER_HUMAN = originalEnv;
    }
  });

  describe('getHumanConfigFromEnv', () => {
    it('should be disabled by default', () => {
      delete process.env.AGENT_BROWSER_HUMAN;
      const config = getHumanConfigFromEnv();
      expect(config.enabled).toBe(false);
      expect(config.pathType).toBe('arc');
    });

    it('should enable when set to "1"', () => {
      process.env.AGENT_BROWSER_HUMAN = '1';
      const config = getHumanConfigFromEnv();
      expect(config.enabled).toBe(true);
      expect(config.pathType).toBe('arc');
    });

    it('should parse arc path type', () => {
      process.env.AGENT_BROWSER_HUMAN = 'arc';
      const config = getHumanConfigFromEnv();
      expect(config.enabled).toBe(true);
      expect(config.pathType).toBe('arc');
    });

    it('should parse bezier path type', () => {
      process.env.AGENT_BROWSER_HUMAN = 'bezier';
      const config = getHumanConfigFromEnv();
      expect(config.enabled).toBe(true);
      expect(config.pathType).toBe('bezier');
    });

    it('should parse random path type', () => {
      process.env.AGENT_BROWSER_HUMAN = 'random';
      const config = getHumanConfigFromEnv();
      expect(config.enabled).toBe(true);
      expect(config.pathType).toBe('random');
    });

    it('should parse linear path type', () => {
      process.env.AGENT_BROWSER_HUMAN = 'linear';
      const config = getHumanConfigFromEnv();
      expect(config.enabled).toBe(true);
      expect(config.pathType).toBe('linear');
    });

    it('should default to arc for invalid values', () => {
      process.env.AGENT_BROWSER_HUMAN = 'invalid';
      const config = getHumanConfigFromEnv();
      expect(config.enabled).toBe(true);
      expect(config.pathType).toBe('arc');
    });

    it('should handle empty string as disabled', () => {
      process.env.AGENT_BROWSER_HUMAN = '';
      const config = getHumanConfigFromEnv();
      expect(config.enabled).toBe(false);
    });
  });
});

describe('human flag from global config (not CLI)', () => {
  const originalEnv = process.env.AGENT_BROWSER_HUMAN;

  beforeEach(() => {
    delete process.env.AGENT_BROWSER_HUMAN;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AGENT_BROWSER_HUMAN;
    } else {
      process.env.AGENT_BROWSER_HUMAN = originalEnv;
    }
  });

  describe('click without CLI --human', () => {
    it('should parse click without human property when env not set', () => {
      const cmd = parseCliArgs(['click', '#button']);
      expect(cmd.action).toBe('click');
      expect(cmd.selector).toBe('#button');
      // human is not set via CLI, so it should be undefined
      expect(cmd.human).toBeUndefined();
    });
  });

  describe('fill without CLI --human', () => {
    it('should parse fill without human property', () => {
      const cmd = parseCliArgs(['fill', '#input', 'hello']);
      expect(cmd.action).toBe('fill');
      expect(cmd.selector).toBe('#input');
      expect(cmd.value).toBe('hello');
      expect(cmd.human).toBeUndefined();
    });
  });

  describe('type without CLI --human', () => {
    it('should parse type without human property', () => {
      const cmd = parseCliArgs(['type', '#input', 'hello']);
      expect(cmd.action).toBe('type');
      expect(cmd.selector).toBe('#input');
      expect(cmd.text).toBe('hello');
      expect(cmd.human).toBeUndefined();
    });
  });

  describe('hover without CLI --human', () => {
    it('should parse hover without human property', () => {
      const cmd = parseCliArgs(['hover', '#menu']);
      expect(cmd.action).toBe('hover');
      expect(cmd.selector).toBe('#menu');
      expect(cmd.human).toBeUndefined();
    });
  });

  describe('dblclick without CLI --human', () => {
    it('should parse dblclick without human property', () => {
      const cmd = parseCliArgs(['dblclick', '#item']);
      expect(cmd.action).toBe('dblclick');
      expect(cmd.selector).toBe('#item');
      expect(cmd.human).toBeUndefined();
    });
  });

  describe('mouse wander', () => {
    it('should parse mouse wander with duration', () => {
      const cmd = parseCliArgs(['mouse', 'wander', '3000']);
      expect(cmd.action).toBe('wander');
      expect(cmd.duration).toBe(3000);
    });

    it('should parse mouse wander without human property', () => {
      const cmd = parseCliArgs(['mouse', 'wander', '5000']);
      expect(cmd.action).toBe('wander');
      expect(cmd.duration).toBe(5000);
      expect(cmd.human).toBeUndefined();
    });
  });

  describe('combined with other flags', () => {
    it('should parse click with --diff only', () => {
      const cmd = parseCliArgs(['click', '#button', '--diff']);
      expect(cmd.action).toBe('click');
      expect(cmd.diffScope).toBe(3);
      expect(cmd.human).toBeUndefined();
    });

    it('should parse click with --in-frame only', () => {
      const cmd = parseCliArgs(['click', '#button', '--in-frame', '#myframe']);
      expect(cmd.action).toBe('click');
      expect(cmd.inFrame).toBe('#myframe');
      expect(cmd.human).toBeUndefined();
    });
  });
});
