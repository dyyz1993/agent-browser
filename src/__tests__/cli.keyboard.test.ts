import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('press command', () => {
  describe('single keys', () => {
    it('should parse press Enter', () => {
      const cmd = parseCliArgs(['press', 'Enter']);
      expect(cmd.action).toBe('press');
      expect(cmd.key).toBe('Enter');
    });

    it('should parse press Tab', () => {
      const cmd = parseCliArgs(['press', 'Tab']);
      expect(cmd.action).toBe('press');
      expect(cmd.key).toBe('Tab');
    });

    it('should parse press Escape', () => {
      const cmd = parseCliArgs(['press', 'Escape']);
      expect(cmd.action).toBe('press');
      expect(cmd.key).toBe('Escape');
    });

    it('should parse press Backspace', () => {
      const cmd = parseCliArgs(['press', 'Backspace']);
      expect(cmd.action).toBe('press');
      expect(cmd.key).toBe('Backspace');
    });

    it('should parse press Delete', () => {
      const cmd = parseCliArgs(['press', 'Delete']);
      expect(cmd.action).toBe('press');
      expect(cmd.key).toBe('Delete');
    });
  });

  describe('modifier keys', () => {
    it('should parse press Control', () => {
      const cmd = parseCliArgs(['press', 'Control']);
      expect(cmd.action).toBe('press');
      expect(cmd.key).toBe('Control');
    });

    it('should parse press Shift', () => {
      const cmd = parseCliArgs(['press', 'Shift']);
      expect(cmd.action).toBe('press');
      expect(cmd.key).toBe('Shift');
    });

    it('should parse press Alt', () => {
      const cmd = parseCliArgs(['press', 'Alt']);
      expect(cmd.action).toBe('press');
      expect(cmd.key).toBe('Alt');
    });

    it('should parse press Meta', () => {
      const cmd = parseCliArgs(['press', 'Meta']);
      expect(cmd.action).toBe('press');
      expect(cmd.key).toBe('Meta');
    });
  });

  describe('combination keys', () => {
    it('should parse press Control+A', () => {
      const cmd = parseCliArgs(['press', 'Control+A']);
      expect(cmd.action).toBe('press');
      expect(cmd.key).toBe('Control+A');
    });

    it('should parse press Control+C', () => {
      const cmd = parseCliArgs(['press', 'Control+C']);
      expect(cmd.action).toBe('press');
      expect(cmd.key).toBe('Control+C');
    });

    it('should parse press Control+V', () => {
      const cmd = parseCliArgs(['press', 'Control+V']);
      expect(cmd.action).toBe('press');
      expect(cmd.key).toBe('Control+V');
    });

    it('should parse press Meta+Shift+P', () => {
      const cmd = parseCliArgs(['press', 'Meta+Shift+P']);
      expect(cmd.action).toBe('press');
      expect(cmd.key).toBe('Meta+Shift+P');
    });
  });

  describe('arrow keys', () => {
    it('should parse press ArrowUp', () => {
      const cmd = parseCliArgs(['press', 'ArrowUp']);
      expect(cmd.action).toBe('press');
      expect(cmd.key).toBe('ArrowUp');
    });

    it('should parse press ArrowDown', () => {
      const cmd = parseCliArgs(['press', 'ArrowDown']);
      expect(cmd.action).toBe('press');
      expect(cmd.key).toBe('ArrowDown');
    });

    it('should parse press ArrowLeft', () => {
      const cmd = parseCliArgs(['press', 'ArrowLeft']);
      expect(cmd.action).toBe('press');
      expect(cmd.key).toBe('ArrowLeft');
    });

    it('should parse press ArrowRight', () => {
      const cmd = parseCliArgs(['press', 'ArrowRight']);
      expect(cmd.action).toBe('press');
      expect(cmd.key).toBe('ArrowRight');
    });
  });

  describe('function keys', () => {
    it('should parse press F1', () => {
      const cmd = parseCliArgs(['press', 'F1']);
      expect(cmd.action).toBe('press');
      expect(cmd.key).toBe('F1');
    });

    it('should parse press F12', () => {
      const cmd = parseCliArgs(['press', 'F12']);
      expect(cmd.action).toBe('press');
      expect(cmd.key).toBe('F12');
    });
  });

  describe('key alias', () => {
    it('should parse key as press', () => {
      const cmd = parseCliArgs(['key', 'Enter']);
      expect(cmd.action).toBe('press');
      expect(cmd.key).toBe('Enter');
    });
  });

  describe('press with --in-frame', () => {
    it('should parse press Enter with --in-frame', () => {
      const cmd = parseCliArgs(['press', '--in-frame', '1', 'Enter']);
      expect(cmd.action).toBe('press');
      expect(cmd.key).toBe('Enter');
      expect(cmd.inFrame).toBe('1');
    });

    it('should parse press with --in-frame and complex key', () => {
      const cmd = parseCliArgs(['press', '--in-frame', 'iframe-selector', 'Control+A']);
      expect(cmd.action).toBe('press');
      expect(cmd.key).toBe('Control+A');
      expect(cmd.inFrame).toBe('iframe-selector');
    });

    it('should parse press with --in-frame before and after key', () => {
      const cmd = parseCliArgs(['press', 'Enter', '--in-frame', '2']);
      expect(cmd.action).toBe('press');
      expect(cmd.key).toBe('Enter');
      expect(cmd.inFrame).toBe('2');
    });

    it('should not include --in-frame as key (regression)', () => {
      const cmd = parseCliArgs(['press', '--in-frame', '1', 'Enter']);
      expect(cmd.key).not.toBe('--in-frame');
      expect(cmd.key).toBe('Enter');
    });
  });

  describe('press errors', () => {
    it('should throw error when key is missing', () => {
      expect(() => parseCliArgs(['press'])).toThrow(CliError);
      try {
        parseCliArgs(['press']);
      } catch (e) {
        expect((e as CliError).message).toBe('Missing key');
        expect((e as CliError).usage).toBe('agent-browser press <key> [--in-frame <path>]');
      }
    });
  });
});

