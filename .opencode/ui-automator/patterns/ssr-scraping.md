# SSR 页面数据提取模式

> 最后更新：2026-05-12 | 来源：opencode-usage 插件开发

## 摘要
当目标网站是 SSR（服务端渲染）且没有公开 REST API 时，如何提取数据。

## 适用场景

- 网站使用 SSR 框架（Next.js/Gatsby/Remix/hypermedia 等）
- 数据直接服务端渲染到 HTML
- **没有** XHR/Fetch API 端点可调用
- 页面需要登录认证

## 提取策略

### 1. 确认架构

```javascript
// 检查是否有全局数据
const globalData = window.__DATA__ || window.__INITIAL_STATE__ || 
  window.__NEXT_DATA__ || window.__NUXT__ || window.__remixContext || null;

// 尝试常见 API 端点
const endpoints = ['/api/v1/...', '/api/...', '/v1/...'];
for (const ep of endpoints) {
  const resp = await fetch('https://host' + ep);
  console.log(ep, resp.status);
}
```

### 2. 登录态检测

```javascript
// 检测登录态（非 HttpOnly Cookie 不可读时的代替方案）
const isLoggedIn = () => {
  const hasApp = document.querySelector('[data-app]');
  const isLoginPage = document.querySelector('button')?.textContent?.includes('Sign in');
  return !isLoginPage && !!hasApp;
};
```

### 3. 数据提取（CSS 选择器优先）

推荐用 `data-slot`、`data-component` 等稳定属性，避免用 class name：

```typescript
// 从 SSR HTML 提取结构化数据
const data = await ctx.eval(`JSON.stringify(
  [...document.querySelectorAll('[data-slot=usage-item]')].map(n => ({
    dimension: n.querySelector('[data-slot=usage-label]')?.textContent?.trim(),
    usage: n.querySelector('[data-slot=usage-value]')?.textContent?.trim(),
    resetIn: n.querySelector('[data-slot=reset-time]')?.textContent?.trim(),
  }))
)`);
```

### 4. 认证方式优先级

| 方式 | 适用场景 | 命令 |
|------|----------|------|
| CDP 连接（推荐） | 用户有已登录浏览器 | `--cdp http://localhost:9221` |
| Headed 手动登录 | 需要首次登录 | `login` 命令 + 等待 |
| HttpOnly Cookie | 纯 curl（不推荐，会过期） | `-H 'Cookie: ...'` |

### 5. 注意事项

- **不要假设有 REST API** — SSR 站点可能没有 API
- **页面导航可能丢失会话** — 某些 SSO 在跨页导航时需重新认证
- **优先复用当前 URL** — 如果已在目标页面，直接提取，避免 `goto` 导致会话中断

## 变更记录
- 2026-05-12：初始创建（opencode-usage 插件开发总结）
