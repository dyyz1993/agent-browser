import { describe, it, expect } from 'vitest';
import { parseCliArgs } from './utils/parseCli';

describe('human flag parsing', () => {
  describe('click with --human', () => {
    it('should parse click with --human (default arc)', () => {
      const cmd = parseCliArgs(['click', '#button', '--human']);
      expect(cmd.action).toBe('click');
      expect(cmd.selector).toBe('#button');
      expect(cmd.human).toEqual({ enabled: true, pathType: 'arc' });
    });

    it('should parse click with --human arc', () => {
      const cmd = parseCliArgs(['click', '#button', '--human', 'arc']);
      expect(cmd.action).toBe('click');
      expect(cmd.human).toEqual({ enabled: true, pathType: 'arc' });
    });

    it('should parse click with --human bezier', () => {
      const cmd = parseCliArgs(['click', '#button', '--human', 'bezier']);
      expect(cmd.action).toBe('click');
      expect(cmd.human).toEqual({ enabled: true, pathType: 'bezier' });
    });

    it('should parse click with --human random', () => {
      const cmd = parseCliArgs(['click', '#button', '--human', 'random']);
      expect(cmd.action).toBe('click');
      expect(cmd.human).toEqual({ enabled: true, pathType: 'random' });
    });

    it('should parse click with --human linear', () => {
      const cmd = parseCliArgs(['click', '#button', '--human', 'linear']);
      expect(cmd.action).toBe('click');
      expect(cmd.human).toEqual({ enabled: true, pathType: 'linear' });
    });

    it('should parse click with -H shorthand', () => {
      const cmd = parseCliArgs(['click', '#button', '-H']);
      expect(cmd.action).toBe('click');
      expect(cmd.human).toEqual({ enabled: true, pathType: 'arc' });
    });

    it('should parse click with -H and type', () => {
      const cmd = parseCliArgs(['click', '#button', '-H', 'bezier']);
      expect(cmd.action).toBe('click');
      expect(cmd.human).toEqual({ enabled: true, pathType: 'bezier' });
    });
  });

  describe('fill with --human', () => {
    it('should parse fill with --human', () => {
      const cmd = parseCliArgs(['fill', '#input', 'hello', '--human']);
      expect(cmd.action).toBe('fill');
      expect(cmd.selector).toBe('#input');
      expect(cmd.value).toBe('hello');
      expect(cmd.human).toEqual({ enabled: true, pathType: 'arc' });
    });

    it('should parse fill with --human random', () => {
      const cmd = parseCliArgs(['fill', '#input', 'test', '--human', 'random']);
      expect(cmd.action).toBe('fill');
      expect(cmd.human).toEqual({ enabled: true, pathType: 'random' });
    });
  });

  describe('type with --human', () => {
    it('should parse type with --human', () => {
      const cmd = parseCliArgs(['type', '#input', 'hello', '--human']);
      expect(cmd.action).toBe('type');
      expect(cmd.selector).toBe('#input');
      expect(cmd.text).toBe('hello');
      expect(cmd.human).toEqual({ enabled: true, pathType: 'arc' });
    });
  });

  describe('hover with --human', () => {
    it('should parse hover with --human', () => {
      const cmd = parseCliArgs(['hover', '#menu', '--human']);
      expect(cmd.action).toBe('hover');
      expect(cmd.selector).toBe('#menu');
      expect(cmd.human).toEqual({ enabled: true, pathType: 'arc' });
    });
  });

  describe('dblclick with --human', () => {
    it('should parse dblclick with --human', () => {
      const cmd = parseCliArgs(['dblclick', '#item', '--human']);
      expect(cmd.action).toBe('dblclick');
      expect(cmd.selector).toBe('#item');
      expect(cmd.human).toEqual({ enabled: true, pathType: 'arc' });
    });
  });

  describe('mouse wander with --human', () => {
    it('should parse mouse wander with duration', () => {
      const cmd = parseCliArgs(['mouse', 'wander', '3000']);
      expect(cmd.action).toBe('wander');
      expect(cmd.duration).toBe(3000);
    });

    it('should parse mouse wander with --human', () => {
      const cmd = parseCliArgs(['mouse', 'wander', '5000', '--human']);
      expect(cmd.action).toBe('wander');
      expect(cmd.duration).toBe(5000);
      expect(cmd.human).toEqual({ enabled: true, pathType: 'arc' });
    });

    it('should parse mouse wander with --human bezier', () => {
      const cmd = parseCliArgs(['mouse', 'wander', '2000', '--human', 'bezier']);
      expect(cmd.action).toBe('wander');
      expect(cmd.duration).toBe(2000);
      expect(cmd.human).toEqual({ enabled: true, pathType: 'bezier' });
    });
  });

  describe('combined with other flags', () => {
    it('should parse click with --human and --diff', () => {
      const cmd = parseCliArgs(['click', '#button', '--human', '--diff']);
      expect(cmd.action).toBe('click');
      expect(cmd.human).toEqual({ enabled: true, pathType: 'arc' });
      expect(cmd.diffScope).toBe(3);
    });

    it('should parse click with --diff and --human', () => {
      const cmd = parseCliArgs(['click', '#button', '--diff', '--human', 'random']);
      expect(cmd.action).toBe('click');
      expect(cmd.diffScope).toBe(3);
      expect(cmd.human).toEqual({ enabled: true, pathType: 'random' });
    });

    it('should parse click with --in-frame and --human', () => {
      const cmd = parseCliArgs(['click', '#button', '--in-frame', '#myframe', '--human']);
      expect(cmd.action).toBe('click');
      expect(cmd.inFrame).toBe('#myframe');
      expect(cmd.human).toEqual({ enabled: true, pathType: 'arc' });
    });
  });

  describe('without --human', () => {
    it('should not have human property when --human is not provided', () => {
      const cmd = parseCliArgs(['click', '#button']);
      expect(cmd.action).toBe('click');
      expect(cmd.human).toBeUndefined();
    });
  });
});
