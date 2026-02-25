import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('iOS commands', () => {
  describe('tap command', () => {
    it('should parse tap with selector', () => {
      const cmd = parseCliArgs(['tap', '#button']);
      expect(cmd.action).toBe('tap');
      expect(cmd.selector).toBe('#button');
    });

    it('should parse tap with ref selector', () => {
      const cmd = parseCliArgs(['tap', '@e5']);
      expect(cmd.action).toBe('tap');
      expect(cmd.selector).toBe('@e5');
    });

    it('should throw error when selector is missing', () => {
      expect(() => parseCliArgs(['tap'])).toThrow(CliError);
    });
  });

  describe('swipe command', () => {
    it('should parse swipe up', () => {
      const cmd = parseCliArgs(['swipe', 'up']);
      expect(cmd.action).toBe('swipe');
      expect(cmd.direction).toBe('up');
    });

    it('should parse swipe down', () => {
      const cmd = parseCliArgs(['swipe', 'down']);
      expect(cmd.action).toBe('swipe');
      expect(cmd.direction).toBe('down');
    });

    it('should parse swipe left', () => {
      const cmd = parseCliArgs(['swipe', 'left']);
      expect(cmd.action).toBe('swipe');
      expect(cmd.direction).toBe('left');
    });

    it('should parse swipe right', () => {
      const cmd = parseCliArgs(['swipe', 'right']);
      expect(cmd.action).toBe('swipe');
      expect(cmd.direction).toBe('right');
    });

    it('should parse swipe with distance', () => {
      const cmd = parseCliArgs(['swipe', 'up', '100']);
      expect(cmd.action).toBe('swipe');
      expect(cmd.direction).toBe('up');
      expect(cmd.distance).toBe(100);
    });

    it('should throw error for invalid direction', () => {
      expect(() => parseCliArgs(['swipe', 'diagonal'])).toThrow(CliError);
    });

    it('should throw error when direction is missing', () => {
      expect(() => parseCliArgs(['swipe'])).toThrow(CliError);
    });
  });

  describe('device command', () => {
    it('should parse device list', () => {
      const cmd = parseCliArgs(['device', 'list']);
      expect(cmd.action).toBe('device_list');
    });

    it('should parse device (implicit list)', () => {
      const cmd = parseCliArgs(['device']);
      expect(cmd.action).toBe('device_list');
    });

    it('should throw error for unknown subcommand', () => {
      expect(() => parseCliArgs(['device', 'unknown'])).toThrow(CliError);
    });
  });
});
