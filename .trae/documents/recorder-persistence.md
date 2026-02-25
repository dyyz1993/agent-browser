# Recorder 跨页面持久化方案

## 问题分析

### 当前问题
1. **页面跳转后数据丢失**：录制步骤存储在页面内存中，跳转后丢失
2. **跨域无法同步**：不同域名的页面无法共享数据
3. **缺少鼠标轨迹**：无法还原用户操作的真实路径

### 解决方案架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Playwright)                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Page Context                            │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │              Injected Script                         │  │  │
│  │  │  - 记录操作步骤                                       │  │  │
│  │  │  - 记录鼠标轨迹                                       │  │  │
│  │  │  - 调用 window.__recorderSync(data)                  │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                          │                                 │  │
│  │                          ▼                                 │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │         CDP: Runtime.addBinding                      │  │  │
│  │  │         window.__recorderSync = function(data)       │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          │                                       │
│                          ▼                                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │         CDP: Runtime.bindingCalled 事件                    │  │
│  │         → 后端接收数据                                      │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (Node.js)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ StepStore   │  │ Trajectory  │  │ SyncManager │              │
│  │ (步骤存储)  │  │ (轨迹记录)  │  │ (同步管理)  │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                           │                                       │
│                           ▼                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              JSON File / Database                        │    │
│  │              session-xxx.json                            │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 实现方案

### 1. 数据结构设计

```typescript
// 鼠标轨迹点
interface TrajectoryPoint {
  x: number;      // 相对窗口 X 坐标
  y: number;      // 相对窗口 Y 坐标
  t: number;      // 相对时间戳 (ms)
}

// 录制步骤
interface RecordedStep {
  id: string;
  timestamp: number;
  url: string;              // 当前页面 URL
  action: 'click' | 'fill' | 'navigate' | 'annotate' | 'scroll';
  selector: string;
  value?: string;
  elementInfo: {...};
  annotation?: {...};
  
  // 新增：鼠标轨迹
  trajectory: TrajectoryPoint[];  // 操作前 5 个坐标点
  viewport: {
    width: number;
    height: number;
  };
}

// 录制会话
interface RecordingSession {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  pages: {
    url: string;
    title: string;
    firstVisitTime: number;
  }[];
  steps: RecordedStep[];
}
```

### 2. CDP 绑定实现

```typescript
// 后端：设置 CDP 绑定
async function setupRecorderBinding(page: Page, sessionStore: SessionStore) {
  // 获取 CDP session
  const cdp = await page.context().newCDPSession(page);
  
  // 添加绑定函数
  await cdp.send('Runtime.addBinding', {
    name: '__recorderSync'
  });
  
  // 监听绑定调用
  cdp.on('Runtime.bindingCalled', (params) => {
    if (params.name === '__recorderSync') {
      const data = JSON.parse(params.payload);
      sessionStore.addStep(data);
    }
  });
  
  // 注入初始化脚本（每次页面加载都会执行）
  await page.addInitScript(`
    // 鼠标轨迹追踪
    window.__recorderTrajectory = [];
    window.__recorderLastTime = 0;
    
    document.addEventListener('mousemove', (e) => {
      const now = Date.now();
      // 每 50ms 记录一个点
      if (now - window.__recorderLastTime > 50) {
        window.__recorderTrajectory.push({
          x: e.clientX,
          y: e.clientY,
          t: now
        });
        // 只保留最近 10 个点
        if (window.__recorderTrajectory.length > 10) {
          window.__recorderTrajectory.shift();
        }
        window.__recorderLastTime = now;
      }
    }, true);
    
    // 获取轨迹（操作前调用）
    window.__getTrajectory = function() {
      const points = window.__recorderTrajectory.slice(-5);
      window.__recorderTrajectory = [];
      return points;
    };
    
    // 同步数据到后端
    window.__syncStep = function(step) {
      step.trajectory = window.__getTrajectory();
      step.viewport = {
        width: window.innerWidth,
        height: window.innerHeight
      };
      step.url = window.location.href;
      
      if (window.__recorderSync) {
        window.__recorderSync(JSON.stringify(step));
      }
    };
    
    console.log('[Recorder] CDP binding initialized');
  `);
}
```

