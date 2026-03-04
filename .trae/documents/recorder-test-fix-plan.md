# Recorder 测试失败修复方案

## 问题概述

当前有 11 个测试失败，分为三类问题：

| 类别 | 失败测试数 | 根因 |
|------|-----------|------|
| 键盘事件录制 | 6 | `handlePress` 未触发 JavaScript 层面的 `keydown` 事件 |
| 标签页操作录制 | 4 | 新标签页创建后录制面板未正确注入/显示 |
| iframe 事件录制 | 1 | iframe 内的事件未被正确捕获 |

---

## 问题一：键盘事件录制失败

### 失败测试
- `should record Enter key press`
- `should record Tab key press`
- `should record Escape key press`
- `should record arrow key presses`
- `should record modifier key combinations`
- `should record form interaction with keyboard submit`

### 根因分析
`handlePress` 函数使用 Playwright 的 `page.keyboard.press()` 方法，该方法在操作系统层面模拟按键，不会触发 JavaScript 层面的 `keydown` 事件。而 `inject.js` 中的录制器监听的是 JavaScript 的 `keydown` 事件。

### 修复方案
在 `handlePress` 函数中，按键操作后手动触发 `keydown` 事件：

**文件**: `src/actions.ts`

```typescript
async function handlePress(command: PressCommand, browser: BrowserManager): Promise<Response> {
  const page = browser.getPage();
  let locator = page.locator('body');

  if (command.inFrame && command.selector) {
    const frameLocator = browser.getFrame(command.inFrame);
    locator = frameLocator.locator(command.selector);
  } else if (command.selector) {
    locator = page.locator(command.selector);
  }

  const diffResult = await performDiff(locator, command.diffScope, async () => {
    if (command.inFrame && command.selector) {
      const frameLocator = browser.getFrame(command.inFrame);
      await frameLocator.locator(command.selector).press(command.key);
    } else {
      if (command.selector) {
        await page.press(command.selector, command.key);
      } else {
        await page.keyboard.press(command.key);
      }
    }
    
    // 触发 keydown 事件供录制器捕获
    await page.evaluate((key) => {
      const specialKeys = ['Enter', 'Tab', 'Escape', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      const keyParts = key.split('+');
      const mainKey = keyParts[keyParts.length - 1];
      const hasCtrl = keyParts.includes('Control') || keyParts.includes('Ctrl');
      const hasMeta = keyParts.includes('Meta') || keyParts.includes('Command');
      const hasAlt = keyParts.includes('Alt');
      const hasShift = keyParts.includes('Shift');
      
      if (specialKeys.includes(mainKey) || hasCtrl || hasMeta || hasAlt) {
        const event = new KeyboardEvent('keydown', {
          key: mainKey,
          code: mainKey.length === 1 ? `Key${mainKey.toUpperCase()}` : mainKey,
          ctrlKey: hasCtrl,
          metaKey: hasMeta,
          altKey: hasAlt,
          shiftKey: hasShift,
          bubbles: true
        });
        document.activeElement?.dispatchEvent(event);
      }
    }, command.key);
  });

  // ... rest of function
}
```

---

## 问题二：标签页操作录制失败

### 失败测试
- `should record tab_new action when opening new tab and show panel`
- `should record tab_switch action when switching tabs and show panel`
- `should record tab_close action when closing tab and show panel`
- `should record complete tab workflow and show panel`

### 根因分析
1. 新标签页创建后，录制器脚本需要注入到新页面
2. 切换标签页时，录制面板需要在当前活动页面显示
3. `recorderPageHandler` 中的脚本注入可能存在时序问题

### 修复方案
检查并修复 `browser.ts` 中的 `recorderPageHandler`：

**文件**: `src/browser.ts`

1. 确保新标签页创建时正确注入录制器脚本和面板
2. 确保标签页切换时面板正确显示
3. 增加等待时间确保脚本执行完成

---

## 问题三：iframe 事件录制失败

### 失败测试
- `should record click inside same-origin iframe`

### 根因分析
当使用 `--in-frame` 参数在 iframe 内执行操作时，事件在 iframe 内部触发，但 `inject.js` 中的事件监听器可能未正确捕获 iframe 内的事件。

### 修复方案
1. 确保 iframe 内的录制器脚本正确注入
2. 在 `handleClick` 和 `handleFill` 中，对于 iframe 操作，手动触发事件

---

## 实施步骤

### 步骤 1：修复键盘事件录制
1. 修改 `src/actions.ts` 中的 `handlePress` 函数
2. 在按键操作后触发 `keydown` 事件
3. 运行测试验证

### 步骤 2：修复标签页操作录制
1. 检查 `src/browser.ts` 中的 `recorderPageHandler`
2. 确保新标签页创建时正确注入录制器脚本
3. 确保标签页切换时面板正确显示
4. 运行测试验证

### 步骤 3：修复 iframe 事件录制
1. 检查 iframe 内的事件捕获逻辑
2. 在 iframe 操作时手动触发事件
3. 运行测试验证

### 步骤 4：运行完整测试套件
1. 运行所有 recorder 相关测试
2. 确保所有测试通过
3. 提交代码

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 键盘事件触发可能影响现有功能 | 中 | 只在录制会话激活时触发事件 |
| 标签页操作可能影响性能 | 低 | 使用异步注入，不阻塞主流程 |
| iframe 操作可能影响跨域安全 | 中 | 只对同源 iframe 进行处理 |

---

## 预期结果

修复后，所有 15 个 `recorder-missing-features.e2e.test.ts` 测试应该通过。
