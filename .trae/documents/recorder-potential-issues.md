# Recorder 功能潜在问题分析报告

## 一、已发现的问题

### 1. 内存泄漏问题 (高优先级)

**问题描述**：
- `page.on('load')` 事件监听器在 `startRecorder` 中注册，但在 `stopRecorder` 中没有移除
- 如果用户多次调用 `startRecorder` 和 `stopRecorder`，会累积事件监听器

**代码位置**：
- `src/browser.ts:2086` - `page.on('load', async () => { ... })`

**影响**：
- 内存泄漏
- 可能导致重复执行注入逻辑

**解决方案**：
```typescript
// 保存事件处理器引用
private recorderLoadHandler: (() => Promise<void>) | null = null;

// startRecorder 中
this.recorderLoadHandler = async () => { ... };
page.on('load', this.recorderLoadHandler);

// stopRecorder 中
if (this.recorderLoadHandler) {
  page.off('load', this.recorderLoadHandler);
  this.recorderLoadHandler = null;
}
```

---

### 2. CDP Session 管理问题 (高优先级)

**问题描述**：
- 在 `setupBinding` 中，每次都创建新的 CDP session
- 如果页面快速导航，可能出现 session 未正确清理的情况

**代码位置**：
- `src/browser.ts:2058-2082` - `setupBinding` 函数

**影响**：
- 可能导致 CDP session 泄漏
- 多个 binding 可能同时存在

**解决方案**：
```typescript
const setupBinding = async (targetPage: Page) => {
  // 先移除旧的监听器
  if (this.recorderCdp) {
    this.recorderCdp.removeAllListeners('Runtime.bindingCalled');
    await this.recorderCdp.detach().catch(() => {});
  }
  // ... 创建新 session
};
```

---

### 3. 动态添加的 iframe 不会被注入 (中优先级)

**问题描述**：
- `addInitScript` 只对新创建的 iframe 有效
- 页面加载后动态添加的 iframe 不会被注入脚本

**代码位置**：
- `src/browser.ts:2113` - `page.context().addInitScript(injectScript)`

**影响**：
- 动态 iframe 中的操作不会被记录

**解决方案**：
- 监听 `frameattached` 事件，对新添加的 iframe 进行注入
```typescript
page.on('frameattached', async (frame) => {
  if (this.recorderSessionId) {
    try {
      await frame.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
      await frame.evaluate(injectScript);
    } catch {}
  }
});
```

---

### 4. 面板 Clear 按钮不同步 (中优先级)

**问题描述**：
- 面板的 `Clear` 按钮只清除浏览器端的 `window.__recorderSteps`
- 没有通知 Node.js 清除 `this.recorderSteps`

**代码位置**：
- `src/recorder/inject.js:488-494` - Clear 按钮点击处理

**影响**：
- 清除后，下次页面导航数据会重新出现
- Node.js 端的数据没有被清除

**解决方案**：
```javascript
document.getElementById('recorder-clear').addEventListener('click', function() {
  window.__recorderSteps = [];
  // 通知 Node.js 清除数据
  if (typeof window.__recorderSync === 'function') {
    window.__recorderSync(JSON.stringify({ action: '__clear__' }));
  }
  // ...
});
```

---

### 5. 并发安全问题 (中优先级)

**问题描述**：
- 如果页面快速导航，`setupBinding` 可能被多次调用
- `recorderCdp` 可能被覆盖，导致旧的 session 泄漏

**代码位置**：
- `src/browser.ts:2058-2082`

**影响**：
- 数据可能丢失
- CDP session 泄漏

**解决方案**：
- 添加锁机制或使用 Promise 队列

---

### 6. Fill 事件可能重复记录 (低优先级)

**问题描述**：
- `handleFill` 中手动触发了 `input` 事件
- inject.js 中的 `input` 监听器也会捕获这个事件
- 可能导致同一个 fill 被记录两次

**代码位置**：
- `src/actions.ts:798-800` - 手动触发 input 事件
- `src/recorder/inject.js:269-293` - input 事件监听

**影响**：
- 可能出现重复的 fill 步骤

**解决方案**：
- 在 inject.js 中添加去重逻辑，或者在 actions.ts 中不触发 input 事件

---

### 7. 错误被静默忽略 (低优先级)

**问题描述**：
- 很多地方使用了 `catch {}` 或 `catch(() => {})`
- 可能隐藏了真正的错误

**代码位置**：
- 多处 `catch {}` 语句

**影响**：
- 难以调试问题

**解决方案**：
- 至少记录错误日志

---

### 8. beforeunload 事件可能丢失数据 (低优先级)

**问题描述**：
- `beforeunload` 事件中调用 `__syncStepDirect`
- 但此时页面可能已经开始卸载，CDP binding 可能不可用

**代码位置**：
- `src/recorder/inject.js:308-324`

**影响**：
- 最后的 fill 和 navigate 事件可能丢失

**解决方案**：
- 使用 `pagevisibilitychange` 事件作为备选

---

## 二、建议的修复计划

### 阶段 1：关键问题修复 (高优先级)
1. 修复 `page.on('load')` 事件监听器内存泄漏
2. 改进 CDP session 管理
3. 添加动态 iframe 支持

### 阶段 2：功能完善 (中优先级)
4. 修复面板 Clear 按钮同步问题
5. 添加并发安全机制
6. 改进错误日志记录

### 阶段 3：优化 (低优先级)
7. 添加 fill 事件去重逻辑
8. 改进 beforeunload 数据保存

---

## 三、测试建议

1. **多次启动/停止测试**：验证内存泄漏是否修复
2. **快速导航测试**：验证并发安全性
3. **动态 iframe 测试**：验证动态添加的 iframe 是否被注入
4. **清除功能测试**：验证 Clear 按钮是否同步清除 Node.js 数据
5. **长时间运行测试**：验证稳定性

---

## 四、当前状态

- ✅ 基本录制功能正常
- ✅ 跨页面导航数据持久化
- ✅ 嵌套 iframe 支持
- ✅ 跨域 iframe 支持
- ⚠️ 存在潜在的内存泄漏
- ⚠️ 动态 iframe 支持不完整
- ⚠️ Clear 按钮不同步
