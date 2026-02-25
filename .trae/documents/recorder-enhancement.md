# Recorder 增强计划

## 问题分析

### 1. 缺少 iframe 演示
- 当前 HTML 没有 iframe 演示区域
- 需要添加 iframe 测试区域

### 2. 轨迹记录方式
**当前问题**：轨迹作为步骤的属性存储
```javascript
step.trajectory = [{x, y, t}, ...]
```

**期望行为**：轨迹作为独立步骤在操作前插入
```javascript
// 点击前
{ action: 'trajectory', points: [{x, y, t}, ...] }
{ action: 'click', selector: '#btn' }
```

### 3. 滚动事件
**当前问题**：没有记录滚动事件

**期望行为**：在点击/采集前插入滚动记录
```javascript
{ action: 'scroll', x: 0, y: 500 }
{ action: 'click', selector: '#btn' }
```

### 4. href 跳转页面
**当前问题**：只记录了 `beforeunload` 事件

**期望行为**：
- 记录链接点击（`<a href>`）
- 检测是否打开新页面（`target="_blank"`）
- 记录跳转目标 URL

---

## 实现方案

### 1. iframe 演示
在 HTML 中添加 iframe 演示区域：
```html
<div class="data-table">
  <h2>iframe 演示</h2>
  <iframe srcdoc="..." style="..."></iframe>
</div>
```

### 2. 轨迹作为独立步骤
修改注入脚本，在操作前插入轨迹步骤：

```javascript
function recordStep(action, data) {
  // 先记录轨迹步骤
  const trajectory = window.__getTrajectory();
  if (trajectory.length > 0) {
    window.__recorderSync(JSON.stringify({
      id: 'step-' + Date.now(),
      timestamp: Date.now(),
      action: 'trajectory',
      points: trajectory,
      viewport: { width: window.innerWidth, height: window.innerHeight }
    }));
  }
  
  // 再记录操作步骤
  const step = {
    id: 'step-' + Date.now(),
    timestamp: Date.now(),
    action: action,
    selector: data.selector || '',
    value: data.value,
    elementInfo: data.elementInfo
  };
  window.__syncStep(step);
}
```

### 3. 滚动事件
添加滚动监听，记录滚动位置：

```javascript
let lastScrollX = window.scrollX;
let lastScrollY = window.scrollY;
let scrollTimeout = null;

window.addEventListener('scroll', () => {
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    
    // 只在滚动距离超过阈值时记录
    if (Math.abs(scrollY - lastScrollY) > 50 || Math.abs(scrollX - lastScrollX) > 50) {
      window.__recorderSync(JSON.stringify({
        id: 'step-' + Date.now(),
        timestamp: Date.now(),
        action: 'scroll',
        x: scrollX,
        y: scrollY,
        viewport: { width: window.innerWidth, height: window.innerHeight }
      }));
      lastScrollX = scrollX;
      lastScrollY = scrollY;
    }
  }, 100);
}, true);
```

### 4. href 跳转检测
监听链接点击，检测跳转行为：

```javascript
document.addEventListener('click', (e) => {
  const element = e.composedPath()[0] || e.target;
  
  // 检测链接点击
  const link = element.closest('a[href]');
  if (link) {
    const href = link.href;
    const target = link.target;
    const isExternal = target === '_blank' || href.startsWith('http') && !href.includes(window.location.host);
    
    recordStep('link_click', {
      selector: getSelector(link),
      value: href,
      elementInfo: {
        ...getElementInfo(link),
        target: target || '_self',
        isExternal: isExternal
      }
    });
    
    // 如果是新窗口打开，不阻止默认行为
    if (target === '_blank') {
      return; // 允许新窗口打开
    }
  }
  
  // 其他点击处理...
}, true);
```

---

## 数据结构更新

### 轨迹步骤
```typescript
interface TrajectoryStep {
  action: 'trajectory';
  points: Array<{ x: number; y: number; t: number }>;
  viewport: { width: number; height: number };
}
```

### 滚动步骤
```typescript
interface ScrollStep {
  action: 'scroll';
  x: number;
  y: number;
  viewport: { width: number; height: number };
}
```

### 链接点击步骤
```typescript
interface LinkClickStep {
  action: 'link_click';
  selector: string;
  value: string;  // href
  elementInfo: {
    tagName: string;
    target: '_self' | '_blank' | string;
    isExternal: boolean;
  };
}
```

---

## 文件修改

1. `demo/recorder-inject.js` - 更新注入脚本
   - 轨迹作为独立步骤
   - 添加滚动事件
   - 添加链接点击检测

2. `demo/recorder-overlay.html` - 更新演示页面
   - 添加 iframe 演示区域
   - 更新步骤面板显示（支持新步骤类型）

---

## 步骤显示优化

更新步骤面板，区分不同类型的步骤：

| 步骤类型 | 显示样式 |
|---------|---------|
| trajectory | 灰色，显示点数 |
| scroll | 灰色，显示坐标 |
| click | 默认样式 |
| link_click | 蓝色，显示目标 URL |
| fill | 默认样式 |
