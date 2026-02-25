# E2E 测试未发现问题分析

## 问题现象

```
[Recorder] Inject script executing, __recorderInitialized: undefined 
[Recorder] Initialized successfully 
Uncaught TypeError: Cannot read properties of null (reading 'appendChild')
    at <anonymous>:314:19
```

## 问题原因

`document.body` 在脚本执行时可能还不存在：

```javascript
// 问题代码
document.body.appendChild(panel);  // document.body 可能是 null
```

## 为什么 E2E 测试没有发现？

### 测试环境 vs 实际环境

| 场景 | 页面状态 | document.body |
|------|----------|---------------|
| E2E 测试 | 页面已完全加载 | ✅ 存在 |
| CLI 实际使用 | 页面刚开始加载 | ❌ 可能是 null |

### 测试代码分析

```typescript
// 测试中
beforeEach(async () => {
  const openResult = await executeCommand(
    parseCliArgs(['open', getFixturePath('comprehensive-test.html')]),
    browser
  );
  // 页面已完全加载后才执行 recorder start
});

it('should record single click', async () => {
  await executeCommand(parseCliArgs(['recorder', 'start']), browser);
  // 此时 document.body 已存在
});
```

### 实际 CLI 流程

```
recorder start baidu.com
    ↓
page.goto(url, { waitUntil: 'load' })
    ↓
page.evaluate(injectScript)  // 在 load 事件后执行
    ↓
但 addInitScript 可能在更早执行
    ↓
document.body 可能还不存在
```

## 解决方案

### 方案 1: 等待 document.body 存在

```javascript
function createPanel() {
  if (!document.body) {
    // 等待 body 存在
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createPanel);
    } else {
      setTimeout(createPanel, 10);
    }
    return;
  }
  // 创建面板...
}
```

### 方案 2: 使用 document.documentElement

```javascript
// 使用 document.documentElement (html 元素) 作为备选
const root = document.body || document.documentElement;
root.appendChild(panel);
```

### 方案 3: 在 recorder start 中等待 DOM

```typescript
// browser.ts
await page.evaluate(() => {
  if (document.readyState === 'loading') {
    return new Promise(resolve => {
      document.addEventListener('DOMContentLoaded', resolve);
    });
  }
});
await page.evaluate(injectScript);
```

## 测试改进建议

### 添加 DOM 状态测试

```typescript
it('should handle early injection before DOM ready', async () => {
  // 在页面加载前注入
  await page.evaluate(() => {
    document.body = null; // 模拟早期状态
  });
  await executeCommand(parseCliArgs(['recorder', 'start']), browser);
  // 验证没有错误
});
```

### 添加控制台错误检测

```typescript
it('should not have console errors during recording', async () => {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  
  await executeCommand(parseCliArgs(['recorder', 'start']), browser);
  await executeCommand(parseCliArgs(['click', '#btn']), browser);
  
  expect(errors).toHaveLength(0);
});
```

## 任务列表

- [ ] Task 1: 修复 document.body null 问题
- [ ] Task 2: 添加 DOM 状态检测
- [ ] Task 3: 添加控制台错误检测测试
