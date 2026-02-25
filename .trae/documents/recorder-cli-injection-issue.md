# Recorder 注入脚本问题分析

## 问题现象

用户反馈：

* `window.__recorderInitialized` 一直是 `undefined`

* 说明注入脚本**根本没有执行**

## 问题根源

### context.addInitScript vs page.evaluate

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    注入方式对比                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  context.addInitScript(script)                                          │
│  ─────────────────────────────                                          │
│  ✅ 注入到所有新页面/iframe                                              │
│  ❌ 不会注入到已经加载的页面                                             │
│  ❌ 如果当前没有页面，什么都不会发生                                     │
│                                                                         │
│  page.evaluate(script)                                                  │
│  ─────────────────────────────                                          │
│  ✅ 立即在当前页面执行                                                   │
│  ❌ 如果 page 是 null/undefined，会报错                                 │
│  ❌ 如果页面还没加载完成，可能失败                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 当前代码问题

```typescript
async startRecorder(url?: string): Promise<{ started: boolean; sessionId: string }> {
  const page = this.getPage();
  if (!page) {
    throw new Error('No page available. Launch browser first.');
  }
  // ...
  await page.context().addInitScript(injectScript);  // 只影响新页面
  await page.evaluate(injectScript);  // 应该立即执行，但可能 page 是 about:blank
  // ...
  if (url) {
    await page.goto(url, { waitUntil: 'load' });  // 导航后，addInitScript 会生效
  }
}
```

### 问题分析

1. **如果 URL 存在**：

   * `addInitScript` 设置

   * `page.evaluate` 在 about:blank 执行（可能失败或无效）

   * `page.goto(url)` 导航后，`addInitScript` 生效 ✅

2. **如果 URL 不存在**：

   * `addInitScript` 设置

   * `page.evaluate` 在当前页面执行

   * 但如果当前页面是 about:blank 或未加载，可能失败 ❌

3. **CLI 场景**：

   * `--headed` 启动浏览器

   * 立即发送 `recorder start baidu.com`

   * `page.goto('https://baidu.com')` 导航

   * `addInitScript` 应该在新页面生效 ✅

### 为什么 `__recorderInitialized` 是 undefined？

可能的原因：

1. **页面导航后，脚本未执行** - `addInitScript` 可能没有正确设置
2. **CDP binding 未设置** - `Runtime.addBinding` 可能没有在正确的 context
3. **脚本执行顺序问题** - 页面加载完成前脚本未执行

## 解决方案

### 方案 1: 确保 page.evaluate 正确执行

```typescript
// 等待页面加载完成
await page.waitForLoadState('domcontentloaded');

// 执行注入脚本
await page.evaluate(injectScript);

// 验证注入成功
const initialized = await page.evaluate(() => window.__recorderInitialized);
console.log('[Recorder] Initialized:', initialized);
```

### 方案 2: 在 goto 后重新注入

```typescript
if (url) {
  await page.goto(url, { waitUntil: 'load' });
  // 导航后重新注入
  await page.evaluate(injectScript);
}
```

### 方案 3: 添加调试日志

```typescript
const injectScript = `
console.log('[Recorder] Inject script executing...');
if (window.__recorderInitialized) {
  console.log('[Recorder] Already initialized, skipping');
  return;
}
window.__recorderInitialized = true;
console.log('[Recorder] Initialized successfully');
// ... rest of script
`;
```

## 任务列表

* [ ] Task 1: 添加调试日志验证脚本执行

* [ ] Task 2: 在 goto 后重新注入脚本

* [ ] Task 3: 确保 CDP binding 正确设置

* [ ] Task 4: 添加验证逻辑确认注入成功

