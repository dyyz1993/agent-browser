# Recorder Overlay 优化计划

## 问题分析

### 1. 事件拦截问题
- **当前状态**：`shadowBox` 使用 `pointer-events: none`（正确），但 `bridge` 使用 `pointer-events: auto`（会拦截事件）
- **问题**：连接桥会拦截点击事件，导致用户点击页面元素没反应
- **解决方案**：将 `bridge` 改为 `pointer-events: none`，让事件完全穿透

### 2. 选择器路径优化
- **当前问题**：选择器路径可能过长，不够简洁
- **优化策略**：
  1. 优先使用 `#id`（如果有）
  2. 其次使用语义化属性：`[data-testid]`、`[aria-label]`、`[name]`、`[role]`
  3. 使用 `tag.class` 组合
  4. 最后使用路径组合，但限制深度

### 3. Shadow DOM 支持
- **问题**：Shadow DOM 内的元素事件会被 retarget 到 host 元素
- **解决方案**：
  - 使用 `event.composedPath()` 获取真实目标元素
  - 为 Shadow DOM 元素生成特殊选择器：`host-element >> shadow-element`

### 4. iframe 支持
- **问题**：iframe 内的元素无法被父页面的脚本捕获
- **解决方案**：
  - 遍历所有 iframe，注入相同的 overlay 脚本
  - 跨 iframe 通信使用 `postMessage`
  - 注意同源策略限制

### 5. Fragment (DocumentFragment) 支持
- **说明**：DocumentFragment 是临时容器，不会出现在 DOM 中，不需要特殊处理
- 但需要处理 `<template>` 元素内的元素

---

## 实现计划

### Step 1: 修复事件穿透
- 将 `bridge` 的 `pointer-events` 改为 `none`
- 确保所有 overlay 元素都不拦截事件（除了工具栏按钮）

### Step 2: 优化选择器生成
```javascript
function getOptimizedSelector(element) {
  // 1. 优先 ID
  if (element.id) return `#${CSS.escape(element.id)}`;
  
  // 2. 语义化属性
  const semanticAttrs = ['data-testid', 'data-test', 'data-cy', 'aria-label', 'aria-labelledby', 'name', 'role', 'title'];
  for (const attr of semanticAttrs) {
    const value = element.getAttribute(attr);
    if (value) return `${element.tagName.toLowerCase()}[${attr}="${CSS.escape(value)}"]`;
  }
  
  // 3. 简洁 class 组合
  if (element.className && typeof element.className === 'string') {
    const classes = element.className.trim().split(/\s+/).filter(c => c && !c.startsWith('_'));
    if (classes.length > 0) {
      const selector = `${element.tagName.toLowerCase()}.${classes.slice(0, 2).join('.')}`;
      if (document.querySelectorAll(selector).length === 1) return selector;
    }
  }
  
  // 4. 路径选择器（限制深度）
  return getPathSelector(element, 3);
}
```

### Step 3: 支持 Shadow DOM
```javascript
function getRealTarget(event) {
  // 使用 composedPath 获取真实目标
  const path = event.composedPath();
  return path[0];
}

function getShadowSelector(element) {
  const path = [];
  let current = element;
  
  while (current && current !== document) {
    const selector = getOptimizedSelector(current);
    path.unshift(selector);
    
    // 检查是否在 Shadow DOM 中
    const root = current.getRootNode();
    if (root instanceof ShadowRoot) {
      path.unshift('>>'); // Shadow DOM 分隔符
      current = root.host;
    } else {
      current = current.parentElement;
    }
  }
  
  return path.join(' ');
}
```

### Step 4: 支持 iframe
```javascript
function injectToIframes() {
  document.querySelectorAll('iframe').forEach(iframe => {
    try {
      // 同源检查
      const iframeDoc = iframe.contentDocument;
      if (iframeDoc) {
        // 注入脚本
        const script = iframeDoc.createElement('script');
        script.textContent = OVERLAY_SCRIPT;
        iframeDoc.head.appendChild(script);
      }
    } catch (e) {
      // 跨域 iframe 无法访问
      console.warn('[Recorder] Cannot access cross-origin iframe:', iframe.src);
    }
  });
}
```

---

## 文件修改

修改文件：`demo/recorder-overlay.html`

1. 修改 CSS：`pointer-events: none` for bridge
2. 修改事件处理：使用 `composedPath()`
3. 优化选择器生成函数
4. 添加 iframe 注入逻辑
5. 添加 Shadow DOM 选择器支持
