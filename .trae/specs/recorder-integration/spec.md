# Recorder 集成方案 Spec

## Why
当前 recorder 模块已经完成核心功能开发，需要集成到项目中，支持命令行启动、viewer 页面控制、录制数据导出和测试验证。

## What Changes
- 命令行支持 `record` 命令启动录制
- viewer 页面增加录制控制面板
- 录制数据支持导出为多种格式（JSON、Shell 脚本、Playwright 代码）
- 添加 E2E 测试验证录制功能

## Impact
- Affected code: `src/cli/commands.ts`, `src/actions.ts`, `src/viewer-html.ts`, `src/viewer-script.ts`
- New files: `src/recorder/export.ts`, `src/__tests__/e2e/recorder.e2e.test.ts`

---

## ADDED Requirements

### Requirement: 命令行录制支持
系统 SHALL 支持通过命令行启动和控制录制。

#### Scenario: 启动录制会话
- **WHEN** 用户执行 `agent-browser record start`
- **THEN** 系统创建新页面并开始录制
- **AND** 返回 session ID

#### Scenario: 停止录制并输出
- **WHEN** 用户执行 `agent-browser record stop`
- **THEN** 系统停止录制
- **AND** 直接输出 YAML 到 stdout

#### Scenario: 停止录制并保存文件
- **WHEN** 用户执行 `agent-browser record stop --output session.yaml`
- **THEN** 系统停止录制
- **AND** 保存 YAML 到指定文件

#### Scenario: 获取当前录制状态
- **WHEN** 用户执行 `agent-browser record status`
- **THEN** 返回当前录制状态（是否录制中、步骤数量）

#### Scenario: 录制指定页面
- **WHEN** 用户执行 `agent-browser record start https://example.com`
- **THEN** 系统打开指定 URL 并开始录制

#### Scenario: 连接已有页面录制
- **WHEN** 用户执行 `agent-browser --cdp ws://... record start`
- **THEN** 系统连接已有页面并开始录制

### Requirement: Viewer 页面录制控制
系统 SHALL 在 viewer 页面提供录制控制面板。

#### Scenario: 显示录制按钮
- **WHEN** 用户打开 viewer 页面
- **THEN** 工具栏显示录制按钮

#### Scenario: 开始录制
- **WHEN** 用户点击录制按钮
- **THEN** 系统开始录制当前页面
- **AND** 按钮变为停止状态

#### Scenario: 停止录制并导出
- **WHEN** 用户再次点击录制按钮
- **THEN** 系统停止录制
- **AND** 显示导出选项（JSON/Shell/Playwright）

### Requirement: 录制数据导出
系统 SHALL 支持 YAML 格式导出录制数据，便于 LLM 阅读。

#### Scenario: 导出 YAML
- **WHEN** 用户选择导出
- **THEN** 系统生成 YAML 格式的会话数据
- **AND** 格式清晰易读，便于 LLM 理解和生成代码

### Requirement: E2E 测试验证
系统 SHALL 有完整的 E2E 测试覆盖录制功能。

#### Scenario: 测试基本录制
- **WHEN** 运行 E2E 测试
- **THEN** 验证点击、输入、滚动等操作被正确记录

#### Scenario: 测试 iframe 录制
- **WHEN** 运行 E2E 测试
- **THEN** 验证 iframe 内操作被正确记录

#### Scenario: 测试数据导出
- **WHEN** 运行 E2E 测试
- **THEN** 验证导出的 JSON/Shell/Playwright 格式正确

---

## 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI 入口                                 │
│  agent-browser record --output session.yaml                      │
│  agent-browser --cdp ws://... record                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Actions 处理                               │
│  - record: 启动录制                                              │
│  - record-stop: 停止录制                                         │
│  - record-export: 导出 YAML                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Recorder 模块                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Recorder    │  │ SessionStore│  │ Exporter    │              │
│  │ (CDP绑定)   │  │ (数据存储)  │  │ (YAML导出)  │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Viewer 页面（简单模式）                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  工具栏: [🔗 URL] [🔴 录制] [📤 导出 YAML]              │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 技术实现：CDP 绑定

### 绑定时机

