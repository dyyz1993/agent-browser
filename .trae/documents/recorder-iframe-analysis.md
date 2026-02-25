# Recorder 测试失败分析与 iframe 原理深度解析

## 一、测试失败分析

### 当前测试结果
- **通过**: 28/31 (90.3%)
- **失败**: 3/31 (9.7%)

### 失败原因详解

| 测试 | 失败原因 | 根本问题 |
|------|----------|----------|
| radio button click | 元素选择器问题 | `#radio-option1` 可能与页面其他元素冲突 |
| iframe click | 30秒超时 | iframe 选择器语法 `>>` 在 Playwright 中需要特殊处理 |
| iframe fill | 30秒超时 | 同上，iframe 内部元素无法正确选中 |

### 核心问题：iframe 录制失败的技术原因

1. **注入脚本未进入 iframe**
   - `page.addInitScript()` 只注入到主页面
   - `page.evaluate()` 只在主页面执行
   - iframe 是独立的文档，需要单独注入

2. **CDP Binding 的局限性**
   - `Runtime.addBinding` 只在当前页面有效
   - iframe 内部调用 `window.__recorderSync` 会报错（函数不存在）

---

## 二、当前数据流转分析

### 现有架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Node.js 进程                             │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │ BrowserManager  │    │         CDP Session             │ │
│  │                 │◄───│  Runtime.addBinding({           │ │
│  │ recorderSteps[] │    │    name: '__recorderSync'       │ │
│  │                 │    │  })                             │ │
│  └─────────────────┘    └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ CDP bindingCalled event
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    主页面 (Main Page)                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 注入脚本                                             │   │
│  │ - document.addEventListener('click', ...)           │   │
│  │ - document.addEventListener('input', ...)           │   │
│  │ - window.__recorderSync = CDP binding              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│  │ iframe 1    │    │ iframe 2    │    │ iframe 3    │    │
│  │ (同源)      │    │ (跨域)      │    │ (嵌套)      │    │
│  │ ❌ 无注入   │    │ ❌ 无法注入 │    │ ❌ 无注入   │    │
│  └─────────────┘    └─────────────┘    └─────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 问题总结

| iframe 类型 | 当前状态 | 原因 |
|-------------|----------|------|
| 同源 iframe | ❌ 不工作 | 注入脚本未进入 iframe |
| 跨域 iframe | ❌ 不工作 | 浏览器安全策略禁止访问 |
| 嵌套 iframe | ❌ 不工作 | 多层注入未实现 |

---

## 三、iframe 录制解决方案

### 方案 A：PostMessage 通信（推荐）

**原理**：利用 `window.postMessage` 在 iframe 之间通信

```
┌─────────────────────────────────────────────────────────────┐
│                    主页面 (Main Page)                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 注入脚本                                             │   │
│  │ - 监听 message 事件                                  │   │
│  │ - 收到消息后调用 __recorderSync                      │   │
│  │ - 向所有 iframe 发送 'recorder-init' 消息            │   │
│  └─────────────────────────────────────────────────────┘   │
│                         ▲                                   │
│                         │ postMessage                       │
│                         │                                   │
│  ┌──────────────────────┴──────────────────────────────┐   │
│  │ iframe (同源)                                        │   │
│  │ - 收到 'recorder-init' 后注入脚本                    │   │
│  │ - 事件触发后通过 postMessage 发送到父页面            │   │
│  │ - 支持多层嵌套（逐层向上传递）                       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**优点**：
- ✅ 同源 iframe 完全支持
- ✅ 支持多层嵌套 iframe
- ✅ 不需要 CDP 对每个 iframe 建立连接

**缺点**：
- ❌ 跨域 iframe 仍然无法工作（浏览器安全策略）

### 方案 B：Node 端事件捕获（跨域方案）

**原理**：在 Node 端通过 Playwright 的 API 捕获事件，而不是在页面内注入脚本

```
┌─────────────────────────────────────────────────────────────┐
│                     Node.js 进程                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ BrowserManager                                       │   │
│  │ - page.on('click', handler)     // 点击事件         │   │
│  │ - page.on('fill', handler)      // 填充事件         │   │
│  │ - page.waitForSelector()        // 等待元素         │   │
│  │ - page.evaluate()               // 执行脚本         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Playwright 自动处理：                                       │
│  - 同源 iframe: page.frameLocator('iframe').click()        │
│  - 跨域 iframe: 同样支持（Playwright 自动穿透）             │
│  - 嵌套 iframe: frameLocator().frameLocator()              │
└─────────────────────────────────────────────────────────────┘
```

**问题**：Playwright 不会自动触发 `page.on('click')` 事件，需要手动记录

### 方案 C：混合方案（最佳实践）

结合方案 A 和 B：

1. **同源 iframe**：使用 PostMessage 方案
2. **跨域 iframe**：在 Node 端记录操作命令（而非用户真实点击）

```
┌─────────────────────────────────────────────────────────────┐
│                     混合录制架构                             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 层级 1: 页面内注入脚本                               │   │
│  │ - 捕获用户真实交互（click, input, scroll 等）        │   │
│  │ - 通过 CDP binding 或 postMessage 传递               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 层级 2: Node 端命令记录                              │   │
│  │ - 记录 executeCommand 调用                           │   │
│  │ - 包含 iframe 定位信息                               │   │
│  │ - 适用于所有 iframe 类型                             │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 四、多层 iframe PostMessage 方案详解

