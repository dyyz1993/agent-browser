import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('snapshot command', () => {
  describe('basic snapshot', () => {
    it('should parse snapshot without arguments', () => {
      const cmd = parseCliArgs(['snapshot']);
      expect(cmd.action).toBe('snapshot');
    });
  });

  describe('interactive flag', () => {
    it('should parse snapshot -i', () => {
      const cmd = parseCliArgs(['snapshot', '-i']);
      expect(cmd.action).toBe('snapshot');
      expect(cmd.interactive).toBe(true);
    });

    it('should parse snapshot --interactive', () => {
      const cmd = parseCliArgs(['snapshot', '--interactive']);
      expect(cmd.action).toBe('snapshot');
      expect(cmd.interactive).toBe(true);
    });
  });

  describe('cursor flag', () => {
    it('should parse snapshot -C', () => {
      const cmd = parseCliArgs(['snapshot', '-C']);
      expect(cmd.action).toBe('snapshot');
      expect(cmd.cursor).toBe(true);
    });

    it('should parse snapshot --cursor', () => {
      const cmd = parseCliArgs(['snapshot', '--cursor']);
      expect(cmd.action).toBe('snapshot');
      expect(cmd.cursor).toBe(true);
    });
  });

  describe('compact flag', () => {
    it('should parse snapshot -c', () => {
      const cmd = parseCliArgs(['snapshot', '-c']);
      expect(cmd.action).toBe('snapshot');
      expect(cmd.compact).toBe(true);
    });

    it('should parse snapshot --compact', () => {
      const cmd = parseCliArgs(['snapshot', '--compact']);
      expect(cmd.action).toBe('snapshot');
      expect(cmd.compact).toBe(true);
    });
  });

  describe('depth flag', () => {
    it('should parse snapshot -d 3', () => {
      const cmd = parseCliArgs(['snapshot', '-d', '3']);
      expect(cmd.action).toBe('snapshot');
      expect(cmd.maxDepth).toBe(3);
    });

    it('should parse snapshot --depth 5', () => {
      const cmd = parseCliArgs(['snapshot', '--depth', '5']);
      expect(cmd.action).toBe('snapshot');
      expect(cmd.maxDepth).toBe(5);
    });
  });

  describe('selector flag', () => {
    it('should parse snapshot -s #content', () => {
      const cmd = parseCliArgs(['snapshot', '-s', '#content']);
      expect(cmd.action).toBe('snapshot');
      expect(cmd.selector).toBe('#content');
    });

    it('should parse snapshot --selector .main', () => {
      const cmd = parseCliArgs(['snapshot', '--selector', '.main']);
      expect(cmd.action).toBe('snapshot');
      expect(cmd.selector).toBe('.main');
    });
  });

  describe('combined flags', () => {
    it('should parse snapshot -i -C', () => {
      const cmd = parseCliArgs(['snapshot', '-i', '-C']);
      expect(cmd.action).toBe('snapshot');
      expect(cmd.interactive).toBe(true);
      expect(cmd.cursor).toBe(true);
    });

    it('should parse snapshot -i -c -C', () => {
      const cmd = parseCliArgs(['snapshot', '-i', '-c', '-C']);
      expect(cmd.action).toBe('snapshot');
      expect(cmd.interactive).toBe(true);
      expect(cmd.compact).toBe(true);
      expect(cmd.cursor).toBe(true);
    });

    it('should parse snapshot -i -d 3', () => {
      const cmd = parseCliArgs(['snapshot', '-i', '-d', '3']);
      expect(cmd.action).toBe('snapshot');
      expect(cmd.interactive).toBe(true);
      expect(cmd.maxDepth).toBe(3);
    });

    it('should parse snapshot with all flags', () => {
      const cmd = parseCliArgs(['snapshot', '-i', '-c', '-C', '-d', '5', '-s', '#main']);
      expect(cmd.action).toBe('snapshot');
      expect(cmd.interactive).toBe(true);
      expect(cmd.compact).toBe(true);
      expect(cmd.cursor).toBe(true);
      expect(cmd.maxDepth).toBe(5);
      expect(cmd.selector).toBe('#main');
    });
  });

  describe('selector-for flag', () => {
    it('should parse --selector-for with ref target', () => {
      const cmd = parseCliArgs(['snapshot', '--selector-for', 'snap_1:@e1']);
      expect(cmd.action).toBe('selector-for');
      expect((cmd as Record<string, unknown>).target).toBe('snap_1:@e1');
    });

    it('should parse --selector-for with index target', () => {
      const cmd = parseCliArgs(['snapshot', '--selector-for', 'snap_3:1']);
      expect(cmd.action).toBe('selector-for');
      expect((cmd as Record<string, unknown>).target).toBe('snap_3:1');
    });
  });

  describe('selectors-of flag', () => {
    it('should parse --selectors-of', () => {
      const cmd = parseCliArgs(['snapshot', '--selectors-of', 'snap_1']);
      expect(cmd.action).toBe('selectors-of');
      expect((cmd as Record<string, unknown>).target).toBe('snap_1');
    });
  });

  describe('validate flag', () => {
    it('should parse --validate', () => {
      const cmd = parseCliArgs(['snapshot', '--validate', 'snap_1']);
      expect(cmd.action).toBe('validate');
      expect((cmd as Record<string, unknown>).target).toBe('snap_1');
    });
  });
});
