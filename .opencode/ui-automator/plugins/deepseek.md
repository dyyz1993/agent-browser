# DeepSeek 插件开发笔记

> 最后更新：2026-05-12 | 来源：deepseek-cdp-raw.cjs 全链路测试

## 摘要
DeepSeek 浏览器自动化插件的设计和实现笔记。基于 CDP 原始连接模式，为 agent-browser 提供 DeepSeek 专属 CLI 命令。

## 插件架构

```
cdp-raw 连接器（通用底层）
  └── deepseek 插件（站点专属）
        ├── deepseek connect     → 连接 DeepSeek 已有页面
        ├── deepseek list        → 列出历史会话
        ├── deepseek open <idx>  → 打开某会话
        ├── deepseek new         → 新建对话
        ├── deepseek send <msg>  → 发送消息
        ├── deepseek mode <mode> → 切换模式（快速/专家）
        ├── deepseek deepthink   → 切换深度思考
        └── deepseek search      → 切换智能搜索
```

## 关键发现

### 连接方式
- **必须**使用页面级 WS 端点直接连接，不能用 `connectOverCDP()`
- 页面级 WS URL 格式：`ws://localhost:9221/devtools/page/{UUID}`
- 通过 `http://localhost:9221/json` 获取所有目标
- 过滤 `url.includes('chat.deepseek.com')` 找 DeepSeek 页面

### 稳定选择器

| 目标 | 最佳定位方式 |
|------|-------------|
| 侧栏会话 | `a[href*="/a/chat/s/"]` — 按语义查找 |
| 新聊天按钮 | 文本 `"开启新对话"` |
| 快速/专家模式 | `[role="radio"]` + textContent |
| 深度思考 | `button` + textContent includes "深度思考" |
| 智能搜索 | `button` + textContent includes "智能搜索" |
| 输入框 | `textarea` — 页面唯一 |

### 流程提醒
1. **读会话列表之前**：确保在首页，不在首页先 navigate
2. **模式切换之前**：必须先回到首页（`window.location.href = "/"`）
3. **发送消息**：输入后按 Enter（`Input.dispatchKeyEvent` 三件套）
4. **新建对话**：点击"开启新对话"后页面 URL 回到 `/`

## 已知踩坑

| 问题 | 解决 |
|------|------|
| Entry 重复文本："快速模式快速模式" | 用 `.includes()` 而非严格匹配 |
| 新建对话按钮无 aria-label | 用文本 "开启新对话" 定位 |
| 模式切换仅在首页 | 先 navigate 到首页再操作 |
| 响应检测困难（流式输出） | 等待足够长时间后检查 `totalChars` 变化 |
| CSS Modules 类名随机 | 不用 class，用语义/文本定位 |

## 变更记录
- 2026-05-12：初始创建（deepseek-cdp-raw.cjs 全链路测试返回）
