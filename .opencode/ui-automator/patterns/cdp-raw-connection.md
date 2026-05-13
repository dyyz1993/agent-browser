# CDP 原始连接模式

> 最后更新：2026-05-12 | 来源：deepseek-cdp-raw.cjs 全链路测试

## 摘要
当需要操作已登录浏览器中现有页面时，Playwright 的 `connectOverCDP()` 无法列出已有页面。此模式使用原生 CDP WebSocket 直接连接页面级 WS 端点，实现现有页面的完全控制。

## 适用场景
- 需要操作已有页面的 DOM（会话列表、历史记录等存储在客户端的数据）
- 不能创建新页面（`newPage()`）否则看不到历史数据
- 其他依赖页面状态的自动化任务

## 核心模式

### 1. 获取页面 WS 端点

```javascript
const http = require('http');

async function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// 获取所有页面目标（带各自的 WebSocket URL）
const targets = await getJson('http://localhost:9221/json');
const targetPage = targets.find(t => t.url.includes('target-site.com'));
const wsUrl = targetPage.webSocketDebuggerUrl;
```

### 2. CDP 客户端

```javascript
const WebSocket = require('ws');

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.messageId = 0;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id !== undefined) {
          const resolver = this.pending.get(msg.id);
          if (resolver) {
            this.pending.delete(msg.id);
            if (msg.error) {
              resolver(Promise.reject(new Error(msg.error.message)));
            } else {
              resolver(msg.result);
            }
          }
        }
      });
    });
  }

  async send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}
```

### 3. 执行 JS 和读取 DOM

```javascript
// Evaluate JavaScript in the page context
const result = await cdp.send('Runtime.evaluate', {
  expression: 'document.title',
  returnByValue: true
});
const title = result.result.value; // Runtime.evaluate 的 value 嵌在 result 内

// Click an element
await cdp.send('Runtime.evaluate', {
  expression: `document.querySelector('a[href*="chat"]').click()`
});

// Navigate
await cdp.send('Runtime.evaluate', {
  expression: 'window.location.href = "https://..."'
});
```

### 4. 注意事项

| 要点 | 说明 |
|------|------|
| **直接连接** | 连接页面级 WS 端点（`/devtools/page/{id}`），而非浏览器级 |
| **无需 sessionId** | 直接连接后所有命令直接发往页面，无需 `sessionId` 路由 |
| **跨导航稳定** | 页面导航后 WS 连接保持有效，继续发送命令即可 |
| **`Runtime.evaluate` 返回值** | 响应结构为 `{result: RemoteObject}`，实际值在 `result.value` |
| **`returnByValue: true`** | 必须设置才能获取 JS 值而非 RemoteObject 引用 |

## 与 Playwright connectOverCDP 的对比

| 方式 | 可以访问已有页面 | 需要 sessionId | 跨导航稳定性 |
|------|:---:|:---:|:---:|
| Playwright `connectOverCDP` | ❌ | ✅ (flatten 模式) | 不稳定 |
| 直接连接页面 WS | ✅ | ❌ (直接发送) | ✅ |
| Puppeteer `connect` with `browser.wsEndpoint()` | ❌ | ✅ | 部分 |

## 失败处理
- CDP 命令可能超时 → 设置合理的超时（默认 30s）
- `Runtime.evaluate` 可能返回 `exceptionDetails` → 检查异常详情
- 页面可能被关闭 → 重新从 `/json` 获取目标

## 变更记录
- 2026-05-12：初始创建（deepseek-cdp-raw.cjs 全链路测试返回）