### 3. 页面注入脚本

```javascript
// 注入到每个页面的脚本
(function() {
  if (window.__recorderInitialized) return;
  window.__recorderInitialized = true;
  
  // 记录步骤并同步
  function recordStep(action, data) {
    const step = {
      id: `step-${Date.now()}`,
      timestamp: Date.now(),
      action: action,
      selector: data.selector,
      value: data.value,
      elementInfo: data.elementInfo,
      annotation: data.annotation
    };
    
    window.__syncStep(step);
  }
  
  // 点击事件
  document.addEventListener('click', (e) => {
    const element = e.composedPath()[0];
    const selector = getSelector(element);
    
    recordStep('click', {
      selector: selector,
      elementInfo: getElementInfo(element)
    });
  }, true);
  
  // 输入事件
  document.addEventListener('input', (e) => {
    const element = e.target;
    const selector = getSelector(element);
    
    recordStep('fill', {
      selector: selector,
      value: element.value,
      elementInfo: getElementInfo(element)
    });
  }, true);
  
  // 导航事件
  window.addEventListener('beforeunload', () => {
    recordStep('navigate', {
      selector: 'window',
      value: window.location.href
    });
  });
})();
```

### 4. 数据持久化

```typescript
// 后端存储管理
class SessionStore {
  private session: RecordingSession;
  private filePath: string;
  
  constructor(sessionId: string) {
    this.session = {
      id: sessionId,
      name: `session-${sessionId}`,
      startTime: Date.now(),
      pages: [],
      steps: []
    };
    this.filePath = `/tmp/recorder-${sessionId}.json`;
  }
  
  addStep(step: RecordedStep) {
    this.session.steps.push(step);
    
    // 记录新页面
    const pageUrl = new URL(step.url).origin + new URL(step.url).pathname;
    if (!this.session.pages.find(p => p.url === pageUrl)) {
      this.session.pages.push({
        url: pageUrl,
        title: '', // 可以通过 CDP 获取
        firstVisitTime: step.timestamp
      });
    }
    
    // 实时写入文件
    this.save();
  }
  
  save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.session, null, 2));
  }
  
  load(): RecordingSession {
    if (fs.existsSync(this.filePath)) {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
    }
    return this.session;
  }
}
```

### 5. 页面跳转后恢复数据

```typescript
// 页面加载后恢复状态
async function restoreRecorderState(page: Page, sessionStore: SessionStore) {
  const session = sessionStore.load();
  
  // 注入已有步骤（供 UI 显示）
  await page.evaluate((steps) => {
    window.__recorderSteps = steps;
  }, session.steps);
  
  // 触发 UI 更新
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('recorder:restored', {
      detail: { steps: window.__recorderSteps }
    }));
  });
}
```

---

## 实现步骤

### Step 1: 添加鼠标轨迹追踪
- 在注入脚本中添加 `mousemove` 监听
- 每 50ms 记录一个坐标点
- 只保留最近 10 个点

### Step 2: 实现 CDP 绑定
- 使用 `Runtime.addBinding` 注入 `__recorderSync` 函数
- 监听 `Runtime.bindingCalled` 事件接收数据

### Step 3: 实现后端存储
- 创建 `SessionStore` 类管理会话数据
- 实时写入 JSON 文件

### Step 4: 实现页面跳转恢复
- 使用 `page.addInitScript` 确保脚本注入
- 页面加载后从后端恢复数据

### Step 5: 更新 HTML Demo
- 模拟 CDP 绑定（使用 `postMessage`）
- 添加鼠标轨迹显示

---

## 文件修改

1. `src/recorder/types.ts` - 新增数据类型定义
2. `src/recorder/store.ts` - 会话存储管理
3. `src/recorder/binding.ts` - CDP 绑定实现
4. `src/recorder/inject.ts` - 注入脚本
5. `demo/recorder-overlay.html` - 更新演示页面
