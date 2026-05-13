import type { Command, Flags } from './shared.js';
import { error } from './shared.js';

export function handleNetwork(
  cmd: string,
  rest: string[],
  id: string,
  flags: Flags
): Command | undefined {
  if (
    cmd !== 'network' &&
    cmd !== 'storage' &&
    cmd !== 'cookies' &&
    cmd !== 'scrape' &&
    cmd !== 'crawl' &&
    cmd !== 'map' &&
    cmd !== 'search'
  ) {
    return undefined;
  }

  switch (cmd) {
    case 'network': {
      const subcmd = rest[0];
      if (!subcmd)
        error(
          'Missing subcommand',
          'agent-browser network <route|unroute|requests|websockets> ...'
        );
      switch (subcmd) {
        case 'route': {
          const url = rest[1];
          if (!url)
            error(
              'Missing URL pattern',
              'agent-browser network route <url> [--abort] [--body <json>]'
            );
          const abort = rest.includes('--abort');
          const bodyIdx = rest.indexOf('--body');
          const body = bodyIdx !== -1 ? rest[bodyIdx + 1] : undefined;
          const contentTypeIdx = rest.indexOf('--content-type');
          const contentType = contentTypeIdx !== -1 ? rest[contentTypeIdx + 1] : undefined;
          const response =
            body || contentType
              ? {
                  ...(body ? { body } : {}),
                  ...(contentType ? { contentType } : {}),
                }
              : undefined;
          return { id, action: 'route', url, abort, response };
        }
        case 'unroute':
          return { id, action: 'unroute', url: rest[1] };
        case 'requests': {
          const clear = rest.includes('--clear');
          const filterIdx = rest.indexOf('--filter');
          const filter = filterIdx !== -1 ? rest[filterIdx + 1] : undefined;
          const captureResponse = rest.includes('--capture-response');
          const typeIdx = rest.indexOf('--type');
          const type = typeIdx !== -1 ? (rest[typeIdx + 1] as 'json') : undefined;
          const outputIdx = rest.indexOf('--output');
          const output = outputIdx !== -1 ? rest[outputIdx + 1] : undefined;
          return { id, action: 'requests', clear, filter, captureResponse, type, output };
        }
        case 'websockets': {
          const clear = rest.includes('--clear');
          const filterIdx = rest.indexOf('--filter');
          const filter = filterIdx !== -1 ? rest[filterIdx + 1] : undefined;
          return { id, action: 'websockets', clear, filter };
        }
        default:
          error(
            `Unknown network subcommand: ${subcmd}`,
            'agent-browser network <route|unroute|requests|websockets> ...'
          );
      }
    }
    case 'storage': {
      const type = rest[0] as 'local' | 'session';
      if (!type || (type !== 'local' && type !== 'session'))
        error('Missing storage type', 'agent-browser storage <local|session> [key] [value]');
      const subcmd = rest[1];
      if (!subcmd) return { id, action: 'storage_get', type };
      if (subcmd === 'set') {
        const key = rest[2];
        const value = rest[3];
        if (!key || !value)
          error('Missing key or value', 'agent-browser storage <local|session> set <key> <value>');
        return { id, action: 'storage_set', type, key, value };
      }
      if (subcmd === 'clear') return { id, action: 'storage_clear', type };
      return { id, action: 'storage_get', type, key: subcmd };
    }
    case 'cookies': {
      const subcmd = rest[0] || 'get';
      switch (subcmd) {
        case 'set': {
          const name = rest[1];
          const value = rest[2];
          if (!name || !value)
            error('Missing name or value', 'agent-browser cookies set <name> <value> [options]');
          const cookie: Record<string, unknown> = { name, value };
          for (let i = 3; i < rest.length; i++) {
            switch (rest[i]) {
              case '--url':
                cookie.url = rest[++i];
                break;
              case '--domain':
                cookie.domain = rest[++i];
                break;
              case '--path':
                cookie.path = rest[++i];
                break;
              case '--httpOnly':
                cookie.httpOnly = true;
                break;
              case '--secure':
                cookie.secure = true;
                break;
              case '--sameSite':
                cookie.sameSite = rest[++i];
                break;
              case '--expires':
                cookie.expires = parseInt(rest[++i], 10);
                break;
            }
          }
          return { id, action: 'cookies_set', cookies: [cookie] };
        }
        case 'clear':
          return { id, action: 'cookies_clear' };
        default:
          return {
            id,
            action: 'cookies_get',
            urls: subcmd !== 'get' ? [subcmd, ...rest.slice(1)] : undefined,
          };
      }
    }
    case 'scrape': {
      const url = rest[0];
      if (!url) error('Missing URL', 'agent-browser scrape <url> [options]');

      const cmd: Command = { id, action: 'scrape', url };

      const formatIndex = rest.indexOf('--format');
      if (formatIndex >= 0 && rest[formatIndex + 1]) {
        cmd.format = rest[formatIndex + 1] as 'text' | 'html' | 'markdown';
      }

      const selectorIndex = rest.indexOf('--selector');
      if (selectorIndex >= 0 && rest[selectorIndex + 1]) {
        cmd.selector = rest[selectorIndex + 1];
      }

      const timeoutIndex = rest.indexOf('--timeout');
      if (timeoutIndex >= 0 && rest[timeoutIndex + 1]) {
        cmd.timeout = parseInt(rest[timeoutIndex + 1], 10);
      }

      const waitForIndex = rest.indexOf('--wait-for');
      if (waitForIndex >= 0 && rest[waitForIndex + 1]) {
        cmd.waitForSelector = rest[waitForIndex + 1];
      }

      cmd.headless = !rest.includes('--headed');

      const outputIndex = rest.indexOf('--output');
      if (outputIndex >= 0 && rest[outputIndex + 1]) {
        cmd.outputFile = rest[outputIndex + 1];
      }

      const cookiesIdx = rest.indexOf('--cookies');
      if (cookiesIdx >= 0 && rest[cookiesIdx + 1]) {
        try {
          cmd.cookies = JSON.parse(rest[cookiesIdx + 1]);
        } catch {
          error(
            'Invalid cookies JSON',
            'agent-browser scrape --cookies \'[{"name":"k","value":"v"}]\''
          );
        }
      }

      const jsIdx = rest.indexOf('--javascript');
      if (jsIdx >= 0 && rest[jsIdx + 1]) {
        cmd.javaScriptEnabled = rest[jsIdx + 1] === 'true';
      }

      if (rest.includes('--metadata')) {
        cmd.includeMetadata = true;
      }

      return cmd;
    }
    case 'crawl': {
      const url = rest[0];
      if (!url) error('Missing URL', 'agent-browser crawl <url> [options]');

      const cmd: Command = { id, action: 'crawl', url };

      const depthIndex = rest.indexOf('--depth');
      if (depthIndex >= 0 && rest[depthIndex + 1]) {
        cmd.depth = parseInt(rest[depthIndex + 1], 10);
      }

      const limitIndex = rest.indexOf('--limit');
      if (limitIndex >= 0 && rest[limitIndex + 1]) {
        cmd.limit = parseInt(rest[limitIndex + 1], 10);
      }

      const formatIndex = rest.indexOf('--format');
      if (formatIndex >= 0 && rest[formatIndex + 1]) {
        cmd.format = rest[formatIndex + 1] as 'text' | 'html' | 'markdown';
      }

      const timeoutIndex = rest.indexOf('--timeout');
      if (timeoutIndex >= 0 && rest[timeoutIndex + 1]) {
        cmd.timeout = parseInt(rest[timeoutIndex + 1], 10);
      }

      const selectorIndex = rest.indexOf('--selector');
      if (selectorIndex >= 0 && rest[selectorIndex + 1]) {
        cmd.selector = rest[selectorIndex + 1];
      }

      const excludeIdx = rest.indexOf('--exclude-patterns');
      if (excludeIdx >= 0 && rest[excludeIdx + 1]) {
        cmd.excludePatterns = rest[excludeIdx + 1]
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
      }

      const includeIdx = rest.indexOf('--include-patterns');
      if (includeIdx >= 0 && rest[includeIdx + 1]) {
        cmd.includePatterns = rest[includeIdx + 1]
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
      }

      if (rest.includes('--allow-external')) {
        cmd.allowExternal = true;
      }

      cmd.headless = !rest.includes('--headed');

      const concurrencyIdx = rest.indexOf('--concurrency');
      if (concurrencyIdx >= 0 && rest[concurrencyIdx + 1]) {
        cmd.concurrency = parseInt(rest[concurrencyIdx + 1], 10);
      }

      const cookiesIdx = rest.indexOf('--cookies');
      if (cookiesIdx >= 0 && rest[cookiesIdx + 1]) {
        try {
          cmd.cookies = JSON.parse(rest[cookiesIdx + 1]);
        } catch {
          error(
            'Invalid cookies JSON',
            'agent-browser crawl --cookies \'[{"name":"k","value":"v"}]\''
          );
        }
      }

      const jsIdx = rest.indexOf('--javascript');
      if (jsIdx >= 0 && rest[jsIdx + 1]) {
        cmd.javaScriptEnabled = rest[jsIdx + 1] === 'true';
      }

      return cmd;
    }
    case 'map': {
      const url = rest[0];
      if (!url) error('Missing URL', 'agent-browser map <url> [options]');

      const cmd: Command = { id, action: 'map', url };

      const limitIndex = rest.indexOf('--limit');
      if (limitIndex >= 0 && rest[limitIndex + 1]) {
        cmd.limit = parseInt(rest[limitIndex + 1], 10);
      }

      const timeoutIndex = rest.indexOf('--timeout');
      if (timeoutIndex >= 0 && rest[timeoutIndex + 1]) {
        cmd.timeout = parseInt(rest[timeoutIndex + 1], 10);
      }

      const excludeIdx = rest.indexOf('--exclude-patterns');
      if (excludeIdx >= 0 && rest[excludeIdx + 1]) {
        cmd.excludePatterns = rest[excludeIdx + 1]
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
      }

      const includeIdx = rest.indexOf('--include-patterns');
      if (includeIdx >= 0 && rest[includeIdx + 1]) {
        cmd.includePatterns = rest[includeIdx + 1]
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);
      }

      cmd.headless = !rest.includes('--headed');

      return cmd;
    }
    case 'search': {
      const query = rest[0];
      if (!query) error('Missing query', 'agent-browser search <query> [options]');

      const cmd: Command = { id, action: 'search', query };

      const engineIndex = rest.indexOf('--engine');
      if (engineIndex >= 0 && rest[engineIndex + 1]) {
        cmd.engine = rest[engineIndex + 1] as 'google' | 'bing' | 'duckduckgo';
      }

      const limitIndex = rest.indexOf('--limit');
      if (limitIndex >= 0 && rest[limitIndex + 1]) {
        cmd.limit = parseInt(rest[limitIndex + 1], 10);
      }

      const timeoutIndex = rest.indexOf('--timeout');
      if (timeoutIndex >= 0 && rest[timeoutIndex + 1]) {
        cmd.timeout = parseInt(rest[timeoutIndex + 1], 10);
      }

      cmd.headless = !rest.includes('--headed');

      const outputIndex = rest.indexOf('--output');
      if (outputIndex >= 0 && rest[outputIndex + 1]) {
        cmd.outputFile = rest[outputIndex + 1];
      }

      if (rest.includes('--no-stealth')) {
        cmd.stealth = false;
      } else if (rest.includes('--stealth')) {
        cmd.stealth = true;
      }

      return cmd;
    }
    default:
      return undefined;
  }
}
