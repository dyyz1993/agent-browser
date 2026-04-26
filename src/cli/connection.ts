import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn, exec } from 'child_process';

export interface Command {
  id: string;
  action: string;
  [key: string]: unknown;
}

export interface Response {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
  tips?: string | string[];
}

export interface ConnectionInfo {
  type: 'unix' | 'tcp';
  path?: string;
  port?: number;
}

export interface DaemonOptions {
  session: string;
  headed?: boolean;
  executablePath?: string;
  extensions?: string[];
  args?: string;
  userAgent?: string;
  proxy?: string;
  proxyBypass?: string;
  ignoreHttpsErrors?: boolean;
  allowFileAccess?: boolean;
  profile?: string;
  state?: string;
  provider?: string;
  device?: string;
}

const isWindows = process.platform === 'win32';
const STREAM_SERVER_PID_FILE = 'stream-server.pid';
const STREAM_SERVER_IPC_FILE = 'stream-server.ipc';

export function genId(): string {
  return `n${Date.now() % 1000000}`;
}

function getPortForSession(session: string): number {
  let hash = 0;
  for (let i = 0; i < session.length; i++) {
    hash = (hash << 5) - hash + session.charCodeAt(i);
    hash |= 0;
  }
  return 49152 + (Math.abs(hash) % 16383);
}

export function getSocketDir(): string {
  if (process.env.AGENT_BROWSER_SOCKET_DIR) {
    return process.env.AGENT_BROWSER_SOCKET_DIR;
  }
  if (process.env.XDG_RUNTIME_DIR) {
    return path.join(process.env.XDG_RUNTIME_DIR, 'agent-browser');
  }
  const homeDir = os.homedir();
  if (homeDir) {
    return path.join(homeDir, '.agent-browser');
  }
  return path.join(os.tmpdir(), 'agent-browser');
}

function getSocketPath(session: string): string {
  return path.join(getSocketDir(), `${session}.sock`);
}

function getPidPath(session: string): string {
  return path.join(getSocketDir(), `${session}.pid`);
}

function getPortPath(session: string): string {
  return path.join(getSocketDir(), `${session}.port`);
}

export function getConnectionInfo(session: string): ConnectionInfo {
  if (isWindows) {
    return { type: 'tcp', port: getPortForSession(session) };
  }
  return { type: 'unix', path: getSocketPath(session) };
}

