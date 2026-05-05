import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { parseCliArgs, CliError } from './utils/parseCli';

vi.mock('fs', () => ({
  default: {
    readSync: vi.fn(),
  },
}));

describe('addinitscript command', () => {
  describe('basic addinitscript', () => {
    it('should parse addinitscript with inline script', () => {
      const cmd = parseCliArgs(['addinitscript', 'window.__myFlag = true']);
      expect(cmd.action).toBe('addinitscript');
      expect(cmd.script).toBe('window.__myFlag = true');
    });

    it('should parse addinitscript with complex script', () => {
      const cmd = parseCliArgs([
        'addinitscript',
        'Object.defineProperty(navigator, "webdriver", { get: () => undefined })',
      ]);
      expect(cmd.action).toBe('addinitscript');
      expect(cmd.script).toBe(
        'Object.defineProperty(navigator, "webdriver", { get: () => undefined })'
      );
    });

    it('should parse addinitscript with multi-word script', () => {
      const cmd = parseCliArgs([
        'addinitscript',
        'document.querySelector(".btn").addEventListener("click", () => console.log("clicked"))',
      ]);
      expect(cmd.action).toBe('addinitscript');
      expect(cmd.script).toContain('addEventListener');
    });
  });

  describe('addinitscript --file', () => {
    it('should parse addinitscript --file <path>', () => {
      const cmd = parseCliArgs(['addinitscript', '--file', 'recognition.js']);
      expect(cmd.action).toBe('addinitscript');
      expect(cmd.file).toBe('recognition.js');
    });

    it('should parse addinitscript -f <path>', () => {
      const cmd = parseCliArgs(['addinitscript', '-f', 'recognition.js']);
      expect(cmd.action).toBe('addinitscript');
      expect(cmd.file).toBe('recognition.js');
    });

    it('should parse addinitscript --file with full path', () => {
      const cmd = parseCliArgs(['addinitscript', '--file', './scripts/recognition.js']);
      expect(cmd.action).toBe('addinitscript');
      expect(cmd.file).toBe('./scripts/recognition.js');
    });
  });

  describe('addinitscript --stdin', () => {
    const mockReadSync = vi.mocked(fs.readSync);

    beforeEach(() => {
      mockReadSync.mockReset();
    });

    afterEach(() => {
      mockReadSync.mockRestore();
    });

    it('should parse addinitscript --stdin', () => {
      const scriptContent = 'window.__injected = true';
      const scriptBuffer = Buffer.from(scriptContent);
      let callCount = 0;
      mockReadSync.mockImplementation((_fd, buffer) => {
        if (callCount === 0) {
          scriptBuffer.copy(buffer as Buffer);
          callCount++;
          return scriptBuffer.length;
        }
        return 0;
      });

      const cmd = parseCliArgs(['addinitscript', '--stdin']);
      expect(cmd.action).toBe('addinitscript');
      expect(cmd.script).toBe('window.__injected = true');
    });

    it('should parse addinitscript --stdin with multiline script', () => {
      const scriptContent = `(() => {
  const id = Symbol('__agentId');
  window[id] = true;
})()`;
      const scriptBuffer = Buffer.from(scriptContent);
      let callCount = 0;
      mockReadSync.mockImplementation((_fd, buffer) => {
        if (callCount === 0) {
          scriptBuffer.copy(buffer as Buffer);
          callCount++;
          return scriptBuffer.length;
        }
        return 0;
      });

      const cmd = parseCliArgs(['addinitscript', '--stdin']);
      expect(cmd.action).toBe('addinitscript');
      expect(cmd.script).toContain('Symbol');
    });
  });

  describe('addinitscript base64', () => {
    it('should parse addinitscript -b with base64', () => {
      const encoded = Buffer.from('window.__flag = 1').toString('base64');
      const cmd = parseCliArgs(['addinitscript', '-b', encoded]);
      expect(cmd.action).toBe('addinitscript');
      expect(cmd.script).toBe('window.__flag = 1');
    });

    it('should parse addinitscript --base64', () => {
      const encoded = Buffer.from('document.title').toString('base64');
      const cmd = parseCliArgs(['addinitscript', '--base64', encoded]);
      expect(cmd.action).toBe('addinitscript');
      expect(cmd.script).toBe('document.title');
    });
  });

  describe('addinitscript errors', () => {
    it('should throw error when no script provided', () => {
      expect(() => parseCliArgs(['addinitscript'])).toThrow(CliError);
      try {
        parseCliArgs(['addinitscript']);
      } catch (e) {
        expect((e as CliError).message).toBe('Missing script');
      }
    });

    it('should throw error when --file is missing path', () => {
      expect(() => parseCliArgs(['addinitscript', '--file'])).toThrow(CliError);
    });

    it('should throw error when -b is missing value', () => {
      expect(() => parseCliArgs(['addinitscript', '-b'])).toThrow(CliError);
    });

    it('should throw error when --base64 is missing value', () => {
      expect(() => parseCliArgs(['addinitscript', '--base64'])).toThrow(CliError);
    });
  });
});
