import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { RcConfig } from '../rc-config.js';

const TEST_HOME = path.join(os.tmpdir(), `rc-config-test-${process.pid}`);
const TEST_CONFIG_DIR = path.join(TEST_HOME, '.agent-browser');
const TEST_CONFIG_FILE = path.join(TEST_CONFIG_DIR, 'config.json');

const ENV_KEYS = [
  'AGENT_BROWSER_VIEWER_HOST',
  'AGENT_BROWSER_STREAM_PORT',
  'MESSAGE_BRIDGE_URL',
  'AGENT_BROWSER_EXECUTABLE_PATH',
  'AGENT_BROWSER_PROXY',
  'HTTPS_PROXY',
];

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os');
  return { ...actual, homedir: () => TEST_HOME };
});

const {
  loadConfig,
  saveConfig,
  getConfigValue,
  setConfigValue,
  getEffectiveValue,
  getViewerHost,
  getViewerPort,
  getViewerUrl,
  getViewerWsUrl,
  getMessageBridgeUrl,
  getExecutablePath,
  isViewerConfigured,
  isMessageBridgeConfigured,
  formatTips,
  CONFIG_KEY_MAP,
} = await import('../rc-config.js');

const savedEnv: Record<string, string | undefined> = {};

function writeTestConfig(config: RcConfig): void {
  if (!fs.existsSync(TEST_CONFIG_DIR)) {
    fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(TEST_CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

describe('rc-config', () => {
  beforeEach(() => {
    try {
      fs.rmSync(TEST_HOME, { recursive: true });
    } catch {
      /* empty */
    }
    fs.mkdirSync(TEST_HOME, { recursive: true });
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    try {
      fs.rmSync(TEST_HOME, { recursive: true });
    } catch {
      /* empty */
    }
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
  });

  describe('loadConfig', () => {
    it('should return empty object when no config file exists', () => {
      expect(loadConfig()).toEqual({});
    });

    it('should parse existing config file correctly', () => {
      writeTestConfig({
        viewer: { host: 'https://viewer.example.com:8443', port: 9090 },
        messageBridge: { url: 'https://bridge.example.com' },
        browser: { executablePath: '/usr/bin/chromium' },
      });
      const config = loadConfig();
      expect(config.viewer?.host).toBe('https://viewer.example.com:8443');
      expect(config.viewer?.port).toBe(9090);
      expect(config.messageBridge?.url).toBe('https://bridge.example.com');
      expect(config.browser?.executablePath).toBe('/usr/bin/chromium');
    });

    it('should return empty object for malformed JSON', () => {
      if (!fs.existsSync(TEST_CONFIG_DIR)) {
        fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });
      }
      fs.writeFileSync(TEST_CONFIG_FILE, '{ invalid json !!!', 'utf-8');
      expect(loadConfig()).toEqual({});
    });
  });

  describe('saveConfig', () => {
    it('should create config directory if it does not exist', () => {
      expect(fs.existsSync(TEST_CONFIG_DIR)).toBe(false);
      saveConfig({ viewer: { host: 'http://localhost' } });
      expect(fs.existsSync(TEST_CONFIG_DIR)).toBe(true);
      expect(fs.existsSync(TEST_CONFIG_FILE)).toBe(true);
    });

    it('should write valid JSON config', () => {
      const config: RcConfig = {
        viewer: { host: 'https://example.com', port: 3000 },
        browser: { executablePath: '/path/to/browser' },
      };
      saveConfig(config);
      const raw = fs.readFileSync(TEST_CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed).toEqual(config);
    });

    it('should overwrite existing config', () => {
      saveConfig({ viewer: { host: 'http://first.com' } });
      saveConfig({ viewer: { host: 'http://second.com' } });
      const config = loadConfig();
      expect(config.viewer?.host).toBe('http://second.com');
    });
  });

  describe('getConfigValue', () => {
    it('should return undefined for unknown key', () => {
      expect(getConfigValue('unknown.key')).toBeUndefined();
    });

    it('should return value for known key', () => {
      writeTestConfig({ viewer: { host: 'https://my-host.com' } });
      expect(getConfigValue('viewer.host')).toBe('https://my-host.com');
    });

    it('should return undefined for missing nested value', () => {
      writeTestConfig({});
      expect(getConfigValue('viewer.host')).toBeUndefined();
    });

    it('should return port as number', () => {
      writeTestConfig({ viewer: { port: 8080 } });
      expect(getConfigValue('viewer.port')).toBe(8080);
    });

    it('should handle all mapped keys', () => {
      writeTestConfig({
        viewer: { host: 'http://v.com', port: 1234 },
        messageBridge: { url: 'http://mb.com' },
        browser: { executablePath: '/b' },
        proxy: { url: 'http://p.com' },
        messageProxy: { url: 'http://mp.com' },
      });
      expect(getConfigValue('viewer.host')).toBe('http://v.com');
      expect(getConfigValue('viewer.port')).toBe(1234);
      expect(getConfigValue('messageBridge.url')).toBe('http://mb.com');
      expect(getConfigValue('browser.executablePath')).toBe('/b');
      expect(getConfigValue('proxy.url')).toBe('http://p.com');
      expect(getConfigValue('messageProxy.url')).toBe('http://mp.com');
    });
  });

  describe('setConfigValue', () => {
    it('should return false for unknown key', () => {
      expect(setConfigValue('unknown.key', 'val')).toBe(false);
    });

    it('should set a string value and persist', () => {
      expect(setConfigValue('viewer.host', 'https://my.com')).toBe(true);
      expect(getConfigValue('viewer.host')).toBe('https://my.com');
    });

    it('should set viewer.port as number', () => {
      expect(setConfigValue('viewer.port', '9090')).toBe(true);
      expect(getConfigValue('viewer.port')).toBe(9090);
    });

    it('should reject invalid port numbers', () => {
      expect(setConfigValue('viewer.port', '0')).toBe(false);
      expect(setConfigValue('viewer.port', '-1')).toBe(false);
      expect(setConfigValue('viewer.port', '70000')).toBe(false);
      expect(setConfigValue('viewer.port', 'abc')).toBe(false);
    });

    it('should create nested objects if missing', () => {
      expect(setConfigValue('browser.executablePath', '/usr/bin/chrome')).toBe(true);
      expect(getConfigValue('browser.executablePath')).toBe('/usr/bin/chrome');
    });

    it('should overwrite existing value', () => {
      setConfigValue('viewer.host', 'http://first.com');
      setConfigValue('viewer.host', 'http://second.com');
      expect(getConfigValue('viewer.host')).toBe('http://second.com');
    });
  });

  describe('getEffectiveValue', () => {
    it('should prefer env variable over config file', () => {
      writeTestConfig({ viewer: { host: 'http://from-config.com' } });
      process.env.AGENT_BROWSER_VIEWER_HOST = 'http://from-env.com';
      expect(getEffectiveValue('viewer.host')).toBe('http://from-env.com');
    });

    it('should return config value when no env set', () => {
      writeTestConfig({ viewer: { host: 'http://from-config.com' } });
      expect(getEffectiveValue('viewer.host')).toBe('http://from-config.com');
    });

    it('should return undefined when neither env nor config provides value', () => {
      expect(getEffectiveValue('viewer.host')).toBeUndefined();
    });

    it('should parse viewer.port from env as number', () => {
      process.env.AGENT_BROWSER_STREAM_PORT = '7777';
      expect(getEffectiveValue('viewer.port')).toBe(7777);
    });

    it('should return string for non-port env values', () => {
      process.env.AGENT_BROWSER_EXECUTABLE_PATH = '/path/to/browser';
      expect(getEffectiveValue('browser.executablePath')).toBe('/path/to/browser');
    });

    it('should handle MESSAGE_BRIDGE_URL env', () => {
      process.env.MESSAGE_BRIDGE_URL = 'https://bridge.example.com';
      expect(getEffectiveValue('messageBridge.url')).toBe('https://bridge.example.com');
    });

    it('should handle AGENT_BROWSER_PROXY env', () => {
      process.env.AGENT_BROWSER_PROXY = 'http://proxy:8080';
      expect(getEffectiveValue('proxy.url')).toBe('http://proxy:8080');
    });

    it('should handle HTTPS_PROXY env for messageProxy', () => {
      process.env.HTTPS_PROXY = 'http://msgproxy:3128';
      expect(getEffectiveValue('messageProxy.url')).toBe('http://msgproxy:3128');
    });
  });

  describe('getViewerHost', () => {
    it('should return default http://localhost when nothing configured', () => {
      expect(getViewerHost()).toBe('http://localhost');
    });

    it('should return configured host', () => {
      process.env.AGENT_BROWSER_VIEWER_HOST = 'https://my-viewer.com';
      expect(getViewerHost()).toBe('https://my-viewer.com');
    });

    it('should return config file host', () => {
      writeTestConfig({ viewer: { host: 'https://config-host.com' } });
      expect(getViewerHost()).toBe('https://config-host.com');
    });
  });

  describe('getViewerPort', () => {
    it('should return default 5005 when nothing configured', () => {
      expect(getViewerPort()).toBe(5005);
    });

    it('should return port from env', () => {
      process.env.AGENT_BROWSER_STREAM_PORT = '6006';
      expect(getViewerPort()).toBe(6006);
    });

    it('should return port from config', () => {
      writeTestConfig({ viewer: { port: 7070 } });
      expect(getViewerPort()).toBe(7070);
    });
  });

  describe('getViewerUrl', () => {
    it('should build URL with host containing ://', () => {
      process.env.AGENT_BROWSER_VIEWER_HOST = 'https://viewer.example.com:8443';
      const url = getViewerUrl('test-id');
      expect(url).toBe('https://viewer.example.com:8443/view?instanceId=test-id');
    });

    it('should build URL with host:port when no ://', () => {
      writeTestConfig({ viewer: { host: 'myhost' } });
      const url = getViewerUrl('abc');
      expect(url).toBe('http://myhost:5005/view?instanceId=abc');
    });

    it('should use config port', () => {
      writeTestConfig({ viewer: { host: 'myhost', port: 9000 } });
      const url = getViewerUrl('id1');
      expect(url).toBe('http://myhost:9000/view?instanceId=id1');
    });

    it('should default to localhost with default port 5005', () => {
      const url = getViewerUrl('xyz');
      expect(url).toBe('http://localhost:5005/view?instanceId=xyz');
    });
  });

  describe('getViewerWsUrl', () => {
    it('should convert https:// to wss://', () => {
      process.env.AGENT_BROWSER_VIEWER_HOST = 'https://viewer.example.com:8443';
      const url = getViewerWsUrl('test-id');
      expect(url).toBe('wss://viewer.example.com:8443/?instanceId=test-id');
    });

    it('should convert http:// to ws:// with port', () => {
      process.env.AGENT_BROWSER_VIEWER_HOST = 'http://myhost.com';
      const url = getViewerWsUrl('id2');
      expect(url).toBe('ws://myhost.com:5005/?instanceId=id2');
    });

    it('should use host:port for plain host', () => {
      writeTestConfig({ viewer: { host: 'myhost', port: 4000 } });
      const url = getViewerWsUrl('id3');
      expect(url).toBe('ws://myhost:4000/?instanceId=id3');
    });

    it('should default to ws://localhost with port', () => {
      const url = getViewerWsUrl('id4');
      expect(url).toBe('ws://localhost:5005/?instanceId=id4');
    });
  });

  describe('getMessageBridgeUrl', () => {
    it('should return empty string when not configured', () => {
      expect(getMessageBridgeUrl()).toBe('');
    });

    it('should return URL from env', () => {
      process.env.MESSAGE_BRIDGE_URL = 'https://bridge.example.com';
      expect(getMessageBridgeUrl()).toBe('https://bridge.example.com');
    });

    it('should return URL from config', () => {
      writeTestConfig({ messageBridge: { url: 'https://config-bridge.com' } });
      expect(getMessageBridgeUrl()).toBe('https://config-bridge.com');
    });
  });

  describe('getExecutablePath', () => {
    it('should return undefined when not configured', () => {
      expect(getExecutablePath()).toBeUndefined();
    });

    it('should return path from env', () => {
      process.env.AGENT_BROWSER_EXECUTABLE_PATH = '/usr/bin/chromium';
      expect(getExecutablePath()).toBe('/usr/bin/chromium');
    });

    it('should return path from config', () => {
      writeTestConfig({
        browser: { executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium' },
      });
      expect(getExecutablePath()).toBe('/Applications/Chromium.app/Contents/MacOS/Chromium');
    });

    it('should prefer env over config', () => {
      writeTestConfig({ browser: { executablePath: '/config/path' } });
      process.env.AGENT_BROWSER_EXECUTABLE_PATH = '/env/path';
      expect(getExecutablePath()).toBe('/env/path');
    });
  });

  describe('isViewerConfigured', () => {
    it('should return false when not configured', () => {
      expect(isViewerConfigured()).toBe(false);
    });

    it('should return true when viewer.host set in config', () => {
      writeTestConfig({ viewer: { host: 'https://viewer.com' } });
      expect(isViewerConfigured()).toBe(true);
    });

    it('should return true when env AGENT_BROWSER_VIEWER_HOST set', () => {
      process.env.AGENT_BROWSER_VIEWER_HOST = 'https://viewer.com';
      expect(isViewerConfigured()).toBe(true);
    });
  });

  describe('isMessageBridgeConfigured', () => {
    it('should return false when not configured', () => {
      expect(isMessageBridgeConfigured()).toBe(false);
    });

    it('should return true when messageBridge.url set in config', () => {
      writeTestConfig({ messageBridge: { url: 'https://bridge.com' } });
      expect(isMessageBridgeConfigured()).toBe(true);
    });

    it('should return true when env MESSAGE_BRIDGE_URL set', () => {
      process.env.MESSAGE_BRIDGE_URL = 'https://bridge.com';
      expect(isMessageBridgeConfigured()).toBe(true);
    });
  });

  describe('formatTips', () => {
    it('should return tips for viewer when not configured', () => {
      const tips = formatTips('viewer');
      expect(tips.length).toBeGreaterThan(0);
      expect(tips.some((t) => t.includes('Viewer host not configured'))).toBe(true);
    });

    it('should return empty array for viewer when configured', () => {
      process.env.AGENT_BROWSER_VIEWER_HOST = 'https://viewer.com';
      expect(formatTips('viewer')).toEqual([]);
    });

    it('should return tips for ask when not configured', () => {
      const tips = formatTips('ask');
      expect(tips.length).toBeGreaterThan(0);
      expect(tips.some((t) => t.includes('Message Bridge URL not configured'))).toBe(true);
    });

    it('should return empty array for ask when configured', () => {
      process.env.MESSAGE_BRIDGE_URL = 'https://bridge.com';
      expect(formatTips('ask')).toEqual([]);
    });

    it('should include set command hint in viewer tips', () => {
      const tips = formatTips('viewer');
      expect(tips.some((t) => t.includes('agent-browser config set viewer.host'))).toBe(true);
    });

    it('should include env variable hint in viewer tips', () => {
      const tips = formatTips('viewer');
      expect(tips.some((t) => t.includes('AGENT_BROWSER_VIEWER_HOST'))).toBe(true);
    });
  });

  describe('CONFIG_KEY_MAP', () => {
    it('should have entries for all expected keys', () => {
      const keys = Object.keys(CONFIG_KEY_MAP);
      expect(keys).toContain('viewer.host');
      expect(keys).toContain('viewer.port');
      expect(keys).toContain('messageBridge.url');
      expect(keys).toContain('browser.executablePath');
      expect(keys).toContain('proxy.url');
      expect(keys).toContain('messageProxy.url');
    });

    it('should have path and description for each entry', () => {
      for (const [, val] of Object.entries(CONFIG_KEY_MAP)) {
        expect(Array.isArray(val.path)).toBe(true);
        expect(val.path.length).toBeGreaterThan(0);
        expect(typeof val.description).toBe('string');
        expect(val.description.length).toBeGreaterThan(0);
      }
    });
  });
});