function cleanupStaleFiles(session: string): void {
  const pidPath = getPidPath(session);
  try {
    if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath);
  } catch {}

  // Clean up lock file
  const lockPath = getLockPath(session);
  try {
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
  } catch {}

  if (isWindows) {
    const portPath = getPortPath(session);
    try {
      if (fs.existsSync(portPath)) fs.unlinkSync(portPath);
    } catch {}
  } else {
    const socketPath = getSocketPath(session);
    try {
      if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
    } catch {}
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getLockPath(session: string): string {
  return path.join(getSocketDir(), `${session}.lock`);
}

async function acquireLock(session: string, timeoutMs: number = 10000): Promise<void> {
  const lockPath = getLockPath(session);
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeSync(fd, `${process.pid}\n`);
      fs.closeSync(fd);
      return;
    } catch (e: any) {
      if (e.code === 'EEXIST') {
        const lockAge = Date.now() - (fs.statSync(lockPath).mtimeMs || 0);
        if (lockAge > 30000) {
          try {
            fs.unlinkSync(lockPath);
          } catch {}
        }
        await sleep(50);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`Timeout acquiring lock for session ${session}`);
}

function releaseLock(session: string): void {
  const lockPath = getLockPath(session);
  try {
    fs.unlinkSync(lockPath);
  } catch {}
}

async function withLock<T>(session: string, fn: () => Promise<T>): Promise<T> {
  await acquireLock(session);
  try {
    return await fn();
  } finally {
    releaseLock(session);
  }
}

function isDaemonProcessRunning(session: string): boolean {
  const pidPath = getPidPath(session);
  if (!fs.existsSync(pidPath)) return false;

  try {
    const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
    return isProcessRunning(pid);
  } catch {
    return false;
  }
}

function isDaemonReady(session: string): Promise<boolean> {
  return new Promise((resolve) => {
    const connectionInfo = getConnectionInfo(session);
    let socket: net.Socket;

    if (connectionInfo.type === 'unix' && connectionInfo.path) {
      socket = net.createConnection({ path: connectionInfo.path });
    } else if (connectionInfo.type === 'tcp' && connectionInfo.port) {
      socket = net.createConnection({ port: connectionInfo.port, host: '127.0.0.1' });
    } else {
      resolve(false);
      return;
    }

    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 100);

    socket.on('connect', () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

function getStreamPortPath(session: string): string {
  return path.join(getSocketDir(), `${session}.stream`);
}

function hasStreamPort(session: string): boolean {
  const streamPortPath = getStreamPortPath(session);
  return fs.existsSync(streamPortPath);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface DaemonResult {
  alreadyRunning: boolean;
}

function getStreamServerPidPath(): string {
  return path.join(getSocketDir(), STREAM_SERVER_PID_FILE);
}

function getStreamServerIpcPath(): string {
  return path.join(getSocketDir(), STREAM_SERVER_IPC_FILE);
}

function isStreamServerRunning(): boolean {
  const pidPath = getStreamServerPidPath();
  if (!fs.existsSync(pidPath)) return false;

  try {
    const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
    return isProcessRunning(pid);
  } catch {
    return false;
  }
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    const check = (host: string) => {
      const server = net.createServer();
      server.once('error', () => {
        if (!resolved) {
          resolved = true;
          resolve(true);
        }
      });
      server.once('listening', () => {
        server.close();
      });
      server.listen(port, host);
    };

    check('127.0.0.1');
    check('::1');

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    }, 100);
  });
}

async function checkStreamServerPort(): Promise<boolean> {
  const port = parseInt(process.env.AGENT_BROWSER_STREAM_PORT || '5005', 10);
  return isPortInUse(port);
}

export async function ensureStreamServer(): Promise<boolean> {
  const port = parseInt(process.env.AGENT_BROWSER_STREAM_PORT || '5005', 10);

  if (isStreamServerRunning()) {
    return true;
  }

  const portInUse = await checkStreamServerPort();
  if (portInUse) {
    console.log(`[CLI] Stream Server port ${port} already in use, assuming server is running`);
    return true;
  }

  const socketDir = getSocketDir();
  if (!fs.existsSync(socketDir)) {
    fs.mkdirSync(socketDir, { recursive: true });
  }

  const exePath = fs.realpathSync(process.argv[1] || '');
  const exeDir = path.dirname(exePath);
  const streamServerPaths = [
    path.join(exeDir, 'stream-server-standalone.js'),
    path.join(exeDir, '../dist/stream-server-standalone.js'),
    path.join(process.cwd(), 'dist/stream-server-standalone.js'),
  ];

  if (process.env.AGENT_BROWSER_HOME) {
    streamServerPaths.unshift(
      path.join(process.env.AGENT_BROWSER_HOME, 'dist/stream-server-standalone.js'),
      path.join(process.env.AGENT_BROWSER_HOME, 'stream-server-standalone.js')
    );
  }

  const streamServerPath = streamServerPaths.find((p) => fs.existsSync(p));
  if (!streamServerPath) {
    console.log('[CLI] Stream Server standalone not found, viewer will be unavailable');
    return false;
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    AGENT_BROWSER_STREAM_SERVER: '1',
  };

  const streamServer = spawn('node', [streamServerPath], {
    detached: true,
    stdio: 'ignore',
    env,
  });

  streamServer.unref();

  for (let i = 0; i < 30; i++) {
    await sleep(100);
    if (isStreamServerRunning()) {
      console.log('[CLI] Stream Server started');
      return true;
    }
  }

  const portNowInUse = await checkStreamServerPort();
  if (portNowInUse) {
    console.log('[CLI] Stream Server port in use, assuming server started');
    return true;
  }

  console.log('[CLI] Stream Server failed to start. Run `agent-browser viewer` when needed.');
  return false;
}

export async function ensureDaemon(options: DaemonOptions): Promise<DaemonResult> {
  const session = options.session;

  if (isDaemonProcessRunning(session) && (await isDaemonReady(session))) {
    await sleep(150);
    if (await isDaemonReady(session)) {
      return { alreadyRunning: true };
    }
  }

  return withLock(session, async () => {
    if (isDaemonProcessRunning(session) && (await isDaemonReady(session))) {
      return { alreadyRunning: true };
    }

    cleanupStaleFiles(session);

    const socketDir = getSocketDir();
    if (!fs.existsSync(socketDir)) {
      fs.mkdirSync(socketDir, { recursive: true });
    }

    if (!isWindows) {
      const socketPath = getSocketPath(session);
      if (socketPath.length > 103) {
        throw new Error(
          `Session name '${session}' is too long. Socket path would be ${socketPath.length} bytes (max 103).`
        );
      }
    }

    const testFile = path.join(socketDir, '.write_test');
    try {
      fs.writeFileSync(testFile, '');
      fs.unlinkSync(testFile);
    } catch (e) {
      throw new Error(`Socket directory '${socketDir}' is not writable: ${e}`);
    }

    await ensureStreamServer();

    const exePath = fs.realpathSync(process.argv[1] || '');
    const exeDir = path.dirname(exePath);
    const daemonPaths = [
      path.join(exeDir, 'daemon.js'),
      path.join(exeDir, '../dist/daemon.js'),
      path.join(process.cwd(), 'dist/daemon.js'),
    ];

    if (process.env.AGENT_BROWSER_HOME) {
      daemonPaths.unshift(
        path.join(process.env.AGENT_BROWSER_HOME, 'dist/daemon.js'),
        path.join(process.env.AGENT_BROWSER_HOME, 'daemon.js')
      );
    }

    const daemonPath = daemonPaths.find((p) => fs.existsSync(p));
    if (!daemonPath) {
      throw new Error('Daemon not found. Set AGENT_BROWSER_HOME environment variable.');
    }

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      AGENT_BROWSER_DAEMON: '1',
      AGENT_BROWSER_SESSION: session,
    };

    if (options.headed) env.AGENT_BROWSER_HEADED = '1';
    if (options.executablePath) env.AGENT_BROWSER_EXECUTABLE_PATH = options.executablePath;
    if (options.extensions?.length) env.AGENT_BROWSER_EXTENSIONS = options.extensions.join(',');
    if (options.args) env.AGENT_BROWSER_ARGS = options.args;
    if (options.userAgent) env.AGENT_BROWSER_USER_AGENT = options.userAgent;
    if (options.proxy) env.AGENT_BROWSER_PROXY = options.proxy;
    if (options.proxyBypass) env.AGENT_BROWSER_PROXY_BYPASS = options.proxyBypass;
    if (options.ignoreHttpsErrors) env.AGENT_BROWSER_IGNORE_HTTPS_ERRORS = '1';
    if (options.allowFileAccess) env.AGENT_BROWSER_ALLOW_FILE_ACCESS = '1';
    if (options.profile) env.AGENT_BROWSER_PROFILE = options.profile;
    if (options.state) env.AGENT_BROWSER_STATE = options.state;
    if (options.provider) env.AGENT_BROWSER_PROVIDER = options.provider;
    if (options.device) env.AGENT_BROWSER_IOS_DEVICE = options.device;

    const logFile = path.join(socketDir, `${session}.log`);
    const logStream = fs.openSync(logFile, 'a');

    const daemon = spawn('node', [daemonPath], {
      detached: true,
      stdio: ['ignore', logStream, logStream],
      env,
    });

    daemon.unref();

    for (let i = 0; i < 50; i++) {
      await sleep(100);
      if (await isDaemonReady(session)) {
        return { alreadyRunning: false };
      }
    }

    throw new Error(`Daemon failed to start (socket: ${getSocketDir()}/${session}.sock)`);
  });
}

