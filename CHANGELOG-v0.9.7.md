# v0.9.7 Changelog

## Element Selector Mode (Server-Authoritative)

WebSocket viewer 客户端可通过 `?selector=.some-class` 参数指定元素选择器，服务器端自动裁剪视频帧，只展示目标元素区域。点击坐标自动映射回页面绝对坐标。

### Architecture

- **Server-authoritative**: elementBox 由服务器通过 IPC 向 daemon 请求 `getBoundingClientRect()`，客户端不参与计算
- **Degradation**: 选择器找不到元素时，降级为全屏模式，前端显示 toast 提示
- **Periodic re-check**: 每 2.5 秒重新检查元素是否存在，支持动态 DOM 变化
- **Multi-client**: 每个客户端独立维护 selector/elementBox 状态

### Modified Files

| File                                                 | Changes                                                                                                                                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/stream-server.ts`                               | 状态机 FPS 配置调整；`FrameProcessor` 新增 CropConfig 支持和直传优化；`StreamServer` / `StreamServerProxy` 新增 per-client selector 状态管理、elementBox IPC 请求、裁剪帧广播；`StatusMessage` 新增 element/degraded 字段 |
| `src/stream-server-standalone.ts`                    | standalone 模式完整实现：`ClientState` 管理、`requestElementBox` IPC、`sendCroppedFrame` 帧裁剪（含 scale 适配）、`selector_element` IPC 处理、`clientStates` Map、IPC session 保留（disconnect 不删 session）            |
| `src/viewer-script.ts`                               | 前端支持：selector URL 参数透传、element metadata 保留（frame 不覆盖 status 的 element）、`screenToPage` 元素坐标映射、降级 toast、自适应目标元素尺寸                                                                     |
| `src/browser.ts`                                     | headed 模式启用 GPU 加速（不再传 `--disable-gpu`），headless 模式保持禁用                                                                                                                                                 |
| `src/test-live.ts`                                   | 实时集成测试：scaled frame crop / full size frame crop / no selector 三个测试用例                                                                                                                                         |
| `src/__tests__/stream-server-element.test.ts`        | 17 个单元测试：FrameProcessor 裁剪、坐标映射、状态消息                                                                                                                                                                    |
| `src/__tests__/element-selector-flow.test.ts`        | 21 个流程测试：完整 selector 生命周期                                                                                                                                                                                     |
| `src/__tests__/element-selector-integration.test.ts` | 17 个集成测试：IPC 交互、URL 解析、边界情况                                                                                                                                                                               |
| `src/__tests__/element-selector-e2e.test.ts`         | 16 个模拟 E2E 测试                                                                                                                                                                                                        |
| `src/__tests__/viewer-script.test.ts`                | 53 个测试（含新增 element 模式坐标映射测试）                                                                                                                                                                              |

### Key Bugs Fixed

1. **Frame downscaling crash**: CDP screencast 在不同状态下缩放帧（0.4x/0.6x/1.0x），但 elementBox 坐标基于原始视口。裁剪前需要按实际帧尺寸 vs 设备尺寸的比例重新映射坐标
2. **IPC session deletion**: `socket.on('close')` 误删 `this.sessions`，导致 IPC 断连后客户端丢失 session 信息
3. **Frame metadata overwrites element info**: viewer-script 的 `case 'frame'` 用 `metadata = msg.metadata` 覆盖了 status 设置的 `metadata.element`，导致点击坐标映射错误
4. **IPC helper pattern**: `removeListener` 方式会破坏后续测试的持久监听器，改用 queue + waiters 数组模式
5. **WS binary/text confusion**: `ws` 库可能以 Buffer 形式投递 JSON 文本消息，需要统一解析
6. **Stale cached frame leaking**: 新 WS 连接会收到前次测试的 `latestFrame` 缓存帧，需要 drain 机制

## Streaming Performance Optimization

### State Machine FPS Adjustment

| State              | Before                          | After                             | Improvement                    |
| ------------------ | ------------------------------- | --------------------------------- | ------------------------------ |
| `user_interacting` | jpeg Q80, 60fps, scale 0.4      | jpeg Q80, 60fps, scale **0.6**    | +50% resolution                |
| `screen_moving`    | webp Q50, **1fps**, scale 0.6   | jpeg Q75, **8fps**, scale **0.8** | **+700% fps, +33% resolution** |
| `static`           | webp Q80, **0.5fps**, scale 1.0 | jpeg Q80, **2fps**, scale 1.0     | **+300% fps**                  |

### Sharp Bypass Optimization

`FrameProcessor.process()` 新增直传判断：当 CDP 输出格式/质量与目标一致（jpeg Q80）、无需缩放（scale=1）、无裁剪时，跳过整个 sharp 管道，直接转发原始帧数据。`static` 状态每帧节省 4-7ms。

### Headed GPU Acceleration

- headed 模式（`--headed` / extensions）：移除 `--disable-gpu`，启用 `--use-gl=desktop` + `--enable-gpu-compositing`
- headless 模式：保持 `--disable-gpu`（无显示器时 GPU 初始化会失败）

## Test Results

- 124 unit tests passing (5 test files)
- 3 live integration tests passing (test-live.ts)
- Version: 0.9.7
