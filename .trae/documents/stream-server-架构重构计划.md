# Stream Server 架构重构计划

## 当前问题分析

### 1. 代码冗余
- `processFrame` 函数（L80-96）已废弃，在 `broadcastFrame` 中直接处理
- 缺少 FPS 统计功能（用户规范中提到的变量不存在）

### 2. 架构不清晰
- 状态管理、帧率控制、图像处理混在一起
- 缺少明确的 FPS 计算和监控

## 目标架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              StreamServer                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        WebSocket Server                              │    │
│  │  - 连接管理 (clients)                                                │    │
│  │  - 消息路由 (handleMessage)                                          │    │
│  │  - 事件广播 (broadcastEvent)                                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     StreamStateManager                               │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │                    状态机 (State Machine)                     │    │    │
│  │  │                                                              │    │    │
│  │  │   ┌──────────────┐     2s无交互      ┌──────────────┐       │    │    │
│  │  │   │     USER     │ ──────────────────▶│   SCREEN     │       │    │    │
│  │  │   │ INTERACTING  │                    │   MOVING     │       │    │    │
│  │  │   └──────────────┘                    └──────────────┘       │    │    │
│  │  │          ▲                                   │               │    │    │
│  │  │          │                                   │               │    │    │
│  │  │          │ 用户交互                          │ 帧间隔≥1s     │    │    │
│  │  │          │                                   ▼               │    │    │
│  │  │   ┌──────────────┐                    ┌──────────────┐       │    │    │
│  │  │   │    STATIC    │◀───────────────────│   SCREEN     │       │    │    │
│  │  │   │              │    帧间隔≥1s       │   MOVING     │       │    │    │
│  │  │   └──────────────┘                    └──────────────┘       │    │    │
│  │  │                                                              │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  │                                                                      │    │
│  │  状态配置:                                                           │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │  状态              │  format  │  quality  │  maxFps        │    │    │
│  │  ├─────────────────────────────────────────────────────────────┤    │    │
│  │  │  USER_INTERACTING │  jpeg    │  10       │  60            │    │    │
│  │  │  SCREEN_MOVING    │  webp    │  50       │  2             │    │    │
│  │  │  STATIC           │  webp    │  80       │  0.5           │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     FrameRateController                             │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │  属性:                                                       │    │    │
│  │  │  - lastSentTime: 上次发送时间戳                              │    │    │
│  │  │  - fpsFrameCount: FPS 计数器                                 │    │    │
│  │  │  - fpsLastTime: 上次计算 FPS 时间                            │    │    │
│  │  │  - currentFps: 当前 FPS 值                                   │    │    │
│  │  │                                                              │    │    │
│  │  │  方法:                                                       │    │    │
│  │  │  - shouldSendFrame(maxFps): 是否应该发送此帧                 │    │    │
│  │  │  - calculateFps(): 计算当前 FPS                              │    │    │
│  │  │  - getCurrentFps(): 获取当前 FPS                             │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  │                                                                      │    │
│  │  帧率控制流程:                                                       │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │                                                              │    │    │
│  │  │   screencastFrame 触发                                       │    │    │
│  │  │         │                                                    │    │    │
│  │  │         ▼                                                    │    │    │
│  │  │   frameInterval = now - lastFrameTime                       │    │    │
│  │  │         │                                                    │    │    │
│  │  │         ▼                                                    │    │    │
│  │  │   state = stateManager.getState()                           │    │    │
│  │  │   config = STATE_CONFIGS[state]                             │    │    │
│  │  │   minInterval = 1000 / config.maxFps                        │    │    │
│  │  │         │                                                    │    │    │
│  │  │         ▼                                                    │    │    │
│  │  │   ┌─────────────────────────┐                               │    │    │
│  │  │   │ frameInterval < minInterval? │                          │    │    │
│  │  │   └───────────┬─────────────┘                               │    │    │
│  │  │               │                                             │    │    │
│  │  │       ┌───────┴───────┐                                     │    │    │
│  │  │       │ Yes           │ No                                  │    │    │
│  │  │       ▼               ▼                                     │    │    │
│  │  │   跳过此帧        处理并发送此帧                              │    │    │
│  │  │   (太快了)        fpsFrameCount++                           │    │    │
│  │  │                                                              │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       FrameProcessor                                │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │  - process(data, config): Buffer                             │    │    │
│  │  │    使用 Sharp 进行图像压缩                                    │    │    │
│  │  │    - JPEG: quality 10 (用户交互时)                           │    │    │
│  │  │    - WebP: quality 50/80 (画面移动/静态时)                    │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 数据流图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              数据流                                          │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────┐
                    │   Browser CDP   │
                    │  screencastFrame│
                    └────────┬────────┘
                             │
                             ▼
        ┌────────────────────────────────────────┐
        │           StreamServer                  │
        │                                        │
        │   1. stateManager.onFrameReceived()    │
        │      - 更新 lastFrameTime              │
        │      - 计算帧间隔                       │
        │      - 判断状态切换                     │
        │                                        │
        │   2. config = stateManager.getConfig() │
        │                                        │
        │   3. frameRateController               │
        │      .shouldSendFrame(config.maxFps)   │
        │      - 检查是否满足 FPS 限制            │
        │      - 更新 fpsFrameCount              │
        │                                        │
        │   4. frameProcessor.process()          │
        │      - Sharp 图像压缩                   │
        │                                        │
        │   5. broadcast to clients              │
        │      - JSON header                      │
        │      - Binary frame data               │
        │                                        │
        └────────────────────────────────────────┘
                             │
                             ▼
              ┌──────────────────────────┐
              │   WebSocket Clients       │
              │  (浏览器 Viewer 页面)     │
              └──────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                           用户交互数据流                                      │
