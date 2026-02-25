# Connection Timeout 问题调研

## 问题描述

执行 `agent-browser click "button.btn-data:nth-child(2)"` 时出现 `Connection timeout` 错误。

## 分析

### 1. 命令支持情况

`click` 命令是支持的，在 `src/cli/commands.ts:108-117` 中定义：

```typescript
case 'click': {
  const { inFrame, remaining: r1 } = parseInFrame(rest);
  const { diffScope, remaining: r2 } = parseDiff(r1);
  const { config: human, remaining } = parseHumanFlag(r2);
  const selector = remaining[0];
  if (!selector) error('Missing selector', 'agent-browser click <selector>...');
  const cmd: Command = { id, action: 'click', selector, inFrame, diffScope };
  if (human.enabled) cmd.human = human;
  return cmd;
}
```

### 2. 错误来源

错误来自 `src/cli/connection.ts:469-471`：

```typescript
socket.on('timeout', () => {
  socket.end();
  reject(new Error('Connection timeout'));
});
```

### 3. 可能的原因

1. **Daemon 未启动**：需要先执行一个会启动 daemon 的命令（如 `open`）
2. **Daemon 已崩溃**：之前的操作可能导致 daemon 崩溃
3. **Socket 文件不存在**：daemon 的 socket 文件可能被删除

### 4. 解决方案

需要先启动浏览器（daemon），然后再执行 click 命令：

```bash
# 方法1：使用 open 命令启动 daemon
agent-browser open https://www.baidu.com
agent-browser click "#kw"

# 方法2：使用 --headed 参数启动
agent-browser --headed open https://www.baidu.com
agent-browser click "#kw"

# 方法3：检查 daemon 状态
agent-browser session list
```

## 结论

`click` 命令是支持的，但需要先启动 daemon（通过 `open` 命令）。单独执行 `click` 命令时，如果没有运行中的 daemon，会出现 Connection timeout 错误。
