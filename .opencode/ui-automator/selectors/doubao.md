# 豆包 (doubao.com) — 选择器库

> 最后更新：2026-05-12 | 来源：doubao shell 脚本分析 + v0.2.0 实测验证

## 摘要
豆包 AI（字节跳动）的 Web 界面，提供聊天和图片生成功能。站点**没有 data-testid 属性**，所有之前的 data-testid 选择器均已验证为无效。

## 重要架构发现

- **无 data-testid**: doubao.com 全站 0 个 data-testid 属性
- **双模式编辑器**: 聊天模式用 `<textarea>`，图片模式用 Slate.js `[role="textbox"]`
- **图片生成是模式切换**: `/chat/create-image` URL 不存在，必须从 `/chat` 点击 "图像生成" 按钮切换
- **图片生成返回 4 张图**: 每次 `rc_gen_image` 请求返回 4 张缩略图

## 聊天模式 (`https://www.doubao.com/chat`)

| 选择器 | 用途 | 稳定性 |
|--------|------|--------|
| `textarea[placeholder="发消息..."]` | 聊天输入框（主选择器） | ✅ 稳定（Semi Design） |
| `textarea` | 聊天输入框（备选） | ✅ 稳定 |
| Enter 键 | 发送消息 | ✅ 稳定 |

**登录态检测**: 无明确的 avatar/login 元素。通过历史对话列表判断是否登录（8+ 条历史 = 已登录）。

## 图片生成模式（从 /chat 切换）

| 选择器 | 用途 | 稳定性 |
|--------|------|--------|
| 按钮文本 "图像生成" | 切换到图片模式 | ✅ 稳定（用 clickByText） |
| 按钮文本 "图片生成" | 备选切换按钮文本 | ✅ 稳定 |
| `[role="textbox"][data-slate-editor]` | 图片模式输入框（Slate.js） | ✅ 稳定 |
| `[role="textbox"]` | 图片模式输入框（简写） | ✅ 稳定 |
| 按钮文本 "比例" | 比例选择按钮 | ✅ 稳定 |
| Enter 键 | 发送生成请求 | ✅ 稳定 |
| `img[src*="rc_gen_image"]` | 生成的图片 | ✅ 稳定（4 张一组） |

## 已废弃的选择器（v0.1.0 错误）

| 选择器 | 问题 |
|--------|------|
| `[data-testid="chat_input_input"]` | ✗ 不存在（0 data-testid on site） |
| `#flow-end-msg-send` | ✗ 不存在 |
| `[data-testid="image-creation-chat-input-picture-ration-button"]` | ✗ 不存在 |
| `[data-testid="dropdown-menu-item"]` | ✗ 不存在 |
| `[data-testid="skill-page-image-template-item"]` | ✗ 不存在 |
| `img.image-Q7dBqW` | ✗ 不存在（hash class 已变） |
| `/chat/create-image` | ✗ URL 不存在（404/timeout） |

## API 端点（从 network 拦截）

| URL 模式 | 用途 |
|----------|------|
| `*rc_gen_image*` | AI 生成的图片（缩略图） |
| `*image_pre_watermark*` | 原始图片（无水印，高分辨率） |
| `*downsize_watermark*` | 缩略图（有水印，低分辨率） |

## 变更记录
- 2026-05-12：v0.2.0 实测验证 — 全面重写选择器库，标记所有 data-testid 为无效
- 2026-05-12：初始创建（doubao shell 脚本分析，选择器未经验证）
