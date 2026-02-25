# Viewer 输入事件简化方案

## 问题分析

### 当前实现的问题

1. **协议被修改**：在 `injectKeyboardEvent` 中自动添加 `text` 参数，改变了原有行为
2. **前端逻辑复杂**：前端判断 `isSpecialKey`，增加了复杂性
3. **中文输入无效**：`compositionend` 事件可能没有正确触发或处理
4. **不符合标准**：自己修改协议，容易产生歧义

### 现有协议分析

**CLI 命令协议**（`protocol.ts`）：
- `keydown <key>` - 按下键（使用 Playwright `keyboard.down`）
- `keyup <key>` - 释放键（使用 Playwright `keyboard.up`）
- `inserttext <text>` - 插入文本（使用 Playwright `keyboard.insertText`）
- `press <key>` - 按键（使用 Playwright `keyboard.press`）

**WebSocket 流协议**（`stream-server.ts`）：
- `input_keyboard` - 键盘事件（直接调用 CDP `Input.dispatchKeyEvent`）
- `input_text` - 文本插入（调用 CDP `Input.insertText`）

### Playwright 的处理方式

Playwright 的 `keyboard.press(key)` 内部会：
1. 解析 key（如 'a', 'Enter', 'Control+A'）
2. 自动判断是字符键还是特殊键
3. 发送正确的 CDP 事件序列

## 推荐方案：简化协议，直接使用 Playwright

### 方案：前端使用 Playwright 风格的 key

**核心思路**：前端发送 Playwright 风格的 key，后端使用 Playwright 的 `keyboard` API。

**优点**：
1. 不修改任何协议
2. Playwright 内部处理所有特殊情况
3. 支持所有键盘操作（包括修饰键组合）
4. 代码简单，易于维护

### 前端修改

```javascript
// viewer-html.ts

// 键盘按下
document.addEventListener('keydown', (e) => {
  if (isComposing) return;
  sendUserActivity();
  
  // 直接发送 keydown 命令
  safeSend(JSON.stringify({
    type: 'keyboard_down',
    key: e.key
  }));
  
  // 阻止某些默认行为
  if (e.key === 'Tab' || (e.key === 'Backspace' && !e.target.matches('input, textarea'))) {
    e.preventDefault();
  }
});

// 键盘释放
document.addEventListener('keyup', (e) => {
  if (isComposing) return;
  
  safeSend(JSON.stringify({
    type: 'keyboard_up',
    key: e.key
  }));
});

// IME 输入完成
document.addEventListener('compositionend', (e) => {
  isComposing = false;
  if (e.data) {
    sendUserActivity();
    safeSend(JSON.stringify({
      type: 'keyboard_insert_text',
      text: e.data
    }));
  }
});

// 粘贴
document.addEventListener('paste', async (e) => {
  e.preventDefault();
  sendUserActivity();
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      safeSend(JSON.stringify({
        type: 'keyboard_insert_text',
        text: text
      }));
    }
  } catch (err) {
    console.error('Failed to read clipboard:', err);
  }
});
```

### 后端修改

```typescript
// stream-server.ts

// 新增消息类型
export interface KeyboardDownMessage {
  type: 'keyboard_down';
  key: string;
}

export interface KeyboardUpMessage {
  type: 'keyboard_up';
  key: string;
}

export interface KeyboardInsertTextMessage {
  type: 'keyboard_insert_text';
  text: string;
}

// 处理逻辑
case 'keyboard_down':
  this.stateManager.onUserInteraction();
  await this.browser.getPage().keyboard.down(message.key);
  break;

case 'keyboard_up':
  await this.browser.getPage().keyboard.up(message.key);
  break;

case 'keyboard_insert_text':
  this.stateManager.onUserInteraction();
  await this.browser.getPage().keyboard.insertText(message.text);
  break;
```

### 移除的内容

1. **移除** `injectKeyboardEvent` 中的自动 `text` 添加逻辑
2. **移除** 前端的 `isSpecialKey` 判断
3. **移除** `input_keyboard` 和 `input_text` 消息类型（或保留但不推荐使用）

### 为什么这样更好

1. **Playwright 处理所有复杂性**：
   - 自动处理 `keyDown` + `char` 事件序列
   - 自动处理特殊键（Backspace, Enter, Tab 等）
   - 自动处理修饰键组合（Control+A 等）

2. **协议清晰**：
   - `keyboard_down` → `page.keyboard.down(key)`
   - `keyboard_up` → `page.keyboard.up(key)`
   - `keyboard_insert_text` → `page.keyboard.insertText(text)`

3. **中文输入正确处理**：
   - `compositionend` 发送 `keyboard_insert_text`
   - Playwright 的 `insertText` 直接调用 CDP `Input.insertText`

4. **所有键盘事件都能监听**：
   - 字母、数字、特殊键、功能键、修饰键组合

---

## 实施计划

### 第一步：恢复原有代码

1. 恢复 `browser.ts` 的 `injectKeyboardEvent` 方法（移除自动添加 `text` 的逻辑）
2. 恢复 `viewer-html.ts` 的键盘事件处理（移除 `isSpecialKey` 判断）

### 第二步：添加新的消息类型

1. 在 `stream-server.ts` 添加 `keyboard_down`, `keyboard_up`, `keyboard_insert_text` 消息类型
2. 添加对应的处理逻辑

### 第三步：更新前端

1. 更新 `viewer-html.ts` 使用新的消息类型
2. 保持 IME 和粘贴的处理

### 第四步：测试验证

1. 更新 E2E 测试使用新的消息类型
2. 验证所有键盘输入正常工作

---

## 预期改动文件

| 文件 | 改动 |
|------|------|
| `src/stream-server.ts` | 添加新消息类型和处理逻辑 |
| `src/viewer-html.ts` | 使用新的消息类型 |
| `src/__tests__/e2e/viewer-input.e2e.test.ts` | 更新测试 |

---

## 总结

**核心原则**：不要自己造轮子，直接使用 Playwright 的键盘 API。

**好处**：
- 所有键盘事件都能正确处理
- 中文输入正确工作
- 代码简单，易于维护
- 协议清晰，不会产生歧义
