import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { BrowserManager } from './browser.js';
import { IOSManager } from './ios-manager.js';
import { parseCommand, serializeResponse, errorResponse, successResponse } from './protocol.js';
import { executeCommand } from './actions.js';
import { executeIOSCommand } from './ios-actions.js';
import { StreamServerProxy, getStreamServerIpcPath } from './stream-server.js';

type Manager = BrowserManager | IOSManager;

const isWindows = process.platform === 'win32';

let currentSession = process.env.AGENT_BROWSER_SESSION || 'default';
let currentInstanceId = randomUUID().substring(0, 8);

let streamServerProxy: StreamServerProxy | null = null;

const STREAM_SERVER_PID_FILE = 'stream-server.pid';

const INPUT_FILL_DEBOUNCE_MS = 60;
const inputFillDebounceMap = new Map<
  string,
  { timer: ReturnType<typeof setTimeout>; text: string; id: string }
>();

function debounceInputFill(
  socket: net.Socket,
  manager: BrowserManager,
  id: string,
  selector: string,
  text: string
): void {
  const key = selector || '__global__';
  const existing = inputFillDebounceMap.get(key);

  if (existing) {
    clearTimeout(existing.timer);
    existing.text = text;
    existing.id = id;
  }

  const entry = existing ?? { timer: null as unknown as ReturnType<typeof setTimeout>, text, id };
  entry.timer = setTimeout(async () => {
    inputFillDebounceMap.delete(key);
    try {
      await manager.fillValue(selector, entry.text);
      socket.write(
        serializeResponse(successResponse(entry.id, { filled: true, selector, text: entry.text })) +
          '\n'
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      socket.write(serializeResponse(errorResponse(entry.id, message)) + '\n');
    }
  }, INPUT_FILL_DEBOUNCE_MS);

  inputFillDebounceMap.set(key, entry);
}

/**
 * Set the current session
 */
export function setSession(session: string): void {
  currentSession = session;
}

/**
 * Get the current session
 */
export function getSession(): string {
  return currentSession;
}

/**
 * Get the current instance ID
 */
export function getInstanceId(): string {
  return currentInstanceId;
}

/**
 * Get port number for TCP mode (Windows)
 * Uses a hash of the session name to get a consistent port
 */
function getPortForSession(session: string): number {
  let hash = 0;
  for (let i = 0; i < session.length; i++) {
    hash = (hash << 5) - hash + session.charCodeAt(i);
    hash |= 0;
  }
  // Port range 49152-65535 (dynamic/private ports)
  return 49152 + (Math.abs(hash) % 16383);
}

/**
 * Get the base directory for socket/pid files.
 * Priority: AGENT_BROWSER_SOCKET_DIR > XDG_RUNTIME_DIR > ~/.agent-browser > tmpdir
 */
export function getAppDir(): string {
  // 1. XDG_RUNTIME_DIR (Linux standard)
  if (process.env.XDG_RUNTIME_DIR) {
    return path.join(process.env.XDG_RUNTIME_DIR, 'agent-browser');
  }

  // 2. Home directory fallback (like Docker Desktop's ~/.docker/run/)
  const homeDir = os.homedir();
  if (homeDir) {
    return path.join(homeDir, '.agent-browser');
  }

  // 3. Last resort: temp dir
  return path.join(os.tmpdir(), 'agent-browser');
}

export function getSocketDir(): string {
  // Allow explicit override for socket directory
  if (process.env.AGENT_BROWSER_SOCKET_DIR) {
    return process.env.AGENT_BROWSER_SOCKET_DIR;
  }
  return getAppDir();
}

/**
 * Get the socket path for the current session (Unix) or port (Windows)
 */
export function getSocketPath(session?: string): string {
  const sess = session ?? currentSession;
  if (isWindows) {
    return String(getPortForSession(sess));
  }
  return path.join(getSocketDir(), `${sess}.sock`);
}

/**
 * Get the port file path for Windows (stores the port number)
 */
export function getPortFile(session?: string): string {
  const sess = session ?? currentSession;
  return path.join(getSocketDir(), `${sess}.port`);
}

/**
 * Get the PID file path for the current session
 */
export function getPidFile(session?: string): string {
  const sess = session ?? currentSession;
  return path.join(getSocketDir(), `${sess}.pid`);
}

/**
 * Check if daemon socket is ready to accept connections
 */
async function isDaemonReady(session?: string): Promise<boolean> {
  const connectionInfo = getConnectionInfo(session);

  return new Promise((resolve) => {
    let socket: net.Socket;
    try {
      if (connectionInfo.type === 'unix' && connectionInfo.path) {
        socket = net.createConnection({ path: connectionInfo.path });
      } else if (connectionInfo.type === 'tcp' && connectionInfo.port) {
        socket = net.createConnection({ port: connectionInfo.port, host: '127.0.0.1' });
      } else {
        resolve(false);
        return;
      }
    } catch {
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
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Check if daemon is running for the current session
 */
export async function isDaemonRunning(session?: string): Promise<boolean> {
  const pidFile = getPidFile(session);
  if (!fs.existsSync(pidFile)) return false;

  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    process.kill(pid, 0);

    if (!(await isDaemonReady(session))) {
      cleanupSocket(session);
      return false;
    }

    return true;
  } catch {
    cleanupSocket(session);
    return false;
  }
}

/**
 * Get connection info for the current session
 * Returns { type: 'unix', path: string } or { type: 'tcp', port: number }
 */
export function getConnectionInfo(
  session?: string
): { type: 'unix'; path: string } | { type: 'tcp'; port: number } {
  const sess = session ?? currentSession;
  if (isWindows) {
    return { type: 'tcp', port: getPortForSession(sess) };
  }
  return { type: 'unix', path: path.join(getSocketDir(), `${sess}.sock`) };
}

/**
 * Clean up socket and PID file for the current session
 */
export function cleanupSocket(session?: string): void {
  const pidFile = getPidFile(session);
  const streamPortFile = getStreamPortFile(session);
  try {
    if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
    if (fs.existsSync(streamPortFile)) fs.unlinkSync(streamPortFile);
    if (isWindows) {
      const portFile = getPortFile(session);
      if (fs.existsSync(portFile)) fs.unlinkSync(portFile);
    } else {
      const socketPath = getSocketPath(session);
      if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
    }
  } catch {
    // Ignore cleanup errors
  }
}

export function getStreamPortFile(session?: string): string {
  const sess = session ?? currentSession;
  return path.join(getSocketDir(), `${sess}.stream`);
}

export function getStreamServerPidFile(): string {
  return path.join(getSocketDir(), STREAM_SERVER_PID_FILE);
}

export async function startDaemon(options?: { provider?: string }): Promise<void> {
  const socketDir = getSocketDir();
  if (!fs.existsSync(socketDir)) {
    fs.mkdirSync(socketDir, { recursive: true });
  }

  cleanupSocket();

  const provider = options?.provider ?? process.env.AGENT_BROWSER_PROVIDER;
  const isIOS = provider === 'ios';

  const manager: Manager = isIOS ? new IOSManager() : new BrowserManager();
  let shuttingDown = false;

  if (!isIOS && manager instanceof BrowserManager) {
    const ipcPath = getStreamServerIpcPath();
    if (fs.existsSync(ipcPath)) {
      streamServerProxy = new StreamServerProxy(manager);
      try {
        await streamServerProxy.connect();
        console.log('[Daemon] Connected to Stream Server');
      } catch (err) {
        console.error('[Daemon] Failed to connect to Stream Server:', err);
        streamServerProxy = null;
      }
    } else {
      console.log(
        '[Daemon] Stream Server not running, viewer unavailable (use `agent-browser viewer` to start)'
      );
    }
  }

  const server = net.createServer((socket) => {
    let buffer = '';
    let httpChecked = false;

    socket.on('data', async (data) => {
      buffer += data.toString();

      // Security: Detect and reject HTTP requests to prevent cross-origin attacks.
      // Browsers using fetch() must send HTTP headers (e.g., "POST / HTTP/1.1"),
      // while legitimate clients send raw JSON starting with "{".
      if (!httpChecked) {
        httpChecked = true;
        const trimmed = buffer.trimStart();
        if (/^(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH|CONNECT|TRACE)\s/i.test(trimmed)) {
          socket.destroy();
          return;
        }
      }

      // Process complete lines
      while (buffer.includes('\n')) {
        const newlineIdx = buffer.indexOf('\n');
        const line = buffer.substring(0, newlineIdx);
        buffer = buffer.substring(newlineIdx + 1);

        if (!line.trim()) continue;

        // Handle custom actions before schema validation (not in standard Zod union)
        // Viewer sends messages with 'type' field, standalone commands use 'action' field.
        // Normalize to support both.
        if (line.trim()) {
          try {
            const quickParse = JSON.parse(line);
            const action = quickParse.action || quickParse.type;
            if (
              quickParse &&
              action === 'inject_focus_listener' &&
              manager instanceof BrowserManager
            ) {
              try {
                await manager.injectFocusListener((data) => {
                  try {
                    socket.write(JSON.stringify(data) + '\n');
                  } catch (_) {}
                });
                socket.write(
                  serializeResponse(successResponse(quickParse.id, { injected: true })) + '\n'
                );
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                socket.write(serializeResponse(errorResponse(quickParse.id, message)) + '\n');
              }
              continue;
            }

            if (quickParse && action === 'input_fill' && manager instanceof BrowserManager) {
              const selector = quickParse.selector || '';
              const text = quickParse.text || '';
              debounceInputFill(socket, manager, String(quickParse.id), selector, text);
              continue;
            }

            if (
              quickParse &&
              (action === 'blur_element' || action === 'input_blur_element') &&
              manager instanceof BrowserManager
            ) {
              try {
                const selector = quickParse.selector || '';
                await manager.blurElement(selector);
                socket.write(
                  serializeResponse(successResponse(quickParse.id, { blurred: true, selector })) +
                    '\n'
                );
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                socket.write(serializeResponse(errorResponse(quickParse.id, message)) + '\n');
              }
              continue;
            }

            if (quickParse && action === 'input_mouse' && manager instanceof BrowserManager) {
              try {
                await manager.injectMouseEvent({
                  type: quickParse.eventType,
                  x: quickParse.x ?? 0,
                  y: quickParse.y ?? 0,
                  button: quickParse.button,
                  clickCount: quickParse.clickCount,
                  deltaX: quickParse.deltaX,
                  deltaY: quickParse.deltaY,
                  modifiers: quickParse.modifiers,
                });
                socket.write(
                  serializeResponse(successResponse(quickParse.id, { injected: true })) + '\n'
                );
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                socket.write(serializeResponse(errorResponse(quickParse.id, message)) + '\n');
              }
              continue;
            }

            if (quickParse && action === 'input_keyboard' && manager instanceof BrowserManager) {
              try {
                await manager.injectKeyboardEvent({
                  type: quickParse.eventType,
                  key: quickParse.key,
                  code: quickParse.code,
                  text: quickParse.text,
                  modifiers: quickParse.modifiers,
                });
                socket.write(
                  serializeResponse(successResponse(quickParse.id, { injected: true })) + '\n'
                );
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                socket.write(serializeResponse(errorResponse(quickParse.id, message)) + '\n');
              }
              continue;
            }

            if (
              quickParse &&
              action === 'keyboard_insert_text' &&
              manager instanceof BrowserManager
            ) {
              try {
                const text = quickParse.text || '';
                await manager.insertText(text);
                socket.write(
                  serializeResponse(successResponse(quickParse.id, { inserted: true })) + '\n'
                );
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                socket.write(serializeResponse(errorResponse(quickParse.id, message)) + '\n');
              }
              continue;
            }
          } catch (_) {
            /* not JSON, fall through to normal parsing */
          }
        }

        try {
          const parseResult = parseCommand(line);

          if (!parseResult.success) {
            const resp = errorResponse(parseResult.id ?? 'unknown', parseResult.error);
            socket.write(serializeResponse(resp) + '\n');
            continue;
          }

          // Handle device_list specially - it works without a session and always uses IOSManager
          if (parseResult.command.action === 'device_list') {
            const iosManager = new IOSManager();
            try {
              const devices = await iosManager.listAllDevices();
              const response = {
                id: parseResult.command.id,
                success: true as const,
                data: { devices },
              };
              socket.write(serializeResponse(response) + '\n');
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              socket.write(
                serializeResponse(errorResponse(parseResult.command.id, message)) + '\n'
              );
            }
            continue;
          }

          // Auto-launch if not already launched and this isn't a launch/close command
          if (
            !manager.isLaunched() &&
            parseResult.command.action !== 'launch' &&
            parseResult.command.action !== 'close'
          ) {
            if (isIOS && manager instanceof IOSManager) {
              // Auto-launch iOS Safari
              // Check for device in command first (for reused daemons), then fall back to env vars
              const cmd = parseResult.command as { iosDevice?: string };
              const iosDevice = cmd.iosDevice || process.env.AGENT_BROWSER_IOS_DEVICE;
              await manager.launch({
                device: iosDevice,
                udid: process.env.AGENT_BROWSER_IOS_UDID,
              });
            } else if (manager instanceof BrowserManager) {
              // Auto-launch desktop browser
              const extensions = process.env.AGENT_BROWSER_EXTENSIONS
                ? process.env.AGENT_BROWSER_EXTENSIONS.split(',')
                    .map((p) => p.trim())
                    .filter(Boolean)
                : undefined;

              // Parse args from env (comma or newline separated)
              const argsEnv = process.env.AGENT_BROWSER_ARGS;
              const args = argsEnv
                ? argsEnv
                    .split(/[,\n]/)
                    .map((a) => a.trim())
                    .filter((a) => a.length > 0)
                : undefined;

              // Parse proxy from env
              const proxyServer = process.env.AGENT_BROWSER_PROXY;
              const proxyBypass = process.env.AGENT_BROWSER_PROXY_BYPASS;
              const proxy = proxyServer
                ? {
                    server: proxyServer,
                    ...(proxyBypass && { bypass: proxyBypass }),
                  }
                : undefined;

              const ignoreHTTPSErrors = process.env.AGENT_BROWSER_IGNORE_HTTPS_ERRORS === '1';
              const allowFileAccess = process.env.AGENT_BROWSER_ALLOW_FILE_ACCESS === '1';
              await manager.launch({
                id: 'auto',
                action: 'launch' as const,
                headless: process.env.AGENT_BROWSER_HEADED !== '1',
                executablePath: process.env.AGENT_BROWSER_EXECUTABLE_PATH,
                extensions: extensions,
                profile: process.env.AGENT_BROWSER_PROFILE,
                storageState: process.env.AGENT_BROWSER_STATE,
                args,
                userAgent: process.env.AGENT_BROWSER_USER_AGENT,
                proxy,
                ignoreHTTPSErrors: ignoreHTTPSErrors,
                allowFileAccess: allowFileAccess,
              });
            }
          }

          // Handle close command specially - shuts down daemon
          if (parseResult.command.action === 'close') {
            const response =
              isIOS && manager instanceof IOSManager
                ? await executeIOSCommand(parseResult.command, manager)
                : await executeCommand(parseResult.command, manager as BrowserManager);
            socket.write(serializeResponse(response) + '\n');

            if (!shuttingDown) {
              shuttingDown = true;
              // 先断开 StreamServer 连接，发送 unregister 消息
              if (streamServerProxy) {
                await streamServerProxy.disconnect();
                streamServerProxy = null;
              }
              setTimeout(() => {
                server.close();
                cleanupSocket();
                process.exit(0);
              }, 100);
            }
            return;
          }

          // Handle inject_focus_listener: set up focus event bridge to stream-server
          if (
            parseResult.command.action === 'inject_focus_listener' &&
            manager instanceof BrowserManager
          ) {
            try {
              await manager.injectFocusListener((data) => {
                try {
                  socket.write(JSON.stringify(data) + '\n');
                } catch (_) {}
              });
              socket.write(
                serializeResponse(successResponse(parseResult.command.id, { injected: true })) +
                  '\n'
              );
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              socket.write(
                serializeResponse(errorResponse(parseResult.command.id, message)) + '\n'
              );
            }
            continue;
          }

          // Execute command with appropriate handler
          const response =
            isIOS && manager instanceof IOSManager
              ? await executeIOSCommand(parseResult.command, manager)
              : await executeCommand(parseResult.command, manager as BrowserManager);

          socket.write(serializeResponse(response) + '\n');
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          socket.write(serializeResponse(errorResponse('error', message)) + '\n');
        }
      }
    });

    socket.on('error', () => {
      // Client disconnected, ignore
    });
  });

  const pidFile = getPidFile();

  // Write PID file before listening
  fs.writeFileSync(pidFile, process.pid.toString());

  if (isWindows) {
    // Windows: use TCP socket on localhost
    const port = getPortForSession(currentSession);
    const portFile = getPortFile();
    fs.writeFileSync(portFile, port.toString());
    server.listen(port, '127.0.0.1', () => {
      // Daemon is ready on TCP port
    });
  } else {
    // Unix: use Unix domain socket
    const socketPath = getSocketPath();
    server.listen(socketPath, () => {
      // Daemon is ready
    });
  }

  server.on('error', (err) => {
    console.error('Server error:', err);
    cleanupSocket();
    process.exit(1);
  });

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    if (streamServerProxy) {
      await streamServerProxy.disconnect();
      streamServerProxy = null;
    }

    await manager.close();
    server.close();
    cleanupSocket();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown);

  // Handle unexpected errors - always cleanup
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    cleanupSocket();
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
    cleanupSocket();
    process.exit(1);
  });

  // Cleanup on normal exit
  process.on('exit', () => {
    cleanupSocket();
  });

  // Keep process alive
  process.stdin.resume();
}

// Run daemon if this is the entry point
if (process.argv[1]?.endsWith('daemon.js') || process.env.AGENT_BROWSER_DAEMON === '1') {
  startDaemon().catch((err) => {
    console.error('Daemon error:', err);
    cleanupSocket();
    process.exit(1);
  });
}
