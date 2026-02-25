# Recorder 性能优化计划

## 问题分析

通过分析 `inject.js`，发现以下性能瓶颈：

### 1. `shouldHighlightElement` 过于昂贵
```javascript
function shouldHighlightElement(element) {
  // ...
  const rect = element.getBoundingClientRect();  // 强制回流
  const style = window.getComputedStyle(element); // 强制回流
  // ...
}
```
每次 mousemove 都调用 `getBoundingClientRect()` 和 `getComputedStyle()`，这两个方法都会强制浏览器回流。

### 2. 节流机制不够高效
```javascript
function throttledHighlight(element) {
  // 每次都创建新的 setTimeout
  clearTimeout(highlightThrottleTimeout);
  highlightThrottleTimeout = setTimeout(() => { ... }, ...);
}
```

### 3. Canvas 每帧重绘
```javascript
function animateTrajectory() {
  // 即使没有轨迹也在每帧执行
  if (!window.__recorderTrajectory || window.__recorderTrajectory.length < 2) { 
    ctx.clearRect(0, 0, canvas.width, canvas.height); 
  }
  // ...
  animationFrameId = requestAnimationFrame(animateTrajectory);
}
```

### 4. 多重延迟叠加
- `HIGHLIGHT_THROTTLE = 50ms`
- `SHADOW_UPDATE_DELAY = 80ms`
- 加上 `requestAnimationFrame`
- 总延迟可能超过 130ms，但仍然频繁计算

---

## 优化方案

### 1. 缓存元素尺寸信息
```javascript
const elementSizeCache = new WeakMap();
const CACHE_TTL = 100; // 100ms 缓存

function shouldHighlightElement(element) {
  if (!element || !element.tagName) return false;
  if (SKIP_TAGS.has(element.tagName)) return false;
  if (element.closest && element.closest('.recorder-panel, .recorder-toolbar, .recorder-shadow, .recorder-markers-container')) return false;
  
  // 使用缓存
  const now = Date.now();
  const cached = elementSizeCache.get(element);
  if (cached && (now - cached.time) < CACHE_TTL) {
    return cached.result;
  }
  
  const rect = element.getBoundingClientRect();
  if (rect.width < 5 || rect.height < 5) {
    elementSizeCache.set(element, { time: now, result: false });
    return false;
  }
  
  // 只在尺寸通过时才检查样式
  const style = window.getComputedStyle(element);
  const result = style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) !== 0;
  
  elementSizeCache.set(element, { time: now, result });
  return result;
}
```

### 2. 使用 requestAnimationFrame 替代 setTimeout 节流
```javascript
let highlightRafId = null;
let pendingHighlightElement = null;

function throttledHighlight(element) {
  pendingHighlightElement = element;
  
  if (highlightRafId === null) {
    highlightRafId = requestAnimationFrame(() => {
      highlightRafId = null;
      processHighlight(pendingHighlightElement);
    });
  }
}
```

### 3. 简化 processHighlight
```javascript
function processHighlight(element) {
  updateShadowBox(element);
  updateToolbar(element);
}
```

### 4. Canvas 按需绘制
```javascript
let lastTrajectoryLength = 0;
let canvasRafId = null;
let needsCanvasUpdate = false;

function scheduleCanvasUpdate() {
  if (canvasRafId === null) {
    canvasRafId = requestAnimationFrame(drawCanvas);
  }
}

function drawCanvas() {
  canvasRafId = null;
  
  const points = window.__recorderTrajectory;
  if (!points || points.length < 2) {
    if (lastTrajectoryLength > 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      lastTrajectoryLength = 0;
    }
    return;
  }
  
  lastTrajectoryLength = points.length;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // ... 绘制逻辑
}

// 只在轨迹更新时触发
// 在 mousemove 的 trajectory 记录后调用 scheduleCanvasUpdate()
```

### 5. 减少 DOM 查询
```javascript
// 预先缓存 recorder panel 元素检查
let recorderPanelElement = null;

function isInRecorderPanel(element) {
  if (!element) return false;
  if (!recorderPanelElement) {
    recorderPanelElement = document.querySelector('.recorder-panel');
  }
  if (!recorderPanelElement) return false;
  return element === recorderPanelElement || recorderPanelElement.contains(element);
}
```

### 6. 增加节流时间
```javascript
const HIGHLIGHT_THROTTLE = 100; // 从 50ms 增加到 100ms
const SHADOW_UPDATE_DELAY = 0;  // 移除额外延迟，使用 RAF 即可
```

---

## 实现步骤

1. **优化 shouldHighlightElement** - 添加 WeakMap 缓存
2. **优化节流机制** - 使用 RAF 替代 setTimeout
3. **简化 processHighlight** - 移除多余的 setTimeout
4. **优化 Canvas 绘制** - 按需绘制
5. **减少 DOM 查询** - 缓存 panel 元素
6. **调整时间参数** - 增加节流时间

---

## 预期效果

- 减少 70% 的 `getBoundingClientRect` 调用
- 减少 50% 的 `getComputedStyle` 调用
- 消除 setTimeout 开销
- Canvas 只在有数据时绘制
- 整体响应更流畅
