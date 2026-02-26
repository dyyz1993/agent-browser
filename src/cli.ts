#!/usr/bin/env npx tsx

import { parseFlags, cleanArgs, Flags } from './cli/flags.js';
import {
  ensureDaemon,
  sendCommand,
  Command,
  listSessions,
  genId,
  killDaemon,
  killAll,
} from './cli/connection.js';
import { parseCommand, CliError } from './cli/commands.js';
import { printHelp, printCommandHelp, printVersion } from './cli/help.js';
import {
  printResponse,
  printSession,
  printError,
  printWarning,
  successIndicator,
  warningIndicator,
} from './cli/output.js';
import { spawn } from 'child_process';
import { getHumanConfigFromEnv } from './human-mouse.js';

function parseProxy(proxyStr: string): Record<string, unknown> {
  const protocolEnd = proxyStr.indexOf('://');
  if (protocolEnd === -1) {
    return { server: proxyStr };
  }

  const protocol = proxyStr.substring(0, protocolEnd + 3);
  const rest = proxyStr.substring(protocolEnd + 3);
  const atPos = rest.lastIndexOf('@');

  if (atPos === -1) {
    return { server: proxyStr };
  }

  const creds = rest.substring(0, atPos);
  const serverPart = rest.substring(atPos + 1);
  const server = protocol + serverPart;

  const colonPos = creds.indexOf(':');
  if (colonPos === -1) {
    return { server, username: creds, password: '' };
  }

  return {
    server,
    username: creds.substring(0, colonPos),
    password: creds.substring(colonPos + 1),
  };
}

