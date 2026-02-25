# 为 agent-browser 添加 `--diff` 功能计划

## 背景

在使用 `agent-browser` 进行自动化操作时，执行 `click`、`fill`、`type` 等交互命令后，虽然返回 `Done`，但无法直观看到操作是否产生了预期效果。需要手动执行 `snapshot` 来查看变化。

## 需求

为交互命令添加 `--diff` 参数，在操作前后自动对比页面变化并输出差异：

```bash
# 默认 diff：自动从操作元素往上找 3 层父元素作为监控范围
agent-browser click @e1 --diff

# 指定往上层数：往上找 5 层
agent-browser click @e1 --diff 5

# 全局 diff：对比整个页面
agent-browser click @e1 --diff full

# 局部 diff：指定选择器范围（高级用法）
agent-browser fill @e2 "hello" --diff "#form"
```

## 设计方案

### 1. 命令参数设计

```
--diff [scope]    操作后显示页面变化差异
                  scope 可选，默认往上 3 层父元素
                  - 数字 N：往上找 N 层父元素
                  - "full"：全局 diff
                  - CSS选择器：指定监控范围
```

**设计理由**：
- 默认往上找 3 层是最佳实践，大多数表单/按钮的变化都在这个范围内
- 避免全局 diff 输出过大
- 用户无需知道具体选择器，自动智能定位

### 2. 支持的命令

以下交互命令支持 `--diff` 参数：
- `click`
- `dblclick`
- `fill`
- `type`
- `hover`
- `focus`
- `check`
- `uncheck`
- `select`
- `press`

### 3. Diff 输出格式

```
✓ Done

--- Diff (scope: 3 levels up) ---
  button "登录" → button "已登录"           # 文本变化
  textbox value: "" → "13751880018"        # 值变化
+ button "获取验证码" [new]                 # 新增元素
- link "忘记密码" [removed]                 # 移除元素
```

## 实现步骤

### Step 1: 修改类型定义 (`src/types.ts`)

为交互命令添加 `diffScope` 字段：

```typescript
export type DiffScope = number | 'full' | string;

export interface ClickCommand extends BaseCommand {
  action: 'click';
  selector: string;
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
  delay?: number;
  inFrame?: string;
  diffScope?: DiffScope;  // 新增：数字=往上层数，'full'=全局，string=选择器
}
```

### Step 2: 修改命令解析 (`src/cli/commands.ts`)

为支持的命令添加 `--diff` 参数解析：

```typescript
case 'click': {
  const { inFrame, remaining } = parseInFrame(rest);
  
  // 解析 --diff 参数
  let diffScope: DiffScope | undefined;
  const diffIdx = remaining.indexOf('--diff');
  if (diffIdx !== -1) {
    remaining.splice(diffIdx, 1);
    const nextArg = remaining[diffIdx];
    
    if (nextArg === 'full') {
      diffScope = 'full';
      remaining.splice(diffIdx, 1);
    } else if (/^\d+$/.test(nextArg)) {
      diffScope = parseInt(nextArg, 10);
      remaining.splice(diffIdx, 1);
    } else if (nextArg && !nextArg.startsWith('-') && !nextArg.startsWith('@')) {
      // CSS 选择器
      diffScope = nextArg;
      remaining.splice(diffIdx, 1);
    } else {
      // 默认往上 3 层
      diffScope = 3;
    }
  }
  
  const selector = remaining[0];
  if (!selector) error('Missing selector', 'agent-browser click <selector> [--diff [scope]] [--in-frame <path>]');
  return { id, action: 'click', selector, inFrame, diffScope };
}
```

### Step 3: 实现 Diff 计算模块 (`src/diff.ts`)

创建专门的差异计算模块：

```typescript
import type { Locator, Frame } from 'playwright-core';

export interface SnapshotDiff {
  added: ElementInfo[];      // 新增元素
  removed: ElementInfo[];    // 移除元素
  changed: ElementChange[];  // 变化元素
  scope: string;             // diff 范围描述
}

export interface ElementInfo {
  role: string;
  name?: string;
  value?: string;
  text?: string;
}

export interface ElementChange {
  role: string;
  name?: string;
  before: { value?: string; text?: string };
  after: { value?: string; text?: string };
}

/**
 * 根据操作元素和 scope 计算 diff 目标选择器
 */
export async function getDiffTarget(
  locator: Locator,
  scope: DiffScope
): Promise<{ target: Locator; description: string }> {
  if (scope === 'full') {
    return { target: locator.page(), description: 'full page' };
  }
  
  if (typeof scope === 'string') {
    // CSS 选择器
    return { target: locator.page().locator(scope), description: scope };
  }
  
  // 数字：往上找 N 层父元素
  const levels = scope as number;
  let parent = locator;
  for (let i = 0; i < levels; i++) {
    parent = parent.locator('xpath=..');
  }
  return { target: parent, description: `${levels} levels up` };
}

export function computeDiff(before: string, after: string): SnapshotDiff;
export function formatDiff(diff: SnapshotDiff): string;
```

