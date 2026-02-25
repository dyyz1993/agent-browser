# CDP 连接问题调试计划

## 问题现象

| 调用次数 | 命令 | 结果 | 错误信息 |
|---------|------|------|---------|
| 第1次 | `open douyin.com` | ❌ | `page.goto: Timeout 10000ms exceeded` |
| 第2次 | `open douyin.com` | ❌ | `Connection timeout` |
| 第3次 | `open douyin.com` | ❌ | `page.goto: Timeout 10000ms exceeded` |
| tab list | `tab list` | ✅ | 显示 `[0] Untitled - about:blank` |

**关键对比**：直接使用 Playwright 连接同一个 CDP 正常，但 agent-browser 出现问题。

## 问题分析

### 1. agent-browser 与直接 Playwright 的区别

```
直接 Playwright:
  chromium.connectOverCDP() → browser.contexts() → context.pages() → goto() ✓

agent-browser:
  CLI → ensureDaemon() → sendCommand('launch') → BrowserManager.launch() 
      → needsCdpReconnect()? → close()? → connectViaCDP() → goto()
```

### 2. 可能的问题点

| 问题点 | 位置 | 可能原因 |
|-------|------|---------|
| **重连逻辑** | `launch()` 方法 | `needsCdpReconnect()` 误判触发 `close()` |
| **连接状态** | `isCdpConnectionAlive()` | 页面状态判断错误 |
| **超时设置** | `setDefaultTimeout(10000)` | 10秒超时对某些网站不够 |
| **页面管理** | `this.pages` 数组 | 页面引用丢失或错误 |
| **CDP URL 处理** | `connectViaCDP()` | WebSocket URL 处理问题 |

### 3. 关键代码路径

```
第一次调用:
  launch() 
    → isLaunched() = false 
    → connectViaCDP() 
    → goto() 超时

第二次调用:
  launch()
    → isLaunched() = true
    → needsCdpReconnect() = ?
      → 如果返回 true: close() → Browser.close → 远程浏览器被关闭!
      → 如果返回 false: 直接 return
    → connectViaCDP() → Connection timeout (说明触发了 close!)
```

## 调试计划

### Phase 1: 添加详细日志

在以下位置添加调试日志：

**1. `launch()` 方法 (browser.ts:1097-1106)**
```typescript
console.log('[DEBUG launch] isLaunched:', this.isLaunched());
console.log('[DEBUG launch] cdpEndpoint param:', cdpEndpoint);
console.log('[DEBUG launch] this.cdpEndpoint:', this.cdpEndpoint);
console.log('[DEBUG launch] needsRelaunch:', needsRelaunch);
```

**2. `needsCdpReconnect()` 方法 (browser.ts:736-741)**
```typescript
console.log('[DEBUG needsCdpReconnect] isConnected:', this.browser?.isConnected());
console.log('[DEBUG needsCdpReconnect] endpoint match:', this.cdpEndpoint === cdpEndpoint);
console.log('[DEBUG needsCdpReconnect] isCdpConnectionAlive:', this.isCdpConnectionAlive());
```

**3. `isCdpConnectionAlive()` 方法 (browser.ts:722-731)**
```typescript
console.log('[DEBUG isCdpConnectionAlive] browser exists:', !!this.browser);
console.log('[DEBUG isCdpConnectionAlive] contexts count:', contexts.length);
console.log('[DEBUG isCdpConnectionAlive] pages per context:', contexts.map(c => c.pages().length));
```

**4. `close()` 方法 CDP 部分 (browser.ts:2011-2021)**
```typescript
console.log('[DEBUG close] CDP endpoint detected, sending Browser.close');
```

### Phase 2: 运行测试

执行以下命令并收集日志：

```bash
# 重新编译
npm run build

# 测试序列
agent-browser --cdp ws://127.0.0.1:8080/client open douyin.com
agent-browser --cdp ws://127.0.0.1:8080/client open douyin.com
agent-browser --cdp ws://127.0.0.1:8080/client open douyin.com
```

### Phase 3: 对比测试

创建独立测试脚本验证 CDP 本身：

```javascript
const { chromium } = require('playwright-core');

async function test() {
  const browser = await chromium.connectOverCDP('ws://127.0.0.1:8080/client');
  const contexts = browser.contexts();
  const context = contexts[0];
  const pages = context.pages();
  const page = pages[0] || await context.newPage();
  
  // 测试导航
  await page.goto('https://douyin.com', { timeout: 30000 });
  console.log('URL:', page.url());
  
  // 保持连接，测试第二次导航
  await page.goto('https://qq.com', { timeout: 30000 });
  console.log('URL:', page.url());
  
  // 不要关闭 browser，保持连接
  // await browser.close();
}

test().catch(console.error);
```

### Phase 4: 问题定位

根据日志结果判断：

| 日志结果 | 问题原因 | 解决方案 |
|---------|---------|---------|
| `needsCdpReconnect = true` | 重连逻辑误触发 | 修改判断条件 |
| `isCdpConnectionAlive = false` | 页面状态检测错误 | 修复检测逻辑 |
| `close() 被调用` | 远程浏览器被关闭 | 修改 close() 不发送 Browser.close |
| `goto 超时但连接正常` | 超时时间不够 | 增加超时时间 |

## 预期问题根因

根据现象分析，最可能的问题是：

1. **第一次 goto 超时**：10秒超时对 douyin.com 不够
2. **第二次 Connection timeout**：超时后 `isCdpConnectionAlive()` 返回 false，触发 `close()`，发送 `Browser.close` 关闭了远程浏览器

## 解决方案

### 方案1: 修改 close() 方法

对于 CDP 连接，只断开连接不关闭远程浏览器：

```typescript
} else if (this.cdpEndpoint !== null) {
  if (this.browser) {
    // 只断开连接，不发送 Browser.close
    await this.browser.close().catch(() => {});
    this.browser = null;
  }
}
```

### 方案2: 修改 isCdpConnectionAlive() 方法

增加容错，不因页面问题判定连接失效：

```typescript
private isCdpConnectionAlive(): boolean {
  if (!this.browser) return false;
  try {
    const contexts = this.browser.contexts();
    if (contexts.length === 0) return false;
    // 只要 browser 连接正常就返回 true
    return this.browser.isConnected();
  } catch {
    return false;
  }
}
```

### 方案3: 增加超时时间

```typescript
context.setDefaultTimeout(30000);  // 从 10秒 改为 30秒
```

## 执行步骤

1. 添加调试日志到 browser.ts
2. 重新编译 `npm run build`
3. 运行测试序列收集日志
4. 根据日志定位问题
5. 应用对应解决方案
6. 验证修复效果
