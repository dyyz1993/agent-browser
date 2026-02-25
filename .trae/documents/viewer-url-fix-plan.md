# Viewer URL 参数修正计划

## 问题分析

当前 viewer URL 使用 `session` 参数：
```
http://localhost:5005/view?session=default
```

应该使用 `instanceId` 参数：
```
http://localhost:5005/view?instanceId=a1b2c3d4
```

## 原因

根据之前的架构设计：
- `session` 是 daemon 的标识符（如 "default"），用于 CLI 连接
- `instanceId` 是自动生成的唯一 ID（如 "a1b2c3d4"），用于 viewer URL

用户看到的应该是 `instanceId`，而不是内部的 `session` 名称。

## 需要修改的位置

### 1. actions.ts - handleViewer 函数 (L2235-2247)

**当前代码**：
```typescript
async function handleViewer(
  command: Command & { action: 'viewer' },
  _browser: BrowserManager
): Promise<Response<ViewerData>> {
  const session = getSession();
  const port = parseInt(process.env.AGENT_BROWSER_STREAM_PORT || '5005', 10);

  return successResponse(command.id, {
    url: `http://localhost:${port}/view?session=${session}`,
    wsUrl: `ws://localhost:${port}?session=${session}`,
    streamPort: port,
  });
}
```

**修改为**：
```typescript
async function handleViewer(
  command: Command & { action: 'viewer' },
  _browser: BrowserManager
): Promise<Response<ViewerData>> {
  const instanceId = getInstanceId();
  const port = parseInt(process.env.AGENT_BROWSER_STREAM_PORT || '5005', 10);

  return successResponse(command.id, {
    url: `http://localhost:${port}/view?instanceId=${instanceId}`,
    wsUrl: `ws://localhost:${port}?instanceId=${instanceId}`,
    streamPort: port,
  });
}
```

**需要添加 import**：
```typescript
import { getAppDir, getSession, getInstanceId } from './daemon.js';
```

## 关联代码确认

### 已正确使用 instanceId 的位置

1. **handleLaunch** (L505-516) ✅
   ```typescript
   viewerUrl: `http://localhost:5005/view?instanceId=${instanceId}`,
   ```

2. **daemon.ts CDP 连接** (L421-424) ✅
   ```typescript
   (response.data as Record<string, unknown>).viewerUrl = `http://localhost:5005/view?instanceId=${currentInstanceId}`;
   ```

### 需要修改的位置

1. **handleViewer** (L2235-2247) ❌
   - 当前使用 `session`
   - 需要改为 `instanceId`

## 实施步骤

1. 修改 `actions.ts` 的 import，添加 `getInstanceId`
2. 修改 `handleViewer` 函数，使用 `getInstanceId()` 替代 `getSession()`
3. 修改 URL 参数从 `session` 改为 `instanceId`
4. 编译并测试

## 影响范围

- `agent-browser viewer` 命令的输出
- viewer 页面的 URL 参数

## 验证方法

```bash
# 启动 daemon
agent-browser open example.com

# 执行 viewer 命令
agent-browser viewer

# 预期输出应该包含 instanceId 参数
# url: http://localhost:5005/view?instanceId=xxxxxxxx
```