function isTransientError(error: string): boolean {
  return (
    error.includes('os error 35') ||
    error.includes('os error 11') ||
    error.includes('EAGAIN') ||
    error.includes('WouldBlock') ||
    error.includes('Resource temporarily unavailable') ||
    error.includes('EOF') ||
    error.includes('line 1 column 0') ||
    error.includes('Connection reset') ||
    error.includes('Broken pipe') ||
    error.includes('os error 54') ||
    error.includes('os error 104') ||
    error.includes('os error 2') ||
    error.includes('ENOENT') ||
    error.includes('os error 61') ||
    error.includes('ECONNREFUSED') ||
    error.includes('os error 111')
  );
}

function connect(session: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const connectionInfo = getConnectionInfo(session);
    let socket: net.Socket;

    if (connectionInfo.type === 'unix' && connectionInfo.path) {
      socket = net.createConnection({ path: connectionInfo.path });
    } else if (connectionInfo.type === 'tcp' && connectionInfo.port) {
      socket = net.createConnection({ port: connectionInfo.port, host: '127.0.0.1' });
    } else {
      reject(new Error('Invalid connection info'));
      return;
    }

    socket.on('connect', () => resolve(socket));
    socket.on('error', (err) => reject(err));
  });
}

function sendCommandOnce(cmd: Command, session: string): Promise<Response> {
  return new Promise(async (resolve, reject) => {
    let socket: net.Socket;
    try {
      socket = await connect(session);
    } catch (e) {
      reject(e);
      return;
    }

    socket.setTimeout(30000);

    let buffer = '';
    socket.on('data', (data) => {
      buffer += data.toString();
      if (buffer.includes('\n')) {
        try {
          const response = JSON.parse(buffer.trim());
          socket.end();
          resolve(response);
        } catch {
          socket.end();
          reject(new Error('Invalid response'));
        }
      }
    });

    socket.on('error', (err) => reject(err));
    socket.on('timeout', () => {
      socket.end();
      reject(new Error('Connection timeout'));
    });

    socket.write(JSON.stringify(cmd) + '\n');
  });
}