### Step 4: 修改 Action 处理器 (`src/actions.ts`)

在交互命令处理器中添加 diff 逻辑：

```typescript
async function handleClick(command: ClickCommand, browser: BrowserManager): Promise<Response> {
  const frame = browser.getFrame(command.inFrame);
  const locator = frame.locator(command.selector);
  
  // 如果需要 diff，先获取操作前的快照
  let beforeSnapshot: string | undefined;
  let diffTarget: { target: any; description: string } | undefined;
  
  if (command.diffScope !== undefined) {
    diffTarget = await getDiffTarget(locator, command.diffScope);
    beforeSnapshot = await getSnapshotText(diffTarget.target);
  }
  
  try {
    await locator.click({
      button: command.button,
      clickCount: command.clickCount,
      delay: command.delay,
    });
  } catch (error) {
    throw toAIFriendlyError(error, command.selector);
  }
  
  // 如果需要 diff，获取操作后的快照并计算差异
  let diffOutput: string | undefined;
  if (command.diffScope !== undefined && diffTarget) {
    await frame.waitForTimeout(100); // 等待 DOM 更新
    const afterSnapshot = await getSnapshotText(diffTarget.target);
    const diff = computeDiff(beforeSnapshot!, afterSnapshot);
    diff.scope = diffTarget.description;
    diffOutput = formatDiff(diff);
  }
  
  return successResponse(command.id, { 
    clicked: true,
    diff: diffOutput 
  });
}
```

### Step 5: 修改输出格式 (`src/cli/output.ts`)

在输出结果时显示 diff 信息：

```typescript
if (result.diff) {
  console.log(`\n--- Diff (scope: ${result.diff.scope}) ---`);
  console.log(result.diff.output);
}
```

### Step 6: 更新帮助信息 (`src/cli/help.ts`)

添加 `--diff` 参数的帮助说明：

```typescript
const diffHelp = `
  --diff [scope]    Show page changes after action
                    scope options:
                      - (no arg)  3 levels up from target element (default)
                      - N         N levels up from target element
                      - full      entire page
                      - selector  CSS selector for diff scope
`;
```

### Step 7: 同步更新 Rust CLI (`cli/src/commands.rs`, `cli/src/flags.rs`)

确保 Rust CLI 也支持相同的参数解析。

## 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `src/types.ts` | 添加 `DiffScope` 类型和 `diffScope` 字段 |
| `src/cli/commands.ts` | 添加 `--diff` 参数解析 |
| `src/cli/output.ts` | 修改输出格式，显示 diff |
| `src/cli/help.ts` | 添加 `--diff` 帮助说明 |
| `src/diff.ts` | 新建：差异计算模块 |
| `src/actions.ts` | 修改交互命令处理器，添加 diff 逻辑 |
| `cli/src/commands.rs` | 同步 Rust CLI 参数解析 |
| `cli/src/flags.rs` | 同步 Rust CLI flags |

## 测试用例

```bash
# 测试默认 diff（往上 3 层）
agent-browser open https://example.com
agent-browser snapshot -i
agent-browser click @e1 --diff

# 测试往上 5 层
agent-browser click @e1 --diff 5

# 测试全局 diff
agent-browser click @e1 --diff full

# 测试指定选择器
agent-browser fill @e2 "hello" --diff "#form"

# 测试 iframe 内的 diff
agent-browser click @e3 --diff --in-frame "#iframe"

# 测试无变化的情况
agent-browser hover @e4 --diff
```

## 注意事项

1. **性能考虑**：diff 功能会增加一次额外的 snapshot 调用，对于复杂页面可能增加延迟
2. **等待策略**：操作后需要适当等待 DOM 更新，可以使用固定延迟或等待特定条件
3. **输出长度**：默认往上 3 层可以有效控制输出长度
4. **错误处理**：如果 diff 计算失败，不应影响主操作的返回结果

## 可选扩展

1. `--diff-timeout` 参数：设置等待 DOM 更新的超时时间
2. `--diff-format` 参数：支持 `text` / `json` 输出格式
3. `--diff-ignore` 参数：忽略特定元素的变化
