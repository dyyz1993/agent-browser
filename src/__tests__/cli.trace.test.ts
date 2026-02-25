import { describe, it, expect } from 'vitest';
import { parseCliArgs, CliError } from './utils/parseCli';

describe('trace command', () => {
  describe('trace start', () => {
    it('should parse trace start', () => {
      const cmd = parseCliArgs(['trace', 'start']);
      expect(cmd.action).toBe('trace_start');
    });
  });

  describe('trace stop', () => {
    it('should parse trace stop', () => {
      const cmd = parseCliArgs(['trace', 'stop', 'trace.zip']);
      expect(cmd.action).toBe('trace_stop');
      expect(cmd.path).toBe('trace.zip');
    });

    it('should throw error when path is missing', () => {
      expect(() => parseCliArgs(['trace', 'stop'])).toThrow(CliError);
    });
  });

  describe('trace errors', () => {
    it('should throw error when subcommand is missing', () => {
      expect(() => parseCliArgs(['trace'])).toThrow(CliError);
    });

    it('should throw error for unknown subcommand', () => {
      expect(() => parseCliArgs(['trace', 'unknown'])).toThrow(CliError);
    });
  });
});

describe('record command', () => {
  describe('record start', () => {
    it('should parse record start', () => {
      const cmd = parseCliArgs(['record', 'start', 'output.webm']);
      expect(cmd.action).toBe('recording_start');
      expect(cmd.path).toBe('output.webm');
      expect(cmd.url).toBeUndefined();
    });

    it('should parse record start with URL', () => {
      const cmd = parseCliArgs(['record', 'start', 'demo.webm', 'https://example.com']);
      expect(cmd.action).toBe('recording_start');
      expect(cmd.path).toBe('demo.webm');
      expect(cmd.url).toBe('https://example.com');
    });

    it('should parse record start with URL without protocol', () => {
      const cmd = parseCliArgs(['record', 'start', 'demo.webm', 'example.com']);
      expect(cmd.action).toBe('recording_start');
      expect(cmd.path).toBe('demo.webm');
      expect(cmd.url).toBe('https://example.com');
    });

    it('should throw error when path is missing', () => {
      expect(() => parseCliArgs(['record', 'start'])).toThrow(CliError);
    });
  });

  describe('record stop', () => {
    it('should parse record stop', () => {
      const cmd = parseCliArgs(['record', 'stop']);
      expect(cmd.action).toBe('recording_stop');
    });
  });

  describe('record restart', () => {
    it('should parse record restart', () => {
      const cmd = parseCliArgs(['record', 'restart', 'output.webm']);
      expect(cmd.action).toBe('recording_restart');
      expect(cmd.path).toBe('output.webm');
      expect(cmd.url).toBeUndefined();
    });

    it('should parse record restart with URL', () => {
      const cmd = parseCliArgs(['record', 'restart', 'demo.webm', 'https://example.com']);
      expect(cmd.action).toBe('recording_restart');
      expect(cmd.path).toBe('demo.webm');
      expect(cmd.url).toBe('https://example.com');
    });

    it('should throw error when path is missing', () => {
      expect(() => parseCliArgs(['record', 'restart'])).toThrow(CliError);
    });
  });

  describe('record errors', () => {
    it('should throw error when subcommand is missing', () => {
      expect(() => parseCliArgs(['record'])).toThrow(CliError);
    });

    it('should throw error for unknown subcommand', () => {
      expect(() => parseCliArgs(['record', 'unknown'])).toThrow(CliError);
    });
  });
});

describe('console command', () => {
  it('should parse console', () => {
    const cmd = parseCliArgs(['console']);
    expect(cmd.action).toBe('console');
    expect(cmd.clear).toBe(false);
  });

  it('should parse console --clear', () => {
    const cmd = parseCliArgs(['console', '--clear']);
    expect(cmd.action).toBe('console');
    expect(cmd.clear).toBe(true);
  });
});

describe('errors command', () => {
  it('should parse errors', () => {
    const cmd = parseCliArgs(['errors']);
    expect(cmd.action).toBe('errors');
    expect(cmd.clear).toBe(false);
  });

  it('should parse errors --clear', () => {
    const cmd = parseCliArgs(['errors', '--clear']);
    expect(cmd.action).toBe('errors');
    expect(cmd.clear).toBe(true);
  });
});

describe('highlight command', () => {
  it('should parse highlight with selector', () => {
    const cmd = parseCliArgs(['highlight', '#element']);
    expect(cmd.action).toBe('highlight');
    expect(cmd.selector).toBe('#element');
  });

  it('should throw error when selector is missing', () => {
    expect(() => parseCliArgs(['highlight'])).toThrow(CliError);
  });
});

describe('state command', () => {
  describe('state save', () => {
    it('should parse state save', () => {
      const cmd = parseCliArgs(['state', 'save', 'state.json']);
      expect(cmd.action).toBe('state_save');
      expect(cmd.path).toBe('state.json');
    });

    it('should throw error when path is missing', () => {
      expect(() => parseCliArgs(['state', 'save'])).toThrow(CliError);
    });
  });

  describe('state load', () => {
    it('should parse state load', () => {
      const cmd = parseCliArgs(['state', 'load', 'state.json']);
      expect(cmd.action).toBe('state_load');
      expect(cmd.path).toBe('state.json');
    });

    it('should throw error when path is missing', () => {
      expect(() => parseCliArgs(['state', 'load'])).toThrow(CliError);
    });
  });

  describe('state errors', () => {
    it('should throw error when subcommand is missing', () => {
      expect(() => parseCliArgs(['state'])).toThrow(CliError);
    });

    it('should throw error for unknown subcommand', () => {
      expect(() => parseCliArgs(['state', 'unknown', 'file'])).toThrow(CliError);
    });
  });
});
