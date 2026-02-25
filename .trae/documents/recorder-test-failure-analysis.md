# Recorder 测试失败原因调研报告（更新版）

## 用户问题解答

### 1. 用 type 代替 fill？

**答案：是的，`type`** **会触发更多事件**

| 方法     | Playwright API                | 触发的事件                                   |
| ------ | ----------------------------- | --------------------------------------- |
| `fill` | `locator.fill()`              | 可能不触发 `input` 事件                        |
| `type` | `locator.pressSequentially()` | `keydown`, `keypress`, `input`, `keyup` |

**代码对比**：

```typescript
// fill - 直接设置 value
await locator.fill(command.value);

// type - 逐字符输入
await locator.pressSequentially(command.text, { delay: command.delay });
```

**建议**：测试中使用 `type` 命令代替 `fill`，或者修改 `handleFill` 在填充后手动触发 `input` 事件。

***

### 2. iframe 可以通过 postMessage 传递？

**答案：是的，inject.js 已经有 postMessage 机制**

```javascript
// inject.js 中的 iframe 通信机制

// iframe 内发送步骤
if (isInIframe) {
  window.parent.postMessage({ type: '__recorder_step__', step: step }, '*');
}

// 父页面接收步骤
if (!isInIframe) {
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === '__recorder_step__' && event.data.step) {
      window.__recorderSync(JSON.stringify(event.data.step));
    }
  });
}
```

**问题**：iframe 内的 `__recorderSync` 可能没有正确绑定。

**建议**：确保 iframe 注入时，`__recorderSync` 已经在父页面绑定。

***

### 3. reload 后脚本丢失？

**答案：`addInitScript`** **应该能处理，但可能存在时序问题**

```typescript
// browser.ts 中的注入方式
await page.context().addInitScript(injectScript);
```

**`addInitScript`** **的行为**：

* 在**每个新页面/框架**加载时自动执行

* 包括 reload 后的页面

* 应该是"雷打不动"的

**可能的问题**：

1. CDP binding (`__recorderSync`) 在页面 reload 后可能需要重新绑定
2. 注入脚本执行时，binding 可能还未就绪

**建议**：检查 CDP binding 是否在 reload 后仍然可用。

***

### 4. 原代码的采集机制

**inject.js 中的 fill 采集机制**：

```javascript
document.addEventListener('input', (e) => {
  const element = e.target;
  const selector = getSelector(element);
  const value = element.value;

  // 防抖逻辑：500ms 后记录
  clearTimeout(fillTimeout);
  
  if (lastFillSelector === selector) {
    lastFillValue = value;
  } else {
    if (lastFillSelector && lastFillValue) {
      recordStep('fill', { selector: lastFillSelector, value: lastFillValue });
    }
    lastFillSelector = selector;
    lastFillValue = value;
  }

  fillTimeout = setTimeout(() => {
    if (lastFillSelector && lastFillValue) {
      recordStep('fill', { selector: lastFillSelector, value: lastFillValue });
    }
  }, 500);
}, true);
```

**问题**：

1. 依赖 `input` 事件，但 `fill()` 可能不触发
2. 500ms 防抖延迟，测试等待时间不够

***

## 解决方案

### 方案 1: 修改 handleFill 触发 input 事件

```typescript
// actions.ts
await locator.fill(command.value);
await locator.evaluate(el => {
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
```

### 方案 2: 使用 type 代替 fill

```typescript
// 测试中使用
await executeCommand(parseCliArgs(['type', '#type-input', 'test value']), browser);
```

### 方案 3: 确保 iframe 注入正确

```typescript
// 在 startRecorder 中，等待 iframe 加载后再注入
for (const frame of page.frames()) {
  if (frame !== page.mainFrame()) {
    try {
      await frame.waitForLoadState('domcontentloaded');
      await frame.evaluate(injectScript);
    } catch {}
  }
}
```

### 方案 4: 检查 reload 后 binding 是否可用

```typescript
// 在 bindingCalled 处理中添加日志
cdp.on('Runtime.bindingCalled', (params: any) => {
  console.log('[Recorder] bindingCalled:', params.name, params.payload?.slice(0, 100));
  // ...
});
```

***

## 任务列表

* [ ] Task 1: 修改 handleFill 触发 input 事件

* [ ] Task 2: 确保 iframe 注入正确

* [ ] Task 3: 检查 reload 后 binding 是否可用

* [ ] Task 4: 运行测试验证修复