async function runInstall(withDeps: boolean): Promise<void> {
  const args = ['playwright', 'install', 'chromium'];
  if (withDeps) {
    args.push('--with-deps');
  }

  const child = spawn('npx', args, {
    stdio: 'inherit',
    shell: true,
  });

  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Install failed with code ${code}`));
      }
    });
    child.on('error', reject);
  });
}

async function runSession(flags: Flags): Promise<void> {
  const sessions = await listSessions();

  if (flags.json) {
    console.log(
      JSON.stringify({
        success: true,
        data: { session: flags.session, sessions },
      })
    );
    return;
  }

  printSession(flags.session, sessions, flags.json);
}

function runConfig(flags: Flags): void {
  const humanConfig = getHumanConfigFromEnv();

  const config = {
    session: process.env.AGENT_BROWSER_SESSION || 'default',
    executablePath: process.env.AGENT_BROWSER_EXECUTABLE_PATH || null,
    extensions: process.env.AGENT_BROWSER_EXTENSIONS || null,
    profile: process.env.AGENT_BROWSER_PROFILE || null,
    state: process.env.AGENT_BROWSER_STATE || null,
    proxy: process.env.AGENT_BROWSER_PROXY || null,
    proxyBypass: process.env.AGENT_BROWSER_PROXY_BYPASS || null,
    args: process.env.AGENT_BROWSER_ARGS || null,
    userAgent: process.env.AGENT_BROWSER_USER_AGENT || null,
    provider: process.env.AGENT_BROWSER_PROVIDER || null,
    allowFileAccess: process.env.AGENT_BROWSER_ALLOW_FILE_ACCESS === '1',
    iosDevice: process.env.AGENT_BROWSER_IOS_DEVICE || null,
    streamPort: process.env.AGENT_BROWSER_STREAM_PORT || null,
    headed: flags.headed,
    human: humanConfig,
  };

  if (flags.json) {
    console.log(JSON.stringify({ success: true, data: config }, null, 2));
    return;
  }

  const lines: string[] = [
    'Agent Browser Configuration',
    '===========================',
    '',
    'Session & Browser:',
    `  AGENT_BROWSER_SESSION          ${config.session}`,
    `  AGENT_BROWSER_EXECUTABLE_PATH  ${config.executablePath || '(not set)'}`,
    `  AGENT_BROWSER_PROVIDER         ${config.provider || '(not set)'}`,
    `  AGENT_BROWSER_HEADED           ${config.headed ? 'true' : 'false (default)'}`,
    '',
    'Browser Options:',
    `  AGENT_BROWSER_PROFILE          ${config.profile || '(not set)'}`,
    `  AGENT_BROWSER_EXTENSIONS       ${config.extensions || '(not set)'}`,
    `  AGENT_BROWSER_ARGS             ${config.args || '(not set)'}`,
    `  AGENT_BROWSER_USER_AGENT       ${config.userAgent || '(not set)'}`,
    `  AGENT_BROWSER_PROXY            ${config.proxy || '(not set)'}`,
    `  AGENT_BROWSER_ALLOW_FILE_ACCESS ${config.allowFileAccess ? 'true' : 'false (default)'}`,
    '',
    'Human Mode (runtime):',
    `  AGENT_BROWSER_HUMAN            ${humanConfig.enabled ? humanConfig.pathType + ' ✓' : '(disabled)'}`,
    '',
    'Note: Most settings only take effect at browser startup.',
    'Use "export AGENT_BROWSER_XXX=value" before starting.',
  ];

  console.log(lines.join('\n'));
}

async function launchWithFlags(flags: Flags): Promise<void> {
  const launchCmd: Command = {
    id: genId(),
    action: 'launch',
    headless: !flags.headed,
  };

  if (flags.executablePath) {
    launchCmd.executablePath = flags.executablePath;
  }
  if (flags.profile) {
    launchCmd.profile = flags.profile;
  }
  if (flags.state) {
    launchCmd.storageState = flags.state;
  }
  if (flags.proxy) {
    const proxyObj = parseProxy(flags.proxy);
    if (flags.proxyBypass) {
      (proxyObj as Record<string, unknown>).bypass = flags.proxyBypass;
    }
    launchCmd.proxy = proxyObj;
  }
  if (flags.userAgent) {
    launchCmd.userAgent = flags.userAgent;
  }
  if (flags.args) {
    launchCmd.args = flags.args
      .split(/[,\n]/)
      .map((a) => a.trim())
      .filter((a) => a);
  }
  if (flags.ignoreHttpsErrors) {
    launchCmd.ignoreHTTPSErrors = true;
  }
  if (flags.allowFileAccess) {
    launchCmd.allowFileAccess = true;
  }

  const resp = await sendCommand(launchCmd, flags.session);
  if (!resp.success) {
    throw new Error(resp.error || 'Browser launch failed');
  }
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const flags = parseFlags(rawArgs);
  const args = cleanArgs(rawArgs);

  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    if (args[0]) {
      if (printCommandHelp(args[0])) {
        return;
      }
    }
    printHelp();
    return;
  }

  if (rawArgs.includes('--version') || rawArgs.includes('-V')) {
    printVersion();
    return;
  }

  if (args.length === 0) {
    printHelp();
    return;
  }

  if (args[0] === 'install') {
    const withDeps = rawArgs.includes('--with-deps') || rawArgs.includes('-d');
    try {
      await runInstall(withDeps);
    } catch (e) {
      printError(e instanceof Error ? e.message : String(e), flags.json);
      process.exit(1);
    }
    return;
  }

  if (args[0] === 'session') {
    try {
      await runSession(flags);
    } catch (e) {
      printError(e instanceof Error ? e.message : String(e), flags.json);
      process.exit(1);
    }
    return;
  }

  if (args[0] === 'config') {
    runConfig(flags);
    return;
  }

  if (args[0] === 'kill') {
    try {
      const result = await killAll();
      if (flags.json) {
        console.log(
          JSON.stringify({
            success: true,
            daemons: result.daemons,
            streamServer: result.streamServer,
          })
        );
      } else {
        if (result.daemons.length > 0) {
          console.log(`✓ Killed daemons: ${result.daemons.join(', ')}`);
        } else {
          console.log('✓ No daemons running');
        }
        if (result.streamServer) {
          console.log('✓ Stream Server killed');
        } else {
          console.log('✓ No Stream Server running');
        }
      }
    } catch (e) {
      printError(e instanceof Error ? e.message : String(e), flags.json);
      process.exit(1);
    }
    return;
  }

  let cmd: Command;
  try {
    cmd = parseCommand(args, flags);
  } catch (e) {
    if (e instanceof CliError) {
      printError(e.message, flags.json);
      if (e.usage && !flags.json) {
        console.error(`Usage: ${e.usage}`);
      }
    } else {
      printError(e instanceof Error ? e.message : String(e), flags.json);
    }
    process.exit(1);
    return;
  }

  try {
    const daemonResult = await ensureDaemon({
      session: flags.session,
      headed: flags.headed,
      executablePath: flags.executablePath,
      extensions: flags.extensions,
      args: flags.args,
      userAgent: flags.userAgent,
      proxy: flags.proxy,
      proxyBypass: flags.proxyBypass,
      ignoreHttpsErrors: flags.ignoreHttpsErrors,
      allowFileAccess: flags.allowFileAccess,
      profile: flags.profile,
      state: flags.state,
      provider: flags.provider,
      device: flags.device,
    });

    if (daemonResult.alreadyRunning) {
      const ignoredFlags: string[] = [];
      if (flags.cliExecutablePath) ignoredFlags.push('--executable-path');
      if (flags.cliExtensions) ignoredFlags.push('--extension');
      if (flags.cliProfile) ignoredFlags.push('--profile');
      if (flags.cliState) ignoredFlags.push('--state');
      if (flags.cliArgs) ignoredFlags.push('--args');
      if (flags.cliUserAgent) ignoredFlags.push('--user-agent');
      if (flags.cliProxy) ignoredFlags.push('--proxy');
      if (flags.cliProxyBypass) ignoredFlags.push('--proxy-bypass');
      if (flags.ignoreHttpsErrors) ignoredFlags.push('--ignore-https-errors');
      if (flags.cliAllowFileAccess) ignoredFlags.push('--allow-file-access');

      if (ignoredFlags.length > 0 && !flags.json) {
        printWarning(
          `${ignoredFlags.join(', ')} ignored: daemon already running. Use 'agent-browser close' first to restart with new options.`
        );
      }
    }
  } catch (e) {
    printError(e instanceof Error ? e.message : String(e), flags.json);
    process.exit(1);
    return;
  }

  if (flags.cdp && flags.provider) {
    printError('Cannot use --cdp and -p/--provider together', flags.json);
    process.exit(1);
    return;
  }

  if (flags.provider && flags.extensions.length > 0) {
    printError(
      'Cannot use --extension with -p/--provider (extensions require local browser)',
      flags.json
    );
    process.exit(1);
    return;
  }

  if (flags.cdp) {
    const cdpValue = flags.cdp;
    let launchCmd: Command;

    if (
      cdpValue.startsWith('ws://') ||
      cdpValue.startsWith('wss://') ||
      cdpValue.startsWith('http://') ||
      cdpValue.startsWith('https://')
    ) {
      launchCmd = { id: genId(), action: 'launch', cdpUrl: cdpValue };
    } else {
      const port = parseInt(cdpValue, 10);
      if (isNaN(port) || port <= 0 || port > 65535) {
        printError(`Invalid CDP port: ${cdpValue}`, flags.json);
        process.exit(1);
        return;
      }
      launchCmd = { id: genId(), action: 'launch', cdpPort: port };
    }

    if (flags.ignoreHttpsErrors) {
      launchCmd.ignoreHTTPSErrors = true;
    }

    try {
      const resp = await sendCommand(launchCmd, flags.session);
      if (!resp.success) {
        printError(resp.error || 'CDP connection failed', flags.json);
        process.exit(1);
        return;
      }
    } catch (e) {
      printError(e instanceof Error ? e.message : String(e), flags.json);
      process.exit(1);
      return;
    }
  }

  if (flags.provider) {
    const launchCmd: Command = {
      id: genId(),
      action: 'launch',
      provider: flags.provider,
    };

    try {
      const resp = await sendCommand(launchCmd, flags.session);
      if (!resp.success) {
        printError(resp.error || 'Provider connection failed', flags.json);
        process.exit(1);
        return;
      }
    } catch (e) {
      printError(e instanceof Error ? e.message : String(e), flags.json);
      process.exit(1);
      return;
    }
  }

  if (
    (flags.headed ||
      flags.executablePath ||
      flags.profile ||
      flags.state ||
      flags.proxy ||
      flags.args ||
      flags.userAgent ||
      flags.allowFileAccess) &&
    !flags.cdp &&
    !flags.provider
  ) {
    try {
      await launchWithFlags(flags);
    } catch (e) {
      printError(e instanceof Error ? e.message : String(e), flags.json);
      process.exit(1);
      return;
    }
  }

  try {
    const resp = await sendCommand(cmd, flags.session);
    const action = cmd.action as string | undefined;
    printResponse(resp, flags.json, action);
    if (!resp.success) {
      process.exit(1);
    }
  } catch (e) {
    printError(e instanceof Error ? e.message : String(e), flags.json);
    process.exit(1);
  }
}

main().catch((e) => {
  printError(e instanceof Error ? e.message : String(e), false);
  process.exit(1);
});
