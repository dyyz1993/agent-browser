# inject.js 潜在改进点分析

## 一、事件录制增强

### 1. 缺少的事件类型
| 事件类型 | 当前状态 | 价值 |
|---------|---------|------|
| 双击事件 (dblclick) | ❌ 未录制 | 某些场景需要双击操作 |
| 右键菜单 (contextmenu) | ❌ 未录制 | 右键操作场景 |
| 拖拽事件 (drag/drop) | ❌ 未录制 | 拖拽排序、文件上传等 |
| 复制/粘贴 (copy/paste) | ❌ 未录制 | 快捷键操作 |
| 焦点事件 (focus/blur) | ❌ 未录制 | 表单验证场景 |
| 表单提交 (submit) | ❌ 未录制 | 表单场景 |
| 鼠标悬停 (hover) | ❌ 未录制 | 下拉菜单、tooltip |
| 触摸事件 (touch) | ❌ 未录制 | 移动端场景 |
| 滚轮事件 (wheel) | ❌ 未录制 | 缩放场景 |

### 2. 建议添加的事件录制
```javascript
// 双击事件
document.addEventListener('dblclick', (e) => {
  const element = e.composedPath()[0] || e.target;
  if (isInRecorderPanel(element)) return;
  recordStep('dblclick', { selector: getSelector(element), ... });
}, true);

// 拖拽事件
document.addEventListener('dragstart', (e) => {
  recordStep('drag_start', { selector: getSelector(e.target), ... });
}, true);
document.addEventListener('drop', (e) => {
  recordStep('drop', { selector: getSelector(e.target), ... });
}, true);

// 复制粘贴
document.addEventListener('copy', (e) => {
  recordStep('copy', { selector: getSelector(document.activeElement), ... });
}, true);
document.addEventListener('paste', (e) => {
  recordStep('paste', { selector: getSelector(document.activeElement), ... });
}, true);
```

## 二、选择器生成改进

### 1. 动态 ID 处理
```javascript
// 当前问题：动态 ID 如 id="react-123" 会导致选择器不稳定
// 建议：识别并跳过动态 ID
function isDynamicId(id) {
  const dynamicPatterns = [
    /^:r[0-9a-z]+:$/,           // React
    /^__[A-Z]+_\d+__$/,         // Generated
    /^[a-z]+-\d+$/,             // Dynamic
    /^ember\d+$/,               // Ember.js
  ];
  return dynamicPatterns.some(p => p.test(id));
}
```

### 2. 随机 class 处理
```javascript
// 当前问题：CSS Modules 生成的随机 class 如 "_1a2b3c" 不稳定
// 建议：过滤掉不稳定的 class
function isStableClass(className) {
  const unstablePatterns = [
    /^css-[a-z0-9]+$/,          // Emotion
    /^sc-[a-z]+$/,              // Styled Components
    /^_[a-z0-9]+$/,             // CSS Modules
    /^[a-z]{1,2}$/,             // 短随机 class
  ];
  return !unstablePatterns.some(p => p.test(className));
}
```

### 3. 框架特定选择器
```javascript
// React/Vue/Angular 特定属性
const frameworkAttrs = [
  'data-reactid',
  'data-v-',          // Vue
  'ng-',              // Angular
  '_ngcontent-',
  '_nghost-',
];
```

## 三、性能优化

### 1. 轨迹动画优化
```javascript
// 当前问题：animateTrajectory 一直运行
// 建议：只在有轨迹时运行
function animateTrajectory() {
  if (window.__recorderTrajectory.length >= 2) {
    drawCanvas();
  }
  animationFrameId = requestAnimationFrame(animateTrajectory);
}

// 更好的方案：按需启动/停止
function startTrajectoryAnimation() {
  if (!animationFrameId) {
    animationFrameId = requestAnimationFrame(animateTrajectory);
  }
}
function stopTrajectoryAnimation() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}
```

### 2. 轮询机制优化
```javascript
// 当前问题：每 500ms 轮询一次
// 建议：使用 WebSocket 或仅在需要时轮询
// 或者使用 Visibility API 减少后台轮询
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopPolling();
  } else {
    startPolling();
  }
});
```

### 3. 缓存清理
```javascript
// 当前问题：WeakMap 缓存没有清理机制
// 建议：定期清理失效缓存
setInterval(() => {
  // 清理已移除元素的缓存
  selectorCache = new WeakMap();
  xpathCache = new WeakMap();
}, 60000); // 每分钟清理一次
```

## 四、用户体验改进

### 1. 工具栏改进
```javascript
// 当前问题：工具栏跟随鼠标，难以点击
// 建议：固定在元素边缘，不跟随鼠标
function calculateToolbarPosition(rect) {
  // 固定在元素右上角
  return {
    left: rect.right + scrollX - TOOLBAR_W - 10,
    top: rect.top + scrollY - TOOLBAR_H - 10,
    orientation: 'horizontal'
  };
}
```

### 2. 撤销功能
```javascript
// 建议：添加撤销功能
const undoStack = [];
function recordStep(action, data) {
  const step = { ... };
  undoStack.push({ type: 'add', step });
  window.__syncStep(step);
}
function undo() {
  const lastAction = undoStack.pop();
  if (lastAction.type === 'add') {
    window.__recorderAction({ type: 'delete', id: lastAction.step.id });
  }
}
```

### 3. 步骤编辑
```javascript
// 建议：允许编辑步骤
function editStep(stepId, newData) {
  const result = window.__recorderAction({ 
    type: 'update', 
    id: stepId, 
    data: newData 
  });
  if (result.success) {
    window.__updateRecorderUI();
  }
}
```

