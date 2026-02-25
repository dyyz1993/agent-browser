# 修改计划：CDP 模式下发送 Browser.close 命令

## 目标

在 CDP 连接模式下，`close()` 方法应该发送 `Browser.close` CDP 命令来真正关闭浏览器，而不是仅仅断开 WebSocket 连接。

## 当前行为

```typescript
} else if (this.cdpEndpoint !== null) {
  // CDP: only disconnect, don't close external app's pages
  if (this.browser) {
    await this.browser.close().catch(() => {});  // 只是断开连接
    this.browser = null;
  }
}
```

## 修改方案

在 `browser.ts` 的 `close()` 方法中，CDP 模式下通过 CDP session 发送 `Browser.close` 命令：

```typescript
} else if (this.cdpEndpoint !== null) {
  // CDP: send Browser.close command to actually close the browser
  if (this.browser) {
    try {
      // 创建 Browser 级别的 CDP session 并发送关闭命令
      const cdpSession = await this.browser.newBrowserCDPSession();
      await cdpSession.send('Browser.close');
    } catch {
      // 如果 Browser.close 失败，回退到断开连接
      await this.browser.close().catch(() => {});
    }
    this.browser = null;
  }
}
```

## 修改位置

* 文件：`src/browser.ts`

* 行号：2011-2016

## 注意事项

1. `newBrowserCDPSession()` 是 Playwright 提供的方法，用于创建 Browser 级别的 CDP session
2. 发送 `Browser.close` 命令会真正关闭浏览器进程
3. 如果命令失败（比如浏览器已经关闭），回退到原来的断开连接逻辑

