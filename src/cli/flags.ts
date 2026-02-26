import { HumanConfig, getHumanConfigFromEnv } from '../human-mouse.js';

export interface Flags {
  json: boolean;
  full: boolean;
  headed: boolean;
  debug: boolean;
  session: string;
  headers?: string;
  executablePath?: string;
  cdp?: string;
  extensions: string[];
  profile?: string;
  state?: string;
  proxy?: string;
  proxyBypass?: string;
  args?: string;
  userAgent?: string;
  provider?: string;
  ignoreHttpsErrors: boolean;
  allowFileAccess: boolean;
  device?: string;
  human: HumanConfig;

  cliExecutablePath: boolean;
  cliExtensions: boolean;
  cliProfile: boolean;
  cliState: boolean;
  cliArgs: boolean;
  cliUserAgent: boolean;
  cliProxy: boolean;
  cliProxyBypass: boolean;
  cliAllowFileAccess: boolean;
}

const GLOBAL_FLAGS: string[] = [
  '--json',
  '--full',
  '--headed',
  '--debug',
  '--ignore-https-errors',
  '--allow-file-access',
  '-f',
];

const GLOBAL_FLAGS_WITH_VALUE: string[] = [
  '--session',
  '--headers',
  '--executable-path',
  '--cdp',
  '--extension',
  '--profile',
  '--state',
  '--proxy',
  '--proxy-bypass',
  '--args',
  '--user-agent',
  '-p',
  '--provider',
  '--device',
];

export function parseFlags(args: string[]): Flags {
  const extensionsEnv = process.env.AGENT_BROWSER_EXTENSIONS
    ? process.env.AGENT_BROWSER_EXTENSIONS.split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
    : [];

  const flags: Flags = {
    json: false,
    full: false,
    headed: false,
    debug: false,
    session: process.env.AGENT_BROWSER_SESSION || 'default',
    headers: undefined,
    executablePath: process.env.AGENT_BROWSER_EXECUTABLE_PATH,
    cdp: undefined,
    extensions: extensionsEnv,
    profile: process.env.AGENT_BROWSER_PROFILE,
    state: process.env.AGENT_BROWSER_STATE,
    proxy: process.env.AGENT_BROWSER_PROXY,
    proxyBypass: process.env.AGENT_BROWSER_PROXY_BYPASS,
    args: process.env.AGENT_BROWSER_ARGS,
    userAgent: process.env.AGENT_BROWSER_USER_AGENT,
    provider: process.env.AGENT_BROWSER_PROVIDER,
    ignoreHttpsErrors: false,
    allowFileAccess: process.env.AGENT_BROWSER_ALLOW_FILE_ACCESS === '1',
    device: process.env.AGENT_BROWSER_IOS_DEVICE,
    human: getHumanConfigFromEnv(),
    cliExecutablePath: false,
    cliExtensions: false,
    cliProfile: false,
    cliState: false,
    cliArgs: false,
    cliUserAgent: false,
    cliProxy: false,
    cliProxyBypass: false,
    cliAllowFileAccess: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--json':
        flags.json = true;
        break;
      case '--full':
      case '-f':
        flags.full = true;
        break;
      case '--headed':
        flags.headed = true;
        break;
      case '--debug':
        flags.debug = true;
        break;
      case '--session':
        if (nextArg) {
          flags.session = nextArg;
          i++;
        }
        break;
      case '--headers':
        if (nextArg) {
          flags.headers = nextArg;
          i++;
        }
        break;
      case '--executable-path':
        if (nextArg) {
          flags.executablePath = nextArg;
          flags.cliExecutablePath = true;
          i++;
        }
        break;
      case '--extension':
        if (nextArg) {
          flags.extensions.push(nextArg);
          flags.cliExtensions = true;
          i++;
        }
        break;
      case '--cdp':
        if (nextArg) {
          flags.cdp = nextArg;
          i++;
        }
        break;
      case '--profile':
        if (nextArg) {
          flags.profile = nextArg;
          flags.cliProfile = true;
          i++;
        }
        break;
      case '--state':
        if (nextArg) {
          flags.state = nextArg;
          flags.cliState = true;
          i++;
        }
        break;
      case '--proxy':
        if (nextArg) {
          flags.proxy = nextArg;
          flags.cliProxy = true;
          i++;
        }
        break;
      case '--proxy-bypass':
        if (nextArg) {
          flags.proxyBypass = nextArg;
          flags.cliProxyBypass = true;
          i++;
        }
        break;
      case '--args':
        if (nextArg) {
          flags.args = nextArg;
          flags.cliArgs = true;
          i++;
        }
        break;
      case '--user-agent':
        if (nextArg) {
          flags.userAgent = nextArg;
          flags.cliUserAgent = true;
          i++;
        }
        break;
      case '-p':
      case '--provider':
        if (nextArg) {
          flags.provider = nextArg;
          i++;
        }
        break;
      case '--ignore-https-errors':
        flags.ignoreHttpsErrors = true;
        break;
      case '--allow-file-access':
        flags.allowFileAccess = true;
        flags.cliAllowFileAccess = true;
        break;
      case '--device':
        if (nextArg) {
          flags.device = nextArg;
          i++;
        }
        break;
    }
  }

  return flags;
}

export function cleanArgs(args: string[]): string[] {
  const result: string[] = [];
  let skipNext = false;

  for (const arg of args) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (GLOBAL_FLAGS_WITH_VALUE.includes(arg)) {
      skipNext = true;
      continue;
    }
    if (GLOBAL_FLAGS.includes(arg)) {
      continue;
    }
    result.push(arg);
  }

  return result;
}
