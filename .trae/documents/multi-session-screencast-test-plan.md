# 多客户端 Session Screencast 测试计划

## 测试目标

验证当两个不同的客户端通过底层 net.Socket 连接到 Daemon 和 StreamServerStandalone 时：
1. 两个客户端都能正确收到各自 session 的屏幕截图
2. 两个客户端看到的画面是各自对应的浏览器页面
3. screencast 在第一个客户端连接时启动，在最后一个客户端断开时停止

## 测试架构

```
┌─────────────────────────┐
│   Daemon               │
│  (net.Server socket)   │
│         │               │
│    ┌────┴────┐          │
│    │         │          │
│    ▼         ▼          │
│ StreamServer ◄─────────►│ StreamServerStandalone
│ (Proxy)    │   IPC      │ (独立进程)
│    │       │            │
└────┼───────┘            │
     │                    │
     │ net.Socket         │ net.Socket (IPC)
     │ (浏览器控制)        │
     ▼                    ▼
┌─────────────┐    ┌─────────────┐
│  Client A   │    │  Client B   │
│ session=foo │    │ session=bar │
└─────────────┘    └─────────────┘
```

## 通信方式

### 1. Daemon 通信 (Unix Socket/TCP)

- 连接地址: `$XDG_RUNTIME_DIR/agent-browser/default.sock` 或 TCP 端口
- 协议: JSON 行协议 (每行一个 JSON)
- 命令示例:
  ```json
  {"id":"1","action":"launch","headless":true}
  {"id":"2","action":"navigate","url":"https://example.com"}
  {"id":"3","action":"screencast_start"}
  ```

### 2. StreamServerStandalone 通信 (HTTP + WebSocket)

- HTTP 端口: 5005
- WebSocket 连接: `ws://localhost:5005?session=foo`

## 测试步骤

### 步骤 1: 启动服务

1. 编译 TypeScript: `npm run build`
2. 启动 StreamServerStandalone: `AGENT_BROWSER_STREAM_SERVER=1 node dist/stream-server-standalone.js &`
3. 启动 Daemon: `node dist/daemon.js &`

### 步骤 2: 通过 Daemon Socket 连接并操作浏览器

1. 使用 net.Socket 连接到 daemon socket
2. 发送 launch 命令启动浏览器
3. 发送 navigate 命令让浏览器访问 URL A (session=foo)
4. 创建新标签页并访问 URL B (session=bar)

### 步骤 3: 通过 WebSocket 连接客户端

1. Client A: 连接到 `ws://localhost:5005?session=foo`
2. Client B: 连接到 `ws://localhost:5005?session=bar`

### 步骤 4: 接收帧并保存截图

1. 从 Client A 接收 frame，保存为 `client_a.png`
2. 从 Client B 接收 frame，保存为 `client_b.png`

### 步骤 5: 验证

1. 检查两个图片是否不同
2. 验证图片内容是否分别对应 URL A 和 URL B

### 步骤 6: 断开测试

1. 断开 Client A
2. 验证 Client B 仍能收到帧
3. 断开 Client B
4. 验证帧停止

## 实现代码

### 测试脚本 (test-multi-session-screencast.ts)

```typescript
import net from 'net';
import WebSocket from 'ws';
import fs from 'fs';

// 配置
const SOCKET_PATH = '/tmp/agent-browser/default.sock';
const WS_PORT = 5005;
const SESSION_A = 'foo';
const SESSION_B = 'bar';

// 1. 连接 Daemon 并操作浏览器
async function controlBrowser() {
  return new Promise((resolve) => {
    const client = net.createConnection({ path: SOCKET_PATH }, () => {
      // 发送 launch 命令
      client.write(JSON.stringify({
        id: '1',
        action: 'launch',
        headless: true
      }) + '\n');

      // 发送 navigate 命令 (session A)
      client.write(JSON.stringify({
        id: '2',
        action: 'navigate',
        url: 'https://example.com'
      }) + '\n');
    });

    client.on('data', (data) => {
      console.log('Daemon response:', data.toString());
    });

    setTimeout(resolve, 5000);
  });
}

// 2. 连接 WebSocket 客户端
async function connectWSClient(session: string): Promise<Buffer[]> {
  return new Promise((resolve) => {
    const frames: Buffer[] = [];
    const ws = new WebSocket(`ws://localhost:${WS_PORT}?session=${session}`);

    ws.on('message', (data) => {
      // 处理帧数据
      frames.push(Buffer.from(data as Buffer));
    });

    ws.on('close', () => {
      resolve(frames);
    });

    // 30秒后断开
    setTimeout(() => ws.close(), 30000);
  });
}

// 3. 主测试流程
async function main() {
  // 启动浏览器并导航
  await controlBrowser();

  // 连接两个 WebSocket 客户端
  const [framesA, framesB] = await Promise.all([
    connectWSClient(SESSION_A),
    connectWSClient(SESSION_B)
  ]);

  // 保存截图
  if (framesA.length > 0) {
    fs.writeFileSync('client_a.png', framesA[0]);
  }
  if (framesB.length > 0) {
    fs.writeFileSync('client_b.png', framesB[0]);
  }

  console.log('截图已保存');
}

main();
```

## 预期结果

- ✅ 两个 net.Socket 客户端都能操作浏览器
- ✅ 两个 WebSocket 客户端都能连接到各自 session
- ✅ 两个客户端都能收到帧数据
- ✅ 两个客户端收到的画面不同
- ✅ 截图正确保存

## 注意事项

- 确保 socket 路径正确
- 需要处理帧数据的二进制格式
- 帧数据包含 header (JSON) 和 body (二进制图片)
