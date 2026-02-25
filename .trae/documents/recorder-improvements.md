# Recorder 改进计划

## 问题分析

通过分析 `src/recorder/recorder.ts` 和 `src/recorder/inject.js`，发现以下问题：

### 1. Stop 时面板未关闭
- `recorder.ts` 的 `stop()` 方法只结束了会话和移除 CDP binding
- 没有通知前端关闭 UI 面板

### 2. 工具栏交互体验差
- `inject.js` 第 398-402 行：工具栏设置了 `pointer-events: none`，hover 时才启用
- 没有延迟隐藏机制，导致鼠标移入工具栏时容易触发元素切换
- 工具栏显示/隐藏过于敏感

### 3. 元素框选过于频繁
- `inject.js` 第 644-656 行：`mousemove` 事件每次都会更新 shadow box 和 toolbar
- 没有节流/防抖处理
- 所有元素都会触发框选，包括不需要的元素

### 4. 步骤缺少 tool 标识功能
- 当前面板只显示 action、selector、value
- 没有提供在面板上直接添加 tool 标识的功能

### 5. 工具栏事件透传问题
- 鼠标移动到工具栏时，事件仍然会触发底层元素的框选计算
- 导致工具栏位置和边框频繁重新计算

### 6. 边框计算过于灵敏
- `transition: all 0.15s ease` (第 394 行) 过渡时间太短
- 没有延迟计算机制

### 7. 性能问题
- `mousemove` 事件处理过于频繁
- Canvas 轨迹可视化每 100ms 重绘一次
- 没有使用 requestAnimationFrame 优化

---

## 改进方案

### 1. 添加关闭面板方法

**文件**: `src/recorder/recorder.ts`

在 `stop()` 方法中添加关闭面板的逻辑：
- 添加 `closePanel()` 方法
- 通过 `page.evaluate()` 调用前端的 `__recorderClosePanel()` 函数
- 在 `stop()` 中调用此方法

**文件**: `src/recorder/inject.js`

添加 `__recorderClosePanel()` 全局函数：
- 移除所有 UI 元素（panel、toolbar、shadowBox、canvas、markers）
- 清理事件监听器
- 重置 `__recorderInitialized` 标志

### 2. 优化工具栏交互

**文件**: `src/recorder/inject.js`

改进工具栏的显示/隐藏逻辑：
- 添加 `toolbarHideTimeout` 延迟隐藏机制（300ms）
- 鼠标移入工具栏时取消隐藏计时器
- 鼠标离开工具栏时启动隐藏计时器
- 工具栏始终启用 `pointer-events: auto`，但通过父容器控制

### 3. 优化元素框选

**文件**: `src/recorder/inject.js`

改进元素框选逻辑：
- 添加 `shouldHighlightElement()` 函数过滤不需要框选的元素：
  - 排除 `<script>`, `<style>`, `<meta>`, `<link>` 等标签
  - 排除不可见元素（`display: none`, `visibility: hidden`, `opacity: 0`）
  - 排除尺寸过小的元素（宽高 < 5px）
  - 排除 recorder 自身的 UI 元素
- 添加 `highlightThrottleTimeout` 节流机制（50ms）

### 4. 添加面板步骤 tool 标识功能

**文件**: `src/recorder/inject.js`

在面板步骤上添加 tool 标识功能：
- 每个步骤添加"添加标识"按钮
- 点击后弹出下拉菜单选择 tool 类型（login、data、pagination、custom）
- 更新步骤的 annotation 字段
- 重新渲染面板

### 5. 阻止工具栏事件透传

**文件**: `src/recorder/inject.js`

在工具栏上阻止事件透传：
- 工具栏 `mouseenter` 时设置 `isOverToolbar = true`
- 工具栏 `mouseleave` 时设置 `isOverToolbar = false`
- `mousemove` 处理中检查 `isOverToolbar`，如果为 true 则跳过框选计算

### 6. 优化边框计算延迟

**文件**: `src/recorder/inject.js`

改进边框计算：
- 增加 transition 时间到 `0.25s ease-out`
- 添加 `shadowBoxUpdateTimeout` 延迟更新机制（100ms）
- 使用 `requestAnimationFrame` 进行更新

### 7. 性能优化

**文件**: `src/recorder/inject.js`

综合性能优化：
- `mousemove` 使用节流（throttle）而非每次都处理
- Canvas 轨迹可视化使用 `requestAnimationFrame` 替代 `setInterval`
- 使用 `WeakMap` 存储 element 相关数据，便于垃圾回收
- 减少不必要的 DOM 查询

---

## 实现步骤

### Step 1: 添加关闭面板功能
1. 在 `inject.js` 中添加 `__recorderClosePanel()` 函数
2. 在 `recorder.ts` 的 `stop()` 方法中调用关闭面板

### Step 2: 优化工具栏交互
1. 添加延迟隐藏机制
2. 改进 pointer-events 处理
3. 添加 hover 状态管理

### Step 3: 优化元素框选
1. 添加元素过滤函数
2. 添加节流机制
3. 优化事件处理

### Step 4: 添加 tool 标识功能
1. 修改面板步骤渲染逻辑
2. 添加标识按钮和下拉菜单
3. 实现标识更新逻辑

### Step 5: 阻止事件透传
1. 添加工具栏 hover 状态检测
2. 在 mousemove 处理中检查状态

### Step 6: 优化边框计算
1. 增加 transition 时间
2. 添加延迟更新机制
3. 使用 requestAnimationFrame

### Step 7: 性能优化
1. 替换 setInterval 为 requestAnimationFrame
2. 添加节流/防抖
3. 优化数据存储

---

## 关键代码变更

### inject.js 主要变更点

```javascript
// 1. 关闭面板函数
window.__recorderClosePanel = function() {
  // 移除所有 UI 元素
  // 清理事件监听器
  // 重置状态
};

// 2. 工具栏延迟隐藏
let toolbarHideTimeout = null;
function showToolbar() { /* ... */ }
function hideToolbarDelayed() { /* ... */ }

// 3. 元素过滤
function shouldHighlightElement(element) {
  // 过滤不需要框选的元素
}

// 4. 节流更新
let highlightThrottleTimeout = null;
function throttledUpdateShadowBox(element) {
  // 节流处理
}

// 5. 工具栏事件阻止
let isOverToolbar = false;
toolbar.addEventListener('mouseenter', () => { isOverToolbar = true; });
toolbar.addEventListener('mouseleave', () => { isOverToolbar = false; });

// 6. requestAnimationFrame 优化
function animateTrajectory() {
  requestAnimationFrame(animateTrajectory);
  // 绘制逻辑
}
```

### recorder.ts 主要变更点

```typescript
async stop(): Promise<void> {
  if (!this.isRecording) return;
  
  // 关闭面板
  await this.closePanel();
  
  // 原有逻辑...
}

async closePanel(): Promise<void> {
  try {
    await this.page.evaluate(() => {
      if (typeof window.__recorderClosePanel === 'function') {
        window.__recorderClosePanel();
      }
    });
  } catch (e) {
    // 忽略错误
  }
}
```

---

## 预期效果

1. **Stop 时面板正常关闭** - 调用 stop() 后 UI 完全消失
2. **工具栏交互流畅** - 可以轻松移动到工具栏上点击按钮
3. **框选更智能** - 只框选有意义的元素
4. **可添加 tool 标识** - 在面板上直接为步骤添加标识
5. **无事件透传问题** - 工具栏上不会触发底层元素框选
6. **边框计算更平滑** - 有适当的延迟和过渡效果
7. **性能显著提升** - 减少不必要的计算和重绘