export async function sendCommand(cmd: Command, session: string): Promise<Response> {
  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 200;

  let lastError = '';

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAY_MS * attempt);
    }

    try {
      const response = await sendCommandOnce(cmd, session);
      return response;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      if (isTransientError(errorMsg)) {
        lastError = errorMsg;
        continue;
      }
      throw e;
    }
  }

  throw new Error(
    `${lastError} (after ${MAX_RETRIES} retries - daemon may be busy or unresponsive)`
  );
}

export async function listSessions(): Promise<string[]> {
  const socketDir = getSocketDir();
  const sessions: string[] = [];

  if (!fs.existsSync(socketDir)) return sessions;

  const entries = fs.readdirSync(socketDir);
  for (const name of entries) {
    if (name.endsWith('.pid') && name !== STREAM_SERVER_PID_FILE) {
      const sessionName = name.replace('.pid', '');
      const pidPath = path.join(socketDir, name);
      try {
        const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
        if (isProcessRunning(pid)) {
          sessions.push(sessionName);
        } else {
          fs.unlinkSync(pidPath);
        }
      } catch {
        try {
          fs.unlinkSync(pidPath);
        } catch {}
      }
    }
  }

  return sessions;
}

export async function killDaemon(session: string): Promise<boolean> {
  const pidPath = getPidPath(session);

  if (!fs.existsSync(pidPath)) {
    return false;
  }

  try {
    const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);

    if (isProcessRunning(pid)) {
      process.kill(pid, 'SIGTERM');

      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (!isProcessRunning(pid)) {
          break;
        }
      }

      if (isProcessRunning(pid)) {
        process.kill(pid, 'SIGKILL');
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  } catch {}

  cleanupStaleFiles(session);

  const streamPortFile = path.join(getSocketDir(), `${session}.stream`);
  try {
    if (fs.existsSync(streamPortFile)) fs.unlinkSync(streamPortFile);
  } catch {}

  return true;
}

async function findProcessByPort(port: number): Promise<number | null> {
  return new Promise((resolve) => {
    exec(`lsof -i :${port} -t -sTCP:LISTEN 2>/dev/null`, (error: Error | null, stdout: string) => {
      if (error || !stdout.trim()) {
        resolve(null);
        return;
      }
      const pids = stdout.trim().split('\n');
      if (pids.length > 0) {
        const pid = parseInt(pids[0], 10);
        if (!isNaN(pid) && pid > 0) {
          resolve(pid);
          return;
        }
      }
      resolve(null);
    });
  });
}

export async function killStreamServer(): Promise<boolean> {
  const pidPath = getStreamServerPidPath();
  let pid: number | null = null;

  if (fs.existsSync(pidPath)) {
    try {
      pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
    } catch {}
  }

  if (!pid) {
    const port = parseInt(process.env.AGENT_BROWSER_STREAM_PORT || '5005', 10);
    pid = await findProcessByPort(port);
  }

  if (!pid) {
    return false;
  }

  try {
    if (isProcessRunning(pid)) {
      process.kill(pid, 'SIGTERM');

      for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (!isProcessRunning(pid!)) {
          break;
        }
      }

      if (isProcessRunning(pid!)) {
        process.kill(pid!, 'SIGKILL');
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  } catch {}

  try {
    if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath);
    const ipcPath = getStreamServerIpcPath();
    if (fs.existsSync(ipcPath)) fs.unlinkSync(ipcPath);
  } catch {}

  return true;
}

export async function killAll(): Promise<{ daemons: string[]; streamServer: boolean }> {
  const sessions = await listSessions();
  const killedDaemons: string[] = [];

  for (const session of sessions) {
    const killed = await killDaemon(session);
    if (killed) {
      killedDaemons.push(session);
    }
  }

  const killedStreamServer = await killStreamServer();

  // Clean up stale lock files and other residual files
  const socketDir = getSocketDir();
  if (fs.existsSync(socketDir)) {
    const entries = fs.readdirSync(socketDir);
    for (const name of entries) {
      // Clean up lock files
      if (name.endsWith('.lock')) {
        try {
          fs.unlinkSync(path.join(socketDir, name));
        } catch {}
      }
      // Clean up stale pid files (process not running)
      if (name.endsWith('.pid') && name !== STREAM_SERVER_PID_FILE) {
        const pidPath = path.join(socketDir, name);
        try {
          const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
          if (!isProcessRunning(pid)) {
            fs.unlinkSync(pidPath);
          }
        } catch {
          // If we can't read the pid, just remove the file
          try {
            fs.unlinkSync(pidPath);
          } catch {}
        }
      }
    }
  }

  return {
    daemons: killedDaemons,
    streamServer: killedStreamServer,
  };
}
