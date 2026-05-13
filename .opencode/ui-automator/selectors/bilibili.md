# Bilibili 选择器库

> 最后更新：2026-05-12 | 来源：bilibili 插件 E2E 测试

## 摘要
Bilibili (https://www.bilibili.com/) 的 DOM 选择器和页面结构分析。Bilibili 使用语义化 class 命名（非 CSS Modules），选择器相对稳定。登录态检测需注意 httpOnly Cookie 限制。

## 页面 URL 模式

| 页面 | URL 模式 |
|------|----------|
| 首页 | `https://www.bilibili.com/` |
| 用户空间 | `https://space.bilibili.com/{uid}` |
| 视频页 | `https://www.bilibili.com/video/{bvid}` |

## 稳定选择器

### 用户信息（空间页）

| 目标 | 选择器 | 稳定性 |
|------|--------|--------|
| 用户昵称 | `.nickname` | ✅ 稳定 |
| 用户签名 | `.upinfo-detail .sign` | ✅ 稳定 |
| 头像图片 | `.upinfo-avatar img` | ✅ 稳定 |
| 头像（通用） | `.bili-avatar-img` | ✅ 稳定 |

### 统计信息

| 目标 | 选择器 | 稳定性 |
|------|--------|--------|
| 统计项 | `.nav-statistics__item` | ✅ 稳定 |
| 视频链接 | `a[href*='/video/']` | ✅ 稳定 |

### 通用局部匹配（脆弱但可用）

| 目标 | 选择器 | 稳定性 |
|------|--------|--------|
| 卡片容器 | `[class*=card]` | ⚠ 脆弱 — 匹配过多 |
| 列表项 | `[class*=item]` | ⚠ 脆弱 — 匹配过多 |

## 登录态检测

### ❌ 失败方式：Cookie 读取

```javascript
// SESSDATA 是 httpOnly Cookie，document.cookie 无法读取
document.cookie.match(/SESSDATA/) // → null（永远如此）
```

### ✅ 正确方式：DOM 检测

```javascript
const isLoggedIn = () => {
  const avatar = document.querySelector('.bili-avatar-img');
  const nickname = document.querySelector('.nickname');
  return !!(avatar || nickname);
};
```

## 注意事项

1. **httpOnly Cookie**: Bilibili 的 `SESSDATA` 标记为 httpOnly，`document.cookie` 永远读不到
2. **通用选择器脆弱**: `[class*=card]` 和 `[class*=item]` 虽然能匹配到，但结果太多、不够精确
3. **用户空间 vs 首页**: 用户信息选择器在 space.bilibili.com 有效，首页结构不同
4. **登录态必须用 DOM**: 不要尝试 Cookie 方案，用头像/昵称元素判断

## 变更记录
- 2026-05-12：初始创建（bilibili 插件 E2E 测试返回）