└─────────────────────────────────────────────────────────────────────────────┘

              ┌──────────────────────────┐
              │   WebSocket Clients       │
              │  鼠标/键盘/触摸事件        │
              └────────────┬─────────────┘
                           │
                           ▼
        ┌────────────────────────────────────────┐
        │           StreamServer                  │
        │                                        │
        │   1. stateManager.onUserInteraction()  │
        │      - 切换到 USER_INTERACTING 状态     │
        │      - 启动 2s 防抖定时器               │
        │                                        │
        │   2. browser.injectXxxEvent()          │
        │      - 注入到浏览器                     │
        │                                        │
        └────────────────────────────────────────┘
                           │
                           ▼
              ┌──────────────────────────┐
              │   Browser CDP           │
              │  Input.dispatchXxxEvent  │
              └──────────────────────────┘
```

## 类设计

### 1. StreamStateManager

```typescript
interface StreamStateConfig {
  format: 'jpeg' | 'webp';
  quality: number;
  maxFps: number;
}

type StreamState = 'user_interacting' | 'screen_moving' | 'static';

class StreamStateManager {
  // 状态
  private currentState: StreamState = 'static';
  
  // 用户交互相关
  private isUserInteracting: boolean = false;
  private userInteractionTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly USER_INTERACTION_TIMEOUT_MS = 2000;
  
  // 帧间隔计算
  private lastFrameTime: number = 0;
  private frameInterval: number = Infinity;
  
  // 配置
  private static readonly STATE_CONFIGS: Record<StreamState, StreamStateConfig> = {
    user_interacting: { format: 'jpeg', quality: 10, maxFps: 60 },
    screen_moving: { format: 'webp', quality: 50, maxFps: 2 },
    static: { format: 'webp', quality: 80, maxFps: 0.5 },
  };
  
  // 方法
  onUserInteraction(): void;
  onFrameReceived(): void;
  getConfig(): StreamStateConfig;
  getState(): StreamState;
  getFrameInterval(): number;
}
```

### 2. FrameRateController

```typescript
class FrameRateController {
  // 帧率控制
  private lastSentTime: number = 0;
  
  // FPS 统计
  private fpsFrameCount: number = 0;
  private fpsLastTime: number = Date.now();
  private currentFps: number = 0;
  
