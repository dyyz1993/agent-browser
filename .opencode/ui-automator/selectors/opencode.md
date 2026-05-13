# opencode.ai — 选择器库

> 最后更新：2026-05-12 | 来源：子任务 "opencode-usage plugin"

## 摘要
opencode.ai 是 OpenCode 的 Web 管理平台，SSR 渲染（无 REST API）。用量数据直接嵌入 HTML。

## 页面结构

opencode.ai 使用类 HTMX/Island SSR 架构，由 `@github/hypermedia` 框架驱动。所有数据在服务端渲染到 HTML 中，**没有独立的 XHR/API 端点**。

## 稳定选择器

### 工作区页面 (`/workspace/<id>/go`)

| 选择器 | 用途 | 稳定性 |
|--------|------|--------|
| `[data-component=workspace-nav]` | 导航栏检测（登录态检查） | ✅ 稳定 |
| `[data-slot=usage-item]` | 每个用量维度的容器 | ✅ 稳定 |
| `[data-slot=usage-label]` | 维度名称（滚动用量/每周用量/每月用量） | ✅ 稳定 |
| `[data-slot=usage-value]` | 用量百分比 | ✅ 稳定 |
| `[data-slot=reset-time]` | 重置倒计时 | ✅ 稳定 |
| `[data-slot=progress-bar]` | 用量进度条 | ✅ 稳定 |
| `[data-slot=progress]` | 进度条容器 | ✅ 稳定 |
| `[data-slot=section-title]` | 套餐标题区块 | ✅ 稳定 |
| `[data-slot=section-title] p` | 套餐名称（如"您已订阅 OpenCode Go。"） | ✅ 稳定 |
| `[data-slot=toggle-label] input[type=checkbox]` | "达到使用限额后使用可用余额"开关 | ✅ 稳定 |
| `[data-slot=setting-row]` | 设置行容器 | ✅ 稳定 |
| `[data-page=workspace]` | 工作区主内容区域 | ✅ 稳定 |
| `button[data-color=primary]` | "管理订阅"按钮 | ✅ 稳定 |
| `[data-component=workspace-container]` | 工作区容器 | ✅ 稳定 |

### API 密钥页 (`/workspace/<id>/keys`)

| 选择器 | 用途 | 稳定性 |
|--------|------|--------|
| `code` | API Key 值（sk-xxx 格式） | ✅ 稳定 |

### 认证检测

```javascript
// 检测是否已登录（页面包含导航栏且非 OpenAuth 登录页）
const isLoggedIn = () => {
  const hasNav = document.querySelector('[data-component=workspace-nav]');
  const isLoginPage = document.querySelector('button')?.textContent?.includes('Continue with');
  return !isLoginPage && !!hasNav;
};
```

## 架构说明

- **框架**: `@github/hypermedia`（类似 HTMX 的 SSR 框架）
- **认证**: OpenAuth（OAuth2 代理，HttpOnly Cookie）
- **SSR 数据**: 所有页面数据服务端渲染到 HTML
- **Cookie**: 认证 Cookie 标记为 HttpOnly，`document.cookie` 不可读
- **API**: 没有公开 REST API（测试 8+ 端点均返回 404）
- **后端端点**: `/_server?id=<hash>` 用于表单提交（POST，无 body）

## 变更记录
- 2026-05-12：初始创建（子任务 "opencode-usage plugin" 返回）
