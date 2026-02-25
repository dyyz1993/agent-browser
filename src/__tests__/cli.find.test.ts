import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('find command', () => {
  describe('find role', () => {
    it('should parse find role button', () => {
      const cmd = parseCliArgs(['find', 'role', 'button']);
      expect(cmd.action).toBe('getbyrole');
      expect(cmd.role).toBe('button');
      expect(cmd.subaction).toBe('click');
    });

    it('should parse find role with --name', () => {
      const cmd = parseCliArgs(['find', 'role', 'button', '--name', 'Submit']);
      expect(cmd.action).toBe('getbyrole');
      expect(cmd.role).toBe('button');
      expect(cmd.name).toBe('Submit');
    });

    it('should parse find role with --exact', () => {
      const cmd = parseCliArgs(['find', 'role', 'button', '--exact']);
      expect(cmd.action).toBe('getbyrole');
      expect(cmd.exact).toBe(true);
    });

    it('should parse find role with action', () => {
      const cmd = parseCliArgs(['find', 'role', 'button', 'fill']);
      expect(cmd.action).toBe('getbyrole');
      expect(cmd.subaction).toBe('fill');
    });
  });

  describe('find text', () => {
    it('should parse find text', () => {
      const cmd = parseCliArgs(['find', 'text', 'Submit']);
      expect(cmd.action).toBe('getbytext');
      expect(cmd.text).toBe('Submit');
      expect(cmd.subaction).toBe('click');
    });

    it('should parse find text with --exact', () => {
      const cmd = parseCliArgs(['find', 'text', 'Submit', '--exact']);
      expect(cmd.action).toBe('getbytext');
      expect(cmd.exact).toBe(true);
    });

    it('should parse find text with action', () => {
      const cmd = parseCliArgs(['find', 'text', 'Submit', 'hover']);
      expect(cmd.action).toBe('getbytext');
      expect(cmd.subaction).toBe('hover');
    });
  });

  describe('find label', () => {
    it('should parse find label', () => {
      const cmd = parseCliArgs(['find', 'label', 'Email']);
      expect(cmd.action).toBe('getbylabel');
      expect(cmd.label).toBe('Email');
    });

    it('should parse find label with action and value', () => {
      const cmd = parseCliArgs(['find', 'label', 'Email', 'fill', 'test@example.com']);
      expect(cmd.action).toBe('getbylabel');
      expect(cmd.label).toBe('Email');
      expect(cmd.subaction).toBe('fill');
      expect(cmd.value).toBe('test@example.com');
    });
  });

  describe('find placeholder', () => {
    it('should parse find placeholder', () => {
      const cmd = parseCliArgs(['find', 'placeholder', 'Search']);
      expect(cmd.action).toBe('getbyplaceholder');
      expect(cmd.placeholder).toBe('Search');
    });

    it('should parse find placeholder with action', () => {
      const cmd = parseCliArgs(['find', 'placeholder', 'Search', 'fill', 'hello']);
      expect(cmd.action).toBe('getbyplaceholder');
      expect(cmd.subaction).toBe('fill');
      expect(cmd.value).toBe('hello');
    });
  });

  describe('find alt', () => {
    it('should parse find alt', () => {
      const cmd = parseCliArgs(['find', 'alt', 'Logo']);
      expect(cmd.action).toBe('getbyalttext');
      expect(cmd.text).toBe('Logo');
    });
  });

  describe('find title', () => {
    it('should parse find title', () => {
      const cmd = parseCliArgs(['find', 'title', 'Close']);
      expect(cmd.action).toBe('getbytitle');
      expect(cmd.text).toBe('Close');
    });
  });

  describe('find testid', () => {
    it('should parse find testid', () => {
      const cmd = parseCliArgs(['find', 'testid', 'submit-btn']);
      expect(cmd.action).toBe('getbytestid');
      expect(cmd.testId).toBe('submit-btn');
    });

    it('should parse find testid with action', () => {
      const cmd = parseCliArgs(['find', 'testid', 'submit-btn', 'click']);
      expect(cmd.action).toBe('getbytestid');
      expect(cmd.subaction).toBe('click');
    });
  });

  describe('find first', () => {
    it('should parse find first', () => {
      const cmd = parseCliArgs(['find', 'first', 'a']);
      expect(cmd.action).toBe('nth');
      expect(cmd.index).toBe(0);
      expect(cmd.selector).toBe('a');
    });

    it('should parse find first with action', () => {
      const cmd = parseCliArgs(['find', 'first', 'a', 'click']);
      expect(cmd.action).toBe('nth');
      expect(cmd.subaction).toBe('click');
    });

    it('should parse find first with value', () => {
      const cmd = parseCliArgs(['find', 'first', 'input', 'fill', 'hello']);
      expect(cmd.action).toBe('nth');
      expect(cmd.value).toBe('hello');
    });
  });

  describe('find last', () => {
    it('should parse find last', () => {
      const cmd = parseCliArgs(['find', 'last', 'a']);
      expect(cmd.action).toBe('nth');
      expect(cmd.index).toBe(-1);
      expect(cmd.selector).toBe('a');
    });
  });

  describe('find nth', () => {
    it('should parse find nth', () => {
      const cmd = parseCliArgs(['find', 'nth', '2', 'a']);
      expect(cmd.action).toBe('nth');
      expect(cmd.index).toBe(2);
      expect(cmd.selector).toBe('a');
    });

    it('should parse find nth with action', () => {
      const cmd = parseCliArgs(['find', 'nth', '2', 'a', 'click']);
      expect(cmd.action).toBe('nth');
      expect(cmd.subaction).toBe('click');
    });
  });

  describe('find errors', () => {
    it('should throw error when locator is missing', () => {
      expect(() => parseCliArgs(['find'])).toThrow(CliError);
    });

    it('should throw error when role is missing', () => {
      expect(() => parseCliArgs(['find', 'role'])).toThrow(CliError);
    });

    it('should throw error when text is missing', () => {
      expect(() => parseCliArgs(['find', 'text'])).toThrow(CliError);
    });

    it('should throw error for unknown locator', () => {
      expect(() => parseCliArgs(['find', 'unknown', 'value'])).toThrow(CliError);
    });
  });
});
