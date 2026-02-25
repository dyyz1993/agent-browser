import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('navigate command', () => {
  describe('open with https', () => {
    it('should parse open with https protocol', () => {
      const cmd = parseCliArgs(['open', 'https://example.com']);
      expect(cmd.action).toBe('navigate');
      expect(cmd.url).toBe('https://example.com');
    });

    it('should parse open with https and path', () => {
      const cmd = parseCliArgs(['open', 'https://example.com/path/to/page']);
      expect(cmd.action).toBe('navigate');
      expect(cmd.url).toBe('https://example.com/path/to/page');
    });

    it('should parse open with https and query string', () => {
      const cmd = parseCliArgs(['open', 'https://example.com/search?q=test']);
      expect(cmd.action).toBe('navigate');
      expect(cmd.url).toBe('https://example.com/search?q=test');
    });

    it('should parse open with https and fragment', () => {
      const cmd = parseCliArgs(['open', 'https://example.com/page#section']);
      expect(cmd.action).toBe('navigate');
      expect(cmd.url).toBe('https://example.com/page#section');
    });
  });

  describe('open with http', () => {
    it('should parse open with http protocol', () => {
      const cmd = parseCliArgs(['open', 'http://example.com']);
      expect(cmd.action).toBe('navigate');
      expect(cmd.url).toBe('http://example.com');
    });

    it('should parse open with http and port', () => {
      const cmd = parseCliArgs(['open', 'http://localhost:3000']);
      expect(cmd.action).toBe('navigate');
      expect(cmd.url).toBe('http://localhost:3000');
    });
  });

  describe('open without protocol', () => {
    it('should add https when no protocol', () => {
      const cmd = parseCliArgs(['open', 'example.com']);
      expect(cmd.action).toBe('navigate');
      expect(cmd.url).toBe('https://example.com');
    });

    it('should add https with path when no protocol', () => {
      const cmd = parseCliArgs(['open', 'example.com/page']);
      expect(cmd.action).toBe('navigate');
      expect(cmd.url).toBe('https://example.com/page');
    });

    it('should add https with subdomain when no protocol', () => {
      const cmd = parseCliArgs(['open', 'www.example.com']);
      expect(cmd.action).toBe('navigate');
      expect(cmd.url).toBe('https://www.example.com');
    });
  });

  describe('open with special protocols', () => {
    it('should parse open with about:blank', () => {
      const cmd = parseCliArgs(['open', 'about:blank']);
      expect(cmd.action).toBe('navigate');
      expect(cmd.url).toBe('about:blank');
    });

    it('should parse open with data URL', () => {
      const cmd = parseCliArgs(['open', 'data:text/html,<h1>Hello</h1>']);
      expect(cmd.action).toBe('navigate');
      expect(cmd.url).toBe('data:text/html,<h1>Hello</h1>');
    });

    it('should parse open with file URL', () => {
      const cmd = parseCliArgs(['open', 'file:///path/to/file.html']);
      expect(cmd.action).toBe('navigate');
      expect(cmd.url).toBe('file:///path/to/file.html');
    });
  });

  describe('open aliases', () => {
    it('should parse goto as navigate', () => {
      const cmd = parseCliArgs(['goto', 'https://example.com']);
      expect(cmd.action).toBe('navigate');
      expect(cmd.url).toBe('https://example.com');
    });

    it('should parse navigate as navigate', () => {
      const cmd = parseCliArgs(['navigate', 'https://example.com']);
      expect(cmd.action).toBe('navigate');
      expect(cmd.url).toBe('https://example.com');
    });
  });

  describe('open errors', () => {
    it('should throw error when URL is missing', () => {
      expect(() => parseCliArgs(['open'])).toThrow(CliError);
      try {
        parseCliArgs(['open']);
      } catch (e) {
        expect((e as CliError).message).toBe('Missing URL');
        expect((e as CliError).usage).toBe('agent-browser open <url>');
      }
    });
  });
});

describe('back command', () => {
  it('should parse back', () => {
    const cmd = parseCliArgs(['back']);
    expect(cmd.action).toBe('back');
  });
});

describe('forward command', () => {
  it('should parse forward', () => {
    const cmd = parseCliArgs(['forward']);
    expect(cmd.action).toBe('forward');
  });
});

describe('reload command', () => {
  it('should parse reload', () => {
    const cmd = parseCliArgs(['reload']);
    expect(cmd.action).toBe('reload');
  });
});
