import type { Command, Flags } from './shared.js';
import { error, genId } from './shared.js';

export function handleNavigate(cmd: string, rest: string[], id: string, flags: Flags): Command {
  const url = rest[0];
  if (!url) error('Missing URL', 'agent-browser open <url>');
  const urlLower = url.toLowerCase();
  const formattedUrl =
    urlLower.startsWith('http://') ||
    urlLower.startsWith('https://') ||
    urlLower.startsWith('about:') ||
    urlLower.startsWith('data:') ||
    urlLower.startsWith('file:')
      ? url
      : `https://${url}`;
  const navCmd: Command = { id, action: 'navigate', url: formattedUrl };
  if (flags.headers) {
    try {
      navCmd.headers = JSON.parse(flags.headers);
    } catch {}
  }
  if (flags.timeout) {
    navCmd.timeout = parseInt(flags.timeout, 10);
  }
  if (flags.waitUntil) {
    navCmd.waitUntil = flags.waitUntil as 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
  }
  return navCmd;
}

export function handleConnect(rest: string[], id: string): Command {
  const endpoint = rest[0];
  if (!endpoint) error('Missing endpoint', 'agent-browser connect <port|url>');
  if (
    endpoint.startsWith('ws://') ||
    endpoint.startsWith('wss://') ||
    endpoint.startsWith('http://') ||
    endpoint.startsWith('https://')
  ) {
    return { id, action: 'launch', cdpUrl: endpoint };
  }
  const port = parseInt(endpoint, 10);
  if (isNaN(port) || port <= 0 || port > 65535)
    error('Invalid port', 'agent-browser connect <port|url>');
  return { id, action: 'launch', cdpPort: port };
}
