# opencode-usage 插件开发笔记

> 最后更新：2026-05-12 | 来源：子任务 "opencode-usage plugin"

## 摘要
opencode-usage 插件用于查询 OpenCode Go 工作区的 3 维用量数据（滚动/每周/每月）。

## 插件元信息

| 属性 | 值 |
|------|-----|
| 名称 | `opencode-usage` |
| 版本 | 0.1.0 |
| 安装路径 | `~/.agent-browser/plugins/opencode-usage/` |

## 命令

### `check`
提取工作区用量数据。

```bash
# 默认工作区
agent-browser --cdp http://localhost:9221 opencode-usage check

# 指定工作区
agent-browser --cdp http://localhost:9221 opencode-usage check --workspace wrk_xxx
```

输出：
```
Workspace: wrk_01KNB7EPDEHQC7DZCG9DBRTNGC
Plan: 您已订阅 OpenCode Go。
Time: 2026/5/12 06:56

Usage (3 dimensions):
  滚动用量    10%  重置于 2 小时 59 分钟
  每周用量     4%  重置于 6 天 1 小时
  每月用量     2%  重置于 30 天 21 小时

Use balance when limit reached: OFF
```

## 架构依赖

- **登录态**: 必须通过 CDP 连接用户已登录的浏览器（HttpOnly Cookie）
- **数据源**: SSR HTML 页面，无 REST API
- **选择器**: 使用 `data-slot` 属性（参见 selectors/opencode.md）

## 已知问题

1. **jiti 缓存**: 插件更新后需清除 jiti 缓存（参见 troubleshooting/jiti-cache.md）
2. **会话依赖**: `ctx.goto()` 可能导致 OpenAuth 会话断开，应尽量复用当前 URL

## 变更记录
- 2026-05-12：初始创建
