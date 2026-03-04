import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const CLI_PATH = path.join(__dirname, '../cli.ts');
const SESSION = `test-daemon-${Date.now()}`;

function runCli(
  args: string[],
  timeout = 10000
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['tsx', CLI_PATH, ...args], {
      env: { ...process.env, AGENT_BROWSER_SESSION: SESSION },
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

function getPidFile(): string {
  return path.join(getSocketDir(), `${SESSION}.pid`);
}

function cleanupDaemon(): void {
  const pidFile = getPidFile();
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
}

describe('CLI daemon management', () => {
  beforeAll(() => {
    cleanupDaemon();
  });

  afterAll(() => {
    cleanupDaemon();
  });

  it('should start daemon and not block on open command', async () => {
    const result = await runCli(['open', 'about:blank'], 15000);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('blank');
  });

  it('should reuse existing daemon for subsequent commands', async () => {
    // First command should start daemon
    const result1 = await runCli(['open', 'about:blank'], 15000);
    expect(result1.code).toBe(0);

    // Wait a bit for daemon to be fully ready
    await new Promise((r) => setTimeout(r, 500));

    // Second command should reuse daemon (should be fast)
    const result2 = await runCli(['get', 'url'], 5000);
    if (result2.code !== 0) {
      console.log('stderr:', result2.stderr);
      console.log('stdout:', result2.stdout);
    }
    expect(result2.code).toBe(0);
    expect(result2.stdout).toContain('about:blank');
  });

  it('should close browser and daemon properly', async () => {
    // Start daemon
    const result1 = await runCli(['open', 'about:blank'], 15000);
    expect(result1.code).toBe(0);

    // Close browser
    const result2 = await runCli(['close'], 5000);
    expect(result2.code).toBe(0);

    // Daemon should still be running (can accept new open)
    const result3 = await runCli(['open', 'about:blank'], 15000);
    expect(result3.code).toBe(0);
  });

  it('should handle multiple rapid commands', async () => {
    // Start daemon
    await runCli(['open', 'about:blank'], 15000);

    // Send multiple commands rapidly
    const results = await Promise.all([
      runCli(['get', 'url'], 5000),
      runCli(['get', 'url'], 5000),
      runCli(['get', 'url'], 5000),
    ]);

    for (const result of results) {
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('about:blank');
    }
  });
});
