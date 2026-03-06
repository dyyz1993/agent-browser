# Recorder 测试失败修复计划

## 问题分析

### 现象
1. 两个测试单独运行时都通过，但在完整测试套件中失败
2. 错误信息指向的行号与实际测试不匹配（错误指向 Test 3 的代码，但实际失败的是 Test 4）
3. 测试日志显示 Test 4 的部分断言通过了，但 `expect(cb1Checked).toBe(true)` 失败

### 根本原因

经过深入调研，发现以下问题：

#### 1. Vitest Source Map 问题
错误堆栈指向的行号（第 297 行）是 Test 3 的代码，但实际失败的是 Test 4。这是 vitest 的 source map 问题，导致错误行号不正确。

#### 2. Test 4 录制时记录了额外的操作（关键发现！）
从录制的 YAML 文件来看，Test 4 录制了 **9 个步骤**，而不是预期的 2 个操作（fill + click）：
- 4 个 trajectory + click 组合（都是点击 #cb1）
- 1 个 fill #username "recovery_user"

但 Test 4 的代码只执行了：
```typescript
await executeCommand(parseCliArgs(['fill', '#username', 'recovery_user']), browser);
await executeCommand(parseCliArgs(['click', '#cb1']), browser);
```

**这说明录制器在 Test 4 开始录制时，仍然记录了 Test 3 遗留的鼠标移动事件！**

#### 3. 根本原因：addInitScript 累积导致事件监听器泄漏

问题出在 `browser.ts` 的 `startRecorder` 方法中：

```typescript
// 注入录制器脚本到所有新页面
await context.addInitScript(injectScript);
```

**`addInitScript` 是累积的**，每次调用 `startRecorder` 都会添加新的脚本，但不会移除旧的脚本。

这导致：
1. Test 3 录制时，注入了 inject.js 脚本，添加了 `mousemove` 事件监听器
2. Test 3 停止录制时，设置了 `window.xyzStopped = true`，但事件监听器仍然存在
3. Test 4 开始录制时：
   - 设置 `window.xyzStopped = false`
   - 添加了新的 inject.js 脚本
   - **旧的 `mousemove` 监听器又开始工作**，因为它检查的是 `window.xyzStopped`
4. Test 4 录制时，旧的监听器记录了 Test 3 遗留的鼠标位置

#### 4. inject.js 中的 mousePath 问题

在 `inject.js` 中：
```javascript
// 鼠标轨迹
let mousePath = [];  // 闭包变量

document.addEventListener('mousemove', (e) => {
  if (window.xyzActive === false || window.xyzStopped) return;
  
  mousePath.push({ x: e.clientX, y: e.clientY, t: now });
  // ...
}, true);
```

当 `xyzStopped` 从 true 变为 false 时，旧的监听器又开始记录鼠标移动，但 `mousePath` 中可能已经有旧的数据。

#### 5. Test 4 的 checkbox 断言失败
从日志来看：
```
[Test 4] Username after recovery: recovery_user
[stopRecorder] No active recording session
```

缺少 `[Test 4] Checkbox after recovery: true` 和 `[Test 4] Test completed successfully` 日志，说明 Test 4 在 `expect(cb1Checked).toBe(true)` 这一行失败了。

## 修复方案

### 方案 1：在 inject.js 中使用会话时间戳验证（推荐）

修改 `inject.js`，让事件监听器检查会话时间戳是否是最新的：

**修改 `src/recorder/inject.js`：**

1. 在脚本开头保存当前会话的时间戳：
```javascript
// 当前脚本的会话 ID（在脚本注入时设置）
const thisSessionId = window.xyzInjectedSessionId;
const thisSessionTimestamp = parseInt(thisSessionId.replace('recorder-', '')) || 0;
```

