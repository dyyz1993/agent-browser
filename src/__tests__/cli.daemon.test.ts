import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const CLI_PATH = path.resolve(__dirname, '../cli.ts');

async function getChromiumPath(): Promise<string | undefined> {
  if (process.env.AGENT_BROWSER_EXECUTABLE_PATH) {
    return process.env.AGENT_BROWSER_EXECUTABLE_PATH;
  }
  try {
    const { chromium } = await import('playwright-core');
    return chromium.executablePath();
  } catch {
    return undefined;
  }
}

let CHROMIUM_PATH: string | undefined;
getChromiumPath().then((p) => { CHROMIUM_PATH = p; });

function makeSession(): string {
  return `test-daemon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function runCli(
  args: string[],
  session: string,
  timeout = 10000
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const env: Record<string, string> = {
      ...process.env,
      AGENT_BROWSER_SESSION: session,
    } as Record<string, string>;
    if (CHROMIUM_PATH) {
      env.AGENT_BROWSER_EXECUTABLE_PATH = CHROMIUM_PATH;
    }
    const proc = spawn('node', ['--import', 'tsx', CLI_PATH, ...args], {
      env,
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => (stdout += data));
    proc.stderr.on('data', (data) => (stderr += data));

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Command timed out: agent-browser ${args.join(' ')}`));
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function getSocketDir(): string {
  return process.env.AGENT_BROWSER_SOCKET_DIR || path.join(os.homedir(), '.agent-browser');
}

function getPidFile(session: string): string {
  return path.join(getSocketDir(), `${session}.pid`);
}

function cleanupDaemon(session: string): void {
  const pidFile = getPidFile(session);
  if (fs.existsSync(pidFile)) {
    try {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
      process.kill(pid, 'SIGTERM');
    } catch {
      // Process may not exist
    }
    try {
      fs.unlinkSync(pidFile);
    } catch {
      // Ignore
    }
  }

  const socketPath = path.join(getSocketDir(), `${session}.sock`);
  try {
    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
  } catch {
    // Ignore
  }

  const lockPath = path.join(getSocketDir(), `${session}.lock`);
  try {
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
  } catch {
    // Ignore
  }
}

describe('CLI daemon management', () => {
  const sessions: string[] = [];

  function freshSession(): string {
    const s = makeSession();
    sessions.push(s);
    return s;
  }

  afterAll(() => {
    for (const s of sessions) {
      cleanupDaemon(s);
    }
  });

  it('should start daemon and not block on open command', async () => {
    const session = freshSession();
    const result = await runCli(['open', 'about:blank'], session, 30000);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('blank');
  }, 45000);

  it('should reuse existing daemon for subsequent commands', async () => {
    const session = freshSession();

    const result1 = await runCli(['open', 'about:blank'], session, 30000);
    expect(result1.code).toBe(0);

    await new Promise((r) => setTimeout(r, 1000));

    const result2 = await runCli(['get', 'url'], session, 10000);
    if (result2.code !== 0) {
      console.log('stderr:', result2.stderr);
      console.log('stdout:', result2.stdout);
    }
    expect(result2.code).toBe(0);
    expect(result2.stdout).toContain('about:blank');
  }, 60000);

  it('should close browser and daemon properly', async () => {
    const session = freshSession();

    const result1 = await runCli(['open', 'about:blank'], session, 30000);
    expect(result1.code).toBe(0);

    const result2 = await runCli(['close'], session, 10000);
    expect(result2.code).toBe(0);

    const result3 = await runCli(['open', 'about:blank'], session, 30000);
    expect(result3.code).toBe(0);
  }, 75000);

  it('should handle multiple rapid commands', async () => {
    const session = freshSession();

    await runCli(['open', 'about:blank'], session, 30000);

    const results = await Promise.all([
      runCli(['get', 'url'], session, 10000),
      runCli(['get', 'url'], session, 10000),
      runCli(['get', 'url'], session, 10000),
    ]);

    for (const result of results) {
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('about:blank');
    }
  }, 60000);
});
