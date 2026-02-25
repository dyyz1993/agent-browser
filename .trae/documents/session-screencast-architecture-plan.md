# Session 与 Screencast 架构分析与改进计划

## 当前架构分析

### 1. Session 的含义

```
Session = Daemon 实例 = 浏览器实例

一个 Daemon 只能管理一个浏览器实例（无论是 launch 还是 CDP 连接）
```

### 2. 当前问题

```
当前流程：
1. 用户启动 Daemon（需要手动设置 AGENT_BROWSER_SESSION）
2. Daemon 注册到 Standalone（使用 session 名称）
3. 用户需要知道 session 名称才能连接 WebSocket

问题：
- 用户需要手动管理 session 名称
- 容易冲突（多个 daemon 使用相同的 "default"）
- URL 中的 session 参数需要用户自己指定
```

## 改进方案：Daemon 自动分配唯一 ID

### 核心思路

```
改进流程：
1. Daemon 启动时自动生成唯一 ID
2. Daemon 注册到 Standalone（使用自动生成的 ID）
3. Launch 响应返回 instanceId 和 viewerUrl
4. Close 时清理所有相关资源
```

### 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                    StreamServerStandalone                        │
│                    (端口 5005)                                   │
│                                                                  │
│  sessions: Map<string, SessionInfo>                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ "a1b2c3d4" → { socketPath: "...", daemonSocket: Socket } │  │
│  │ "cdp-9222" → { socketPath: "...", daemonSocket: Socket } │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  WebSocket 连接：                                                │
│  ws://localhost:5005?session=a1b2c3d4  → Daemon A              │
│  ws://localhost:5005?session=cdp-9222  → Daemon B              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Daemon A                                                        │
│  ├─ instanceId: "a1b2c3d4" (自动生成)                           │
│  ├─ BrowserManager (launch)                                     │
│  └─ StreamServerProxy                                            │
│       └─ 注册时使用 instanceId                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Daemon B                                                        │
│  ├─ instanceId: "cdp-9222" (基于 CDP 端口)                      │
│  ├─ BrowserManager (CDP 9222)                                   │
│  └─ StreamServerProxy                                            │
│       └─ 注册时使用 instanceId                                   │
└─────────────────────────────────────────────────────────────────┘
```

### ID 生成策略

```typescript
function generateInstanceId(launchCommand?: LaunchCommand): string {
  // CDP 连接使用端口作为 ID
  if (launchCommand?.cdpPort) {
    return `cdp-${launchCommand.cdpPort}`;
  }
  if (launchCommand?.cdpUrl) {
    const port = extractPortFromUrl(launchCommand.cdpUrl);
    if (port) return `cdp-${port}`;
  }
  // 普通启动生成随机 ID
  return randomUUID().substring(0, 8);
}
```

## 实现方案

### 1. 修改 daemon.ts

```typescript
import { randomUUID } from 'crypto';

let currentInstanceId: string;

export function getInstanceId(): string {
  return currentInstanceId;
}

function generateInstanceId(launchCommand?: LaunchCommand): string {
  if (launchCommand?.cdpPort) {
    return `cdp-${launchCommand.cdpPort}`;
  }
  if (launchCommand?.cdpUrl) {
    try {
      const url = new URL(launchCommand.cdpUrl);
      const port = url.port || (url.protocol === 'https:' ? '443' : '80');
      return `cdp-${port}`;
    } catch {}
  }
  return randomUUID().substring(0, 8);
}

export async function startDaemon(options?: { provider?: string }): Promise<void> {
  // 自动生成 instanceId
  currentInstanceId = generateInstanceId();
  
  // 设置 session 为 instanceId
  setSession(currentInstanceId);
  
  // ... 其余启动逻辑
}

