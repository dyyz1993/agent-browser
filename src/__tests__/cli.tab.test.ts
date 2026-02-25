import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('tab command', () => {
  describe('tab list', () => {
    it('should parse tab list', () => {
      const cmd = parseCliArgs(['tab', 'list']);
      expect(cmd.action).toBe('tab_list');
    });

    it('should parse tab (implicit list)', () => {
      const cmd = parseCliArgs(['tab']);
      expect(cmd.action).toBe('tab_list');
    });
  });

  describe('tab new', () => {
    it('should parse tab new', () => {
      const cmd = parseCliArgs(['tab', 'new']);
      expect(cmd.action).toBe('tab_new');
      expect(cmd.url).toBeUndefined();
    });

    it('should parse tab new with URL', () => {
      const cmd = parseCliArgs(['tab', 'new', 'https://example.com']);
      expect(cmd.action).toBe('tab_new');
      expect(cmd.url).toBe('https://example.com');
    });
  });

  describe('tab close', () => {
    it('should parse tab close', () => {
      const cmd = parseCliArgs(['tab', 'close']);
      expect(cmd.action).toBe('tab_close');
      expect(cmd.index).toBeUndefined();
    });

    it('should parse tab close with index', () => {
      const cmd = parseCliArgs(['tab', 'close', '2']);
      expect(cmd.action).toBe('tab_close');
      expect(cmd.index).toBe(2);
    });
  });

  describe('tab switch', () => {
    it('should parse tab switch by index', () => {
      const cmd = parseCliArgs(['tab', '3']);
      expect(cmd.action).toBe('tab_switch');
      expect(cmd.index).toBe(3);
    });

    it('should parse tab switch to first', () => {
      const cmd = parseCliArgs(['tab', '0']);
      expect(cmd.action).toBe('tab_switch');
      expect(cmd.index).toBe(0);
    });
  });

  describe('tab errors', () => {
    it('should throw error for unknown subcommand', () => {
      expect(() => parseCliArgs(['tab', 'unknown'])).toThrow(CliError);
    });
  });
});

describe('window command', () => {
  describe('window new', () => {
    it('should parse window new', () => {
      const cmd = parseCliArgs(['window', 'new']);
      expect(cmd.action).toBe('window_new');
    });
  });

  describe('window errors', () => {
    it('should throw error for unknown subcommand', () => {
      expect(() => parseCliArgs(['window', 'unknown'])).toThrow(CliError);
    });
  });
});

describe('frame command', () => {
  describe('frame main', () => {
    it('should parse frame main', () => {
      const cmd = parseCliArgs(['frame', 'main']);
      expect(cmd.action).toBe('mainframe');
    });
  });

  describe('frame selector', () => {
    it('should parse frame with selector', () => {
      const cmd = parseCliArgs(['frame', '#iframe']);
      expect(cmd.action).toBe('frame');
      expect(cmd.selector).toBe('#iframe');
    });

    it('should parse frame with class selector', () => {
      const cmd = parseCliArgs(['frame', '.embed']);
      expect(cmd.action).toBe('frame');
      expect(cmd.selector).toBe('.embed');
    });
  });

  describe('frame --url', () => {
    it('should parse frame --url', () => {
      const cmd = parseCliArgs(['frame', '--url', 'https://example.com/embed']);
      expect(cmd.action).toBe('frame');
      expect(cmd.url).toBe('https://example.com/embed');
    });
  });

  describe('frame --name', () => {
    it('should parse frame --name', () => {
      const cmd = parseCliArgs(['frame', '--name', 'myframe']);
      expect(cmd.action).toBe('frame');
      expect(cmd.name).toBe('myframe');
    });
  });

  describe('frame errors', () => {
    it('should throw error when no arguments', () => {
      expect(() => parseCliArgs(['frame'])).toThrow(CliError);
    });
  });
});

describe('dialog command', () => {
  describe('dialog accept', () => {
    it('should parse dialog accept', () => {
      const cmd = parseCliArgs(['dialog', 'accept']);
      expect(cmd.action).toBe('dialog');
      expect(cmd.response).toBe('accept');
    });

    it('should parse dialog accept with text', () => {
      const cmd = parseCliArgs(['dialog', 'accept', 'Hello']);
      expect(cmd.action).toBe('dialog');
      expect(cmd.response).toBe('accept');
      expect(cmd.promptText).toBe('Hello');
    });
  });

  describe('dialog dismiss', () => {
    it('should parse dialog dismiss', () => {
      const cmd = parseCliArgs(['dialog', 'dismiss']);
      expect(cmd.action).toBe('dialog');
      expect(cmd.response).toBe('dismiss');
    });
  });

  describe('dialog errors', () => {
    it('should throw error when subcommand is missing', () => {
      expect(() => parseCliArgs(['dialog'])).toThrow(CliError);
    });

    it('should throw error for unknown subcommand', () => {
      expect(() => parseCliArgs(['dialog', 'unknown'])).toThrow(CliError);
    });
  });
});
