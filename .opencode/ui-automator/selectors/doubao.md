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

## 音乐生成模式（从 /chat 切换）

### 入口

| 选择器 | 用途 | 稳定性 |
|--------|------|--------|
| 按钮文本 "音乐生成" | 工具栏按钮，切换到音乐模式 | ✅ 稳定（用 clickByText） |
| 工具栏区域 `.toolbar-area` 或类似 | 工具栏容器（含音乐/图像等按钮） | ⚠ 需验证 |

### 音乐面板（弹出后）

| 选择器 | 用途 | 稳定性 |
|--------|------|--------|
| 下拉菜单文本 "流行"/"摇滚"/"民谣" 等 | 曲风选择 | ✅ 稳定（clickByText） |
| 下拉菜单文本 "快乐"/"悲伤"/"激昂" 等 | 心情选择 | ✅ 稳定（clickByText） |
| 下拉菜单文本 "男声"/"女声" | 声音性别选择 | ✅ 稳定（clickByText） |
| 按钮文本 "AI 帮我写歌词" | 歌词来源下拉 | ✅ 稳定 |
| 下拉项文本 "自定义歌词" | 切换到自定义歌词弹窗 | ✅ 稳定 |

### 自定义歌词弹窗

| 选择器 | 用途 | 稳定性 |
|--------|------|--------|
| 弹窗内 `textarea` | 歌词输入区域 | ✅ 稳定 |
| 按钮文本 "确认" | 保存歌词 | ✅ 稳定 |

**重要**: `eval` 设置 textarea.value 不触发 React onChange → 确认按钮保持禁用。必须用 `agent-browser fill`（Playwright 原生输入）。

### 歌曲生成触发

| 选择器 | 用途 | 稳定性 |
|--------|------|--------|
| 底部 `textarea[placeholder="发消息..."]` | 输入 "生成歌曲" 等指令 | ✅ 稳定 |
| Enter 键 | 发送触发生成 | ✅ 稳定 |

**流程**: fill "生成歌曲" → Enter → 自动创建新对话 `/chat/{id}` → 等待约 30s → 出现音频播放器

### 生成结果

| 选择器 | 用途 | 稳定性 |
|--------|------|--------|
| `.audio-player` 或音频相关元素 | 播放器容器 | ⚠ 需进一步验证 |
| 歌曲标题文本 | 歌曲名称（如 "追光终成光芒"） | ✅ 稳定 |
| 时长文本（如 "01:44"） | 歌曲时长 | ✅ 稳定 |
| `.operation-item` 按钮 | 操作按钮（下载/分享等） | ⚠ 需进一步验证 |

### API 端点（音乐相关）

| URL 模式 | 用途 |
|----------|------|
| `POST /alice/media/bigmusic/share_save` | 保存/分享音乐（云端保存，非文件下载） |
| `*bigmusic*` | 音乐生成相关 API |

### 音频文件获取

豆包音乐**不支持直接文件下载**。需要通过以下方式之一提取音频：
1. **网络拦截**: 拦截 `*bigmusic*` 或音频流请求获取 URL
2. **音频元素提取**: 从 `<audio>` 或 `<source>` 元素获取 src
3. **MediaSource API 拦截**: 通过 CDP 拦截 MSE 数据块并重组

详见 `patterns/audio-stream-extraction.md`

## 变更记录
- 2026-05-15：添加音乐生成模式选择器（E2E 验证通过）
- 2026-05-12：v0.2.0 实测验证 — 全面重写选择器库，标记所有 data-testid 为无效
- 2026-05-12：初始创建（doubao shell 脚本分析，选择器未经验证）