  // 方法
  shouldSendFrame(maxFps: number): boolean;
  calculateFps(): number;
  getCurrentFps(): number;
  reset(): void;
}
```

### 3. FrameProcessor

```typescript
class FrameProcessor {
  async process(data: string, config: StreamStateConfig): Promise<Buffer>;
}
```

## 修改清单

| 文件 | 修改内容 |
|------|---------|
| `src/stream-server.ts` | 重构类结构，删除废弃代码，添加 FPS 统计 |
| `src/stream-server.test.ts` | 添加状态管理、帧率控制、FPS 计算的测试 |

## 具体修改

### 1. 删除废弃代码

```typescript
// 删除 processFrame 函数 (L80-96)，已废弃
```

### 2. 增强 StreamStateManager

```typescript
class StreamStateManager {
  private currentState: StreamState = 'static';
  private isUserInteracting: boolean = false;
  private userInteractionTimer: ReturnType<typeof setTimeout> | null = null;
  private lastFrameTime: number = 0;
  private frameInterval: number = Infinity;
  
  private readonly USER_INTERACTION_TIMEOUT_MS = 2000;
  private readonly SCREEN_MOVING_THRESHOLD_MS = 1000;
  
  onUserInteraction(): void {
    this.currentState = 'user_interacting';
    this.isUserInteracting = true;
    this.resetUserInteractionTimeout();
  }
  
  private resetUserInteractionTimeout(): void {
    if (this.userInteractionTimer) {
      clearTimeout(this.userInteractionTimer);
    }
    this.userInteractionTimer = setTimeout(() => {
      this.isUserInteracting = false;
      // 根据帧间隔决定下一个状态
      this.currentState = this.frameInterval < this.SCREEN_MOVING_THRESHOLD_MS 
        ? 'screen_moving' 
        : 'static';
    }, this.USER_INTERACTION_TIMEOUT_MS);
  }
  
  onFrameReceived(): void {
    const now = Date.now();
    this.frameInterval = now - this.lastFrameTime;
    this.lastFrameTime = now;
    
    // 非用户交互状态下，根据帧间隔切换状态
    if (!this.isUserInteracting) {
      this.currentState = this.frameInterval < this.SCREEN_MOVING_THRESHOLD_MS 
        ? 'screen_moving' 
        : 'static';
    }
  }
  
  getConfig(): StreamStateConfig {
    return STATE_CONFIGS[this.currentState];
  }
  
  getState(): StreamState {
    return this.currentState;
  }
  
  getFrameInterval(): number {
    return this.frameInterval;
  }
}
```

### 3. 增强 FrameRateController

```typescript
class FrameRateController {
  private lastSentTime: number = 0;
  private fpsFrameCount: number = 0;
  private fpsLastTime: number = Date.now();
  private currentFps: number = 0;
  private readonly FPS_CALCULATION_INTERVAL_MS = 1000;
  
  shouldSendFrame(maxFps: number): boolean {
    const now = Date.now();
    const minInterval = 1000 / maxFps;
    
    if (now - this.lastSentTime >= minInterval) {
      this.lastSentTime = now;
      this.fpsFrameCount++;
      this.calculateFps();
      return true;
    }
    return false;
  }
  
  private calculateFps(): void {
    const now = Date.now();
    const elapsed = now - this.fpsLastTime;
    
    if (elapsed >= this.FPS_CALCULATION_INTERVAL_MS) {
      this.currentFps = Math.round((this.fpsFrameCount * 1000) / elapsed);
      this.fpsFrameCount = 0;
      this.fpsLastTime = now;
    }
  }
  
  getCurrentFps(): number {
    return this.currentFps;
  }
  
