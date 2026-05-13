# DeepSeek 选择器库

> 最后更新：2026-05-12 | 来源：deepseek 插件 E2E 测试（5/6 pass）

## 摘要
DeepSeek (https://chat.deepseek.com/) 的 DOM 选择器和页面结构分析。所有 class 名被 CSS Modules 混淆，需通过 text/role/attribute 等语义选择器定位。

## 页面 URL 模式

| 页面 | URL 模式 |
|------|----------|
| 首页（含模式切换） | `https://chat.deepseek.com/` |
| 对话详情 | `https://chat.deepseek.com/a/chat/s/{uuid}` |

## 稳定选择器

### 侧栏（历史会话）

| 目标 | 选择器 | 稳定性 |
|------|--------|--------|
| 侧栏容器 | `nav` | ★★★ - 语义标签，稳定 |
| 侧栏容器 | `[class*="sidebar"]` | ★★ - class 名模糊匹配，但 CSS Modules 可能变化 |
| 会话列表 | `a[href*="/a/chat/s/"]` | ★★★★ - href 包含唯一模式，非常稳定 |
| 开启新对话按钮 | 文本 `"开启新对话"` | ★★★ - 文本内容稳定可靠 |
| 开启新对话按钮 | 位置：侧栏顶部第一个 DIV，`left<100`，`height≈40` | ★★ - 位置特征 |

### 模式切换（仅首页可见）

| 目标 | 选择器 | 稳定性 |
|------|--------|--------|
| 快速模式 | `[role="radio"]` 文本含"快速模式" | ★★★ |
| 专家模式 | `[role="radio"]` 文本含"专家模式" | ★★★ |
| 深度思考 | `button` 文本含"深度思考" | ★★★ |
| 智能搜索 | `button` 文本含"智能搜索" | ★★★ |

### 聊天输入

| 目标 | 选择器 | 稳定性 |
|------|--------|--------|
| 输入框 | `textarea` | ★★★★ - 唯一 textarea 元素 |
| 发送方式 | `Enter` 键 | ★★★ - 输入框聚焦状态下 keydown |

## DOM 结构特征

```
nav (侧栏)
├── div[role="button"] (开启新对话, 图标按钮)
│   └── svg (加号图标)
├── a[href="/a/chat/s/{uuid}"] (会话 1)
├── a[href="/a/chat/s/{uuid}"] (会话 2)
└── ... (更多会话)

main / content area (首页)
├── [role="radio"] (快速模式)
├── [role="radio"] (专家模式)
├── button (深度思考, ds-atom-button class)
├── button (智能搜索, ds-atom-button class)
└── textarea (消息输入框)
```

## CSS Modules class 样本（2026-05 采集）

```
模式切换: _9f2341b _7ac2123 [_31a22b0 选中态]
底部 Toggle: ds-atom-button f79352dc ds-tog-[on|off]
```

## 注意事项

1. **模式切换只在首页可见** — 进入对话详情后消失，需要先 `window.location.href = "/"` 回到首页
2. **快速/专家按钮无 aria-label** — 纯文本定位，textContent 含重复文本（"快速模式快速模式"），用 `.includes()` 匹配
3. **深度思考和智能搜索** — `aria-pressed` 属性反映状态，`data-state` 也反映状态
4. **新建页面看不到历史会话** — 必须使用已有页面的 WS 端点连接，不能 `newPage()`
5. **CSS Modules class 名随机** — 每次构建可能变化，不能用 class 做稳定选择器

## 变更记录
- 2026-05-12：E2E 测试验证 — 5/6 命令通过，流式响应检测仍为已知限制
- 2026-05-12：初始创建（deepseek-cdp-raw.cjs 全链路测试返回）
