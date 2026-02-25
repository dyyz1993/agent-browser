# Viewer 输入事件问题调研与 E2E 测试计划

## 问题分析

### 根本原因：CDP `dispatchKeyEvent` 的 `text` 参数缺失

根据 CDP 文档，`Input.dispatchKeyEvent` 有以下类型：

| 类型 | 用途 | 是否需要 `text` 参数 |
|------|------|---------------------|
| `keyDown` | 按键按下 | 需要（用于生成字符） |
| `keyUp` | 按键释放 | 不需要 |
| `rawKeyDown` | 原始按键按下 | 不需要 |
| `char` | 字符输入 | 必须有 `text` |

**当前实现的问题**：

```javascript
// 当前代码只发送 key 和 code，没有 text
safeSend(JSON.stringify({
  type: 'input_keyboard',
  eventType: 'keyDown',
  key: e.key,      // 如 'a'
  code: e.code     // 如 'KeyA'
}));
```

后端调用：
```typescript
await cdp.send('Input.dispatchKeyEvent', {
  type: 'keyDown',
  key: 'a',
  code: 'KeyA',
  // 缺少 text: 'a' ← 这是问题所在！
});
```

**结果**：按键事件被发送，但没有字符被输入到输入框中。

---

## 解决方案

### 方案 A：在 `keyDown` 中添加 `text` 参数（推荐）

```typescript
// browser.ts
async injectKeyboardEvent(params: {
  type: 'keyDown' | 'keyUp' | 'char';
  key?: string;
  code?: string;
  text?: string;
  modifiers?: number;
}): Promise<void> {
  const cdp = await this.getCDPSession();

  const eventParams: Record<string, unknown> = {
    type: params.type,
    key: params.key,
    code: params.code,
    modifiers: params.modifiers ?? 0,
  };

  // 对于可打印字符，添加 text 参数
  if (params.type === 'keyDown' && params.key && params.key.length === 1) {
    eventParams.text = params.key;
  }
  if (params.text) {
    eventParams.text = params.text;
  }

  await cdp.send('Input.dispatchKeyEvent', eventParams);
}
```

### 方案 B：区分字符键和特殊键

```javascript
// viewer-html.ts
document.addEventListener('keydown', (e) => {
  if (isComposing) return;
  sendUserActivity();
  updateModifiers(e);

  // 可打印字符使用 input_text
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    safeSend(JSON.stringify({
      type: 'input_text',
      text: e.key
    }));
  } else {
    // 特殊键使用 input_keyboard
    safeSend(JSON.stringify({
      type: 'input_keyboard',
      eventType: 'keyDown',
      key: e.key,
      code: e.code,
      modifiers: modifiers
    }));
  }
});
```

### 方案 C：使用 `char` 类型事件

```javascript
// 对于可打印字符，发送 char 事件
if (e.key.length === 1) {
  safeSend(JSON.stringify({
    type: 'input_keyboard',
    eventType: 'char',
    text: e.key
  }));
}
```

---

## 推荐方案

**推荐方案 A**：在后端 `injectKeyboardEvent` 中自动处理 `text` 参数。

**理由**：
1. 前端代码不需要区分字符键和特殊键
2. 保持现有的消息协议不变
3. 后端可以根据 `key` 自动判断是否需要 `text`

---

## E2E 测试方案

### 测试文件位置

```
src/__tests__/e2e/
├── fixtures/
│   └── input-test.html      # 测试用 HTML 页面
├── utils/
│   └── test-helpers.ts      # 测试辅助函数
└── viewer-input.e2e.test.ts # Viewer 输入测试
```

### 测试用例设计

#### 1. 基础键盘输入测试

```typescript
describe('keyboard input injection', () => {
  it('should type letters into input field', async () => {
    // 点击输入框
    await browser.injectMouseEvent({
      type: 'mousePressed', x: 100, y: 100, button: 'left', clickCount: 1
    });
    await browser.injectMouseEvent({
      type: 'mouseReleased', x: 100, y: 100, button: 'left'
    });

    // 输入字母
    await browser.injectKeyboardEvent({ type: 'keyDown', key: 'h', code: 'KeyH' });
    await browser.injectKeyboardEvent({ type: 'keyUp', key: 'h', code: 'KeyH' });
    await browser.injectKeyboardEvent({ type: 'keyDown', key: 'i', code: 'KeyI' });
    await browser.injectKeyboardEvent({ type: 'keyUp', key: 'i', code: 'KeyI' });

    // 验证输入框内容
    const value = await page.locator('#input').inputValue();
    expect(value).toBe('hi');
  });

  it('should type numbers into input field', async () => {
    // ...类似测试
  });

  it('should handle special keys (Enter, Tab, Backspace)', async () => {
    // 测试特殊键
  });
});
```

#### 2. IME 中文输入测试

```typescript
describe('IME input injection', () => {
  it('should insert Chinese text via insertText', async () => {
    await browser.insertText('你好');
    const value = await page.locator('#input').inputValue();
    expect(value).toBe('你好');
  });
});
```

#### 3. 粘贴测试

```typescript
describe('paste input', () => {
  it('should insert pasted text', async () => {
    await browser.insertText('pasted text');
    const value = await page.locator('#input').inputValue();
    expect(value).toBe('pasted text');
  });
});
```

#### 4. 修饰键测试

```typescript
describe('modifier keys', () => {
  it('should handle Ctrl+A select all', async () => {
    await browser.insertText('test text');
    await browser.injectKeyboardEvent({
      type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 // Ctrl
    });
    // 验证全选
  });
});
```

### 测试 HTML Fixture

```html
<!-- input-test.html -->
<!DOCTYPE html>
<html>
<head>
  <title>Input Test</title>
</head>
<body>
  <input type="text" id="text-input" placeholder="Type here">
  <textarea id="textarea" placeholder="Multi-line"></textarea>
  <input type="password" id="password-input">
  <div id="output"></div>
  <script>
    document.getElementById('text-input').addEventListener('input', (e) => {
      document.getElementById('output').textContent = e.target.value;
    });
  </script>
</body>
</html>
```

---

## 实施计划

### 第一步：修复输入问题

1. 修改 `browser.ts` 的 `injectKeyboardEvent` 方法
2. 对于单字符 `key`，自动添加 `text` 参数

### 第二步：添加 E2E 测试

1. 创建 `input-test.html` fixture
2. 创建 `viewer-input.e2e.test.ts` 测试文件
3. 添加键盘输入、IME 输入、粘贴等测试用例

### 第三步：验证

1. 运行 E2E 测试确保修复有效
2. 手动测试 Viewer 页面输入功能

---

## 预期改动文件

| 文件 | 改动类型 |
|------|----------|
| `src/browser.ts` | 修改 `injectKeyboardEvent` |
| `src/__tests__/e2e/fixtures/input-test.html` | 新建 |
| `src/__tests__/e2e/viewer-input.e2e.test.ts` | 新建 |