  reset(): void {
    this.lastSentTime = 0;
    this.fpsFrameCount = 0;
    this.fpsLastTime = Date.now();
    this.currentFps = 0;
  }
}
```

### 4. 新增 FrameProcessor 类

```typescript
class FrameProcessor {
  async process(data: string, config: StreamStateConfig): Promise<Buffer> {
    const buffer = Buffer.from(data, 'base64');
    
    let processed: sharp.Sharp = sharp(buffer);
    
    if (config.format === 'jpeg') {
      processed = processed.jpeg({ quality: config.quality });
    } else {
      processed = processed.webp({ quality: config.quality });
    }
    
    return processed.toBuffer();
  }
}
```

### 5. 更新 StreamServer

```typescript
export class StreamServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private browser: BrowserManager;
  private port: number;
  private isScreencasting: boolean = false;
  
  // 分离的组件
  private stateManager: StreamStateManager = new StreamStateManager();
  private frameRateController: FrameRateController = new FrameRateController();
  private frameProcessor: FrameProcessor = new FrameProcessor();
  
  // ... 其他方法
  
  private async broadcastFrame(frame: ScreencastFrame): Promise<void> {
    // 1. 更新状态
    this.stateManager.onFrameReceived();
    
    // 2. 获取配置
    const config = this.stateManager.getConfig();
    
    // 3. 检查帧率限制
    if (!this.frameRateController.shouldSendFrame(config.maxFps)) {
      return;
    }
    
    // 4. 处理图像
    let processedBuffer: Buffer;
    try {
      processedBuffer = await this.frameProcessor.process(frame.data, config);
    } catch {
      processedBuffer = Buffer.from(frame.data, 'base64');
    }
    
    // 5. 广播
    const headerMessage = {
      type: 'frame',
      metadata: frame.metadata,
      format: config.format,
      fps: this.frameRateController.getCurrentFps(),
      state: this.stateManager.getState(),
    };
    
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(headerMessage));
        client.send(processedBuffer);
      }
    }
  }
}
```

## 测试计划

### 1. StreamStateManager 测试

```typescript
describe('StreamStateManager', () => {
  it('should start in static state', () => {
    const manager = new StreamStateManager();
    expect(manager.getState()).toBe('static');
  });
  
  it('should switch to user_interacting on user interaction', () => {
    const manager = new StreamStateManager();
    manager.onUserInteraction();
    expect(manager.getState()).toBe('user_interacting');
  });
  
  it('should switch to screen_moving after user interaction timeout', async () => {
    const manager = new StreamStateManager();
    manager.onUserInteraction();
    // 模拟帧接收
    manager.onFrameReceived();
    // 等待超时
    await sleep(2100);
    expect(manager.getState()).toBe('screen_moving');
  });
  
  it('should switch to static when frame interval >= 1000ms', () => {
    const manager = new StreamStateManager();
    manager.onFrameReceived();
    // 模拟长时间无帧
    // ...
    expect(manager.getState()).toBe('static');
  });
});
```

### 2. FrameRateController 测试

```typescript
describe('FrameRateController', () => {
  it('should respect maxFps limit', () => {
    const controller = new FrameRateController();
    const maxFps = 2; // 500ms interval
    
    // 第一帧应该通过
    expect(controller.shouldSendFrame(maxFps)).toBe(true);
    
    // 立即第二帧应该被拒绝
    expect(controller.shouldSendFrame(maxFps)).toBe(false);
  });
  
  it('should calculate FPS correctly', async () => {
    const controller = new FrameRateController();
    
    // 发送多帧
    for (let i = 0; i < 5; i++) {
      controller.shouldSendFrame(60);
      await sleep(20);
    }
    
    // 等待 FPS 计算周期
    await sleep(1000);
    
    const fps = controller.getCurrentFps();
    expect(fps).toBeGreaterThan(0);
  });
});
```

### 3. FrameProcessor 测试

```typescript
describe('FrameProcessor', () => {
  it('should process JPEG with correct quality', async () => {
    const processor = new FrameProcessor();
    const config: StreamStateConfig = { format: 'jpeg', quality: 10, maxFps: 60 };
    
    const result = await processor.process(testImageBase64, config);
    expect(result).toBeInstanceOf(Buffer);
  });
  
  it('should process WebP with correct quality', async () => {
    const processor = new FrameProcessor();
    const config: StreamStateConfig = { format: 'webp', quality: 80, maxFps: 0.5 };
    
    const result = await processor.process(testImageBase64, config);
    expect(result).toBeInstanceOf(Buffer);
  });
});
```

## 预估工作量

| 任务 | 预估时间 |
|------|---------|
| 删除废弃代码 | 0.5 小时 |
| 增强 StreamStateManager | 1 小时 |
| 增强 FrameRateController | 1 小时 |
| 新增 FrameProcessor | 0.5 小时 |
| 更新 StreamServer | 1 小时 |
| 编写测试 | 1.5 小时 |

**总计**: 约 5.5 小时
