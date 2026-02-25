# 录制器面板 UI 改进方案

## 问题分析

### 1. 面板不支持拖拽
- 当前面板是 `position: fixed; right: 20px; top: 20px;` 固定定位
- 用户无法移动面板位置

### 2. +Tool 下拉菜单问题
- 下拉菜单 `z-index: 10` 相对于步骤项定位
- 可能被其他元素遮挡
- 鼠标移动时容易消失

### 3. 工具栏（Toolbar）问题
- 工具栏在鼠标离开元素后会延迟隐藏
- 位置计算可能不够智能
- 用户反馈"一移动就消失"

### 4. 样式隔离问题
- 当前样式直接注入到 `<head>` 中
- 可能与页面样式冲突
- 没有使用 Shadow DOM 隔离

## 改进方案

### 1. 面板拖拽功能

```javascript
// 添加拖拽功能
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

panelHeader.addEventListener('mousedown', (e) => {
  isDragging = true;
  dragOffset.x = e.clientX - panel.offsetLeft;
  dragOffset.y = e.clientY - panel.offsetTop;
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  panel.style.left = (e.clientX - dragOffset.x) + 'px';
  panel.style.top = (e.clientY - dragOffset.y) + 'px';
  panel.style.right = 'auto'; // 清除 right 定位
});

document.addEventListener('mouseup', () => {
  isDragging = false;
});
```

### 2. +Tool 下拉菜单改进

```css
/* 改进下拉菜单定位 */
.recorder-tool-dropdown {
  position: fixed; /* 改为 fixed 定位 */
  z-index: 2147483647; /* 最高 z-index */
  /* 动态计算位置 */
}

/* 或者使用 popover API */
.recorder-tool-dropdown {
  popover: auto;
}
```

### 3. 工具栏改进

```javascript
// 改进工具栏位置计算
function calculateToolbarPosition(rect) {
  const mouseX = window.mouseX || 0;
  const mouseY = window.mouseY || 0;
  
  // 优先放在鼠标附近
  const GAP = 10;
  const TOOLBAR_W = 280;
  const TOOLBAR_H = 32;
  
  let left = mouseX + GAP;
  let top = mouseY + GAP;
  
  // 边界检测
  if (left + TOOLBAR_W > window.innerWidth) {
    left = mouseX - TOOLBAR_W - GAP;
  }
  if (top + TOOLBAR_H > window.innerHeight) {
    top = mouseY - TOOLBAR_H - GAP;
  }
  
  return { left, top, orientation: 'horizontal' };
}

// 增加隐藏延迟时间
const TOOLBAR_HIDE_DELAY = 500; // 从 200ms 增加到 500ms
```

### 4. 样式隔离

使用 Shadow DOM 隔离样式：

```javascript
function createRecorderOverlay() {
  // 创建 Shadow DOM 容器
  const container = document.createElement('div');
  container.id = 'recorder-container';
  container.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
  document.body.appendChild(container);
  
  const shadow = container.attachShadow({ mode: 'closed' });
  
  // 在 Shadow DOM 中创建样式和元素
  const style = document.createElement('style');
  style.textContent = `...`;
  shadow.appendChild(style);
  
  // 在 Shadow DOM 中创建面板
  const panel = document.createElement('div');
  panel.className = 'recorder-panel';
  shadow.appendChild(panel);
  
  // ...
}
```

## 实现步骤

### 第一阶段：面板拖拽
1. 添加拖拽相关的 CSS 样式（cursor: move）
2. 添加拖拽事件监听器
3. 保存面板位置到 localStorage

### 第二阶段：+Tool 下拉菜单改进
1. 修改下拉菜单为 fixed 定位
2. 动态计算下拉菜单位置
3. 提高下拉菜单 z-index

### 第三阶段：工具栏改进
1. 改进位置计算逻辑，优先放在鼠标附近
2. 增加隐藏延迟时间
3. 添加"固定工具栏"选项

