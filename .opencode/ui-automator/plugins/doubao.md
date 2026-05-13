# doubao 插件开发笔记

> 最后更新：2026-05-12 | 来源：doubao 插件创建 + v0.2.0 修复验证

## 摘要
doubao 插件用于自动化豆包 AI（字节跳动）的聊天和图片生成功能。

## 插件元信息

| 属性 | 值 |
|------|-----|
| 名称 | `doubao` |
| 版本 | 0.2.0 |
| 安装路径 | `~/.agent-browser/plugins/doubao-plugin/` |
| 注册名 | `doubao-plugin` |

## 命令

### `generate-image` ✅ 已验证
在豆包中生成 AI 图片（每次生成 4 张）。

```bash
agent-browser --cdp http://localhost:9221 --session db-img doubao-plugin generate-image "一只可爱的猫" --ratio 1:1 --wait 45
```

**流程**: /chat → 点击 "图像生成" → 填 Slate.js 编辑器 → 可选选比例 → Enter → 等待 `img[src*="rc_gen_image"]`

### `download` ✅ 已验证
生成图片并返回 URL 列表。

```bash
agent-browser --cdp http://localhost:9221 --session db-dl doubao-plugin download "美丽的风景" --ratio 9:16
```

### `chat` ✅ 已验证
发送聊天消息。

```bash
agent-browser --cdp http://localhost:9221 --session db-chat doubao-plugin chat "Python 怎么学？"
```

## v0.1.0 → v0.2.0 修复记录

| 问题 | 原因 | 修复 |
|------|------|------|
| generate-image 超时 | 导航到不存在的 `/chat/create-image` | 改为 `/chat` + 点击 "图像生成" 按钮 |
| 所有 data-testid 无效 | doubao.com 不使用 data-testid | 改用 textarea、role=textbox、clickByText |
| 图片模式输入失败 | 使用了隐藏的 textarea（h:0） | 改用 `[role="textbox"]` Slate.js 编辑器 |
| download 命令报错 | `this['generate-image']` 上下文丢失 | 提取 `doGenerateImage()` 为独立函数 |
| 图片选择器错误 | 使用了不存在的 data-testid | 改用 `img[src*="rc_gen_image"]` |

## 通用工具函数

### `clickByText(ctx, text, timeout)`
点击包含特定文本的按钮/链接。用于绕过没有稳定选择器的 UI 元素。

### `ensureChat(ctx)`
智能导航 — 检查当前 URL，仅在不在 doubao.com/chat 时才导航（避免丢失登录态）。

### `waitForApp(ctx, timeout)`
等待页面加载完成 — 检测 textarea 或 [role="textbox"] 出现。

## 从 Shell 脚本迁移说明

项目根目录有 20+ `doubao-*.sh` 脚本，这些脚本使用旧版 agent-browser CLI 语法：

- `--cdp-port` → `--cdp http://localhost:9221`
- `connect` → 不再需要，CDP 连接自动管理
- `eval --stdin` → `ctx.eval()` TypeScript 内联
- `sleep N` → `ctx.wait(N * 1000)`
- `mouse click X Y` → `find text/label + click`

## 变更记录
- 2026-05-12：v0.2.0 — 全面重写，修复所有 7 个 bug，通过 E2E 测试
- 2026-05-12：初始创建（v0.1.0，未经测试）