2. 在 `mousemove` 监听器中检查时间戳：
```javascript
document.addEventListener('mousemove', (e) => {
  // 检查录制会话是否仍然活跃
  if (window.xyzActive === false || window.xyzStopped) return;
  
  // 检查当前会话是否是最新的
  const currentSessionTimestamp = parseInt((window.xyzSessionId || '').replace('recorder-', '')) || 0;
  if (thisSessionTimestamp < currentSessionTimestamp) return;
  
  // ... rest of the code ...
}, true);
```

3. 在 `recordStep` 函数中也添加同样的检查：
```javascript
function recordStep(action, data) {
  // 检查是否暂停录制或已停止
  if (window.xyzActive === false || window.xyzPaused || window.xyzStopped) return;
  
  // 检查当前会话是否是最新的
  const currentSessionTimestamp = parseInt((window.xyzSessionId || '').replace('recorder-', '')) || 0;
  if (thisSessionTimestamp < currentSessionTimestamp) return;
  
  // ... rest of the code ...
}
```

### 方案 2：在 startRecorder 时设置全局时间戳（补充方案）

修改 `browser.ts`，在开始录制时设置一个全局时间戳：

**修改 `src/browser.ts`：**

```typescript
async startRecorder(url?: string, hide: boolean = false): Promise<{ started: boolean; sessionId: string }> {
  // ... existing code ...
  
  // 在当前页面设置状态，再注入脚本
  try {
    await page.evaluate(`
      // 设置当前会话 ID
      window.xyzSessionId = '${this.recorderSessionId}';
      window.xyzActive = true;
      window.xyzStopped = false;
      window.xyzInited = false;
      // 清空旧的录制队列，避免状态干扰
      window.xyzQueue = [];
    `);
  } catch (e) {}
  
  // ... rest of the code ...
}
```

### 方案 3：修改测试的 beforeEach 清理逻辑（临时方案）

修改 `recorder-integration.e2e.test.ts` 的 `beforeEach`，确保彻底清理：

```typescript
beforeEach(async () => {
  // Stop any active recording first
  await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
  
  // Wait for cleanup
  await new Promise((resolve) => setTimeout(resolve, 500));
  
  // Reset browser page state completely
  const page = browser.getPage();
  if (page) {
    try {
      await page.evaluate(() => {
        const win = window as any;
        // Reset all recorder-related state
        win.xyzActive = false;
        win.xyzStopped = true;
        win.xyzInited = false;
        win.xyzInitializedSessionId = undefined;
        win.xyzSessionId = undefined;
        win.xyzQueue = [];
        win.xyzPaused = false;
      });
    } catch (e) {}
  }
  
  // Wait longer for cleanup
  await new Promise((resolve) => setTimeout(resolve, 800));
  
  // Open fresh page
  const openResult = await executeCommand(
    parseCliArgs(['open', getFixturePath('comprehensive-test.html')]),
    browser
  );
  if (!openResult.success) {
    throw new Error('Failed to open test page');
  }
  
  await new Promise((resolve) => setTimeout(resolve, 300));
});
```

## 实施步骤

1. **修复 inject.js（方案 1）**
   - 在 `mousemove` 监听器中添加会话时间戳检查
   - 在 `recordStep` 函数中添加会话时间戳检查
   - 在 `getTrajectory` 函数中添加会话时间戳检查

2. **修复 browser.ts（方案 2）**
   - 在 `startRecorder` 中确保正确设置 `xyzSessionId`
   - 在 `stopRecorder` 中确保正确清理状态

3. **修复测试文件（方案 3）**
   - 修改 `beforeEach` 中的清理逻辑
   - 移除 `beforeEach` 中的断言，改为检查并抛出错误

4. **运行测试验证**
   - 单独运行每个失败的测试
   - 运行完整的测试套件
   - 运行所有 recorder 相关的测试

## 预期结果

修复后，所有测试应该通过，包括：
- `should recover from trajectory failure` (recorder-integration.e2e.test.ts)
- `should use most recent recording when replay has no path` (recorder-replay.e2e.test.ts)
