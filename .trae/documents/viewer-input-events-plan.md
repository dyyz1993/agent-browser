# Viewer HTML 输入事件增强计划

## 当前实现分析

### 已支持的输入事件

| 类型 | 事件 | 实现位置 |
|------|------|----------|
| 鼠标 | mousePressed, mouseReleased, mouseMoved, mouseWheel | viewer-html.ts:280-330 |
| 键盘 | keyDown, keyUp | viewer-html.ts:332-352 |
| 触摸 | touchStart, touchEnd, touchMove, touchCancel | stream-server.ts (后端支持) |

### 当前问题

1. **中文输入不支持**：当前只发送 keyDown/keyUp，没有处理 IME 组合输入
2. **复制粘贴不支持**：没有处理剪贴板事件
3. **修饰键未传递**：Alt/Ctrl/Meta/Shift 状态没有传递给后端
4. **双击/三击不支持**：clickCount 固定为 1
5. **触摸事件前端未实现**：后端支持但前端没有触摸事件监听

---

## 增强方案

### 1. 中文输入支持（高优先级）

**问题分析**：
- 中文输入需要通过 IME（输入法编辑器）完成
- 浏览器的 `keydown/keyup` 事件在 IME 组合期间不会正常触发
- CDP 提供了 `Input.insertText` 方法直接插入文本

**实现方案**：

#### 方案 A：使用 `beforeinput` 事件（推荐）

```javascript
document.addEventListener('beforeinput', (e) => {
  if (e.inputType === 'insertText' || e.inputType === 'insertComposition') {
    sendUserActivity();
    safeSend(JSON.stringify({
      type: 'input_text',
      text: e.data
    }));
    e.preventDefault();
  }
});
```

**优点**：
- 捕获所有文本输入，包括 IME 输入
- 不干扰正常的键盘事件
- 浏览器原生支持

#### 方案 B：使用 `compositionend` 事件

```javascript
let compositionText = '';
document.addEventListener('compositionstart', () => {
  compositionText = '';
});
document.addEventListener('compositionupdate', (e) => {
  compositionText = e.data;
});
document.addEventListener('compositionend', (e) => {
  sendUserActivity();
  safeSend(JSON.stringify({
    type: 'input_text',
    text: e.data
  }));
});
```

**优点**：
- 专门处理 IME 输入
- 可以获取完整的组合文本

#### 方案 C：使用 CDP `char` 类型事件

```javascript
document.addEventListener('keypress', (e) => {
  if (e.key.length === 1) {
    safeSend(JSON.stringify({
      type: 'input_keyboard',
      eventType: 'char',
      text: e.key
    }));
  }
});
```

**推荐**：方案 A + 方案 B 组合，覆盖所有场景

---

### 2. 复制粘贴支持（高优先级）

**实现方案**：

```javascript
document.addEventListener('paste', async (e) => {
  e.preventDefault();
  sendUserActivity();
  
  const text = await navigator.clipboard.readText();
  safeSend(JSON.stringify({
    type: 'input_text',
    text: text
  }));
});

document.addEventListener('copy', (e) => {
  e.preventDefault();
  safeSend(JSON.stringify({ type: 'clipboard_copy' }));
});

document.addEventListener('cut', (e) => {
  e.preventDefault();
  safeSend(JSON.stringify({ type: 'clipboard_cut' }));
});
```

**注意**：
- `navigator.clipboard.readText()` 需要 HTTPS 或 localhost
- 需要用户授权或用户触发的上下文

---

### 3. 修饰键支持（中优先级）

**实现方案**：

```javascript
let modifiers = 0;
const MODIFIER_MAP = {
  'Alt': 1,
  'Control': 2,
  'Meta': 4,
  'Shift': 8
};

function updateModifiers(e) {
  modifiers = 0;
  if (e.altKey) modifiers |= 1;
  if (e.ctrlKey) modifiers |= 2;
  if (e.metaKey) modifiers |= 4;
  if (e.shiftKey) modifiers |= 8;
}

// 在所有键盘和鼠标事件中传递 modifiers
document.addEventListener('keydown', (e) => {
  updateModifiers(e);
  sendUserActivity();
  safeSend(JSON.stringify({
    type: 'input_keyboard',
    eventType: 'keyDown',
    key: e.key,
    code: e.code,
    modifiers: modifiers
  }));
  // ...
});
```

---

### 4. 双击/三击支持（低优先级）

**实现方案**：

