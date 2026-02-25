import { Response } from './connection.js';

interface RefInfo {
  role?: string;
  name?: string;
  xpath?: string;
  cssPath?: string;
  attributes?: Record<string, string>;
}

/**
 * 检查 refs 中是否有 path/attrs 信息需要显示
 */
function hasPathOrAttrs(refs: Record<string, RefInfo>): boolean {
  for (const ref of Object.values(refs)) {
    if (ref.xpath || ref.cssPath || ref.attributes) {
      return true;
    }
  }
  return false;
}

/**
 * 转义字符串中的特殊字符用于终端显示
 */
function truncatePath(path: string, maxLength: number = 60): string {
  if (path.length <= maxLength) return path;
  return path.substring(0, maxLength - 3) + '...';
}

/**
 * 在 snapshot 文本中内联显示 refs 的 xpath/cssPath/attributes 信息
 */
function enhanceSnapshotWithRefs(snapshot: string, refs: Record<string, RefInfo>): string {
  // 如果没有 path/attrs 信息，直接返回原 snapshot
  if (!hasPathOrAttrs(refs)) {
    return snapshot;
  }

  const lines = snapshot.split('\n');
  const enhancedLines: string[] = [];

  for (const line of lines) {
    // 匹配 [ref=e1] 或 [ref=e12] 等模式
    const refMatch = line.match(/\[ref=(e\d+)\]/);
    if (refMatch) {
      const refId = refMatch[1];
      const refInfo = refs[refId];

      if (refInfo) {
        const extras: string[] = [];

        // 添加 xpath（使用反引号避免引号冲突）
        if (refInfo.xpath) {
          extras.push(`xpath=\`${truncatePath(refInfo.xpath)}\``);
        }

        // 添加 cssPath
        if (refInfo.cssPath) {
          extras.push(`css=\`${truncatePath(refInfo.cssPath)}\``);
        }

        // 添加 attributes（只显示关键属性）
        if (refInfo.attributes && Object.keys(refInfo.attributes).length > 0) {
          const importantAttrs = ['id', 'name', 'type', 'placeholder', 'data-testid', 'aria-label'];
          const attrsToShow: string[] = [];

          for (const key of importantAttrs) {
            if (refInfo.attributes[key]) {
              attrsToShow.push(`${key}=\`${refInfo.attributes[key]}\``);
            }
          }

          // 如果没有重要属性，显示前 2 个属性
          if (attrsToShow.length === 0) {
            const keys = Object.keys(refInfo.attributes).slice(0, 2);
            for (const key of keys) {
              attrsToShow.push(`${key}=\`${refInfo.attributes[key]}\``);
            }
          }

          if (attrsToShow.length > 0) {
            extras.push(`attrs: ${attrsToShow.join(', ')}`);
          }
        }

        if (extras.length > 0) {
          // 在行尾添加额外信息（保持缩进格式）
          enhancedLines.push(line + ` {${extras.join(' | ')}}`);
        } else {
          enhancedLines.push(line);
        }
      } else {
        enhancedLines.push(line);
      }
    } else {
      enhancedLines.push(line);
    }
  }

  return enhancedLines.join('\n');
}

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function colorize(text: string, color: keyof typeof COLORS): string {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function successIndicator(): string {
  return colorize('✓', 'green');
}

function errorIndicator(): string {
  return colorize('✗', 'red');
}

function warningIndicator(): string {
  return colorize('⚠', 'yellow');
}

function bold(text: string): string {
  return colorize(text, 'bold');
}

function dim(text: string): string {
  return colorize(text, 'dim');
}

function green(text: string): string {
  return colorize(text, 'green');
}

function cyan(text: string): string {
  return colorize(text, 'cyan');
}

function consoleLevelPrefix(level: string): string {
  switch (level) {
    case 'error':
      return colorize('✗', 'red');
    case 'warn':
      return colorize('⚠', 'yellow');
    case 'info':
      return colorize('ℹ', 'cyan');
    default:
      return colorize('›', 'dim');
  }
}

export function printResponse(resp: Response, jsonMode: boolean, action?: string): void {
  if (jsonMode) {
    console.log(JSON.stringify(resp));
    return;
  }

  if (!resp.success) {
    console.error(`${errorIndicator()} ${resp.error || 'Unknown error'}`);
    return;
  }

  if (!resp.data) {
    console.log(`${successIndicator()} Done`);
    return;
  }

  const data = resp.data as Record<string, unknown>;

  if (data.body !== undefined) {
    console.log(JSON.stringify(data.body, null, 2));
    return;
  }

  if (data.url && typeof data.url === 'string') {
    if (data.title && typeof data.title === 'string') {
      console.log(`${successIndicator()} ${bold(data.title)}`);
      console.log(`  ${dim(data.url)}`);
      return;
    }
    console.log(data.url);
    return;
  }

  if (data.snapshot && typeof data.snapshot === 'string') {
    // 如果有 refs 且包含 path/attrs 信息，内联显示
    if (data.refs && typeof data.refs === 'object') {
      const enhancedSnapshot = enhanceSnapshotWithRefs(
        data.snapshot,
        data.refs as Record<string, RefInfo>
      );
      console.log(enhancedSnapshot);
    } else {
      console.log(data.snapshot);
    }
    return;
  }

  if (data.title && typeof data.title === 'string') {
    console.log(data.title);
    return;
  }

  if (data.text && typeof data.text === 'string') {
    console.log(data.text);
    return;
  }

  if (data.html && typeof data.html === 'string') {
    console.log(data.html);
    return;
  }

  if (data.value && typeof data.value === 'string') {
    console.log(data.value);
    return;
  }

  if (typeof data.count === 'number') {
    console.log(data.count);
    return;
  }

  if (typeof data.visible === 'boolean') {
    console.log(data.visible);
    return;
  }

  if (typeof data.enabled === 'boolean') {
    console.log(data.enabled);
    return;
  }

  if (typeof data.checked === 'boolean') {
    console.log(data.checked);
    return;
  }

  if (data.result !== undefined) {
    console.log(JSON.stringify(data.result, null, 2));
    return;
  }

  if (Array.isArray(data.devices)) {
    if (data.devices.length === 0) {
      console.log('No iOS devices available. Open Xcode to download simulator runtimes.');
      return;
    }

    const realDevices = data.devices.filter((d: Record<string, unknown>) => d.isRealDevice);
    const simulators = data.devices.filter((d: Record<string, unknown>) => !d.isRealDevice);

    if (realDevices.length > 0) {
      console.log('Connected Devices:\n');
      for (const device of realDevices) {
        const name = (device as Record<string, unknown>).name || 'Unknown';
        const runtime = (device as Record<string, unknown>).runtime || '';
        const udid = (device as Record<string, unknown>).udid || '';
        console.log(`  ${green('●')} ${name} (${runtime})`);
        console.log(`    ${dim(String(udid))}`);
      }
      console.log();
    }

    if (simulators.length > 0) {
      console.log('Simulators:\n');
      for (const device of simulators) {
        const name = (device as Record<string, unknown>).name || 'Unknown';
        const runtime = (device as Record<string, unknown>).runtime || '';
        const state = (device as Record<string, unknown>).state || 'Unknown';
        const udid = (device as Record<string, unknown>).udid || '';
        const stateIndicator = state === 'Booted' ? green('●') : dim('○');
        console.log(`  ${stateIndicator} ${name} (${runtime})`);
        console.log(`    ${dim(String(udid))}`);
      }
    }
    return;
  }

  if (Array.isArray(data.tabs)) {
    for (let i = 0; i < data.tabs.length; i++) {
      const tab = data.tabs[i] as Record<string, unknown>;
      const title = tab.title || 'Untitled';
      const url = tab.url || '';
      const active = tab.active;
      const marker = active ? cyan('→') : ' ';
      console.log(`${marker} [${i}] ${title} - ${url}`);
    }
    return;
  }

  if (Array.isArray(data.messages)) {
    for (const log of data.messages as Record<string, unknown>[]) {
      const level = (log.type as string) || 'log';
      const text = (log.text as string) || '';
      console.log(`${consoleLevelPrefix(level)} ${text}`);
    }
    return;
  }

  if (Array.isArray(data.errors)) {
    for (const err of data.errors as Record<string, unknown>[]) {
      const msg = (err.message as string) || '';
      console.log(`${errorIndicator()} ${msg}`);
    }
    return;
  }

  if (Array.isArray(data.cookies)) {
    for (const cookie of data.cookies as Record<string, unknown>[]) {
      const name = cookie.name || '';
      const value = cookie.value || '';
      console.log(`${name}=${value}`);
    }
    return;
  }

  if (Array.isArray(data.requests)) {
    if (data.requests.length === 0) {
      console.log('No requests captured');
    } else {
      for (const req of data.requests as Record<string, unknown>[]) {
        const method = req.method || 'GET';
        const url = req.url || '';
        const resourceType = req.resourceType || '';
        console.log(`${method} ${url} (${resourceType})`);
      }
    }
    return;
  }

  if (data.cleared === true) {
    console.log(`${successIndicator()} Request log cleared`);
    return;
  }

  if (data.box) {
    console.log(JSON.stringify(data.box, null, 2));
    return;
  }

  if (Array.isArray(data.elements)) {
    for (let i = 0; i < data.elements.length; i++) {
      const el = data.elements[i] as Record<string, unknown>;
      const tag = el.tag || '?';
      const text = el.text || '';
      console.log(`[${i}] ${tag} "${text}"`);

      if (el.box) {
        const box = el.box as Record<string, unknown>;
        const w = box.width || 0;
        const h = box.height || 0;
        const x = box.x || 0;
        const y = box.y || 0;
        console.log(`    box: ${w}x${h} at (${x}, ${y})`);
      }

      if (el.styles) {
        const styles = el.styles as Record<string, unknown>;
        console.log(
          `    font: ${styles.fontSize || ''} ${styles.fontWeight || ''} ${styles.fontFamily || ''}`
        );
        console.log(`    color: ${styles.color || ''}`);
        console.log(`    background: ${styles.backgroundColor || ''}`);
      }
      console.log();
    }
    return;
  }

  if (data.closed !== undefined) {
    console.log(`${successIndicator()} Browser closed`);
    return;
  }

  if (data.started === true) {
    if (data.path) {
      console.log(`${successIndicator()} Recording started: ${data.path}`);
    } else {
      console.log(`${successIndicator()} Recording started`);
    }
    return;
  }

  if (data.stopped !== undefined) {
    const path = (data.path as string) || 'unknown';
    if (data.previousPath) {
      console.log(
        `${successIndicator()} Recording restarted: ${path} (previous saved to ${data.previousPath})`
      );
    } else {
      console.log(`${successIndicator()} Recording started: ${path}`);
    }
    return;
  }

  if (data.frames !== undefined) {
    if (data.path) {
      if (data.error) {
        console.log(`${warningIndicator()} Recording saved to ${data.path} - ${data.error}`);
      } else {
        console.log(`${successIndicator()} Recording saved to ${data.path}`);
      }
    } else {
      console.log(`${successIndicator()} Recording stopped`);
    }
    return;
  }

  if (data.suggestedFilename || data.filename) {
    if (data.path) {
      const filename = (data.suggestedFilename as string) || (data.filename as string) || '';
      if (filename) {
        console.log(
          `${successIndicator()} Downloaded to ${green(data.path as string)} (${filename})`
        );
      } else {
        console.log(`${successIndicator()} Downloaded to ${green(data.path as string)}`);
      }
    }
    return;
  }

  if (data.path && typeof data.path === 'string') {
    switch (action || '') {
      case 'screenshot':
        console.log(`${successIndicator()} Screenshot saved to ${green(data.path)}`);
        break;
      case 'pdf':
        console.log(`${successIndicator()} PDF saved to ${green(data.path)}`);
        break;
      case 'trace_stop':
        console.log(`${successIndicator()} Trace saved to ${green(data.path)}`);
        break;
      case 'download':
      case 'waitfordownload':
        console.log(`${successIndicator()} Download saved to ${green(data.path)}`);
        break;
      case 'state_save':
        console.log(`${successIndicator()} State saved to ${green(data.path)}`);
        break;
      case 'state_load':
        if (data.note) console.log(data.note);
        console.log(`${successIndicator()} State path set to ${green(data.path)}`);
        break;
      case 'recorder_stop':
        console.log(
          `${successIndicator()} Recorded ${data.steps} steps, saved to ${green(data.path)}`
        );
        break;
      default:
        console.log(`${successIndicator()} Saved to ${green(data.path)}`);
    }
    return;
  }

  if (data.note && typeof data.note === 'string') {
    console.log(data.note);
    return;
  }

  if (data.yaml && typeof data.yaml === 'string') {
    console.log(`${successIndicator()} Recorded ${data.steps} steps`);
    console.log(data.yaml);
    return;
  }

  if (data.diff && typeof data.diff === 'string') {
    console.log(`${successIndicator()} Done`);
    const scope = data.diffScope ? ` (scope: ${data.diffScope})` : '';
    console.log(`\n${bold('--- Diff')}${scope}${bold(' ---')}`);
    console.log(data.diff);
    return;
  }

  console.log(`${successIndicator()} Done`);
}

export function printSession(session: string, sessions: string[], jsonMode: boolean): void {
  if (jsonMode) {
    console.log(JSON.stringify({ success: true, data: { session, sessions } }));
    return;
  }

  if (sessions.length === 0) {
    console.log('No active sessions');
    return;
  }

  console.log('Active sessions:');
  for (const s of sessions) {
    const marker = s === session ? cyan('→') : ' ';
    console.log(`${marker} ${s}`);
  }
}

export function printError(message: string, jsonMode: boolean): void {
  if (jsonMode) {
    console.log(JSON.stringify({ success: false, error: message }));
  } else {
    console.error(`${errorIndicator()} ${message}`);
  }
}

export function printWarning(message: string): void {
  console.error(`${warningIndicator()} ${message}`);
}

export { successIndicator, errorIndicator, warningIndicator, bold, dim, green, cyan };