// Close 时清理
async function shutdown() {
  // 1. 停止 screencast
  if (streamServerProxy) {
    await streamServerProxy.disconnect();
    streamServerProxy = null;
  }
  
  // 2. 关闭浏览器
  await manager.close();
  
  // 3. 清理 socket 文件
  cleanupSocket(currentInstanceId);
  
  // 4. 关闭服务器
  server.close();
  
  process.exit(0);
}
```

### 2. 修改 cleanupSocket

```typescript
export function cleanupSocket(session?: string): void {
  const sess = session ?? currentSession;
  const pidFile = getPidFile(sess);
  const streamPortFile = getStreamPortFile(sess);
  const socketPath = getSocketPath(sess);
  
  try {
    if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
    if (fs.existsSync(streamPortFile)) fs.unlinkSync(streamPortFile);
    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
  } catch {
    // Ignore cleanup errors
  }
}
```

### 3. 修改 StreamServerProxy

```typescript
改进流程：
1. Daemon 启动时自动生成唯一 ID
2. Daemon 注册到 Standalone（使用自动生成的 ID）
3. Launch 响应返回 instanceId 和 viewerUrl
4. Close 时清理所有相关资源
```

### 4. 修改 actions.ts - Launch 响应

```typescript
async function handleLaunch(
  command: Command & { action: 'launch' },
  browser: BrowserManager
): Promise<Response> {
  await browser.launch(command);
  
  const instanceId = getSession();  // 获取当前 instanceId
  
  return successResponse(command.id, {
    launched: true,
    instanceId,
    viewerUrl: `http://localhost:5005/view?session=${instanceId}`
  });
}
```

### 5. 修改 StreamServerStandalone - 处理 unregister

```typescript
private handleIpcMessage(socket: net.Socket, message: StreamMessage): void {
  switch (message.type) {
    case 'register':
      // ... 现有逻辑
      break;

    case 'unregister':
      if (message.session) {
        console.log(`[StreamServer] Session unregistered: ${message.session}`);
        this.sessions.delete(message.session);
        this.daemonSockets.delete(message.session);
        this.clients.delete(message.session);  // 清理客户端连接
        this.frameBuffers.delete(message.session);  // 清理帧缓冲
        this.broadcastStatus(message.session, false);
      }
      break;

    case 'frame':
      // ... 现有逻辑
      break;
  }
}
```

## API 变更

### Launch 响应

```json
{
  "id": "1",
  "success": true,
  "data": {
    "launched": true,
    "instanceId": "cdp-9222",
    "viewerUrl": "http://localhost:5005/view?session=cdp-9222"
  }
}
```

### WebSocket 连接

```
ws://localhost:5005?session=cdp-9222
```

## 清理流程

### Close 命令处理

```
用户发送: { "action": "close" }
         ↓
Daemon:
  1. StreamServerProxy.disconnect()
     - 发送 unregister 到 Standalone
     - 清理 screencastFrameCallback
     - 停止 screencast
     - 关闭 IPC socket
  2. BrowserManager.close()
     - 关闭浏览器
  3. cleanupSocket(instanceId)
     - 删除 .sock 文件
     - 删除 .pid 文件
     - 删除 .stream 文件
  4. server.close()
     - 关闭 daemon server
  5. process.exit(0)
```

### Standalone 收到 unregister

```
Standalone:
  1. sessions.delete(session)
  2. daemonSockets.delete(session)
  3. clients.delete(session)  // 关闭所有 WebSocket 客户端
  4. frameBuffers.delete(session)
  5. broadcastStatus(session, false)
```

## 实施步骤

### 第一阶段：修改 ID 生成逻辑

1. 移除 `AGENT_BROWSER_SESSION` 环境变量支持
2. 添加 `generateInstanceId()` 函数
3. 修改 `startDaemon()` 使用自动生成的 ID

### 第二阶段：修改清理逻辑

1. 修改 `cleanupSocket()` 支持传入 session
2. 修改 `StreamServerProxy.disconnect()` 发送 unregister
3. 修改 `StreamServerStandalone` 处理 unregister

### 第三阶段：修改响应格式

1. Launch 响应中添加 `instanceId` 和 `viewerUrl`
2. CLI 输出 viewer URL

### 第四阶段：测试

1. 测试多 daemon 场景
2. 测试 CDP 连接场景
3. 测试 close 清理

## 预期效果

* ✅ 每个 daemon 自动有唯一标识

* ✅ Viewer URL 自动匹配正确的 daemon

* ✅ CDP 连接自动使用端口作为 ID

* ✅ Close 时完整清理所有资源

* ✅ 无需用户手动设置 session