describe('keydown command', () => {
  it('should parse keydown Shift', () => {
    const cmd = parseCliArgs(['keydown', 'Shift']);
    expect(cmd.action).toBe('keydown');
    expect(cmd.key).toBe('Shift');
  });

  it('should parse keydown Control', () => {
    const cmd = parseCliArgs(['keydown', 'Control']);
    expect(cmd.action).toBe('keydown');
    expect(cmd.key).toBe('Control');
  });

  it('should throw error when key is missing', () => {
    expect(() => parseCliArgs(['keydown'])).toThrow(CliError);
  });

  it('should parse keydown with --in-frame', () => {
    const cmd = parseCliArgs(['keydown', '--in-frame', '1', 'Shift']);
    expect(cmd.action).toBe('keydown');
    expect(cmd.key).toBe('Shift');
    expect(cmd.inFrame).toBe('1');
  });
});

describe('keyup command', () => {
  it('should parse keyup Shift', () => {
    const cmd = parseCliArgs(['keyup', 'Shift']);
    expect(cmd.action).toBe('keyup');
    expect(cmd.key).toBe('Shift');
  });

  it('should parse keyup Control', () => {
    const cmd = parseCliArgs(['keyup', 'Control']);
    expect(cmd.action).toBe('keyup');
    expect(cmd.key).toBe('Control');
  });

  it('should throw error when key is missing', () => {
    expect(() => parseCliArgs(['keyup'])).toThrow(CliError);
  });

  it('should parse keyup with --in-frame', () => {
    const cmd = parseCliArgs(['keyup', '--in-frame', '1', 'Control']);
    expect(cmd.action).toBe('keyup');
    expect(cmd.key).toBe('Control');
    expect(cmd.inFrame).toBe('1');
  });
});
