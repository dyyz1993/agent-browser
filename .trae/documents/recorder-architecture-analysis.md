# Recorder 交互流程对比（最简版）

## 现在的交互流程

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           现在的 Recorder 交互流程                                │
└─────────────────────────────────────────────────────────────────────────────────┘

浏览器端                              Node.js 端
    │                                    │
    │  __recorderSync(step)              │
    │ ─────────────────────────────────> │
    │                                    │  recorderSteps.push(step)
    │                                    │
    │  (没有返回)                         │
    │                                    │


问题：数据只在 Node.js 端，浏览器端 UI 无法获取历史数据
```

---

## 预期的交互流程

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           预期的 Recorder 交互流程                                │
└─────────────────────────────────────────────────────────────────────────────────┘

浏览器端                              Node.js 端
    │                                    │
    │  __recorderSync(step)              │
    │ ─────────────────────────────────> │
    │                                    │  recorderSteps.push(step)
    │                                    │
    │        page.evaluate(steps)        │
    │ <───────────────────────────────── │
    │                                    │
    │  window.__recorderSteps = steps    │
    │  自己更新 UI                        │
    │                                    │


Node.js 只负责传数据，浏览器端自己更新 UI
```

---

## 实现方案

### Node.js 端

```typescript
// browser.ts 中

cdp.on('Runtime.bindingCalled', async (params) => {
  // 解析参数
  const payload = params.payload || '';
  
  // 如果有步骤，保存
  if (payload) {
    const step = JSON.parse(payload);
    this.recorderSteps.push(step);
  }
  
  // 把数据传给浏览器端
  await page.evaluate((steps) => {
    window.__recorderSteps = steps;  // 只传数据
  }, this.recorderSteps);
});
```

### 浏览器端

```javascript
// inject.js 中

// 监听数据变化，更新 UI
function updateUI() {
  const steps = window.__recorderSteps || [];
  const container = document.getElementById('recorder-steps');
  const status = document.getElementById('recorder-status');
  
  if (status) status.textContent = 'Steps: ' + steps.length;
  if (container) {
    // 渲染步骤列表...
  }
}

// 初始化时拉取历史
if (typeof window.__recorderSync === 'function') {
  window.__recorderSync('');  // 触发获取数据
}

// 定期检查数据变化（或用其他方式）
setInterval(() => {
  updateUI();
}, 100);
```

---

## 数据流

```
Node.js 端                          浏览器端
    │                                   │
    │  recorderSteps.push(step)         │
    │                                   │
    │  page.evaluate(steps)             │
    │ ────────────────────────────────> │
    │                                   │  window.__recorderSteps = steps
    │                                   │  updateUI()
    │                                   │

Node.js 只传数据，浏览器端自己处理 UI
```
