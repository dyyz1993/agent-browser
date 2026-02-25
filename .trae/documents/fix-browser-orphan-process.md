# 修复浏览器进程残留问题

## 问题场景

### 场景 1：`agent-browser kill` 时 daemon 被强制 SIGKILL

```
killDaemon() 发送 SIGTERM → daemon 2秒内未响应 → 发送 SIGKILL → 浏览器残留
```

### 场景 2：Daemon 异常崩溃

```
uncaughtException → 只清理 socket → daemon 退出 → 浏览器残留
```

### 场景 3：直接 `kill -9`

```
kill -9 <daemon_pid> → daemon 立即终止 → 浏览器残留
```

## 简化方案

### 方案 A：在 killDaemon 中直接杀死浏览器进程

**原理**：在 `killDaemon` 函数中，无论 daemon 是否正常退出，都尝试杀死与该 session 相关的浏览器进程。

**实现**：通过 Playwright 的临时目录特征匹配进程

```typescript
// Playwright 创建的浏览器进程有特征：
// --user-data-dir=/var/folders/xxx/playwright_chromiumdev_profile-xxx

// 在 killDaemon 中添加：
async function killBrowserBySession(session: string): Promise<void> {
  // macOS/Linux
  const pattern = `playwright_chromiumdev_profile`;
  // 通过进程命令行匹配
  execSync(`pkill -f "${pattern}" 2>/dev/null || true`);
}
```

**问题**：无法区分不同 session 的浏览器进程

### 方案 B：通过 CDP 获取浏览器 PID 并保存

**原理**：在 launch 后通过 CDP 获取浏览器 PID，保存到文件，kill 时读取。

**实现**：

```typescript
// BrowserManager 中添加：
async getBrowserPid(): Promise<number | null> {
  if (!this.browser) return null;
  const context = this.browser.contexts()[0];
  if (!context) return null;
  const cdp = await context.newCDPSession(await context.pages()[0]);
  const info = await cdp.send('Browser.getVersion');
  // 或者通过 process id
  const result = await cdp.send('SystemInfo.getInfo');
  // ...
}
```

**问题**：CDP 不直接提供 PID，需要其他方式

### 方案 C：使用 launchPersistentContext 并指定唯一目录（推荐）

**原理**：使用 `launchPersistentContext` 替代 `launch`，指定基于 session 的唯一目录。

**优点**：
- 目录名包含 session，可以精确匹配
- 不需要额外获取 PID
- 实现简单

**实现**：

```typescript
// BrowserManager.launch() 中：
const session = process.env.AGENT_BROWSER_SESSION || 'default';
const userDataDir = path.join(os.tmpdir(), `agent-browser-${session}`);

// 使用 launchPersistentContext 替代 launch
this.browser = await launcher.launchPersistentContext(userDataDir, {
  headless: options.headless ?? true,
  executablePath: options.executablePath,
  args: baseArgs,
  viewport,
  // ...其他选项
});
```

然后在 `killDaemon` 中：

```typescript
async function killBrowserBySession(session: string): Promise<void> {
  const pattern = `agent-browser-${session}`;
  // macOS/Linux
  execSync(`pkill -f "${pattern}" 2>/dev/null || true`);
  // Windows
  // execSync(`taskkill /F /FI "WINDOWTITLE eq ${pattern}"`);
}
```

**缺点**：用户说不想引入 user-data-dir 的复杂度

### 方案 D：组合方案 - 异常处理 + 进程匹配

**原理**：
1. 在 daemon 异常处理中添加 `manager.close()` - 解决场景 2
2. 在 `killDaemon` 中，使用 SIGKILL 后，通过进程特征匹配杀死浏览器 - 解决场景 1 和 3

**实现**：

```typescript
// 1. daemon.ts 异常处理
process.on('uncaughtException', async (err) => {
  console.error('Uncaught exception:', err);
  try {
    await manager.close();  // 新增
  } catch {}
  cleanupSocket();
  process.exit(1);
});

// 2. connection.ts killDaemon
export async function killDaemon(session: string): Promise<boolean> {
  // ... 现有逻辑 ...

  // 新增：如果使用了 SIGKILL，尝试杀死浏览器进程
  if (usedSigkill) {
    await killOrphanedBrowserProcesses();
  }

  return true;
}

async function killOrphanedBrowserProcesses(): Promise<void> {
  // 通过 Playwright 的特征目录匹配
  const pattern = 'playwright_chromiumdev_profile';
  try {
    if (process.platform === 'win32') {
      // Windows: 使用 wmic
      execSync(`wmic process where "commandline like '%${pattern}%'" delete 2>nul`);
    } else {
      // macOS/Linux: 使用 pkill
      execSync(`pkill -f "${pattern}" 2>/dev/null || true`);
    }
  } catch {}
}
```

**优点**：
- 不需要修改 launch 逻辑
- 不需要 user-data-dir
- 实现简单

**缺点**：
- 无法区分不同 session 的浏览器（会杀死所有 Playwright 浏览器）
- 但对于 `agent-browser kill` 场景，这可能是可接受的

## 推荐：方案 D

最简单，改动最小：
1. 在 daemon 异常处理中添加 `manager.close()`
2. 在 `killDaemon` 使用 SIGKILL 后，通过进程特征匹配杀死浏览器

这个方案虽然会杀死所有 Playwright 浏览器进程，但对于 `agent-browser kill` 的使用场景是合理的（用户想清理所有相关进程）。