### 第四阶段：样式隔离（可选）
1. 使用 Shadow DOM 隔离样式
2. 确保所有功能正常工作

## 修改文件

| 文件 | 修改内容 |
|------|------|
| `src/recorder/inject.js` | 1. 添加拖拽功能<br>2. 改进下拉菜单定位<br>3. 改进工具栏位置计算<br>4. 增加隐藏延迟<br>5. 可选：Shadow DOM 隔离 |

## 详细实现

### 1. 面板拖拽

```javascript
// 在 createRecorderOverlay 函数中添加

// 添加拖拽样式
.recorder-panel-header { cursor: move; user-select: none; }

// 拖拽逻辑
let isDragging = false;
let dragStartX = 0, dragStartY = 0;
let panelStartX = 0, panelStartY = 0;

const header = panel.querySelector('.recorder-panel-header');
header.addEventListener('mousedown', (e) => {
  if (e.target.tagName === 'BUTTON') return; // 不拦截按钮点击
  isDragging = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  const rect = panel.getBoundingClientRect();
  panelStartX = rect.left;
  panelStartY = rect.top;
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  panel.style.left = Math.max(0, Math.min(window.innerWidth - 320, panelStartX + dx)) + 'px';
  panel.style.top = Math.max(0, Math.min(window.innerHeight - 100, panelStartY + dy)) + 'px';
  panel.style.right = 'auto';
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    // 保存位置到 localStorage
    try {
      localStorage.setItem('recorder-panel-pos', JSON.stringify({
        left: panel.style.left,
        top: panel.style.top
      }));
    } catch(e) {}
  }
});

// 恢复保存的位置
try {
  const savedPos = localStorage.getItem('recorder-panel-pos');
  if (savedPos) {
    const pos = JSON.parse(savedPos);
    panel.style.left = pos.left;
    panel.style.top = pos.top;
    panel.style.right = 'auto';
  }
} catch(e) {}
```

### 2. +Tool 下拉菜单改进

```javascript
// 修改 __updateRecorderUI 函数中的下拉菜单逻辑

container.querySelectorAll('.add-tool-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const stepIndex = parseInt(btn.dataset.stepIndex);
    const dropdown = document.getElementById('tool-dropdown-' + stepIndex);
    
    // 计算下拉菜单位置
    const btnRect = btn.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.left = btnRect.left + 'px';
    dropdown.style.top = (btnRect.bottom + 4) + 'px';
    dropdown.style.zIndex = '2147483647';
    
    // 关闭其他下拉菜单
    document.querySelectorAll('.recorder-tool-dropdown').forEach(d => {
      if (d !== dropdown) d.classList.remove('show');
    });
    dropdown.classList.toggle('show');
  });
});

// 点击外部关闭下拉菜单
document.addEventListener('click', (e) => {
  if (!e.target.closest('.add-tool-btn') && !e.target.closest('.recorder-tool-dropdown')) {
    document.querySelectorAll('.recorder-tool-dropdown').forEach(d => {
      d.classList.remove('show');
    });
  }
});
```

### 3. 工具栏改进

```javascript
// 修改工具栏位置计算
const TOOLBAR_HIDE_DELAY = 500; // 增加延迟

function calculateToolbarPosition(rect) {
  const GAP = 10;
  const TOOLBAR_W = 280;
  const TOOLBAR_H = 32;
  
  // 优先放在鼠标右下方
  let left = mouseX + GAP;
  let top = mouseY + GAP;
  
  // 边界检测
  if (left + TOOLBAR_W > window.innerWidth - 10) {
    left = mouseX - TOOLBAR_W - GAP;
  }
  if (top + TOOLBAR_H > window.innerHeight - 10) {
    top = mouseY - TOOLBAR_H - GAP;
  }
  
  // 确保不超出屏幕
  left = Math.max(10, left);
  top = Math.max(10, top);
  
  return { left, top, orientation: 'horizontal' };
}
```
