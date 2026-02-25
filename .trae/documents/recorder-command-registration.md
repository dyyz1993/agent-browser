# Recorder 命令注册计划

## 问题分析

### 当前状态
- `recorder` 命令已在以下地方实现：
  - ✅ `src/types.ts` - 类型定义已存在
  - ✅ `src/actions.ts` - action handler 已实现
  - ✅ `src/cli/commands.ts` - CLI 命令解析已实现
  - ✅ `src/__tests__/utils/parseCli.ts` - 测试工具已支持

- ❌ `src/protocol.ts` - **缺少 schema 定义**，导致验证失败

### 错误信息
```
Validation error: action: Invalid discriminator value. Expected 'launch' | 'navigate' | ... | 'recording_start' | 'recording_stop' | ...
```

`recorder_start`, `recorder_stop`, `recorder_status` 不在允许的 action 列表中。

---

## 命令命名讨论

### 现有相关命令
| 命令 | 用途 |
|------|------|
| `recording_start/stop/restart` | Playwright 原生视频录制 |
| `video_start/stop` | 视频录制 |
| `trace_start/stop` | 追踪录制 |
| `har_start/stop` | HAR 录制 |

### 建议方案

**方案 A: 使用 `recorder` 命令** (当前实现)
```
agent-browser recorder start [url]
agent-browser recorder stop [--output file]
agent-browser recorder status
```
- 优点：语义清晰，专门用于行为录制
- 缺点：需要新增 action 类型

**方案 B: 扩展 `recording` 命令**
```
agent-browser recording start-behavior [url]
agent-browser recording stop-behavior [--output file]
```
- 优点：复用现有命令
- 缺点：命令较长，语义不够清晰

**方案 C: 使用 `behavior` 命令**
```
agent-browser behavior start [url]
agent-browser behavior stop [--output file]
agent-browser behavior status
```
- 优点：语义明确，专门用于行为录制
- 缺点：需要新增 action 类型

### 推荐方案
**保持使用 `recorder` 命令**，因为：
1. 语义清晰，专门用于录制用户交互行为
2. 与 `recording` (视频录制) 区分开
3. 已有代码实现

---

## 需要修改的文件

### 1. src/protocol.ts
添加 schema 定义：

```typescript
// Recorder schemas (user interaction recording)
const recorderStartSchema = baseCommandSchema.extend({
  action: z.literal('recorder_start'),
  url: z.string().min(1).optional(),
});

const recorderStopSchema = baseCommandSchema.extend({
  action: z.literal('recorder_stop'),
  output: z.string().min(1).optional(),
});

const recorderStatusSchema = baseCommandSchema.extend({
  action: z.literal('recorder_status'),
});
```

并在 `commandSchema` 的 discriminatedUnion 中添加：
```typescript
recorderStartSchema,
recorderStopSchema,
recorderStatusSchema,
```

### 2. src/types.ts
确认类型定义已存在（已确认存在）

### 3. src/actions.ts
确认 action handler 已实现（已确认存在）

### 4. src/cli/commands.ts
确认 CLI 命令解析已实现（已确认存在）

---

## 任务列表

- [ ] Task 1: 在 protocol.ts 中添加 recorder schema 定义
- [ ] Task 2: 在 commandSchema 中添加新的 schema
- [ ] Task 3: 构建并测试验证
