# Stream Server 独立化重构计划

## 背景

当前问题：
- 每个 daemon 进程都尝试启动自己的 StreamServer（固定端口 9223）
- 多个 session 同时运行会导致端口冲突
- Viewer 和 WebSocket 需要固定端口对外服务

## 目标架构

```
┌─────────────────────────────────────────────────────────────┐
│              Stream Server (固定端口 9223/9224)              │
│                                                             │
│  WebSocket: ws://localhost:9223?session=default             │
│  HTTP:      http://localhost:9224/view?session=default      │
│                                                             │
│  内部维护: Map<session, BrowserManagerProxy>                │
└─────────────────────────────────────────────────────────────┘
         ↑              ↑              ↑
         │              │              │
    daemon          daemon         daemon
  (default)        (test)        (prod)
         │              │              │
    Browser        Browser        Browser
```

## 文件结构

```
~/.agent-browser/
├── stream-server.pid    # Stream Server PID（全局唯一）
├── default.pid          # default session daemon PID
├── default.sock         # default session socket
├── test.pid             # test session daemon PID
├── test.sock            # test session socket
```

## 命令行为

| 命令 | 行为 |
|------|------|
| `agent-browser start --session xxx` | 启动 daemon + 自动启动 Stream Server（如果没运行） |
| `agent-browser close --session xxx` | 关闭该 session 的 daemon 和浏览器 |
| `agent-browser kill` | 关闭所有 daemon + Stream Server |

## 改动文件清单

### 1. 新建文件

#### `src/stream-server-standalone.ts`
独立的 Stream Server 进程入口，负责：
- 启动 WebSocket Server (9223) 和 HTTP Server (9224)
- 管理多 session 的连接
- 通过 IPC 与各 daemon 通信获取画面数据
- 写入 `stream-server.pid`

### 2. 修改文件

#### `src/stream-server.ts`
- 重构为支持多 session
- 添加 session 注册/注销机制
- WebSocket 连接通过 `?session=xxx` 参数区分 session
- 内部维护 `Map<session, SessionConnection>`

#### `src/daemon.ts`
- 移除 StreamServer 启动逻辑
- 添加与 Stream Server 的 IPC 通信
- 启动时检查并启动 Stream Server（如果没运行）
- 添加 `getStreamServerPidFile()` 函数

#### `src/cli/connection.ts`
- 添加 `ensureStreamServer()` 函数
- 添加 `killAll()` 函数（关闭所有 daemon + Stream Server）
- 修改 `ensureDaemon()` 逻辑，自动启动 Stream Server

#### `src/cli.ts`
- 修改 `kill` 命令行为：关闭所有 daemon + Stream Server
- 移除 `--session` 参数对 kill 的影响

#### `src/cli/help.ts`
- 更新 `kill` 命令的帮助文档

### 3. 测试文件

#### `src/stream-server.test.ts`
- 添加多 session 相关测试

#### `src/daemon.test.ts`
- 添加 Stream Server PID 文件相关测试

## 详细实现步骤

### Step 1: 创建 Stream Server 独立进程

1. 创建 `src/stream-server-standalone.ts`
2. 实现固定端口 WebSocket + HTTP 服务
3. 实现 session 注册机制
4. 写入 PID 文件

### Step 2: 重构 StreamServer 类

1. 修改为支持多 session
2. WebSocket 连接通过 query 参数识别 session
3. 添加 `registerSession(session, ipcPath)` 方法
4. 添加 `unregisterSession(session)` 方法

### Step 3: 修改 daemon.ts

1. 移除 StreamServer 启动逻辑
2. 添加 IPC 服务端（供 Stream Server 连接）
3. 启动时向 Stream Server 注册
4. 关闭时向 Stream Server 注销

### Step 4: 修改 CLI

1. 添加 `ensureStreamServer()` 函数
2. 修改 `ensureDaemon()` 调用 `ensureStreamServer()`
3. 实现 `killAll()` 函数
4. 更新 `kill` 命令

### Step 5: 更新测试

1. 添加多 session 测试
2. 添加 Stream Server PID 文件测试

## IPC 通信协议

Daemon 与 Stream Server 之间的通信使用 Unix Socket：

```
# Daemon -> Stream Server 注册
{ type: 'register', session: 'default', ipcPath: '/path/to/default.ipc' }

# Daemon -> Stream Server 注销
{ type: 'unregister', session: 'default' }

# Stream Server -> Daemon 请求画面
{ type: 'screenshot', session: 'default' }

# Daemon -> Stream Server 返回画面
{ type: 'frame', session: 'default', data: 'base64...', metadata: {...} }
```

## 兼容性考虑

- 保持现有 API 不变
- Viewer URL 格式不变：`http://localhost:9224/view?session=default`
- WebSocket URL 格式不变：`ws://localhost:9223?session=default`

## 风险与缓解

1. **Stream Server 崩溃**
   - 所有 session 的 viewer 失效
   - 缓解：daemon 检测到 Stream Server 退出后自动重启

2. **端口冲突**
   - 9223/9224 被其他程序占用
   - 缓解：启动时检测，提示用户

3. **进程孤儿**
   - daemon 退出但未注销
   - 缓解：Stream Server 定期检查 daemon 存活状态