```
┌─────────────────────────────────────────────────────────────────┐
│                     record start 流程                            │
│                                                                  │
│  1. 获取或创建 Page                                               │
│  2. 创建 CDP Session                                             │
│     const cdp = await page.context().newCDPSession(page)        │
│                                                                  │
│  3. 注入绑定函数                                                  │
│     await cdp.send('Runtime.addBinding', {                      │
│       name: '__recorderSync'                                     │
│     })                                                           │
│                                                                  │
│  4. 监听绑定调用                                                  │
│     cdp.on('Runtime.bindingCalled', (params) => {               │
│       if (params.name === '__recorderSync') {                   │
│         store.addStep(JSON.parse(params.payload))               │
│       }                                                          │
│     })                                                           │
│                                                                  │
│  5. 注入初始化脚本                                                │
│     await page.addInitScript(injectScript)                      │
│     // 注入到所有 iframe（包括跨域）                               │
└─────────────────────────────────────────────────────────────────┘
```

### 清理时机

```
┌─────────────────────────────────────────────────────────────────┐
│                     record stop 流程                             │
│                                                                  │
│  1. 结束会话                                                      │
│     store.endSession()                                          │
│                                                                  │
│  2. 移除绑定函数                                                  │
│     await cdp.send('Runtime.removeBinding', {                   │
│       name: '__recorderSync'                                     │
│     })                                                           │
│                                                                  │
│  3. 分离 CDP Session                                             │
│     await cdp.detach()                                          │
│                                                                  │
│  4. 导出数据                                                      │
│     return exporter.toYAML(store.getSession())                  │
└─────────────────────────────────────────────────────────────────┘
```

### 关键代码位置

| 功能 | 文件 | 说明 |
|------|------|------|
| CDP 绑定 | `src/recorder/recorder.ts` | `start()` 方法 |
| 绑定监听 | `src/recorder/recorder.ts` | `handleSync()` 方法 |
| 清理逻辑 | `src/recorder/recorder.ts` | `stop()` 方法 |
| 注入脚本 | `src/recorder/inject.js` | 页面内事件监听 |

### 现有实现参考

```typescript
// src/recorder/recorder.ts
async start(): Promise<void> {
  // 1. 创建 CDP Session
  this.cdp = await this.page.context().newCDPSession(this.page);
  
  // 2. 注入绑定函数
  await this.cdp.send('Runtime.addBinding', {
    name: '__recorderSync'
  });
  
  // 3. 监听绑定调用
  this.cdp.on('Runtime.bindingCalled', (params) => {
    if (params.name === '__recorderSync') {
      this.handleSync(params.payload);
    }
  });
  
  // 4. 注入初始化脚本（自动注入到所有 iframe）
  await this.page.addInitScript(scriptContent);
}

async stop(): Promise<void> {
  this.store.endSession();
  
  if (this.cdp) {
    // 清理绑定
    await this.cdp.send('Runtime.removeBinding', {
      name: '__recorderSync'
    }).catch(() => {});
    
    // 分离 CDP
    await this.cdp.detach().catch(() => {});
    this.cdp = null;
  }
}
```

---

## YAML 导出格式示例

```yaml
session:
  id: session-1709000000000
  name: Recording Session
  startTime: 2024-02-28T10:00:00.000Z
  endTime: 2024-02-28T10:05:00.000Z
  viewport:
    width: 1920
    height: 1080

pages:
  - url: https://example.com/login
    title: Login Page
    firstVisitTime: 1709000000000

steps:
  - id: step-1
    timestamp: 1709000001000
    action: fill
    selector: input[data-testid="username"]
    xpath: //input[@name="username"]
    value: "testuser"
    
  - id: step-2
    timestamp: 1709000002000
    action: click
    selector: button[type="submit"]
    xpath: //button[contains(text(), "登录")]
    
  - id: step-3
    timestamp: 1709000003000
    action: trajectory
    points:
      - { x: 100, y: 200, t: 1709000002500 }
      - { x: 150, y: 220, t: 1709000002600 }
      - { x: 200, y: 250, t: 1709000002700 }
      - { x: 250, y: 280, t: 1709000002800 }
```

---

## 文件修改清单

### 1. CLI 命令支持
- `src/cli/commands.ts` - 添加 `record` 命令解析
- `src/cli/help.ts` - 添加帮助文档

### 2. Actions 处理
- `src/actions.ts` - 添加录制相关 action 处理

### 3. Viewer 页面
- `src/viewer-html.ts` - 添加录制按钮
- `src/viewer-script.ts` - 添加录制控制逻辑

### 4. 导出功能
- `src/recorder/export.ts` - 新增 YAML 导出模块

### 5. 同步
- `src/recorder/inject.js` - 同步 demo 版本

### 6. 测试
- `src/__tests__/e2e/recorder.e2e.test.ts` - E2E 测试
- `src/__tests__/e2e/fixtures/recorder-test.html` - 测试页面