### 数据结构设计

```typescript
interface RecorderMessage {
  type: 'recorder-step' | 'recorder-init' | 'recorder-ready';
  source: 'main' | 'iframe';
  depth: number;           // iframe 嵌套深度
  step?: RecordedStep;     // 录制的步骤
  origin: string;          // 来源 origin
}
```

### 注入脚本改造

```javascript
// 主页面注入脚本
(function() {
  const MAX_DEPTH = 10;
  
  // 监听来自 iframe 的消息
  window.addEventListener('message', (event) => {
    if (event.data.type === 'recorder-step') {
      // 转发到 CDP binding
      window.__recorderSync(JSON.stringify(event.data.step));
    }
  });
  
  // 向所有 iframe 发送初始化消息
  function initIframes() {
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach((iframe, index) => {
      try {
        iframe.contentWindow.postMessage({
          type: 'recorder-init',
          depth: 1,
          index: index
        }, '*');
      } catch (e) {
        // 跨域 iframe 无法访问，跳过
      }
    });
  }
  
  // iframe 内部注入脚本
  if (window.self !== window.top) {
    window.addEventListener('message', (event) => {
      if (event.data.type === 'recorder-init') {
        // 初始化录制脚本
        const myDepth = event.data.depth + 1;
        
        // 监听用户事件
        document.addEventListener('click', (e) => {
          const step = {
            action: 'click',
            selector: getSelector(e.target),
            depth: myDepth
          };
          window.parent.postMessage({
            type: 'recorder-step',
            step: step
          }, '*');
        }, true);
        
        // 向嵌套的 iframe 发送初始化
        initNestedIframes(myDepth);
      }
    });
  }
})();
```

---

## 五、Node 端事件捕获方案

### 原理

Playwright 的 `page.click()` 等方法会自动穿透 iframe，但不会触发页面内的事件监听器。

### 实现方式

```typescript
// 在 BrowserManager 中记录命令调用
class BrowserManager {
  private recorderSteps: RecordedStep[] = [];
  
  async click(selector: string): Promise<void> {
    // 执行点击
    await this.page.click(selector);
    
    // 如果正在录制，记录这个操作
    if (this.recorderSessionId) {
      this.recorderSteps.push({
        action: 'click',
        selector: selector,
        timestamp: Date.now(),
        source: 'command'  // 标记来源为命令
      });
    }
  }
}
```

### 优缺点对比

| 方面 | 页面内注入 | Node 端记录 |
|------|-----------|-------------|
| 用户真实交互 | ✅ 可以捕获 | ❌ 无法捕获 |
| 命令触发操作 | ❌ 无法区分 | ✅ 可以区分 |
| 同源 iframe | 需要额外处理 | ✅ 自动支持 |
| 跨域 iframe | ❌ 无法工作 | ✅ 自动支持 |
| 嵌套 iframe | 需要递归处理 | ✅ 自动支持 |

---

## 六、推荐实施方案

### 短期方案（快速修复）

1. **修复当前 iframe 测试**
   - 使用 `page.frameLocator()` 正确选择 iframe 内元素
   - 增加等待时间让 iframe 加载完成

### 中期方案（完整支持）

1. **实现 PostMessage 方案**
   - 支持同源 iframe 和多层嵌套
   - 主页面作为消息中转站

2. **实现 Node 端命令记录**
   - 记录所有 `executeCommand` 调用
   - 作为跨域 iframe 的补充方案

### 长期方案（最佳实践）

1. **混合录制架构**
   - 页面内注入：捕获用户真实交互
   - Node 端记录：捕获命令触发操作
   - 两者合并，提供完整的录制数据

---

## 七、任务列表

### Task 1: 修复 iframe 测试
- 使用正确的 iframe 选择器语法
- 增加等待时间

### Task 2: 实现 PostMessage 方案
- 修改注入脚本支持 iframe
- 实现消息中转机制
- 支持多层嵌套

### Task 3: 实现 Node 端命令记录
- 在 BrowserManager 中记录命令调用
- 区分用户交互和命令操作

### Task 4: 添加跨域 iframe 测试
- 测试百度 iframe
- 验证 Node 端记录方案