```javascript
let clickCount = 0;
let clickTimer = null;

screen.addEventListener('mousedown', (e) => {
  sendUserActivity();
  
  // 计算点击次数
  if (clickTimer) {
    clickCount++;
  } else {
    clickCount = 1;
    clickTimer = setTimeout(() => {
      clickCount = 0;
      clickTimer = null;
    }, 300);
  }
  
  const pos = screenToPage(e.clientX, e.clientY);
  const buttonMap = { 0: 'left', 1: 'middle', 2: 'right' };
  safeSend(JSON.stringify({
    type: 'input_mouse',
    eventType: 'mousePressed',
    x: pos.x,
    y: pos.y,
    button: buttonMap[e.button] || 'left',
    clickCount: clickCount,
    modifiers: modifiers
  }));
});
```

---

### 5. 触摸事件支持（低优先级）

**实现方案**：

```javascript
screen.addEventListener('touchstart', (e) => {
  sendUserActivity();
  const touchPoints = Array.from(e.touches).map(t => {
    const pos = screenToPage(t.clientX, t.clientY);
    return { x: pos.x, y: pos.y, id: t.identifier };
  });
  safeSend(JSON.stringify({
    type: 'input_touch',
    eventType: 'touchStart',
    touchPoints: touchPoints
  }));
  e.preventDefault();
});

screen.addEventListener('touchmove', (e) => {
  const touchPoints = Array.from(e.touches).map(t => {
    const pos = screenToPage(t.clientX, t.clientY);
    return { x: pos.x, y: pos.y, id: t.identifier };
  });
  safeSend(JSON.stringify({
    type: 'input_touch',
    eventType: 'touchMove',
    touchPoints: touchPoints
  }));
  e.preventDefault();
});

screen.addEventListener('touchend', (e) => {
  const touchPoints = Array.from(e.changedTouches).map(t => {
    const pos = screenToPage(t.clientX, t.clientY);
    return { x: pos.x, y: pos.y, id: t.identifier };
  });
  safeSend(JSON.stringify({
    type: 'input_touch',
    eventType: 'touchEnd',
    touchPoints: touchPoints
  }));
  e.preventDefault();
});
```

---

## 后端修改

### 新增消息类型

```typescript
// stream-server.ts
export interface InputTextMessage {
  type: 'input_text';
  text: string;
}

export interface ClipboardMessage {
  type: 'clipboard_copy' | 'clipboard_cut';
}
```

### 新增处理逻辑

```typescript
case 'input_text':
  this.stateManager.onUserInteraction();
  await this.browser.insertText(message.text);
  break;

case 'clipboard_copy':
  // 执行复制操作
  break;

case 'clipboard_cut':
  // 执行剪切操作
  break;
```

### BrowserManager 新增方法

```typescript
async insertText(text: string): Promise<void> {
  const cdp = await this.getCDPSession();
  await cdp.send('Input.insertText', { text });
}
```

---

## 实施优先级

| 优先级 | 功能 | 复杂度 | 影响 |
|--------|------|--------|------|
| 1 | 中文输入（beforeinput + compositionend） | 中 | 高 |
| 2 | 复制粘贴 | 低 | 高 |
| 3 | 修饰键支持 | 低 | 中 |
| 4 | 双击/三击 | 低 | 低 |
| 5 | 触摸事件 | 中 | 低（移动端） |

---

## 实施计划

### 第一阶段：核心输入增强

1. **前端修改** (`viewer-html.ts`)
   - 添加 `beforeinput` 事件监听
   - 添加 `compositionend` 事件监听
   - 添加 `paste` 事件监听
   - 添加修饰键状态追踪

2. **后端修改** (`stream-server.ts`)
   - 新增 `InputTextMessage` 类型
   - 新增 `input_text` 消息处理

3. **Browser 扩展** (`browser.ts`)
   - 新增 `insertText` 方法

### 第二阶段：完善功能

4. **前端修改**
   - 添加双击/三击检测
   - 添加触摸事件监听

5. **后端修改**
   - 添加剪贴板操作支持

---

## 预期改动文件

| 文件 | 改动量 |
|------|--------|
| `src/viewer-html.ts` | +80 行 |
| `src/stream-server.ts` | +30 行 |
| `src/browser.ts` | +10 行 |

---

## 测试要点

1. **中文输入测试**
   - 拼音输入法
   - 五笔输入法
   - 手写输入

2. **复制粘贴测试**
   - Ctrl+V / Cmd+V 粘贴
   - 右键菜单粘贴
   - 跨应用粘贴

3. **修饰键测试**
   - Ctrl+C 复制
   - Ctrl+V 粘贴
   - Ctrl+A 全选
   - Shift+方向键 选择

4. **双击测试**
   - 双击选词
   - 三击选行
