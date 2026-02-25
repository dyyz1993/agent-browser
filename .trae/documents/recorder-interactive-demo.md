# 录制器交互体验优化方案

## 文件对比分析

### demo/recorder-inject.js（简化版）

* 只负责记录用户操作（点击、输入、选择、滚动等）

* 没有面板 UI

* 没有工具栏

* 通过 `window.__recorderSync` 同步步骤

### src/recorder/inject.js（完整版）

* 完整的录制器功能

* 面板 UI（可拖拽、折叠）

* 工具栏（悬停显示）

* 统一 API（add/update/delete/list/clear）

* 6 位数 ID

* 底部工具选择区域

* 删除步骤功能

### demo/recorder-overlay.html（演示页面）

* 内联的录制器 UI 和逻辑

* 面板样式简洁美观

* 工具栏按钮有颜色区分

* 有持久化边框功能

* 有轨迹可视化

* 有标注类型图例

## 改进目标

创建一个新的 HTML 文件，整合 `src/recorder/inject.js` 的完整功能和 `recorder-overlay.html` 的美观 UI，让用户可以直接在浏览器中体验交互。

## 改进方案

### 1. 创建新的演示文件

创建 `demo/recorder-demo.html`，包含：

* `src/recorder/inject.js` 的完整功能

* `recorder-overlay.html` 的美观 UI

* 可直接在浏览器中打开体验

### 2. UI 改进

| 功能    | 当前状态      | 改进方案                           |
| ----- | --------- | ------------------------------ |
| 面板样式  | 功能完整但样式简单 | 采用 recorder-overlay.html 的美观样式 |
| 工具栏样式 | 功能完整但样式简单 | 按钮颜色区分，悬停效果                    |
| 持久化边框 | 无         | 添加点击元素后的持久化边框                  |
| 轨迹可视化 | 无         | 添加 Canvas 轨迹可视化                |
| 标注图例  | 无         | 添加标注类型图例                       |

### 3. 文件修改

| 文件                        | 操作 | 说明           |
| ------------------------- | -- | ------------ |
| `demo/recorder-demo.html` | 新建 | 整合完整功能和美观 UI |
| `demo/recorder-inject.js` | 保留 | 简化版注入脚本      |

### 4. 实现步骤

1. 创建 `demo/recorder-demo.html` 文件
2. 复制 `recorder-overlay.html` 的 HTML 结构和样式
3. 嵌入 `src/recorder/inject.js` 的核心逻辑
4. 整合面板 UI（拖拽、折叠、工具选择）
5. 添加持久化边框功能
6. 添加轨迹可视化
7. 添加标注类型图例
8. 测试验证