### 4. 步骤搜索/过滤
```javascript
// 建议：添加搜索功能
function filterSteps(keyword) {
  const steps = window.__recorderSteps || [];
  return steps.filter(s => 
    s.selector?.includes(keyword) || 
    s.action?.includes(keyword) ||
    s.value?.includes(keyword)
  );
}
```

## 五、数据持久化

### 1. 本地存储
```javascript
// 建议：自动保存到 localStorage
function saveToLocalStorage() {
  try {
    localStorage.setItem('__recorder_steps__', 
      JSON.stringify(window.__recorderSteps));
  } catch (e) {}
}

function loadFromLocalStorage() {
  try {
    const saved = localStorage.getItem('__recorder_steps__');
    if (saved) {
      window.__recorderSteps = JSON.parse(saved);
    }
  } catch (e) {}
}
```

### 2. 导出功能
```javascript
// 建议：添加导出功能
function exportSteps(format = 'json') {
  const steps = window.__recorderSteps || [];
  switch (format) {
    case 'json':
      return JSON.stringify(steps, null, 2);
    case 'csv':
      return convertToCSV(steps);
    case 'playwright':
      return generatePlaywrightCode(steps);
    case 'puppeteer':
      return generatePuppeteerCode(steps);
  }
}
```

## 六、错误处理

### 1. 完善错误处理
```javascript
// 当前问题：很多地方只是 try-catch 后忽略
// 建议：添加错误上报
function handleError(error, context) {
  console.error('[Recorder Error]', context, error);
  // 上报错误
  if (typeof window.__recorderOnError === 'function') {
    window.__recorderOnError({ error, context, timestamp: Date.now() });
  }
}
```

### 2. 容错机制
```javascript
// 建议：添加重试机制
function safeQuerySelector(selector, retries = 3) {
  try {
    return document.querySelector(selector);
  } catch (e) {
    if (retries > 0) {
      return new Promise(resolve => {
        setTimeout(() => resolve(safeQuerySelector(selector, retries - 1)), 100);
      });
    }
    return null;
  }
}
```

## 七、可配置性

### 1. 配置选项
```javascript
// 建议：添加配置对象
const defaultConfig = {
  trajectoryInterval: 50,
  maxTrajectoryPoints: 10,
  scrollThreshold: 50,
  highlightThrottle: 100,
  toolbarHideDelay: 500,
  cacheTTL: 100,
  fillTimeout: 300,
  pollInterval: 500,
  maxSteps: 1000,
  enableKeyboard: true,
  enableTrajectory: true,
  enableToolbar: true,
  enableMarkers: true,
};

window.__recorderConfig = { ...defaultConfig, ...window.__recorderConfig };
```

### 2. 插件系统
```javascript
// 建议：支持插件扩展
const plugins = [];
function registerPlugin(plugin) {
  plugins.push(plugin);
  plugin.onInit?.();
}
function recordStep(action, data) {
  // 插件预处理
  for (const plugin of plugins) {
    if (plugin.beforeRecord) {
      data = plugin.beforeRecord(action, data);
    }
  }
  // ... 录制逻辑
  // 插件后处理
  for (const plugin of plugins) {
    plugin.afterRecord?.(step);
  }
}
```

## 八、UI 改进

### 1. 录制状态指示
```javascript
// 建议：添加录制状态指示器
function updateRecordingStatus(isRecording) {
  const indicator = document.getElementById('recorder-status-indicator');
  if (indicator) {
    indicator.className = isRecording ? 'recording' : 'paused';
    indicator.textContent = isRecording ? '● Recording' : '⏸ Paused';
  }
}
```

### 2. 步骤分组
```javascript
// 建议：支持步骤分组
function groupSteps(stepIds, groupName) {
  const group = {
    id: generateStepId(),
    type: 'group',
    name: groupName,
    steps: stepIds,
    timestamp: Date.now()
  };
  window.__recorderAction({ type: 'add', data: group });
}
```

### 3. 步骤注释
```javascript
// 建议：支持步骤注释
function addStepComment(stepId, comment) {
  window.__recorderAction({ 
    type: 'update', 
    id: stepId, 
    data: { comment } 
  });
}
```

## 九、移动端支持

### 1. 触摸事件
```javascript
// 建议：添加触摸事件支持
document.addEventListener('touchstart', (e) => {
  const touch = e.touches[0];
  recordStep('touch_start', { x: touch.clientX, y: touch.clientY, ... });
}, true);
document.addEventListener('touchend', (e) => {
  const touch = e.changedTouches[0];
  recordStep('touch_end', { x: touch.clientX, y: touch.clientY, ... });
}, true);
```

### 2. 手势识别
```javascript
// 建议：识别常见手势
function detectGesture(touches) {
  // 识别滑动、缩放、旋转等手势
}
```

## 十、代码质量

### 1. 代码拆分
```javascript
// 建议：将代码拆分为模块
// - core.js: 核心录制逻辑
// - selector.js: 选择器生成
// - xpath.js: XPath 生成
// - ui.js: UI 面板
// - events.js: 事件处理
// - export.js: 导出功能
```

### 2. TypeScript 支持
```javascript
// 建议：添加类型定义
interface RecorderStep {
  id: string;
  timestamp: number;
  action: string;
  selector?: string;
  xpath?: string;
  value?: string;
  elementInfo?: ElementInfo;
  annotation?: Annotation;
  iframe?: boolean;
}
```

## 改进优先级

### 高优先级
1. 双击/拖拽/复制粘贴事件录制
2. 动态 ID 和随机 class 处理
3. 轨迹动画性能优化
4. 本地存储持久化

### 中优先级
5. 撤销功能
6. 步骤编辑功能
7. 配置选项
8. 错误处理完善

### 低优先级
9. 插件系统
10. 移动端支持
11. 代码拆分
12. TypeScript 支持
