# 修复 Stream Port 默认值问题

## 问题分析

### 当前问题
1. `daemon.ts` 中已定义 `DEFAULT_STREAM_PORT = 9223`，但没有使用
2. `startDaemon` 函数中默认值是 `0`，而不是 `DEFAULT_STREAM_PORT`
3. `flags.ts` 中添加了不必要的 `streamPort` 和 `noStream` 字段

### 原有逻辑
```typescript
// daemon.ts L27
const DEFAULT_STREAM_PORT = 9223;

// daemon.ts L344-348 - 问题在这里，默认是 0
const streamPort =
  options?.streamPort ??
  (process.env.AGENT_BROWSER_STREAM_PORT
    ? parseInt(process.env.AGENT_BROWSER_STREAM_PORT, 10)
    : 0);  // <-- 应该是 DEFAULT_STREAM_PORT
```

### 端口约定
- WebSocket 端口: `streamPort` (默认 9223)
- HTTP 端口: `streamPort + 1` (默认 9224) - 已实现

## 修复方案

### 1. 修改 daemon.ts
将默认值从 `0` 改为 `DEFAULT_STREAM_PORT`：

```typescript
const streamPort =
  options?.streamPort ??
  (process.env.AGENT_BROWSER_STREAM_PORT
    ? parseInt(process.env.AGENT_BROWSER_STREAM_PORT, 10)
    : DEFAULT_STREAM_PORT);
```

### 2. 撤销 flags.ts 的修改
删除添加的 `streamPort` 和 `noStream` 字段，恢复原始状态。

### 3. 撤销 cli.ts 的修改
删除 `streamPort` 相关代码。

### 4. 撤销 connection.ts 的修改
删除 `streamPort` 相关代码和自动重启逻辑。

## 文件修改清单

| 文件 | 操作 |
|------|------|
| `src/daemon.ts` | 修改默认值为 `DEFAULT_STREAM_PORT` |
| `src/cli/flags.ts` | 撤销 `streamPort` 和 `noStream` 相关修改 |
| `src/cli.ts` | 撤销 `streamPort` 相关修改 |
| `src/cli/connection.ts` | 撤销 `streamPort` 和自动重启逻辑 |
