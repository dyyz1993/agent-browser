# 抖音 (douyin.com) 选择器库

> 最后更新：2026-05-12 | 来源：douyin 插件 E2E 测试

## 摘要
抖音桌面版 (https://www.douyin.com/) 的 DOM 选择器和页面结构分析。抖音桌面版使用 `data-e2e` 属性作为测试钩子，选择器质量高但架构与移动版差异巨大。

## 重要架构发现

- **桌面端是纵向滑动 Feed**: 不是侧栏推荐列表，而是类似移动端的上下滑动视频流
- **data-e2e 属性**: 抖音使用 `data-e2e` 作为测试属性（类似 data-testid），选择器质量高
- **SPA 架构**: 单页应用，所有导航客户端完成
- **全局变量**: `window.__pace_f` 包含页面状态数据

## 稳定选择器

### 视频交互按钮

| 目标 | 选择器 | 稳定性 |
|------|--------|--------|
| 点赞按钮 | `data-e2e="video-player-digg"` | ✅ 稳定 |
| 评论按钮 | `data-e2e="feed-comment-icon"` | ✅ 稳定 |
| 收藏按钮 | `data-e2e="video-player-collect"` | ✅ 稳定 |
| 分享按钮 | `data-e2e="video-player-share"` | ✅ 稳定 |

### 内容区域

| 目标 | 选择器 | 稳定性 |
|------|--------|--------|
| Feed 项 | `data-e2e="feed-item"` | ✅ 稳定 |
| 当前视频 | `data-e2e="feed-active-video"` | ✅ 稳定 |
| 视频描述 | `data-e2e="video-desc"` | ✅ 稳定 |
| 评论列表 | `data-e2e="comment-list"` | ✅ 稳定 |
| 评论项 | `data-e2e="comment-item"` | ✅ 稳定 |

### 全局数据

| 目标 | 选择器 | 稳定性 |
|------|--------|--------|
| 页面状态 | `window.__pace_f` | ✅ 稳定（全局 JS 变量） |

## 不存在的选择器

| 选择器 | 状态 | 原因 |
|--------|------|------|
| `data-e2e="recommend-list-container"` | ❌ 不存在 | 桌面端没有侧栏推荐列表 |
| `data-e2e="profile-button"` | ❌ 不存在 | 仅移动端存在 |

## DOM 结构特征

```
Feed Container (纵向滑动)
├── div[data-e2e="feed-item"] (视频 1)
│   ├── div[data-e2e="feed-active-video"] (当前激活)
│   ├── div[data-e2e="video-desc"] (视频描述)
│   ├── button[data-e2e="video-player-digg"] (点赞)
│   ├── button[data-e2e="feed-comment-icon"] (评论)
│   ├── button[data-e2e="video-player-collect"] (收藏)
│   └── button[data-e2e="video-player-share"] (分享)
├── div[data-e2e="feed-item"] (视频 2)
└── ...
```

## 注意事项

1. **桌面端 ≠ 移动端**: 桌面版是纵向滑动 Feed，不要假设有侧栏推荐列表
2. **data-e2e 稳定**: 抖音的 `data-e2e` 属性类似 data-testid，质量很高
3. **feed-active-video**: 当前正在播放的视频有此属性，可用于定位当前视频
4. **评论加载**: 评论列表需要点击评论按钮后才会加载
5. **window.__pace_f**: 包含丰富的页面状态数据，可作为数据提取的后备方案

## 变更记录
- 2026-05-12：初始创建（douyin 插件 E2E 测试返回）
