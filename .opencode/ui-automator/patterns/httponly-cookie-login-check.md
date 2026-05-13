# httpOnly Cookie 登录检测模式

> 最后更新：2026-05-12 | 来源：bilibili 插件 E2E 测试踩坑

## 摘要
许多网站使用 httpOnly Cookie 存储认证令牌（如 Bilibili 的 SESSDATA）。在浏览器内通过 `document.cookie` 无法读取这些 Cookie，导致基于 Cookie 的登录检测永远返回 `null`。正确做法是检测 DOM 元素（头像、用户名等）来判断登录态。

## 问题描述

### httpOnly Cookie 机制

```
Set-Cookie: SESSDATA=xxx; Path=/; HttpOnly; Secure; SameSite=Lax
                    ↑
        HttpOnly 标志 = JavaScript 无法通过 document.cookie 读取
```

### 失败的检测方式

```javascript
// ❌ 永远返回 null
const isLoggedIn = document.cookie.match(/SESSDATA/);

// ❌ 永远返回 false
const hasSession = document.cookie.includes('SESSDATA=');
```

即使浏览器开发者工具的 Application > Cookies 面板可以看到 SESSDATA，`document.cookie` 也无法读取。

## 解决方案：DOM 登录检测

### 通用模式

```javascript
function checkLogin() {
  const avatar = document.querySelector('.user-avatar, .avatar, img[alt*="avatar"]');
  const username = document.querySelector('.username, .nickname, .user-name');
  const loginButton = document.querySelector('.login-btn, a[href*="login"]');
  
  if (loginButton && !avatar) return false;
  return !!(avatar || username);
}
```

### 各站点具体实现

#### Bilibili

```javascript
const isLoggedIn = () => {
  return !!(
    document.querySelector('.bili-avatar-img') ||
    document.querySelector('.nickname')
  );
};
```

#### opencode.ai

```javascript
const isLoggedIn = () => {
  const hasNav = document.querySelector('[data-component=workspace-nav]');
  const isLoginPage = document.querySelector('button')?.textContent?.includes('Continue with');
  return !isLoginPage && !!hasNav;
};
```

#### DeepSeek

```javascript
const isLoggedIn = () => {
  const sessions = document.querySelectorAll('a[href*="/a/chat/s/"]');
  return sessions.length > 0;
};
```

## 受影响站点

| 站点 | Cookie 名 | 影响 | 解决方案 |
|------|-----------|------|----------|
| Bilibili | `SESSDATA` | ✅ 已解决 | `.bili-avatar-img` / `.nickname` |
| opencode.ai | Auth Cookie | ✅ 已解决 | `[data-component=workspace-nav]` |
| DeepSeek | Auth Cookie | ✅ 已解决 | 会话列表 DOM 检测 |
| Zhihu | `z_c0` | ⚠ 未验证 | 需登录态测试 |
| Xiaohongshu | `web_session` | ⚠ 未验证 | 需登录态测试 |
| Douyin | `sessionid` | ⚠ 可能受影响 | Feed DOM 检测 |
| Twitter | `auth_token` | ⚠ 可能受影响 | Avatar DOM 检测 |

## 判断标准

如何快速判断某站点是否使用 httpOnly Cookie：

1. **浏览器 DevTools**: Application > Cookies，查看 Cookie 的 HttpOnly 列
2. **CDP 协议**: `Network.getCookies` 可以读取 httpOnly Cookie（但 CDP 命令无法在 `Runtime.evaluate` 中使用）
3. **经验法则**: 大多数认证 Cookie 都是 httpOnly 的，**默认不要用 Cookie 检测登录态**

## 最佳实践

1. **永远优先用 DOM 检测** — 不依赖 Cookie，不依赖 API 响应
2. **选择稳定元素** — 头像、用户名、导航栏（这些元素登录前后一定不同）
3. **排除误判** — 登录页面也可能有头像占位符，要同时检查登录按钮是否存在
4. **记录选择器** — 每个站点的登录检测选择器记录到 selectors/*.md

## 变更记录
- 2026-05-12：初始创建（bilibili SESSDATA httpOnly 踩坑）
