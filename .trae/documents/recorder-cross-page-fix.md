# Recorder 跨页面数据丢失问题分析与修复计划

## 一、问题分析

### 1. 核心问题：`__recorderSync available: false`

用户日志显示：
```
[Recorder] __recorderSync available: false
```

这说明 CDP binding (`__recorderSync`) 没有正确设置到新页面上。

### 2. 问题原因

当用户点击链接打开新页面时，有以下几种情况：

1. **同页面导航** (`target="_self"`)
   - `page.on('load')` 会触发
   - `setupBinding` 会重新设置 binding
   - **应该正常工作**

2. **新标签页/窗口** (`target="_blank"` 或 `window.open()`)
   - 会创建新的 Page 对象
   - **当前代码没有监听新页面创建事件**
   - 新页面没有 binding，所以 `__recorderSync` 不可用

3. **跨域导航**
   - CDP binding 是绑定在特定 Page 对象上的
   - 导航到新域名后，需要重新设置 binding

### 3. 大量日志的原因

日志显示大量 iframe 注入：
```
[Recorder] Running in iframe context
```

这是因为：
1. `addInitScript` 对所有 iframe 都会执行
2. `frameattached` 事件不断触发
3. 某些网站（如百度）有大量动态 iframe

### 4. 数据存储位置

当前实现：
- **后端 (Node.js)**: `this.recorderSteps` - 这是正确的
- **前端 (浏览器)**: `window.__recorderSteps` - 这只是用于 UI 显示

问题在于：新页面没有 binding，所以无法将数据发送到后端。

## 二、修复方案

### 方案 1：监听新页面创建事件

```typescript
// 在 startRecorder 中添加
this.recorderPageHandler = async (newPage: Page) => {
  if (this.recorderSessionId) {
    await setupBinding(newPage);
    await newPage.evaluate(injectScript);
    
    // 监听新页面的 load 事件
    newPage.on('load', async () => {
      if (this.recorderSessionId) {
        await setupBinding(newPage);
        await newPage.evaluate(injectScript);
      }
    });
  }
};
page.context().on('page', this.recorderPageHandler);
```

### 方案 2：减少日志输出

```javascript
// inject.js 中移除或减少 console.log
// 只在调试模式下输出
if (window.__recorderDebug) {
  console.log('[Recorder] Inject script executing');
}
```

### 方案 3：确保 binding 在 inject 之前设置

当前问题是 `addInitScript` 在 `setupBinding` 之后调用，导致脚本执行时 binding 还不可用。

修复顺序：
1. 先设置 CDP binding
2. 再调用 `addInitScript`
3. 最后对当前页面执行 inject

## 三、具体修复步骤

### 步骤 1：添加新页面监听

在 `startRecorder` 中添加 `context.on('page')` 事件监听器，确保新打开的标签页也能正常录制。

### 步骤 2：修复 binding 设置时机

确保在 `addInitScript` 之前，binding 已经设置好。

### 步骤 3：减少日志输出

移除或条件化 `console.log` 输出，避免大量日志。

### 步骤 4：清理事件监听器

在 `stopRecorder` 中移除 `context.on('page')` 事件监听器。

## 四、测试验证

需要验证以下场景：
1. 点击 `target="_blank"` 链接打开新标签页
2. JavaScript `window.open()` 打开新窗口
3. 同页面导航到不同域名
4. 页面内有大量 iframe 的情况

## 五、当前代码问题定位

### browser.ts:2137
```typescript
await page.context().addInitScript(injectScript);
```
这行代码在 `setupBinding` 之后执行，但 `addInitScript` 会立即对所有现有和未来的 iframe 执行脚本，此时 binding 可能还没设置好。

### browser.ts:2127-2135
```typescript
this.recorderFrameAttachedHandler = async (frame: Frame) => {
  if (this.recorderSessionId) {
    try {
      await frame.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
      await frame.evaluate(injectScript);
    } catch {}
  }
};
page.on('frameattached', this.recorderFrameAttachedHandler);
```
这个事件处理器只监听了 `frameattached`，但没有监听新页面创建。

### 缺失的代码
没有监听 `context.on('page')` 事件，导致新标签页没有 binding。
