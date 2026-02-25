# Recorder 注入脚本差异分析

## 文件对比

### 1. src/recorder/inject.js (简化版)
- 142 行代码
- 基本功能：click, input, change, navigate
- 无 scroll 事件
- 无 resize 事件
- 无 iframe 支持
- 无 link_click 区分
- 无 XPath 生成

### 2. demo/recorder-inject.js (完整版)
- 385 行代码
- 完整功能：click, input, change, navigate, scroll, resize
- iframe 支持（通过 postMessage）
- link_click 区分（外部链接检测）
- XPath 生成
- 输入合并（500ms 延迟）
- 轨迹追踪

### 3. browser.ts 中的 getRecorderInjectScript()
- 内联脚本，与 demo/recorder-inject.js 类似
- 但缺少 UI 面板注入

## UI 面板问题

### 为什么没有 UI 面板？

**demo/recorder-overlay.html** 中的 UI 面板是**硬编码在 HTML 中**的：
```html
<!-- 录制面板 -->
<div class="recorded-panel">
  <div class="recorded-panel-header">
    <h3>📝 录制步骤</h3>
    ...
  </div>
  <div class="recorded-panel-body" id="steps-container">
    ...
  </div>
</div>
```

而 **browser.ts** 中的注入脚本只捕获事件，**没有动态创建 UI 面板**。

### 解决方案

需要在注入脚本中动态创建 UI 面板：

```javascript
function createRecorderPanel() {
  const panel = document.createElement('div');
  panel.className = 'recorder-panel';
  panel.innerHTML = `
    <div class="recorder-panel-header">
      <h3>📝 录制步骤</h3>
      <button id="recorder-clear">清空</button>
    </div>
    <div class="recorder-panel-body" id="recorder-steps"></div>
  `;
  document.body.appendChild(panel);
}
```

## 差异对比表

| 功能 | src/recorder/inject.js | demo/recorder-inject.js | browser.ts |
|------|------------------------|-------------------------|------------|
| click 事件 | ✅ | ✅ | ✅ |
| input 事件 | ✅ 立即记录 | ✅ 合并 500ms | ✅ 合并 300ms |
| change 事件 | ✅ | ✅ | ✅ |
| scroll 事件 | ❌ | ✅ | ✅ |
| resize 事件 | ❌ | ✅ | ✅ |
| link_click | ❌ | ✅ | ✅ |
| XPath 生成 | ❌ | ✅ | ✅ |
| iframe 支持 | ❌ | ✅ postMessage | ✅ postMessage |
| 轨迹追踪 | ✅ | ✅ | ✅ |
| UI 面板 | ❌ | ❌ (HTML 硬编码) | ❌ |

## 任务列表

- [ ] Task 1: 统一注入脚本，使用 demo/recorder-inject.js 的完整功能
- [ ] Task 2: 在注入脚本中动态创建 UI 面板
- [ ] Task 3: 添加面板样式
- [ ] Task 4: 实现步骤列表实时更新
- [ ] Task 5: 添加清空和导出按钮
