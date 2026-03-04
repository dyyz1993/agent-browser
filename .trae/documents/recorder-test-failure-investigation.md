# Recorder 测试失败调查计划

## 问题概述

运行完整 recorder 测试套件时，有 2-3 个测试失败：
1. `should recover from trajectory failure` - recorder-integration.e2e.test.ts
2. `should respect delays between points` - recorder-trajectory.e2e.test.ts  
3. `should record click inside same-origin iframe` - recorder-enhanced.e2e.test.ts

**关键发现**：
- 测试 1 和 2 单独运行时都通过，说明问题是测试间的状态干扰
- 测试 3 单独运行时也失败，说明这是一个独立的问题

## 第一阶段：iframe 测试失败分析

### 问题描述
`should record click inside same-origin iframe` 测试失败，录制文件中 `steps: 0`

### 测试代码分析
```javascript
// iframe 使用 about:blank 作为初始 src
<iframe id="same-origin-iframe" src="about:blank" ...></iframe>

// 然后通过 JavaScript 动态设置内容
setTimeout(() => {
  const doc = iframe.contentDocument;
  doc.body.innerHTML = '<button id="iframe-btn-1">Iframe Button</button>...';
}, 100);
```

### iframe 录制机制分析

#### inject.js 中的 iframe 处理
```javascript
// 1. iframe 中的事件通过 postMessage 向父窗口传递
if (isInIframe) {
  window.parent.postMessage({ type: MESSAGE_TYPE, step: step }, '*');
}

// 2. 父窗口监听 message 事件，接收 iframe 中的步骤
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === MESSAGE_TYPE && event.data.step) {
    if (!isInIframe) {
      // 调用 binding 发送步骤到 Node.js
      window[bindingName](JSON.stringify(event.data.step));
    }
  }
});
```

#### 关键问题
1. **脚本注入问题**: `addInitScript` 是否会在 `about:blank` iframe 中执行？
2. **xyzInjectedSessionId 问题**: iframe 中是否设置了 `window.xyzInjectedSessionId`？

### Playwright addInitScript 行为分析

根据 Playwright 文档：
- `addInitScript` 会在子 frame 被附加或导航时执行
- 但是对于 `about:blank` 和动态设置内容的情况，可能不会触发脚本注入

### 需要验证的问题
1. `about:blank` iframe 是否会触发 `addInitScript`？
2. 如果不会，需要手动向 iframe 注入脚本

### 可能的修复方案
1. **方案 A**: 监听 `frameattached` 事件，手动向新 iframe 注入脚本
2. **方案 B**: 在 `startRecorder` 中，遍历所有现有 iframe 并注入脚本
3. **方案 C**: 修改测试，使用真实的 iframe src 而不是 `about:blank`

## 第二阶段：测试间状态干扰分析

### 问题描述
`should recover from trajectory failure` 和 `should respect delays between points` 在完整测试套件中失败，但单独运行时通过

### 可能的原因
1. **鼠标轨迹残留** - 前一个测试的鼠标移动被后一个测试捕获
2. **录制器状态残留** - `xyzActive`、`xyzStopped` 等状态没有正确重置
3. **事件监听器残留** - 旧的事件监听器仍然活跃

### 已实施的修复
1. `mousemove` 事件监听器添加了 `xyzActive` 检查
2. `recordStep` 函数添加了 `xyzActive` 检查
3. `startRecorder` 中添加了 `window.xyzQueue = []` 清空逻辑
4. `stopRecorder` 中修复了 `xyzFlushPending` 调用顺序

### 待调查
1. 是否有其他事件监听器没有检查 `xyzActive`？
2. 测试间的等待时间是否足够？
3. 是否需要更强的测试隔离机制？

## 第三阶段：详细调查计划

### 步骤 1：调查 iframe 录制问题

#### 已发现的问题
1. `addInitScript` 应该会在子 frame 被附加或导航时执行
2. 但测试中的 iframe 使用 `about:blank` 作为初始 src
3. 动态设置 `innerHTML` 不会触发导航事件

#### 根本原因分析
测试中的 iframe 流程：
1. `<iframe id="same-origin-iframe" src="about:blank">` - iframe 加载 about:blank
2. `setTimeout(() => { doc.body.innerHTML = '...' }, 100)` - 动态设置内容

问题：
- `about:blank` iframe 可能不会触发 `addInitScript`
- 动态设置 `innerHTML` 不会触发导航事件
- 因此录制器脚本没有被注入到 iframe 中

#### 验证方法
1. 添加调试日志，检查 iframe 中 `window.xyzInjectedSessionId` 是否存在
2. 检查 iframe 中是否有录制器的事件监听器

### 步骤 2：调查测试间状态干扰

#### 已发现的问题
1. `mousemove` 事件监听器已添加 `xyzActive` 检查
2. `recordStep` 函数已添加 `xyzActive` 检查
3. 但测试仍然失败

#### 可能遗漏的问题
1. 其他事件监听器（click, scroll, resize 等）是否检查 `xyzActive`？
2. `stopRecorder` 后，事件监听器是否仍然活跃？
3. 测试间的等待时间是否足够？

### 步骤 3：修复方案

#### iframe 录制问题修复方案
1. **方案 A**: 在 `startRecorder` 中监听 `frameattached` 事件，手动向新 iframe 注入脚本
2. **方案 B**: 修改测试，使用真实的 iframe src 而不是 `about:blank`
3. **方案 C**: 在 `inject.js` 中添加 iframe 检测逻辑，自动向子 iframe 注入脚本

#### 测试间状态干扰修复方案
1. **方案 A**: 增加测试间的等待时间
2. **方案 B**: 在 `beforeEach` 中强制重置所有状态
3. **方案 C**: 使用独立的浏览器实例
