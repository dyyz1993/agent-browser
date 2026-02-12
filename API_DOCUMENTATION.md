# Agent Browser API 文档 / Agent Browser API Documentation

## 目录 / Table of Contents

- [概述 / Overview](#概述--overview)
- [架构 / Architecture](#架构--architecture)
- [目录结构 / Directory Structure](#目录结构--directory-structure)
- [核心模块 / Core Modules](#核心模块--core-modules)
  - [Daemon (`daemon.ts`)](#daemon-daemonts)
  - [BrowserManager (`browser.ts`)](#browsermanager-browserts)
  - [Actions (`actions.ts`)](#actions-actionsts)
  - [Protocol (`protocol.ts`)](#protocol-protocolts)
  - [Snapshot (`snapshot.ts`)](#snapshot-snapshotts)
  - [Stream Server (`stream-server.ts`)](#stream-server-stream-serverts)
  - [Types (`types.ts`)](#types-typests)
- [命令参考 / Command Reference](#命令参考--command-reference)
- [使用模式 / Usage Patterns](#使用模式--usage-patterns)
- [协议规范 / Protocol Specification](#协议规范--protocol-specification)
- [示例 / Examples](#示例--examples)

---

## 概述 / Overview

**Agent Browser** 是一个专为 AI 智能体设计的无头浏览器自动化系统。基于 Playwright 构建，提供以下功能：

**Agent Browser** is a headless browser automation system designed specifically for AI agents. Built on top of Playwright, it provides:

- **110+ 浏览器自动化命令 / 110+ browser automation commands** - 完整的 Web 交互
- **基于引用的交互 / Ref-based interaction** - AI 友好的元素引用，避免脆弱的 CSS 选择器
- **多标签页/窗口支持 / Multi-tab/window support** - 同时管理多个浏览器页面
- **实时流式传输 / Real-time streaming** - 基于 WebSocket 的浏览器视口流式传输，用于预览和协同浏览
- **基于会话的守护进程架构 / Session-based daemon architecture** - 长期运行的浏览器进程，通过 Socket 通信
- **全面的错误处理 / Comprehensive error handling** - AI 友好的错误消息，指导故障排除

### 核心特性 / Key Features

| 特性 / Feature | 描述 / Description |
|---------|-------------|
| **基于引用的交互 / Ref-Based Interaction** | 元素使用稳定的 ID 引用（如 `@e1`）而非脆弱的 CSS 选择器 |
| **多标签页管理 / Multi-Tab Management** | 编程方式创建、切换和关闭浏览器标签页 |
| **网络拦截 / Network Interception** | 模拟响应、中止请求、检查网络流量 |
| **存储管理 / Storage Management** | 完全控制 cookies、localStorage 和 sessionStorage |
| **录制与追踪 / Recording & Tracing** | 视频录制、屏幕截图、Playwright 追踪 |
| **设备模拟 / Device Emulation** | 移动设备、视口、地理位置、权限 |
| **云浏览器支持 / Cloud Browser Support** | 连接 Browserbase 和 Browser Use 云浏览器 |
| **CDP 连接 / CDP Connection** | 通过 Chrome DevTools Protocol 连接运行的 Chrome 实例 |

---

## 架构 / Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLI / 客户端 / Client                         │
│              (JSON over socket/CLI / 通过 Socket 通信)            │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         守护进程层 / Daemon Layer                  │
│  ┌──────────────┐  ┌───────────────┐  ┌─────────────────────┐  │
│  │   Socket     │  │ Stream Server │  │  Command Parser     │  │
│  │  服务器       │  │  (WebSocket)  │  │  (Zod 验证)         │  │
│  └──────────────┘  └───────────────┘  └─────────────────────┘  │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        执行层 / Execution Layer                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    BrowserManager                          │  │
│  │  - 浏览器生命周期 (启动、关闭)                             │  │
│  │  - 标签页/页面管理                                          │  │
│  │  - 框架切换                                                │  │
│  │  - 基于引用的定位器                                        │  │
│  │  - CDP 会话管理                                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Action Handlers                         │  │
│  │  executeCommand() → 110+ 命令处理器                        │  │
│  │  - 导航、交互、查询                                        │  │
│  │  - 网络、存储、状态                                        │  │
│  │  - 录制、追踪、屏幕截图                                    │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Playwright                                │
│              (Chromium, Firefox, WebKit)                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 目录结构 / Directory Structure

```
src/
├── actions.ts          # 命令执行处理器 (110+ 操作) / Command execution handlers
├── actions.test.ts     # 错误处理单元测试 / Unit tests for error handling
├── browser.ts          # BrowserManager 类 - 核心浏览器生命周期 / Core browser lifecycle
├── browser.test.ts     # 浏览器管理器测试 / Browser manager tests
├── daemon.ts           # 守护进程服务器 - Unix socket/TCP 服务器 / Daemon server
├── daemon.test.ts      # 守护进程测试 / Daemon tests
├── protocol.ts         # 命令解析和验证 (Zod schemas) / Command parsing & validation
├── protocol.test.ts    # 协议验证测试 / Protocol validation tests
├── snapshot.ts         # 带引用的可访问性树 / Accessibility tree with refs
├── stream-server.ts    # WebSocket 浏览器流服务器 / WebSocket server for streaming
├── types.ts            # TypeScript 类型定义 / Type definitions
```

---

## 核心模块 / Core Modules

### Daemon (`daemon.ts`)

守护进程模块管理持久浏览器进程，支持基于 Socket 的通信。

The daemon module manages a persistent browser process with socket-based communication.

#### 导出 / Exports

| 函数 / Function | 签名 / Signature | 描述 / Description |
|----------|-----------|-------------|
| `startDaemon` | `startDaemon(options?: { streamPort?: number }): Promise<void>` | 启动守护进程服务器 / Start the daemon server |
| `setSession` | `setSession(session: string): void` | 设置当前会话 / Set the current session |
| `getSession` | `getSession(): string` | 获取当前会话 / Get the current session |
| `getSocketDir` | `getSocketDir(): string` | 获取 socket 目录路径 / Get socket directory path |
| `getSocketPath` | `getSocketPath(session?: string): string` | 获取 Unix socket 或 TCP 端口 / Get Unix socket or TCP port |
| `isDaemonRunning` | `isDaemonRunning(session?: string): boolean` | 检查守护进程是否活动 / Check if daemon is active |
| `getConnectionInfo` | `getConnectionInfo(session?: string)` | 获取连接详情 / Get connection details |
| `cleanupSocket` | `cleanupSocket(session?: string): void` | 清理 socket 文件 / Clean up socket files |

#### `startDaemon(options?)`

启动接受浏览器自动化命令的守护进程服务器。

Starts the daemon server that accepts browser automation commands.

**参数 / Parameters:**
- `options.streamPort` (可选): WebSocket 流服务器端口（0 表示禁用）/ Port for WebSocket stream server (0 to disable)

**行为 / Behavior:**
- 在 Linux/Mac 上创建 Unix socket，Windows 上创建 TCP / Creates Unix socket on Linux/Mac, TCP on Windows
- 首次命令时自动启动浏览器（如果尚未启动）/ Auto-launches browser on first command
- 支持环境变量配置 / Supports environment variable configuration

**环境变量 / Environment Variables:**

| 变量 / Variable | 描述 / Description |
|----------|-------------|
| `AGENT_BROWSER_DAEMON` | 设置为 '1' 自动启动守护进程 / Set to '1' to auto-start daemon |
| `AGENT_BROWSER_SESSION` | 多租户会话名称 / Session name for multi-tenancy |
| `AGENT_BROWSER_STREAM_PORT` | 默认 WebSocket 端口 / Default WebSocket port |
| `AGENT_BROWSER_EXTENSIONS` | 逗号分隔的扩展路径 / Comma-separated extension paths |
| `AGENT_BROWSER_ARGS` | 浏览器启动参数 / Browser launch arguments |
| `AGENT_BROWSER_PROXY` | 代理服务器 URL / Proxy server URL |
| `AGENT_BROWSER_PROXY_BYPASS` | 代理绕过列表 / Proxy bypass list |
| `AGENT_BROWSER_IGNORE_HTTPS_ERRORS` | 设置为 '1' 忽略 HTTPS 错误 / Set to '1' to ignore HTTPS errors |
| `AGENT_BROWSER_HEADED` | 设置为 '1' 使用有头模式 / Set to '1' for headed mode |
| `AGENT_BROWSER_EXECUTABLE_PATH` | 自定义浏览器可执行文件 / Custom browser executable |
| `AGENT_BROWSER_PROFILE` | 持久配置文件目录 / Persistent profile directory |
| `AGENT_BROWSER_STATE` | 存储状态 JSON 文件 / Storage state JSON file |
| `AGENT_BROWSER_USER_AGENT` | 自定义用户代理 / Custom user agent |

**示例 / Example:**
```typescript
import { startDaemon } from './daemon.js';

await startDaemon({ streamPort: 9223 });
// 守护进程现在在 Unix socket 或 TCP 端口上监听
// Daemon now listening on Unix socket or TCP port
```

**错误处理 / Error Handling:**
- Socket 地址已被使用 → 清理旧文件后报错 / Socket address in use → Error with cleanup
- 浏览器启动失败 → 作为错误响应返回 / Browser launch failures → Returned as error responses

---

### BrowserManager (`browser.ts`)

核心浏览器生命周期管理类，封装 Playwright。

The core browser lifecycle management class wrapping Playwright.

#### 类定义 / Class Definition

```typescript
class BrowserManager {
  // 生命周期 / Lifecycle
  isLaunched(): boolean
  launch(options: LaunchCommand): Promise<void>
  close(): Promise<void>

  // 页面/框架访问 / Page/Frame access
  getPage(): Page
  getFrame(): Frame
  newTab(): Promise<TabNewData>
  newWindow(viewport?): Promise<TabNewData>
  switchTo(index: number): Promise<TabSwitchData>
  closeTab(index?: number): Promise<TabCloseData>
  listTabs(): Promise<TabInfo[]>
  getActiveIndex(): number

  // 基于引用的交互 / Ref-based interaction
  getSnapshot(options?): Promise<EnhancedSnapshot>
  getRefMap(): RefMap
  getLocatorFromRef(ref: string): Locator | null
  isRef(selector: string): boolean
  getLocator(selectorOrRef: string): Locator

  // 框架管理 / Frame management
  switchToFrame(options): Promise<void>
  switchToMainFrame(): void

  // 存储与状态 / Storage & state
  saveStorageState(path): Promise<void>

  // 网络 / Network
  startRequestTracking(): void
  getRequests(filter?): TrackedRequest[]
  clearRequests(): void
  addRoute(url, options): Promise<void>
  removeRoute(url?): Promise<void>
  setScopedHeaders(url, headers): Promise<void>
  setExtraHeaders(headers): Promise<void>

  // 对话框 / Dialogs
  setDialogHandler(response, promptText?): void

  // 地理位置 & 权限 / Geolocation & permissions
  setGeolocation(lat, lng, accuracy?): Promise<void>
  setPermissions(permissions, grant): Promise<void>

  // 设备模拟 / Device emulation
  setViewport(width, height): Promise<void>
  setDeviceScaleFactor(scale, width, height, isMobile?): Promise<void>
  clearDeviceMetricsOverride(): Promise<void>
  getDevice(name): Device | null
  listDevices(): string[]

  // 控制台 & 错误 / Console & errors
  getConsoleMessages(): ConsoleMessage[]
  clearConsoleMessages(): void
  getPageErrors(): PageError[]
  clearPageErrors(): void

  // 追踪 & 录制 / Tracing & recording
  startTracing(options?): Promise<void>
  stopTracing(path): Promise<void>
  startRecording(path, url?): Promise<void>
  stopRecording(): Promise<RecordingStopData>
  restartRecording(path, url?): Promise<RecordingRestartData>

  // HAR
  startHarRecording(): Promise<void>

  // 离线模式 / Offline mode
  setOffline(offline): Promise<void>

  // 屏幕截图 (CDP 流) / Screencast
  startScreencast(callback, options?): Promise<void>
  stopScreencast(): Promise<void>

  // 输入注入 (协同浏览) / Input injection
  injectMouseEvent(event): Promise<void>
  injectKeyboardEvent(event): Promise<void>
  injectTouchEvent(event): Promise<void>
}
```

#### 生命周期方法 / Lifecycle Methods

##### `isLaunched(): boolean`

检查浏览器是否已启动。

Check if browser is currently launched.

**返回 / Returns:** 如果浏览器或持久上下文存在返回 `true` / `true` if browser exists

##### `launch(options): Promise<void>`

使用指定选项启动浏览器。

Launch the browser with specified options.

**参数 / Parameters:**
```typescript
interface LaunchCommand {
  headless?: boolean;           // 无头模式 / headless mode
  viewport?: { width: number; height: number };  // 视口 / viewport
  browser?: 'chromium' | 'firefox' | 'webkit';
  cdpPort?: number;             // CDP 端口 / CDP port
  cdpUrl?: string;              // CDP URL
  executablePath?: string;      // 可执行文件路径 / executable path
  extensions?: string[];        // 扩展路径 / extension paths
  profile?: string;             // 持久配置文件 / persistent profile
  storageState?: string;        // 存储状态文件 / storage state file
  proxy?: { server: string; bypass?: string; username?: string; password?: string };
  args?: string[];              // 浏览器参数 / browser arguments
  userAgent?: string;           // 用户代理 / user agent
  provider?: string;            // 云提供商 / cloud provider
  ignoreHTTPSErrors?: boolean;  // 忽略 HTTPS 错误 / ignore HTTPS errors
}
```

**示例 / Example:**
```typescript
const browser = new BrowserManager();
await browser.launch({
  headless: true,
  viewport: { width: 1920, height: 1080 },
  browser: 'chromium'
});
```

**云提供商支持 / Cloud Provider Support:**
- `provider: 'browserbase'` - 连接到 Browserbase 云浏览器 / Connects to Browserbase
- `provider: 'browseruse'` - 连接到 Browser Use 云浏览器 / Connects to Browser Use

**错误条件 / Error Conditions:**
- 扩展 + CDP 连接 → 错误 / Extensions + CDP → Error
- 配置文件 + CDP 连接 → 错误 / Profile + CDP → Error
- 存储状态 + 配置文件 → 错误 / Storage + profile → Error
- 存储状态 + 扩展 → 错误 / Storage + extensions → Error

##### `close(): Promise<void>`

关闭浏览器并清理所有资源。

Close the browser and clean up all resources.

**行为 / Behavior:**
- 停止活动录制（保存视频）/ Stop active recording (saves video)
- 停止屏幕截图 / Stop screencast
- 关闭 CDP 会话 / Close CDP session
- 关闭所有页面和上下文 / Close all pages and contexts
- 清理云浏览器会话（如适用）/ Cleanup cloud sessions

#### 页面/框架管理 / Page/Frame Management

##### `getPage(): Page`

获取当前活动页面。

Get the current active page.

**返回 / Returns:** 活动 Playwright Page 对象 / Active Playwright Page object

**抛出 / Throws:** 浏览器未启动时抛出 `Error` / `Error` if not launched

##### `getFrame(): Frame`

获取当前框架（或主框架，如果未选择框架）。

Get the current frame (or main frame if no frame selected).

**返回 / Returns:** 活动 Playwright Frame 对象 / Active Playwright Frame object

##### `newTab(): Promise<TabNewData>`

在当前上下文中创建新标签页。

Create a new tab in the current context.

**返回 / Returns:** `{ index: number, total: number }` - 标签索引和总数 / tab index and total

**示例 / Example:**
```typescript
const { index, total } = await browser.newTab();
console.log(`创建了标签 ${index}，现在有 ${total} 个标签`);
// Created tab ${index}, now have ${total} tabs
```

##### `newWindow(viewport?): Promise<TabNewData>`

创建新窗口（新浏览器上下文）。

Create a new window (new browser context).

**参数 / Parameters:**
- `viewport` (可选): `{ width, height }` 默认 1280x720

**返回 / Returns:** `{ index: number, total: number }`

##### `switchTo(index): Promise<TabSwitchData>`

切换到指定标签页。

Switch to a specific tab by index.

**参数 / Parameters:**
- `index`: 0-based tab index / 从0开始的标签索引

**返回 / Returns:** `{ index: number, url: string, title: string }`

**抛出 / Throws:** 索引超出范围时抛出 `Error` / `Error` if out of range

##### `closeTab(index?): Promise<TabCloseData>`

关闭指定标签页（或当前标签页）。

Close a specific tab (or current tab).

**参数 / Parameters:**
- `index` (可选): 标签索引，默认活动标签 / Tab index, defaults to active

**返回 / Returns:** `{ closed: number, remaining: number }`

**抛出 / Throws:** 尝试关闭最后一个标签时抛出 / `Error` if closing last tab

##### `listTabs(): Promise<TabInfo[]>`

列出所有标签页信息。

List all tabs with their info.

**返回 / Returns:** `{ index, url, title, active }[]` - 标签信息数组

#### 基于引用的交互 / Ref-Based Interaction

##### `getSnapshot(options?): Promise<EnhancedSnapshot>`

获取带有嵌入引用的可访问性快照。

Get an accessibility snapshot with embedded refs.

**参数 / Parameters:**
```typescript
interface SnapshotOptions {
  interactive?: boolean;  // 仅交互元素 / Only interactive elements
  maxDepth?: number;       // 最大深度 / Maximum depth (0 = root only)
  compact?: boolean;       // 移除结构元素 / Remove structural elements
  selector?: string;       // CSS 选择器范围 / CSS selector to scope
}
```

**返回 / Returns:**
```typescript
interface EnhancedSnapshot {
  tree: string;  // 格式化的可访问性树 / Formatted accessibility tree
  refs: RefMap;  // ref -> 元素信息 / element info
}
```

**输出示例 / Example Output:**
```
- heading "Welcome" [ref=e1] [level=1]
- paragraph: Introduction text
- button "Submit" [ref=e2]
- textbox "Email" [ref=e3]
- link "Learn more" [ref=e4]
```

##### `getRefMap(): RefMap`

获取上次快照的缓存引用映射。

Get the cached ref map from the last snapshot.

**返回 / Returns:** `RefMap` - ref ID 到元素信息的映射

##### `getLocatorFromRef(ref): Locator | null`

从引用获取 Playwright 定位器。

Get a Playwright Locator from a ref.

**参数 / Parameters:**
- `ref`: 引用字符串（如 "e1", "@e1", "ref=e1"）/ Ref string

**返回 / Returns:** Playwright Locator 或 `null`（未找到时）/ or `null` if not found

**示例 / Example:**
```typescript
const locator = browser.getLocatorFromRef("@e5");
if (locator) {
  await locator.click();
}
```

##### `isRef(selector): boolean`

检查选择器是否为引用格式。

Check if a selector looks like a ref.

**返回 / Returns:** 如果是引用格式返回 `true` / `true` if ref format

##### `getLocator(selectorOrRef): Locator`

获取定位器 - 支持引用和常规选择器。

Get a locator - supports both refs and regular selectors.

**示例 / Example:**
```typescript
// 支持引用 / Works with refs
await browser.getLocator("@e5").click();

// 支持 CSS 选择器 / Works with CSS selectors
await browser.getLocator("button.submit").click();
```

#### 框架管理 / Frame Management

##### `switchToFrame(options): Promise<void>`

通过选择器、名称或 URL 切换到框架。

Switch to a frame by selector, name, or URL.

**参数 / Parameters:**
```typescript
interface FrameOptions {
  selector?: string;  // iframe 元素的 CSS 选择器 / CSS selector to iframe
  name?: string;      // 框架名称属性 / Frame name attribute
  url?: string;       // 框架 URL 模式 / Frame URL pattern
}
```

**抛出 / Throws:** 框架未找到时抛出 `Error` / `Error` if not found

##### `switchToMainFrame(): void`

切换回主框架。

Switch back to the main frame.

#### 网络管理 / Network Management

##### `startRequestTracking(): void`

开始跟踪所有网络请求。

Start tracking all network requests.

##### `getRequests(filter?): TrackedRequest[]`

获取跟踪的请求，可过滤。

Get tracked requests, optionally filtered.

**参数 / Parameters:**
- `filter` (可选): URL 子字符串过滤 / URL substring to filter

**返回 / Returns:** `{ url, method, headers, timestamp, resourceType }[]`

##### `clearRequests(): void`

清除跟踪的请求。

Clear tracked requests.

##### `addRoute(url, options): Promise<void>`

添加路由以拦截和模拟/中止请求。

Add a route to intercept and mock/abort requests.

**参数 / Parameters:**
```typescript
interface RouteOptions {
  response?: {
    status?: number;
    body?: string;
    contentType?: string;
    headers?: Record<string, string>;
  };
  abort?: boolean;
}
```

**示例 / Example:**
```typescript
await browser.addRoute('**/api/**', {
  response: {
    status: 200,
    body: '{"mock": true}',
    contentType: 'application/json'
  }
});
```

##### `removeRoute(url?): Promise<void>`

移除路由。未指定 URL 时移除所有。

Remove routes. If no URL, removes all.

##### `setScopedHeaders(origin, headers): Promise<void>`

为特定来源的请求设置 HTTP 头。

Set HTTP headers for requests to a specific origin.

**参数 / Parameters:**
- `origin`: 来源如 "api.example.com" 或完整 URL / Origin like "api.example.com"
- `headers`: 要添加的头 / Headers to add

##### `setExtraHeaders(headers): Promise<void>`

为所有请求设置全局 HTTP 头。

Set global HTTP headers for all requests.

#### 对话框处理 / Dialog Handling

##### `setDialogHandler(response, promptText?): void`

设置自动处理 JavaScript 对话框（alert、confirm、prompt）。

Set up automatic handling for JavaScript dialogs.

**参数 / Parameters:**
- `response`: `'accept'` 或 `'dismiss'`
- `promptText` (可选): 提示对话框输入的文本 / Text for prompt dialogs

**示例 / Example:**
```typescript
browser.setDialogHandler('accept', 'John Doe');
// 所有提示将自动接受并输入 "John Doe"
// All prompts will be accepted with "John Doe"
```

#### 地理位置 & 权限 / Geolocation & Permissions

##### `setGeolocation(lat, lng, accuracy?): Promise<void>`

设置浏览器地理位置。

Set the browser geolocation.

**示例 / Example:**
```typescript
await browser.setGeolocation(37.7749, -122.4194); // 旧金山 / San Francisco
```

##### `setPermissions(permissions, grant): Promise<void>`

授予或撤销浏览器权限。

Grant or revoke browser permissions.

**参数 / Parameters:**
- `permissions`: 权限字符串数组（如 `'geolocation'`, `'notifications'`）/ Array of permission strings
- `grant`: `true` 授授，`false` 撤销 / `true` to grant, `false` to revoke

**示例 / Example:**
```typescript
await browser.setPermissions(['geolocation', 'camera'], true);
```

#### 设备模拟 / Device Emulation

##### `setViewport(width, height): Promise<void>`

设置视口大小。

Set the viewport size.

##### `setDeviceScaleFactor(scale, width, height, mobile?): Promise<void>`

通过 CDP 设置设备像素比。

Set device pixel ratio via CDP.

**注意 / Note:** 用于 HiDPI/Retina 显示模拟。截图保持逻辑像素，除非在上下文创建时设置。

##### `clearDeviceMetricsOverride(): Promise<void>`

清除设备指标覆盖（恢复默认 1x 缩放）。

Clear device metrics override (restore default 1x scale).

##### `getDevice(name): Device | null`

按名称获取 Playwright 设备描述符。

Get a Playwright device descriptor by name.

**返回 / Returns:** 设备对象或 `null` / Device object or `null`

##### `listDevices(): string[]`

获取所有可用设备名称。

Get all available device names.

**示例 / Example:**
```typescript
const devices = browser.listDevices();
// ['iPhone 13', 'Pixel 5', 'iPad Pro', ...]
```

#### 控制台 & 错误跟踪 / Console & Error Tracking

##### `getConsoleMessages(): ConsoleMessage[]`

获取跟踪的控制台消息。

Get tracked console messages.

**返回 / Returns:** `{ type, text, timestamp }[]`

##### `clearConsoleMessages(): void`

清除跟踪的控制台消息。

Clear tracked console messages.

##### `getPageErrors(): PageError[]`

获取跟踪的页面错误。

Get tracked page errors.

**返回 / Returns:** `{ message, timestamp }[]`

##### `clearPageErrors(): void`

清除跟踪的页面错误。

Clear tracked page errors.

#### 追踪 & 录制 / Tracing & Recording

##### `startTracing(options?): Promise<void>`

启动 Playwright 追踪。

Start Playwright tracing.

**参数 / Parameters:**
```typescript
interface TracingOptions {
  screenshots?: boolean;
  snapshots?: boolean;
}
```

##### `stopTracing(path): Promise<void>`

停止追踪并保存到文件。

Stop tracing and save to file.

**示例 / Example:**
```typescript
await browser.startTracing({ screenshots: true });
// ... 执行操作 / perform actions ...
await browser.stopTracing('./trace.zip');
```

##### `startRecording(path, url?): Promise<void>`

开始视频录制到 WebM 文件（Playwright 原生）。

Start video recording to a WebM file.

**参数 / Parameters:**
- `path`: 输出文件路径（必须是 `.webm`）/ Output path (must be `.webm`)
- `url` (可选): 要导航的 URL（默认当前页）/ URL to navigate (defaults to current)

**行为 / Behavior:**
- 创建启用视频的新浏览器上下文 / Creates new context with video
- 传输 cookies/存储 / Transfers cookies/storage
- 输出必须是 `.webm` 格式 / Output must be `.webm`

##### `stopRecording(): Promise<RecordingStopData>`

停止录制并保存视频。

Stop recording and save video.

**返回 / Returns:** `{ path: string, frames: number, error?: string }`

##### `restartRecording(path, url?): Promise<RecordingRestartData>`

停止当前录制并开始新录制。

Stop current recording and start a new one.

**返回 / Returns:** `{ previousPath?: string, stopped: boolean }`

#### HAR 录制 / HAR Recording

##### `startHarRecording(): Promise<void>`

启动 HAR（HTTP Archive）录制。

Start HAR recording.

#### 存储状态 / Storage State

##### `saveStorageState(path): Promise<void>`

保存 cookies 和 localStorage 到 JSON 文件。

Save cookies and localStorage to a JSON file.

**示例 / Example:**
```typescript
await browser.saveStorageState('./auth-state.json');
// 可在下次启动时使用 --state 标志加载
// Can be loaded with --state flag on next launch
```

#### 离线模式 / Offline Mode

##### `setOffline(offline): Promise<void>`

设置离线模式（模拟网络断开）。

Set offline mode (emulate network disconnection).

#### 屏幕截图 (CDP 流) / Screencast

##### `startScreencast(callback, options?): Promise<void>`

通过 CDP 开始流式传输浏览器视口帧。

Start streaming browser viewport frames via CDP.

**参数 / Parameters:**
- `callback`: 每帧调用的函数 / Function called for each frame
- `options`: 屏幕截图选项 / Screencast options

**屏幕截图选项 / Screencast Options:**
```typescript
interface ScreencastOptions {
  format?: 'jpeg' | 'png';
  quality?: number;  // 0-100，仅 jpeg / jpeg only
  maxWidth?: number;
  maxHeight?: number;
  everyNthFrame?: number;
}
```

**示例 / Example:**
```typescript
await browser.startScreencast((frame) => {
  console.log('Frame:', frame.data); // base64 图像 / image
}, { format: 'jpeg', quality: 80 });
```

##### `stopScreencast(): Promise<void>`

停止屏幕截图。

Stop screencasting.

#### 输入注入 (协同浏览) / Input Injection

##### `injectMouseEvent(params): Promise<void>`

通过 CDP 注入鼠标事件。

Inject a mouse event via CDP.

**参数 / Parameters:**
```typescript
interface MouseEventParams {
  type: 'mousePressed' | 'mouseReleased' | 'mouseMoved' | 'mouseWheel';
  x: number;
  y: number;
  button?: 'left' | 'right' | 'middle' | 'none';
  clickCount?: number;
  deltaX?: number;
  deltaY?: number;
  modifiers?: number;  // 1=Alt, 2=Ctrl, 4=Meta, 8=Shift
}
```

##### `injectKeyboardEvent(params): Promise<void>`

通过 CDP 注入键盘事件。

Inject a keyboard event via CDP.

**参数 / Parameters:**
```typescript
interface KeyboardEventParams {
  type: 'keyDown' | 'keyUp' | 'char';
  key?: string;
  code?: string;
  text?: string;
  modifiers?: number;
}
```

##### `injectTouchEvent(params): Promise<void>`

通过 CDP 注入触摸事件。

Inject a touch event via CDP.

**参数 / Parameters:**
```typescript
interface TouchEventParams {
  type: 'touchStart' | 'touchEnd' | 'touchMove' | 'touchCancel';
  touchPoints: Array<{ x: number; y: number; id?: number }>;
  modifiers?: number;
}
```

---

### Actions (`actions.ts`)

命令执行调度器，包含 110+ 浏览器自动化命令。

Command execution dispatcher with 110+ browser automation commands.

#### 主导出 / Main Export

##### `executeCommand(command, browser): Promise<Response>`

执行命令并返回响应。

Execute a command and return a response.

**参数 / Parameters:**
- `command`: 验证后的命令对象 / Validated command object
- `browser`: BrowserManager 实例 / BrowserManager instance

**返回 / Returns:** 带成功/错误的响应对象 / Response with success/error

**示例 / Example:**
```typescript
const response = await executeCommand({
  id: '1',
  action: 'navigate',
  url: 'https://example.com'
}, browser);
```

#### 错误处理 / Error Handling

`toAIFriendlyError()` 函数将 Playwright 错误转换为有用的消息：

The `toAIFriendlyError()` function converts Playwright errors into helpful messages:

| Playwright 错误 / Error | AI 友好消息 / AI-Friendly Message |
|-----------------|-------------------|
| 严格模式违规（多个匹配）/ Strict mode violation | `"选择器匹配了 X 个元素。运行 'snapshot' 获取更新的引用，或使用更具体的 CSS 选择器。"` |
| 元素被覆盖遮挡 / Element blocked | `"元素被另一个元素遮挡（可能是模态框或覆盖层）。尝试先关闭任何模态框/cookie 横幅。"` |
| 元素不可见 / Element not visible | `"元素不可见。尝试滚动到视图或检查是否隐藏。"` |
| 元素未找到（超时）/ Element not found | `"元素未找到或不可见。运行 'snapshot' 查看当前页面元素。"` |

---

### Protocol (`protocol.ts`)

使用 Zod schemas 进行命令验证和序列化。

Command validation and serialization using Zod schemas.

#### 导出 / Exports

| 函数 / Function | 签名 / Signature | 描述 / Description |
|----------|-----------|-------------|
| `parseCommand` | `parseCommand(input: string): ParseResult` | 解析 JSON 字符串为验证的命令 / Parse JSON into validated command |
| `successResponse` | `successResponse<T>(id: string, data: T): Response<T>` | 创建成功响应 / Create success response |
| `errorResponse` | `errorResponse(id: string, error: string): Response` | 创建错误响应 / Create error response |
| `serializeResponse` | `serializeResponse(response: Response): string` | 序列化响应为 JSON / Serialize response to JSON |

#### `parseCommand(input)`

解析并验证 JSON 命令字符串。

Parse and validate a JSON command string.

**返回 / Returns:**
```typescript
type ParseResult =
  | { success: true; command: Command }
  | { success: false; error: string; id?: string }
```

**示例 / Example:**
```typescript
const result = parseCommand('{"id":"1","action":"click","selector":"@e5"}');
if (result.success) {
  await executeCommand(result.command, browser);
} else {
  console.error(result.error);
}
```

#### 命令 Schemas / Command Schemas

所有命令使用 Zod schemas 验证。每个命令包含：
All commands are validated using Zod schemas. Each command has:
- `id`: string - 命令标识符 / Command identifier
- `action`: string - 命令名称（区分符）/ Command name (discriminator)
- 操作特定参数 / Action-specific parameters

参见 [命令参考](#命令参考--command-reference) 查看所有 110+ 命令。

See [Command Reference](#命令参考--command-reference) for all 110+ commands.

---

### Snapshot (`snapshot.ts`)

可访问性树生成，包含元素引用，支持 AI 友好交互。

Accessibility tree generation with element refs for AI-friendly interaction.

#### 导出 / Exports

| 函数 / Function | 签名 / Signature | 描述 / Description |
|----------|-----------|-------------|
| `getEnhancedSnapshot` | `getEnhancedSnapshot(page, options?): Promise<EnhancedSnapshot>` | 生成带引用的可访问性快照 / Generate snapshot with refs |
| `parseRef` | `parseRef(arg: string): string \| null` | 从各种格式解析引用 / Parse ref from formats |
| `resetRefs` | `resetRefs(): void` | 重置引用计数器 / Reset ref counter |
| `getSnapshotStats` | `getSnapshotStats(tree, refs): SnapshotStats` | 获取快照统计 / Get snapshot statistics |

#### `getEnhancedSnapshot(page, options?)`

生成增强的可访问性快照，包含嵌入的引用。

Generate an enhanced accessibility snapshot with embedded refs.

**参数 / Parameters:**
```typescript
interface SnapshotOptions {
  interactive?: boolean;  // 仅交互元素 / Only interactive elements
  maxDepth?: number;       // 最大树深度 / Maximum tree depth
  compact?: boolean;       // 移除结构元素 / Remove structural elements
  selector?: string;       // CSS 选择器范围 / CSS selector scope
}
```

**返回 / Returns:**
```typescript
interface EnhancedSnapshot {
  tree: string;  // 格式化树 / Formatted tree
  refs: RefMap;  // ref -> { selector, role, name, nth? }
}
```

**输出格式 / Output Format:**
```
- heading "Welcome" [ref=e1] [level=1]
- paragraph: Introduction text
- button "Submit" [ref=e2]
- textbox "Email" [ref=e3]
- link "Learn more" [ref=e4]
```

#### `parseRef(arg)`

从各种格式解析引用。

Parse a ref from various formats.

**支持的格式 / Supported Formats:**
- `@e5` → `e5`
- `ref=e5` → `e5`
- `e5` → `e5`
- `invalid` → `null`

#### 角色类别 / Role Categories

**交互角色 / Interactive Roles**（始终获取引用 / always get refs）:
- button, link, textbox, checkbox, radio, combobox, listbox, menuitem, searchbox, slider, switch, tab, treeitem

**内容角色 / Content Roles**（命名时获取引用 / get refs if named）:
- heading, cell, gridcell, columnheader, rowheader, listitem, article, region, main, navigation

**结构角色 / Structural Roles**（紧凑模式下过滤 / filtered in compact mode）:
- generic, group, list, table, row, grid, toolbar, tablist, tree, document, presentation

---

### Stream Server (`stream-server.ts`)

WebSocket 服务器，用于浏览器视口流式传输和协同浏览。

WebSocket server for browser viewport streaming and pair browsing.

#### 类: StreamServer

```typescript
class StreamServer {
  start(): Promise<void>
  stop(): Promise<void>
  getPort(): number
  getClientCount(): number
}
```

#### `start()`

启动 WebSocket 服务器。

Start the WebSocket server.

**行为 / Behavior:**
- 在指定端口创建 WebSocketServer / Creates WebSocketServer on port
- 设置连接处理器 / Sets up connection handlers
- 首次客户端连接时启动屏幕截图 / Starts screencast on first connection

#### `stop()`

停止 WebSocket 服务器。

Stop the WebSocket server.

**行为 / Behavior:**
- 停止屏幕截图 / Stops screencasting
- 清除帧回调 / Clears frame callback
- 关闭所有客户端 / Closes all clients
- 关闭服务器 / Closes server

#### WebSocket 消息类型 / Message Types

**服务器 → 客户端 / Server → Client:**

| 类型 / Type | 描述 / Description |
|------|-------------|
| `frame` | 屏幕截图帧（base64 图像带元数据）/ Screencast frame (base64 with metadata) |
| `status` | 连接/屏幕截图状态 / Connection/screencast status |
| `error` | 错误消息 / Error message |

**客户端 → 服务器 / Client → Server:**

| 类型 / Type | 描述 / Description |
|------|-------------|
| `input_mouse` | 鼠标事件用于注入 / Mouse event for injection |
| `input_keyboard` | 键盘事件用于注入 / Keyboard event for injection |
| `input_touch` | 触摸事件用于注入 / Touch event for injection |

**帧消息 / Frame Message:**
```typescript
interface FrameMessage {
  type: 'frame';
  data: string;  // base64 编码图像 / encoded image
  metadata: {
    offsetTop: number;
    pageScaleFactor: number;
    deviceWidth: number;
    deviceHeight: number;
    scrollOffsetX: number;
    scrollOffsetY: number;
    timestamp?: number;
  };
}
```

---

### Types (`types.ts`)

整个系统的完整 TypeScript 类型定义。

Complete TypeScript type definitions for the entire system.

#### 关键类型 / Key Types

##### `Command`

所有 110+ 命令类型的联合：

Union of all 110+ command types:

```typescript
type Command =
  | LaunchCommand
  | NavigateCommand
  | ClickCommand
  | TypeCommand
  | FillCommand
  | CheckCommand
  | UncheckCommand
  | UploadCommand
  | DoubleClickCommand
  | FocusCommand
  | DragCommand
  | FrameCommand
  | MainFrameCommand
  | GetByRoleCommand
  | GetByTextCommand
  | GetByLabelCommand
  | GetByPlaceholderCommand
  | PressCommand
  | ScreenshotCommand
  | SnapshotCommand
  | EvaluateCommand
  | WaitCommand
  | ScrollCommand
  | SelectCommand
  | HoverCommand
  | ContentCommand
  | CloseCommand
  | TabNewCommand
  | TabListCommand
  | TabSwitchCommand
  | TabCloseCommand
  | WindowNewCommand
  | CookiesGetCommand
  | CookiesSetCommand
  | CookiesClearCommand
  | StorageGetCommand
  | StorageSetCommand
  | StorageClearCommand
  | DialogCommand
  | PdfCommand
  | RouteCommand
  | UnrouteCommand
  | RequestsCommand
  | DownloadCommand
  | GeolocationCommand
  | PermissionsCommand
  | ViewportCommand
  | UserAgentCommand
  | DeviceCommand
  | BackCommand
  | ForwardCommand
  | ReloadCommand
  | UrlCommand
  | TitleCommand
  | GetAttributeCommand
  | GetTextCommand
  | IsVisibleCommand
  | IsEnabledCommand
  | IsCheckedCommand
  | CountCommand
  | BoundingBoxCommand
  | StylesCommand
  | VideoStartCommand
  | VideoStopCommand
  | RecordingStartCommand
  | RecordingStopCommand
  | RecordingRestartCommand
  | TraceStartCommand
  | TraceStopCommand
  | HarStartCommand
  | HarStopCommand
  | StorageStateSaveCommand
  | ConsoleCommand
  | ErrorsCommand
  | KeyboardCommand
  | WheelCommand
  | TapCommand
  | ClipboardCommand
  | HighlightCommand
  | ClearCommand
  | SelectAllCommand
  | InnerTextCommand
  | InnerHtmlCommand
  | InputValueCommand
  | SetValueCommand
  | DispatchEventCommand
  | EvaluateHandleCommand
  | ExposeFunctionCommand
  | AddScriptCommand
  | AddStyleCommand
  | EmulateMediaCommand
  | OfflineCommand
  | HeadersCommand
  | PauseCommand
  | GetByAltTextCommand
  | GetByTitleCommand
  | GetByTestIdCommand
  | NthCommand
  | WaitForUrlCommand
  | WaitForLoadStateCommand
  | SetContentCommand
  | TimezoneCommand
  | LocaleCommand
  | HttpCredentialsCommand
  | MouseMoveCommand
  | MouseDownCommand
  | MouseUpCommand
  | BringToFrontCommand
  | WaitForFunctionCommand
  | ScrollIntoViewCommand
  | AddInitScriptCommand
  | KeyDownCommand
  | KeyUpCommand
  | InsertTextCommand
  | MultiSelectCommand
  | WaitForDownloadCommand
  | ResponseBodyCommand
  | ScreencastStartCommand
  | ScreencastStopCommand
  | InputMouseCommand
  | InputKeyboardCommand
  | InputTouchCommand;
```

##### `Response<T>`

成功或错误响应 / Success or error response:

```typescript
interface SuccessResponse<T = unknown> {
  id: string;
  success: true;
  data: T;
}

interface ErrorResponse {
  id: string;
  success: false;
  error: string;
}

type Response<T = unknown> = SuccessResponse<T> | ErrorResponse;
```

##### 数据类型 / Data Types

| 类型 / Type | 描述 / Description |
|------|-------------|
| `NavigateData` | `{ url: string, title: string }` |
| `ScreenshotData` | `{ path?: string, base64?: string }` |
| `SnapshotData` | `{ snapshot: string, refs?: Record<string, {role, name}> }` |
| `EvaluateData` | `{ result: unknown }` |
| `ContentData` | `{ html: string }` |
| `TabInfo` | `{ index: number, url: string, title: string, active: boolean }` |
| `TabListData` | `{ tabs: TabInfo[], active: number }` |
| `TabNewData` | `{ index: number, total: number }` |
| `TabSwitchData` | `{ index: number, url: string, title: string }` |
| `TabCloseData` | `{ closed: number, remaining: number }` |
| `RecordingStartData` | `{ started: boolean, path: string }` |
| `RecordingStopData` | `{ path: string, frames: number, error?: string }` |
| `RecordingRestartData` | `{ started: boolean, path: string, previousPath?: string, stopped: boolean }` |
| `InputEventData` | `{ injected: boolean }` |

---

## 命令参考 / Command Reference

所有 110+ 命令的完整参考，按类别组织。

Complete reference of all 110+ commands organized by category.

### 导航命令 / Navigation Commands

#### `launch`

使用指定选项启动浏览器。

Launch the browser with specified options.

```typescript
interface LaunchCommand {
  id: string;
  action: 'launch';
  headless?: boolean;
  viewport?: { width: number; height: number };
  browser?: 'chromium' | 'firefox' | 'webkit';
  cdpPort?: number;
  cdpUrl?: string;
  executablePath?: string;
  extensions?: string[];
  profile?: string;
  storageState?: string;
  proxy?: {
    server: string;
    bypass?: string;
    username?: string;
    password?: string;
  };
  args?: string[];
  userAgent?: string;
  provider?: string;
  ignoreHTTPSErrors?: boolean;
}
```

**示例 / Example:**
```json
{
  "id": "1",
  "action": "launch",
  "headless": true,
  "viewport": { "width": 1920, "height": 1080 }
}
```

**响应 / Response:** `{ launched: true }`

---

#### `navigate`

导航到 URL。

Navigate to a URL.

```typescript
interface NavigateCommand {
  id: string;
  action: 'navigate';
  url: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  headers?: Record<string, string>;
}
```

**响应 / Response:** `{ url: string, title: string }`

---

#### `back`

在浏览器历史中后退。

Go back in browser history.

**响应 / Response:** `{ url: string }`

---

#### `forward`

在浏览器历史中前进。

Go forward in browser history.

**响应 / Response:** `{ url: string }`

---

#### `reload`

重新加载当前页面。

Reload the current page.

**响应 / Response:** `{ url: string }`

---

#### `url`

获取当前 URL。

Get the current URL.

**响应 / Response:** `{ url: string }`

---

#### `title`

获取当前页面标题。

Get the current page title.

**响应 / Response:** `{ title: string }`

---

### 元素交互命令 / Element Interaction Commands

#### `click`

点击元素。

Click an element.

```typescript
interface ClickCommand {
  id: string;
  action: 'click';
  selector: string;  // CSS 选择器或引用 (如 "@e5") / CSS selector or ref
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
  delay?: number;
}
```

**示例 / Example:**
```json
{
  "id": "1",
  "action": "click",
  "selector": "@e5"
}
```

**响应 / Response:** `{ clicked: true }`

**错误处理 / Error Handling:**
- 多个匹配 → 建议使用更具体的选择器 / Multiple matches → use more specific selector
- 被覆盖遮挡 → 建议关闭模态框 / Blocked → dismiss modals
- 未找到 → 建议运行快照 / Not found → run snapshot

---

#### `dblclick`

双击元素。

Double-click an element.

```typescript
interface DoubleClickCommand {
  id: string;
  action: 'dblclick';
  selector: string;
}
```

**响应 / Response:** `{ clicked: true }`

---

#### `hover`

悬停在元素上。

Hover over an element.

```typescript
interface HoverCommand {
  id: string;
  action: 'hover';
  selector: string;
}
```

**响应 / Response:** `{ hovered: true }`

---

#### `focus`

聚焦元素。

Focus an element.

```typescript
interface FocusCommand {
  id: string;
  action: 'focus';
  selector: string;
}
```

**响应 / Response:** `{ focused: true }`

---

#### `tap`

轻触元素（触摸交互）。

Tap an element (touch interaction).

```typescript
interface TapCommand {
  id: string;
  action: 'tap';
  selector: string;
}
```

**响应 / Response:** `{ tapped: true }`

---

#### `drag`

拖放元素。

Drag and drop an element.

```typescript
interface DragCommand {
  id: string;
  action: 'drag';
  source: string;
  target: string;
}
```

**示例 / Example:**
```json
{
  "id": "1",
  "action": "drag",
  "source": "#draggable",
  "target": "#dropzone"
}
```

**响应 / Response:** `{ dragged: true }`

---

### 文本输入命令 / Text Input Commands

#### `type`

输入文本，带按键事件（类人）。

Type text with keypress events (human-like).

```typescript
interface TypeCommand {
  id: string;
  action: 'type';
  selector: string;
  text: string;
  delay?: number;
  clear?: boolean;
}
```

**响应 / Response:** `{ typed: true }`

---

#### `fill`

填充输入字段（即时，无按键事件）。

Fill an input field (instant, no keypress events).

```typescript
interface FillCommand {
  id: string;
  action: 'fill';
  selector: string;
  value: string;
}
```

**响应 / Response:** `{ filled: true }`

---

#### `clear`

清除输入字段。

Clear an input field.

```typescript
interface ClearCommand {
  id: string;
  action: 'clear';
  selector: string;
}
```

**响应 / Response:** `{ cleared: true }`

---

#### `selectall`

选择输入中的所有文本。

Select all text in an input.

```typescript
interface SelectAllCommand {
  id: string;
  action: 'selectall';
  selector: string;
}
```

**响应 / Response:** `{ selected: true }`

---

### 表单命令 / Form Commands

#### `check`

勾选复选框。

Check a checkbox.

```typescript
interface CheckCommand {
  id: string;
  action: 'check';
  selector: string;
}
```

**响应 / Response:** `{ checked: true }`

---

#### `uncheck`

取消勾选复选框。

Uncheck a checkbox.

```typescript
interface UncheckCommand {
  id: string;
  action: 'uncheck';
  selector: string;
}
```

**响应 / Response:** `{ unchecked: true }`

---

#### `select`

在下拉框中选择选项。

Select an option in a dropdown.

```typescript
interface SelectCommand {
  id: string;
  action: 'select';
  selector: string;
  values: string | string[];
}
```

**响应 / Response:** `{ selected: string[] }`

---

#### `multiselect`

选择多个选项。

Select multiple options.

```typescript
interface MultiSelectCommand {
  id: string;
  action: 'multiselect';
  selector: string;
  values: string[];
}
```

**响应 / Response:** `{ selected: string[] }`

---

#### `upload`

上传文件到文件输入。

Upload files to a file input.

```typescript
interface UploadCommand {
  id: string;
  action: 'upload';
  selector: string;
  files: string | string[];
}
```

**响应 / Response:** `{ uploaded: string[] }`

---

### 键盘命令 / Keyboard Commands

#### `press`

按下键盘键。

Press a keyboard key.

```typescript
interface PressCommand {
  id: string;
  action: 'press';
  key: string;  // 如 "Enter", "Control+a", "Shift+Tab"
  selector?: string;
}
```

**响应 / Response:** `{ pressed: true }`

---

#### `keyboard`

按下键盘快捷键。

Press keyboard shortcuts.

```typescript
interface KeyboardCommand {
  id: string;
  action: 'keyboard';
  keys: string;  // 如 "Control+a"
}
```

**响应 / Response:** `{ pressed: string }`

---

#### `keydown`

按住键。

Hold down a key.

```typescript
interface KeyDownCommand {
  id: string;
  action: 'keydown';
  key: string;
}
```

**响应 / Response:** `{ down: true, key: string }`

---

#### `keyup`

释放按住的键。

Release a held key.

```typescript
interface KeyUpCommand {
  id: string;
  action: 'keyup';
  key: string;
}
```

**响应 / Response:** `{ up: true, key: string }`

---

#### `inserttext`

插入文本，无按键事件。

Insert text without key events.

```typescript
interface InsertTextCommand {
  id: string;
  action: 'inserttext';
  text: string;
}
```

**响应 / Response:** `{ inserted: true }`

---

### 鼠标命令 / Mouse Commands

#### `mousemove`

移动鼠标到坐标。

Move mouse to coordinates.

```typescript
interface MouseMoveCommand {
  id: string;
  action: 'mousemove';
  x: number;
  y: number;
}
```

**响应 / Response:** `{ moved: true, x: number, y: number }`

---

#### `mousedown`

按下鼠标按钮。

Press mouse button down.

```typescript
interface MouseDownCommand {
  id: string;
  action: 'mousedown';
  button?: 'left' | 'right' | 'middle';
}
```

**响应 / Response:** `{ down: true }`

---

#### `mouseup`

释放鼠标按钮。

Release mouse button.

```typescript
interface MouseUpCommand {
  id: string;
  action: 'mouseup';
  button?: 'left' | 'right' | 'middle';
}
```

**响应 / Response:** `{ up: true }`

---

#### `wheel`

滚动鼠标滚轮。

Scroll mouse wheel.

```typescript
interface WheelCommand {
  id: string;
  action: 'wheel';
  deltaX?: number;
  deltaY?: number;
  selector?: string;
}
```

**响应 / Response:** `{ scrolled: true }`

---

### 语义定位器命令 / Semantic Locator Commands

#### `getbyrole`

通过 ARIA 角色定位元素并交互。

Locate element by ARIA role and interact.

```typescript
interface GetByRoleCommand {
  id: string;
  action: 'getbyrole';
  role: string;
  name?: string;
  subaction: 'click' | 'fill' | 'check' | 'hover';
  value?: string;
}
```

**示例 / Example:**
```json
{
  "id": "1",
  "action": "getbyrole",
  "role": "button",
  "name": "Submit",
  "subaction": "click"
}
```

**响应 / Response:** 根据子操作变化 / Varies by subaction

---

#### `getbytext`

通过文本内容定位元素。

Locate element by text content.

```typescript
interface GetByTextCommand {
  id: string;
  action: 'getbytext';
  text: string;
  exact?: boolean;
  subaction: 'click' | 'hover';
}
```

---

#### `getbylabel`

通过标签定位表单元素。

Locate form element by label.

```typescript
interface GetByLabelCommand {
  id: string;
  action: 'getbylabel';
  label: string;
  subaction: 'click' | 'fill' | 'check';
  value?: string;
}
```

---

#### `getbyplaceholder`

通过占位符文本定位输入。

Locate input by placeholder text.

```typescript
interface GetByPlaceholderCommand {
  id: string;
  action: 'getbyplaceholder';
  placeholder: string;
  subaction: 'click' | 'fill';
  value?: string;
}
```

---

#### `getbyalttext`

通过 alt 文本定位图像。

Locate image by alt text.

```typescript
interface GetByAltTextCommand {
  id: string;
  action: 'getbyalttext';
  text: string;
  exact?: boolean;
  subaction: 'click' | 'hover';
}
```

---

#### `getbytitle`

通过 title 属性定位元素。

Locate element by title attribute.

```typescript
interface GetByTitleCommand {
  id: string;
  action: 'getbytitle';
  text: string;
  exact?: boolean;
  subaction: 'click' | 'hover';
}
```

---

#### `getbytestid`

通过测试 ID 定位元素。

Locate element by test ID.

```typescript
interface GetByTestIdCommand {
  id: string;
  action: 'getbytestid';
  testId: string;
  subaction: 'click' | 'fill' | 'check' | 'hover';
  value?: string;
}
```

---

#### `nth`

获取第 n 个元素并交互。

Get nth element and interact.

```typescript
interface NthCommand {
  id: string;
  action: 'nth';
  selector: string;
  index: number;  // 0-based, or -1 for last / 从0开始，-1表示最后一个
  subaction: 'click' | 'fill' | 'check' | 'hover' | 'text';
  value?: string;
}
```

---

### 查询命令 / Query Commands

#### `snapshot`

获取带引用的可访问性快照。

Get accessibility snapshot with refs.

```typescript
interface SnapshotCommand {
  id: string;
  action: 'snapshot';
  interactive?: boolean;
  maxDepth?: number;
  compact?: boolean;
  selector?: string;
}
```

**响应 / Response:**
```typescript
{
  snapshot: string;
  refs?: Record<string, { role: string; name?: string }>;
}
```

---

#### `screenshot`

截取屏幕截图。

Take a screenshot.

```typescript
interface ScreenshotCommand {
  id: string;
  action: 'screenshot';
  path?: string;
  fullPage?: boolean;
  selector?: string;
  format?: 'png' | 'jpeg';
  quality?: number;  // 0-100, jpeg only
}
```

**响应 / Response:**
```typescript
{
  path?: string;
  base64?: string;
}
```

---

#### `content`

获取 HTML 内容。

Get HTML content.

```typescript
interface ContentCommand {
  id: string;
  action: 'content';
  selector?: string;
}
```

**响应 / Response:** `{ html: string }`

---

#### `getattribute`

获取属性值。

Get attribute value.

```typescript
interface GetAttributeCommand {
  id: string;
  action: 'getattribute';
  selector: string;
  attribute: string;
}
```

**响应 / Response:** `{ attribute: string, value: string }`

---

#### `gettext`

获取文本内容。

Get text content.

```typescript
interface GetTextCommand {
  id: string;
  action: 'gettext';
  selector: string;
}
```

**响应 / Response:** `{ text: string }`

---

#### `innertext`

获取内部文本。

Get inner text.

```typescript
interface InnerTextCommand {
  id: string;
  action: 'innertext';
  selector: string;
}
```

**响应 / Response:** `{ text: string }`

---

#### `innerhtml`

获取内部 HTML。

Get inner HTML.

```typescript
interface InnerHtmlCommand {
  id: string;
  action: 'innerhtml';
  selector: string;
}
```

**响应 / Response:** `{ html: string }`

---

#### `inputvalue`

获取输入字段值。

Get input field value.

```typescript
interface InputValueCommand {
  id: string;
  action: 'inputvalue';
  selector: string;
}
```

**响应 / Response:** `{ value: string }`

---

#### `setvalue`

直接设置输入值（无事件）。

Set input value directly (no events).

```typescript
interface SetValueCommand {
  id: string;
  action: 'setvalue';
  selector: string;
  value: string;
}
```

**响应 / Response:** `{ set: true }`

---

#### `isvisible`

检查元素是否可见。

Check if element is visible.

```typescript
interface IsVisibleCommand {
  id: string;
  action: 'isvisible';
  selector: string;
}
```

**响应 / Response:** `{ visible: boolean }`

---

#### `isenabled`

检查元素是否启用。

Check if element is enabled.

```typescript
interface IsEnabledCommand {
  id: string;
  action: 'isenabled';
  selector: string;
}
```

**响应 / Response:** `{ enabled: boolean }`

---

#### `ischecked`

检查复选框是否已勾选。

Check if checkbox is checked.

```typescript
interface IsCheckedCommand {
  id: string;
  action: 'ischecked';
  selector: string;
}
```

**响应 / Response:** `{ checked: boolean }`

---

#### `count`

计数匹配的元素。

Count matching elements.

```typescript
interface CountCommand {
  id: string;
  action: 'count';
  selector: string;
}
```

**响应 / Response:** `{ count: number }`

---

#### `boundingbox`

获取元素边界框。

Get element bounding box.

```typescript
interface BoundingBoxCommand {
  id: string;
  action: 'boundingbox';
  selector: string;
}
```

**响应 / Response:** `{ box: { x, y, width, height } }`

---

#### `styles`

获取计算样式。

Get computed styles.

```typescript
interface StylesCommand {
  id: string;
  action: 'styles';
  selector: string;
}
```

**响应 / Response:**
```typescript
{
  elements: Array<{
    tag: string;
    text: string | null;
    box: { x, y, width, height };
    styles: {
      fontSize: string;
      fontWeight: string;
      fontFamily: string;
      color: string;
      backgroundColor: string;
      borderRadius: string;
      border: string | null;
      boxShadow: string | null;
      padding: string;
    };
  }>;
}
```

---

### 框架命令 / Frame Commands

#### `frame`

切换到 iframe。

Switch to an iframe.

```typescript
interface FrameCommand {
  id: string;
  action: 'frame';
  selector?: string;
  name?: string;
  url?: string;
}
```

**响应 / Response:** `{ switched: true }`

---

#### `mainframe`

切换回主框架。

Switch back to main frame.

**响应 / Response:** `{ switched: true }`

---

### 标签页/窗口命令 / Tab/Window Commands

#### `tab_new`

创建新标签页。

Create a new tab.

```typescript
interface TabNewCommand {
  id: string;
  action: 'tab_new';
  url?: string;
}
```

**响应 / Response:** `{ index: number, total: number }`

---

#### `tab_list`

列出所有标签页。

List all tabs.

**响应 / Response:**
```typescript
{
  tabs: Array<{ index: number, url: string, title: string, active: boolean }>;
  active: number;
}
```

---

#### `tab_switch`

切换到标签页。

Switch to a tab.

```typescript
interface TabSwitchCommand {
  id: string;
  action: 'tab_switch';
  index: number;
}
```

**响应 / Response:** `{ index: number, url: string, title: string }`

---

#### `tab_close`

关闭标签页。

Close a tab.

```typescript
interface TabCloseCommand {
  id: string;
  action: 'tab_close';
  index?: number;
}
```

**响应 / Response:** `{ closed: number, remaining: number }`

---

#### `window_new`

创建新窗口。

Create a new window.

```typescript
interface WindowNewCommand {
  id: string;
  action: 'window_new';
  viewport?: { width: number; height: number };
}
```

**响应 / Response:** `{ index: number, total: number }`

---

#### `bringtofront`

将窗口置于前台。

Bring window to front.

**响应 / Response:** `{ focused: true }`

---

### 存储命令 / Storage Commands

#### `cookies_get`

获取 cookies。

Get cookies.

```typescript
interface CookiesGetCommand {
  id: string;
  action: 'cookies_get';
  urls?: string[];
}
```

**响应 / Response:** `{ cookies: Array<Cookie> }`

---

#### `cookies_set`

设置 cookies。

Set cookies.

```typescript
interface CookiesSetCommand {
  id: string;
  action: 'cookies_set';
  cookies: Array<{
    name: string;
    value: string;
    url?: string;
    domain?: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  }>;
}
```

**响应 / Response:** `{ set: true }`

---

#### `cookies_clear`

清除所有 cookies。

Clear all cookies.

**响应 / Response:** `{ cleared: true }`

---

#### `storage_get`

获取 localStorage/sessionStorage。

Get localStorage/sessionStorage.

```typescript
interface StorageGetCommand {
  id: string;
  action: 'storage_get';
  key?: string;
  type: 'local' | 'session';
}
```

**响应 / Response:**
- 带键 / With key: `{ key: string, value: string }`
- 不带键 / Without key: `{ data: Record<string, string> }`

---

#### `storage_set`

设置 localStorage/sessionStorage 值。

Set localStorage/sessionStorage value.

```typescript
interface StorageSetCommand {
  id: string;
  action: 'storage_set';
  key: string;
  value: string;
  type: 'local' | 'session';
}
```

**响应 / Response:** `{ set: true }`

---

#### `storage_clear`

清除存储。

Clear storage.

```typescript
interface StorageClearCommand {
  id: string;
  action: 'storage_clear';
  type: 'local' | 'session';
}
```

**响应 / Response:** `{ cleared: true }`

---

#### `state_save`

保存存储状态到文件。

Save storage state to file.

```typescript
interface StorageStateSaveCommand {
  id: string;
  action: 'state_save';
  path: string;
}
```

**响应 / Response:** `{ path: string }`

---

#### `state_load`

从文件加载存储状态（必须在启动时完成）。

Load storage state from file (must be done at launch).

**响应 / Response:** `{ note: string, path: string }`

---

### 网络命令 / Network Commands

#### `route`

添加路由以拦截请求。

Add a route to intercept requests.

```typescript
interface RouteCommand {
  id: string;
  action: 'route';
  url: string;
  response?: {
    status?: number;
    body?: string;
    contentType?: string;
    headers?: Record<string, string>;
  };
  abort?: boolean;
}
```

**响应 / Response:** `{ routed: string }`

---

#### `unroute`

移除路由。

Remove routes.

```typescript
interface UnrouteCommand {
  id: string;
  action: 'unroute';
  url?: string;
}
```

**响应 / Response:** `{ unrouted: string }`

---

#### `requests`

获取跟踪的请求。

Get tracked requests.

```typescript
interface RequestsCommand {
  id: string;
  action: 'requests';
  filter?: string;
  clear?: boolean;
}
```

**响应 / Response:** `{ requests: Array<Request> }`

---

#### `responsebody`

获取 URL 的响应体。

Get response body for a URL.

```typescript
interface ResponseBodyCommand {
  id: string;
  action: 'responsebody';
  url: string;
  timeout?: number;
}
```

**响应 / Response:**
```typescript
{
  url: string;
  status: number;
  body: unknown;  // 解析的 JSON 或字符串 / Parsed JSON or string
}
```

---

#### `download`

下载文件。

Download a file.

```typescript
interface DownloadCommand {
  id: string;
  action: 'download';
  selector: string;
  path: string;
}
```

**响应 / Response:**
```typescript
{
  path: string;
  suggestedFilename: string;
}
```

---

#### `waitfordownload`

等待下载完成。

Wait for download to complete.

```typescript
interface WaitForDownloadCommand {
  id: string;
  action: 'waitfordownload';
  path?: string;
  timeout?: number;
}
```

**响应 / Response:**
```typescript
{
  path: string;
  filename: string;
  url: string;
}
```

---

### 浏览器配置命令 / Browser Configuration Commands

#### `geolocation`

设置地理位置。

Set geolocation.

```typescript
interface GeolocationCommand {
  id: string;
  action: 'geolocation';
  latitude: number;
  longitude: number;
  accuracy?: number;
}
```

**响应 / Response:** `{ latitude: number, longitude: number }`

---

#### `permissions`

设置权限。

Set permissions.

```typescript
interface PermissionsCommand {
  id: string;
  action: 'permissions';
  permissions: string[];
  grant: boolean;
}
```

**响应 / Response:** `{ permissions: string[], granted: boolean }`

---

#### `viewport`

设置视口大小。

Set viewport size.

```typescript
interface ViewportCommand {
  id: string;
  action: 'viewport';
  width: number;
  height: number;
}
```

**响应 / Response:** `{ width: number, height: number }`

---

#### `device`

模拟设备。

Emulate a device.

```typescript
interface DeviceCommand {
  id: string;
  action: 'device';
  device: string;
}
```

**响应 / Response:**
```typescript
{
  device: string;
  viewport: { width, height };
  userAgent: string;
  deviceScaleFactor: number;
}
```

---

#### `useragent`

设置用户代理（注意：仅在启动时）。

Set user agent (note: only at launch).

```typescript
interface UserAgentCommand {
  id: string;
  action: 'useragent';
  userAgent: string;
}
```

---

#### `timezone`

设置时区（注意：仅在启动时）。

Set timezone (note: only at launch).

```typescript
interface TimezoneCommand {
  id: string;
  action: 'timezone';
  timezone: string;
}
```

---

#### `locale`

设置语言环境（注意：仅在启动时）。

Set locale (note: only at launch).

```typescript
interface LocaleCommand {
  id: string;
  action: 'locale';
  locale: string;
}
```

---

#### `credentials`

设置 HTTP 认证凭据。

Set HTTP authentication credentials.

```typescript
interface HttpCredentialsCommand {
  id: string;
  action: 'credentials';
  username: string;
  password: string;
}
```

**响应 / Response:** `{ set: true }`

---

#### `emulatemedia`

模拟媒体特性。

Emulate media features.

```typescript
interface EmulateMediaCommand {
  id: string;
  action: 'emulatemedia';
  media?: 'screen' | 'print' | null;
  colorScheme?: 'light' | 'dark' | 'no-preference' | null;
  reducedMotion?: 'reduce' | 'no-preference' | null;
  forcedColors?: 'active' | 'none' | null;
}
```

**响应 / Response:** `{ emulated: true }`

---

#### `offline`

设置离线模式。

Set offline mode.

```typescript
interface OfflineCommand {
  id: string;
  action: 'offline';
  offline: boolean;
}
```

**响应 / Response:** `{ offline: boolean }`

---

#### `headers`

设置额外的 HTTP 头。

Set extra HTTP headers.

```typescript
interface HeadersCommand {
  id: string;
  action: 'headers';
  headers: Record<string, string>;
}
```

**响应 / Response:** `{ set: true }`

---

### 对话框 & PDF 命令 / Dialog & PDF Commands

#### `dialog`

设置对话框处理器。

Set dialog handler.

```typescript
interface DialogCommand {
  id: string;
  action: 'dialog';
  response: 'accept' | 'dismiss';
  promptText?: string;
}
```

**响应 / Response:** `{ handler: 'set', response: string }`

---

#### `pdf`

将页面保存为 PDF。

Save page as PDF.

```typescript
interface PdfCommand {
  id: string;
  action: 'pdf';
  path: string;
  format?: 'Letter' | 'Legal' | 'Tabloid' | 'Ledger' | 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6';
}
```

**响应 / Response:** `{ path: string }`

---

### 录制 & 追踪命令 / Recording & Tracing Commands

#### `video_start`

开始视频录制（需要在启动时设置）。

Start video recording (requires setup at launch).

```typescript
interface VideoStartCommand {
  id: string;
  action: 'video_start';
  path: string;
}
```

---

#### `video_stop`

停止视频录制。

Stop video recording.

**响应 / Response:** `{ path?: string }`

---

#### `recording_start`

开始 Playwright 原生录制。

Start Playwright native recording.

```typescript
interface RecordingStartCommand {
  id: string;
  action: 'recording_start';
  path: string;  // 必须是 .webm / Must be .webm
  url?: string;
}
```

**响应 / Response:** `{ started: true, path: string }`

---

#### `recording_stop`

停止 Playwright 原生录制。

Stop Playwright native recording.

**响应 / Response:** `{ path: string, frames: number, error?: string }`

---

#### `recording_restart`

重新开始录制。

Restart recording.

```typescript
interface RecordingRestartCommand {
  id: string;
  action: 'recording_restart';
  path: string;
  url?: string;
}
```

**响应 / Response:** `{ started: true, path: string, previousPath?: string, stopped: boolean }`

---

#### `trace_start`

开始 Playwright 追踪。

Start Playwright tracing.

```typescript
interface TraceStartCommand {
  id: string;
  action: 'trace_start';
  screenshots?: boolean;
  snapshots?: boolean;
}
```

**响应 / Response:** `{ started: true }`

---

#### `trace_stop`

停止追踪并保存。

Stop tracing and save.

```typescript
interface TraceStopCommand {
  id: string;
  action: 'trace_stop';
  path: string;
}
```

**响应 / Response:** `{ path: string }`

---

#### `har_start`

开始 HAR 录制。

Start HAR recording.

**响应 / Response:** `{ started: true }`

---

#### `har_stop`

停止 HAR 录制。

Stop HAR recording.

```typescript
interface HarStopCommand {
  id: string;
  action: 'har_stop';
  path: string;
}
```

**响应 / Response:** `{ path: string, requestCount: number }`

---

#### `screencast_start`

开始屏幕截图流式传输。

Start screencast streaming.

```typescript
interface ScreencastStartCommand {
  id: string;
  action: 'screencast_start';
  format?: 'jpeg' | 'png';
  quality?: number;  // 0-100
  maxWidth?: number;
  maxHeight?: number;
  everyNthFrame?: number;
}
```

**响应 / Response:** `{ started: true, format: string, quality: number }`

---

#### `screencast_stop`

停止屏幕截图流式传输。

Stop screencast streaming.

**响应 / Response:** `{ stopped: true }`

---

### 输入注入命令 / Input Injection Commands

#### `input_mouse`

注入鼠标事件（用于协同浏览）。

Inject mouse event (for pair browsing).

```typescript
interface InputMouseCommand {
  id: string;
  action: 'input_mouse';
  type: 'mousePressed' | 'mouseReleased' | 'mouseMoved' | 'mouseWheel';
  x: number;
  y: number;
  button?: 'left' | 'right' | 'middle' | 'none';
  clickCount?: number;
  deltaX?: number;
  deltaY?: number;
  modifiers?: number;
}
```

**响应 / Response:** `{ injected: true }`

---

#### `input_keyboard`

注入键盘事件。

Inject keyboard event.

```typescript
interface InputKeyboardCommand {
  id: string;
  action: 'input_keyboard';
  type: 'keyDown' | 'keyUp' | 'char';
  key?: string;
  code?: string;
  text?: string;
  modifiers?: number;
}
```

**响应 / Response:** `{ injected: true }`

---

#### `input_touch`

注入触摸事件。

Inject touch event.

```typescript
interface InputTouchCommand {
  id: string;
  action: 'input_touch';
  type: 'touchStart' | 'touchEnd' | 'touchMove' | 'touchCancel';
  touchPoints: Array<{ x: number; y: number; id?: number }>;
  modifiers?: number;
}
```

**响应 / Response:** `{ injected: true }`

---

### 调试 & 工具命令 / Debug & Utility Commands

#### `evaluate`

执行 JavaScript。

Evaluate JavaScript.

```typescript
interface EvaluateCommand {
  id: string;
  action: 'evaluate';
  script: string;
  args?: unknown[];
}
```

**响应 / Response:** `{ result: unknown }`

---

#### `evalhandle`

执行并获取 JS 句柄。

Evaluate and get JS handle.

```typescript
interface EvaluateHandleCommand {
  id: string;
  action: 'evalhandle';
  script: string;
}
```

**响应 / Response:** `{ result: unknown }`

---

#### `wait`

等待条件。

Wait for condition.

```typescript
interface WaitCommand {
  id: string;
  action: 'wait';
  selector?: string;
  timeout?: number;
  state?: 'attached' | 'detached' | 'visible' | 'hidden';
}
```

**响应 / Response:** `{ waited: true }`

---

#### `waitforurl`

等待 URL。

Wait for URL.

```typescript
interface WaitForUrlCommand {
  id: string;
  action: 'waitforurl';
  url: string;
  timeout?: number;
}
```

**响应 / Response:** `{ url: string }`

---

#### `waitforloadstate`

等待加载状态。

Wait for load state.

```typescript
interface WaitForLoadStateCommand {
  id: string;
  action: 'waitforloadstate';
  state: 'load' | 'domcontentloaded' | 'networkidle';
  timeout?: number;
}
```

**响应 / Response:** `{ state: string }`

---

#### `waitforfunction`

等待 JS 函数返回真值。

Wait for JS function to return truthy.

```typescript
interface WaitForFunctionCommand {
  id: string;
  action: 'waitforfunction';
  expression: string;
  timeout?: number;
}
```

**响应 / Response:** `{ waited: true }`

---

#### `scroll`

滚动页面或元素。

Scroll page or element.

```typescript
interface ScrollCommand {
  id: string;
  action: 'scroll';
  selector?: string;
  x?: number;
  y?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
}
```

**响应 / Response:** `{ scrolled: true }`

---

#### `scrollintoview`

滚动元素到视图。

Scroll element into view.

```typescript
interface ScrollIntoViewCommand {
  id: string;
  action: 'scrollintoview';
  selector: string;
}
```

**响应 / Response:** `{ scrolled: true }`

---

#### `setcontent`

设置页面 HTML 内容。

Set page HTML content.

```typescript
interface SetContentCommand {
  id: string;
  action: 'setcontent';
  html: string;
}
```

**响应 / Response:** `{ set: true }`

---

#### `dispatch`

分发 DOM 事件。

Dispatch DOM event.

```typescript
interface DispatchEventCommand {
  id: string;
  action: 'dispatch';
  selector: string;
  event: string;
  eventInit?: Record<string, unknown>;
}
```

**响应 / Response:** `{ dispatched: string }`

---

#### `highlight`

高亮元素（用于调试）。

Highlight element (for debugging).

```typescript
interface HighlightCommand {
  id: string;
  action: 'highlight';
  selector: string;
}
```

**响应 / Response:** `{ highlighted: true }`

---

#### `expose`

向页面暴露函数。

Expose function to page.

```typescript
interface ExposeFunctionCommand {
  id: string;
  action: 'expose';
  name: string;
}
```

**响应 / Response:** `{ exposed: string }`

---

#### `addscript`

添加 script 标签。

Add script tag.

```typescript
interface AddScriptCommand {
  id: string;
  action: 'addscript';
  content?: string;
  url?: string;
}
```

**响应 / Response:** `{ added: true }`

---

#### `addstyle`

添加 style 标签。

Add style tag.

```typescript
interface AddStyleCommand {
  id: string;
  action: 'addstyle';
  content?: string;
  url?: string;
}
```

**响应 / Response:** `{ added: true }`

---

#### `addinitscript`

添加初始化脚本（每次导航时运行）。

Add init script (runs on every navigation).

```typescript
interface AddInitScriptCommand {
  id: string;
  action: 'addinitscript';
  script: string;
}
```

**响应 / Response:** `{ added: true }`

---

#### `clipboard`

剪贴板操作。

Clipboard operations.

```typescript
interface ClipboardCommand {
  id: string;
  action: 'clipboard';
  operation: 'copy' | 'paste' | 'read';
  text?: string;
}
```

**响应 / Response:** 根据操作变化 / Varies by operation

---

#### `console`

获取/清除控制台消息。

Get/clear console messages.

```typescript
interface ConsoleCommand {
  id: string;
  action: 'console';
  clear?: boolean;
}
```

**响应 / Response:** `{ messages?: ConsoleMessage[], cleared?: boolean }`

---

#### `errors`

获取/清除页面错误。

Get/clear page errors.

```typescript
interface ErrorsCommand {
  id: string;
  action: 'errors';
  clear?: boolean;
}
```

**响应 / Response:** `{ errors?: PageError[], cleared?: boolean }`

---

#### `pause`

暂停执行（用于调试）。

Pause execution (for debugging).

**响应 / Response:** `{ paused: true }`

---

#### `close`

关闭浏览器。

Close the browser.

**响应 / Response:** `{ closed: true }`

---

## 使用模式 / Usage Patterns

### 基于引用的交互 / Ref-Based Interaction

引用系统提供稳定、AI 友好的元素引用：

The ref system provides stable, AI-friendly element references:

1. **获取快照** 获取当前页面元素及引用 / **Take snapshot** to get elements with refs
2. **使用引用** 在命令中使用而非 CSS 选择器 / **Use refs** in commands instead of CSS selectors
3. **引用稳定** 即使页面结构变化仍保持有效 / **Refs remain stable** even if page changes

```typescript
// 1. 获取带引用的快照 / Get snapshot with refs
const { snapshot, refs } = await browser.getSnapshot({ interactive: true });
console.log(snapshot);
// - button "Submit" [ref=e5]
// - textbox "Email" [ref=e3]

// 2. 使用引用交互 / Use refs to interact
await browser.getLocator("@e5").click();  // 点击提交按钮 / Click Submit
await browser.getLocator("@e3").fill("user@example.com");  // 填写邮箱 / Fill Email
```

### 多标签页工作流 / Multi-Tab Workflows

```typescript
// 创建多个标签页 / Create multiple tabs
await browser.newTab();
await browser.navigate({ url: 'https://example.com' });

await browser.newTab();
await browser.navigate({ url: 'https://google.com' });

// 列出标签页 / List tabs
const tabs = await browser.listTabs();
tabs.forEach(tab => {
  console.log(`标签 ${tab.index}: ${tab.title} (${tab.url})`);
});

// 切换标签页 / Switch tabs
await browser.switchTo(0);

// 关闭标签页 / Close tab
await browser.closeTab(1);
```

### 会话管理 / Session Management

```typescript
import { setSession, startDaemon } from './daemon.js';

// 设置唯一会话以隔离 / Set unique session for isolation
setSession('my-session');

// 启动守护进程（使用会话的 socket/pid 文件）/ Start daemon
await startDaemon();
```

### 错误处理最佳实践 / Error Handling Best Practices

```typescript
try {
  await executeCommand({
    id: '1',
    action: 'click',
    selector: '@e5'
  }, browser);
} catch (error) {
  // AI 友好的错误消息指导故障排除 / AI-friendly errors guide troubleshooting
  if (error.message.includes('matched')) {
    // 多个匹配 - 使用更具体的选择器 / Multiple matches - use more specific selector
  } else if (error.message.includes('blocked')) {
    // 先关闭模态框/覆盖层 / Dismiss modal/overlay first
  } else if (error.message.includes('not found')) {
    // 运行快照获取更新的引用 / Run snapshot for updated refs
  }
}
```

---

## 协议规范 / Protocol Specification

### 命令格式 / Command Format

所有命令都是 JSON 对象：

All commands are JSON objects:

```json
{
  "id": "unique-command-id",
  "action": "command-name",
  "...": "command-specific-parameters"
}
```

### 响应格式 / Response Format

**成功响应 / Success Response:**
```json
{
  "id": "matching-command-id",
  "success": true,
  "data": { "result": "value" }
}
```

**错误响应 / Error Response:**
```json
{
  "id": "matching-command-id",
  "success": false,
  "error": "Error message describing what went wrong"
}
```

### 通信协议 / Communication Protocol

**通过 Unix Socket (Linux/Mac) 或 TCP (Windows): / Over Unix Socket or TCP:**

1. 客户端连接到 socket / Client connects to socket
2. 客户端发送 JSON 字符串 + 换行符作为命令 / Client sends JSON + newline as command
3. 服务器响应 JSON 字符串 + 换行符 / Server responds with JSON + newline
4. 双方保持连接用于多个命令 / Both persist connection for multiple commands

**示例 / Example:**
```bash
# 客户端发送 / Client sends:
{"id":"1","action":"navigate","url":"https://example.com"}\n

# 服务器响应 / Server responds:
{"id":"1","success":true,"data":{"url":"https://example.com","title":"Example Domain"}}\n
```

### WebSocket 流式传输协议 / WebSocket Streaming Protocol

**连接 / Connection:** `ws://localhost:9223` (默认 / default)

**服务器消息 / Messages from Server:**

帧 / Frame:
```json
{
  "type": "frame",
  "data": "base64-encoded-image...",
  "metadata": {
    "offsetTop": 0,
    "pageScaleFactor": 1,
    "deviceWidth": 1280,
    "deviceHeight": 720,
    "scrollOffsetX": 0,
    "scrollOffsetY": 100
  }
}
```

状态 / Status:
```json
{
  "type": "status",
  "connected": true,
  "screencasting": true,
  "viewportWidth": 1280,
  "viewportHeight": 720
}
```

**客户端消息 / Messages from Client:**

鼠标输入 / Mouse Input:
```json
{
  "type": "input_mouse",
  "eventType": "mousePressed",
  "x": 100,
  "y": 200,
  "button": "left",
  "clickCount": 1
}
```

键盘输入 / Keyboard Input:
```json
{
  "type": "input_keyboard",
  "eventType": "keyDown",
  "key": "Enter"
}
```

---

## 示例 / Examples

### 基本导航和交互 / Basic Navigation and Interaction

```typescript
import { BrowserManager } from './browser.js';
import { executeCommand } from './actions.js';

const browser = new BrowserManager();

// 启动浏览器 / Launch browser
await executeCommand({
  id: '1',
  action: 'launch',
  headless: true
}, browser);

// 导航到页面 / Navigate to page
await executeCommand({
  id: '2',
  action: 'navigate',
  url: 'https://example.com'
}, browser);

// 获取快照 / Get snapshot
const result = await executeCommand({
  id: '3',
  action: 'snapshot',
  interactive: true
}, browser);

console.log(result.data.snapshot);
// - heading "Example Domain" [ref=e1]
// - link "More information..." [ref=e2]

// 使用引用点击 / Click using ref
await executeCommand({
  id: '4',
  action: 'click',
  selector: '@e2'
}, browser);

// 截取屏幕截图 / Take screenshot
await executeCommand({
  id: '5',
  action: 'screenshot',
  path: './screenshot.png'
}, browser);

// 关闭浏览器 / Close browser
await executeCommand({
  id: '6',
  action: 'close'
}, browser);
```

### 表单填写示例 / Form Filling Example

```typescript
// 获取交互快照 / Get interactive snapshot
const snapshot = await browser.getSnapshot({ interactive: true });

// 使用引用填写表单 / Fill form using refs
await executeCommand({
  id: '1',
  action: 'fill',
  selector: '@e3',  // 邮箱文本框 / Email textbox
  value: 'user@example.com'
}, browser);

await executeCommand({
  id: '2',
  action: 'fill',
  selector: '@e4',  // 密码文本框 / Password textbox
  value: 'password123'
}, browser);

await executeCommand({
  id: '3',
  action: 'check',
  selector: '@e5'  // "记住我" 复选框 / "Remember me" checkbox
}, browser);

await executeCommand({
  id: '4',
  action: 'click',
  selector: '@e6'  // 提交按钮 / Submit button
}, browser);
```

### 网络拦截 / Network Interception

```typescript
// 模拟 API 响应 / Mock API responses
await executeCommand({
  id: '1',
  action: 'route',
  url: '**/api/users/**',
  response: {
    status: 200,
    body: JSON.stringify([{ id: 1, name: 'Mock User' }]),
    contentType: 'application/json'
  }
}, browser);

// 阻止分析 / Block analytics
await executeCommand({
  id: '2',
  action: 'route',
  url: '**/analytics/**',
  abort: true
}, browser);

// 跟踪请求 / Track requests
await executeCommand({
  id: '3',
  action: 'requests'
}, browser);

// 之后：移除路由 / Later: remove routes
await executeCommand({
  id: '4',
  action: 'unroute'
}, browser);
```

### 视频录制 / Video Recording

```typescript
// 开始录制 / Start recording
await executeCommand({
  id: '1',
  action: 'recording_start',
  path: './recording.webm',
  url: 'https://example.com'  // 可选 - 导航到此 URL / Optional - navigate to URL
}, browser);

// ... 执行操作 / ... perform actions

// 停止并保存录制 / Stop and save recording
await executeCommand({
  id: '2',
  action: 'recording_stop'
}, browser);
```

### 多标签页工作流 / Multi-Tab Workflow

```typescript
// 标签 1：搜索结果 / Tab 1: Search results
await executeCommand({
  id: '1',
  action: 'tab_new',
  url: 'https://google.com'
}, browser);

// 标签 2：文档 / Tab 2: Documentation
await executeCommand({
  id: '2',
  action: 'tab_new',
  url: 'https://docs.example.com'
}, browser);

// 列出标签页 / List tabs
const list = await executeCommand({
  id: '3',
  action: 'tab_list'
}, browser);
console.log(list.data.tabs);

// 切换回第一个标签页 / Switch back to first tab
await executeCommand({
  id: '4',
  action: 'tab_switch',
  index: 0
}, browser);
```

### 云浏览器连接 / Cloud Browser Connection

```typescript
// 连接到 Browserbase / Connect to Browserbase
await executeCommand({
  id: '1',
  action: 'launch',
  provider: 'browserbase'
}, browser);

// 或连接到 Browser Use / Or connect to Browser Use
await executeCommand({
  id: '2',
  action: 'launch',
  provider: 'browseruse'
}, browser);

// 或通过 CDP 连接本地 Chrome / Or connect to local Chrome via CDP
await executeCommand({
  id: '3',
  action: 'launch',
  cdpPort: 9222
}, browser);
```

---

## 索引 / Index

- **110+ 命令 / Commands** 组织成 20 个类别 / organized into 20 categories
- **7 个核心模块 / Core Modules** 带详细 API 文档 / with detailed API documentation
- **基于引用的交互 / Ref-Based Interaction** 用于 AI 友好元素选择 / for AI-friendly element selection
- **多标签页管理 / Multi-Tab Management** 完整生命周期控制 / with full lifecycle control
- **网络拦截 / Network Interception** 用于模拟和检查 / for mocking and inspection
- **录制与追踪 / Recording & Tracing** 用于调试和文档 / for debugging and documentation
- **云浏览器支持 / Cloud Browser Support** 支持 Browserbase 和 Browser Use / for Browserbase and Browser Use
- **CDP 连接 / CDP Connection** 连接运行的 Chrome 实例 / to running Chrome instances

---

*为 Agent Browser v1.0 生成 / Generated for Agent Browser v1.0*
*最后更新 / Last Updated: 2025*
