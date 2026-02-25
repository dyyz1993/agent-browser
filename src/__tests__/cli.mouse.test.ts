import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('mouse command', () => {
  describe('mouse move', () => {
    it('should parse mouse move with coordinates', () => {
      const cmd = parseCliArgs(['mouse', 'move', '100', '200']);
      expect(cmd.action).toBe('mousemove');
      expect(cmd.x).toBe(100);
      expect(cmd.y).toBe(200);
    });

    it('should parse mouse move with zero coordinates', () => {
      const cmd = parseCliArgs(['mouse', 'move', '0', '0']);
      expect(cmd.action).toBe('mousemove');
      expect(cmd.x).toBe(0);
      expect(cmd.y).toBe(0);
    });

    it('should throw error when coordinates are missing', () => {
      expect(() => parseCliArgs(['mouse', 'move'])).toThrow(CliError);
    });

    it('should throw error when y is missing', () => {
      expect(() => parseCliArgs(['mouse', 'move', '100'])).toThrow(CliError);
    });
  });

  describe('mouse down', () => {
    it('should parse mouse down with default button', () => {
      const cmd = parseCliArgs(['mouse', 'down']);
      expect(cmd.action).toBe('mousedown');
      expect(cmd.button).toBe('left');
    });

    it('should parse mouse down with left button', () => {
      const cmd = parseCliArgs(['mouse', 'down', 'left']);
      expect(cmd.action).toBe('mousedown');
      expect(cmd.button).toBe('left');
    });

    it('should parse mouse down with right button', () => {
      const cmd = parseCliArgs(['mouse', 'down', 'right']);
      expect(cmd.action).toBe('mousedown');
      expect(cmd.button).toBe('right');
    });

    it('should parse mouse down with middle button', () => {
      const cmd = parseCliArgs(['mouse', 'down', 'middle']);
      expect(cmd.action).toBe('mousedown');
      expect(cmd.button).toBe('middle');
    });
  });

  describe('mouse up', () => {
    it('should parse mouse up with default button', () => {
      const cmd = parseCliArgs(['mouse', 'up']);
      expect(cmd.action).toBe('mouseup');
      expect(cmd.button).toBe('left');
    });

    it('should parse mouse up with right button', () => {
      const cmd = parseCliArgs(['mouse', 'up', 'right']);
      expect(cmd.action).toBe('mouseup');
      expect(cmd.button).toBe('right');
    });
  });

  describe('mouse wheel', () => {
    it('should parse mouse wheel with default values', () => {
      const cmd = parseCliArgs(['mouse', 'wheel']);
      expect(cmd.action).toBe('wheel');
      expect(cmd.deltaY).toBe(100);
      expect(cmd.deltaX).toBe(0);
    });

    it('should parse mouse wheel with deltaY', () => {
      const cmd = parseCliArgs(['mouse', 'wheel', '200']);
      expect(cmd.action).toBe('wheel');
      expect(cmd.deltaY).toBe(200);
      expect(cmd.deltaX).toBe(0);
    });

    it('should parse mouse wheel with deltaY and deltaX', () => {
      const cmd = parseCliArgs(['mouse', 'wheel', '100', '50']);
      expect(cmd.action).toBe('wheel');
      expect(cmd.deltaY).toBe(100);
      expect(cmd.deltaX).toBe(50);
    });
  });

  describe('mouse errors', () => {
    it('should throw error when subcommand is missing', () => {
      expect(() => parseCliArgs(['mouse'])).toThrow(CliError);
    });

    it('should throw error for unknown subcommand', () => {
      expect(() => parseCliArgs(['mouse', 'unknown'])).toThrow(CliError);
    });
  });
});
