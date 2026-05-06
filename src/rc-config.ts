import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const CONFIG_DIR = path.join(os.homedir(), '.agent-browser');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export interface RcConfig {
  viewer?: {
    host?: string;
    port?: number;
  };
  messageBridge?: {
    url?: string;
  };
  browser?: {
    executablePath?: string;
  };
  stream?: {
    port?: number;
  };
  proxy?: {
    url?: string;
  };
  messageProxy?: {
    url?: string;
  };
}

export const CONFIG_KEY_MAP: Record<string, { path: string[]; description: string }> = {
  'viewer.host': {
    path: ['viewer', 'host'],
    description: 'Viewer URL host (e.g., https://viewer.example.com:8443)',
  },
  'viewer.port': {
    path: ['viewer', 'port'],
    description: 'Stream Server port (default: 5005)',
  },
  'messageBridge.url': {
    path: ['messageBridge', 'url'],
    description: 'Message Bridge URL for ask command',
  },
  'browser.executablePath': {
    path: ['browser', 'executablePath'],
    description:
      'Browser executable path (e.g., /Applications/Chromium.app/Contents/MacOS/Chromium)',
  },
  'proxy.url': {
    path: ['proxy', 'url'],
    description: 'Proxy server URL for browser',
  },
  'messageProxy.url': {
    path: ['messageProxy', 'url'],
    description: 'Proxy URL for Message Bridge requests (HTTP_PROXY/HTTPS_PROXY)',
  },
};

export function loadConfig(): RcConfig {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as RcConfig;
  } catch {
    return {};
  }
}

export function saveConfig(config: RcConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function getConfigValue(key: string): string | number | undefined {
  const mapping = CONFIG_KEY_MAP[key];
  if (!mapping) return undefined;
  const config = loadConfig();
  let current: unknown = config;
  for (const segment of mapping.path) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current as string | number | undefined;
}

export function setConfigValue(key: string, value: string): boolean {
  const mapping = CONFIG_KEY_MAP[key];
  if (!mapping) return false;

  const config = loadConfig();
  let current: Record<string, unknown> = config as Record<string, unknown>;

  for (let i = 0; i < mapping.path.length - 1; i++) {
    const segment = mapping.path[i];
    if (!current[segment] || typeof current[segment] !== 'object') {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }

  const lastKey = mapping.path[mapping.path.length - 1];

  if (key === 'viewer.port') {
    const num = parseInt(value, 10);
    if (isNaN(num) || num <= 0 || num > 65535) return false;
    current[lastKey] = num;
  } else {
    current[lastKey] = value;
  }

  saveConfig(config);
  return true;
}

export function getEffectiveValue(key: string): string | number | undefined {
  const envMap: Record<string, string> = {
    'viewer.host': 'AGENT_BROWSER_VIEWER_HOST',
    'viewer.port': 'AGENT_BROWSER_STREAM_PORT',
    'messageBridge.url': 'MESSAGE_BRIDGE_URL',
    'browser.executablePath': 'AGENT_BROWSER_EXECUTABLE_PATH',
    'proxy.url': 'AGENT_BROWSER_PROXY',
    'messageProxy.url': 'HTTPS_PROXY',
  };

  const envKey = envMap[key];
  if (envKey && process.env[envKey]) {
    const val = process.env[envKey]!;
    if (key === 'viewer.port') {
      const num = parseInt(val, 10);
      if (!isNaN(num)) return num;
    }
    return val;
  }

  return getConfigValue(key);
}

export function getViewerHost(): string {
  return (getEffectiveValue('viewer.host') as string) || 'http://localhost';
}

export function getViewerPort(): number {
  const val = getEffectiveValue('viewer.port');
  if (typeof val === 'number') return val;
  const parsed = parseInt(String(val || '5005'), 10);
  return isNaN(parsed) ? 5005 : parsed;
}

export function getViewerUrl(instanceId: string): string {
  const host = getViewerHost();
  const port = getViewerPort();
  if (host.includes('://')) {
    return `${host}/view?instanceId=${instanceId}`;
  }
  return `http://${host}:${port}/view?instanceId=${instanceId}`;
}

export function getViewerWsUrl(instanceId: string): string {
  const host = getViewerHost();
  const port = getViewerPort();
  if (host.startsWith('https://')) {
    return `wss://${host.replace('https://', '')}/?instanceId=${instanceId}`;
  }
  if (host.startsWith('http://')) {
    return `ws://${host.replace('http://', '')}/?instanceId=${instanceId}`;
  }
  return `ws://${host}:${port}/?instanceId=${instanceId}`;
}

export function getMessageBridgeUrl(): string {
  return (getEffectiveValue('messageBridge.url') as string) || '';
}

export function getExecutablePath(): string | undefined {
  return getEffectiveValue('browser.executablePath') as string | undefined;
}

export function isViewerConfigured(): boolean {
  return getEffectiveValue('viewer.host') !== undefined;
}

export function isMessageBridgeConfigured(): boolean {
  return getEffectiveValue('messageBridge.url') !== undefined;
}

export function formatTips(command: 'viewer' | 'ask'): string[] {
  const tips: string[] = [];

  if (command === 'viewer' && !isViewerConfigured()) {
    tips.push('');
    tips.push('[Tip] Viewer host not configured. Using default (localhost).');
    tips.push('  To set a custom viewer host, run:');
    tips.push('    agent-browser config set viewer.host https://viewer.example.com:8443');
    tips.push('  Or set environment variable: AGENT_BROWSER_VIEWER_HOST');
  }

  if (command === 'ask' && !isMessageBridgeConfigured()) {
    tips.push('');
    tips.push('[Tip] Message Bridge URL not configured. Using default.');
    tips.push('  To set a custom Message Bridge URL, run:');
    tips.push(
      '    agent-browser config set messageBridge.url https://your-bridge.example.com:8443'
    );
    tips.push('  Or set environment variable: MESSAGE_BRIDGE_URL');
  }

  return tips;
}
