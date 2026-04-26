import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { listSessions } from '../cli/connection.js';

describe('listSessions stale PID cleanup', () => {
  const tempDir = path.join(os.tmpdir(), `agent-browser-test-sessions-${Date.now()}`);
  let originalSocketDir: string | undefined;

  beforeAll(() => {
    fs.mkdirSync(tempDir, { recursive: true });
    originalSocketDir = process.env.AGENT_BROWSER_SOCKET_DIR;
    process.env.AGENT_BROWSER_SOCKET_DIR = tempDir;
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (originalSocketDir !== undefined) {
      process.env.AGENT_BROWSER_SOCKET_DIR = originalSocketDir;
    } else {
      delete process.env.AGENT_BROWSER_SOCKET_DIR;
    }
  });

  it('should clean up PID files for dead processes', async () => {
    const deadPidPath = path.join(tempDir, 'dead-session.pid');
    fs.writeFileSync(deadPidPath, '999999999');
    expect(fs.existsSync(deadPidPath)).toBe(true);

    const sessions = await listSessions();

    expect(sessions).not.toContain('dead-session');
    expect(fs.existsSync(deadPidPath)).toBe(false);
  });

  it('should return sessions for running processes', async () => {
    const alivePidPath = path.join(tempDir, 'alive-session.pid');
    fs.writeFileSync(alivePidPath, process.pid.toString());

    const sessions = await listSessions();

    expect(sessions).toContain('alive-session');
    expect(fs.existsSync(alivePidPath)).toBe(true);

    fs.unlinkSync(alivePidPath);
  });

  it('should handle corrupted PID files gracefully', async () => {
    const corruptPidPath = path.join(tempDir, 'corrupt-session.pid');
    fs.writeFileSync(corruptPidPath, 'not-a-number');

    const sessions = await listSessions();

    expect(sessions).not.toContain('corrupt-session');
    expect(fs.existsSync(corruptPidPath)).toBe(false);
  });

  it('should return empty array when socket dir does not exist', async () => {
    const nonExistentDir = path.join(os.tmpdir(), 'nonexistent-dir-' + Date.now());
    process.env.AGENT_BROWSER_SOCKET_DIR = nonExistentDir;

    const sessions = await listSessions();
    expect(sessions).toEqual([]);

    process.env.AGENT_BROWSER_SOCKET_DIR = tempDir;
  });

  it('should skip stream-server.pid file', async () => {
    const streamPidPath = path.join(tempDir, 'stream-server.pid');
    fs.writeFileSync(streamPidPath, process.pid.toString());

    const sessions = await listSessions();

    expect(sessions).not.toContain('stream-server');
    expect(fs.existsSync(streamPidPath)).toBe(true);

    fs.unlinkSync(streamPidPath);
  });
});
