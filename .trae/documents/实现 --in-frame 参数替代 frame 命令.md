## 实现计划：用 `--in-frame` 参数替代 `frame` 命令

### 设计原则
- **无隐式状态**：移除 `activeFrame` 状态，每次操作明确指定 frame
- **绝对路径**：`--in-frame '#frame1/#frame2'` 始终从 main frame 开始
- **Shadow DOM 不需要处理**：Playwright 自动穿透

---

### 第一阶段：类型定义修改

**文件：`src/types.ts`**

1. 移除 `FrameCommand` 和 `MainFrameCommand` 接口
2. 从 `Command` 联合类型中移除这两个类型
3. 创建 `InFrameSupport` 接口：
   ```typescript
   export interface InFrameSupport {
     inFrame?: string;  // frame 路径，如 '#frame1/#frame2'
   }
   ```
4. 为以下命令接口添加 `inFrame?: string` 字段：
   - `ClickCommand`, `DoubleClickCommand`, `FillCommand`, `TypeCommand`
   - `FocusCommand`, `HoverCommand`, `CheckCommand`, `UncheckCommand`
   - `SelectCommand`, `DragCommand`, `UploadCommand`
   - `GetTextCommand`, `GetValueCommand`, `GetAttributeCommand`
   - `IsVisibleCommand`, `IsEnabledCommand`, `IsCheckedCommand`
   - `CountCommand`, `BoundingBoxCommand`, `StylesCommand`
   - `WaitCommand`, `SnapshotCommand`, `ScreenshotCommand`
   - `EvaluateCommand`, `HighlightCommand`, `ScrollIntoViewCommand`

---

### 第二阶段：BrowserManager 修改

**文件：`src/browser.ts`**

1. 移除 `activeFrame` 私有属性
2. 移除 `switchToFrame()` 方法
3. 移除 `switchToMainFrame()` 方法
4. 添加新方法：
   ```typescript
   async getFrameByPath(framePath: string): Promise<Frame | Page> {
     if (!framePath) return this.page;
     const selectors = framePath.split('/').map(s => s.trim()).filter(Boolean);
     let current: Frame | Page = this.page;
     for (const selector of selectors) {
       const frame = current.frameLocator(selector).first();
       // 返回 Frame 对象用于操作
     }
     return current;
   }
   ```

---

### 第三阶段：Actions 修改

**文件：`src/actions.ts`**

1. 移除 `handleFrame()` 函数
2. 移除 `handleMainFrame()` 函数
3. 移除 switch 中的 `case 'frame'` 和 `case 'mainframe'`
4. 创建辅助函数：
   ```typescript
   async function getTargetFrame(browser: BrowserManager, inFrame?: string): Promise<Frame | Page> {
     if (!inFrame) return browser.getPage();
     return browser.getFrameByPath(inFrame);
   }
   ```
5. 修改所有 handler 函数，使用 `getTargetFrame()` 获取操作目标

---

### 第四阶段：CLI 解析修改

**文件：`bin/cli.ts`**

1. 移除 `case 'frame'` 分支
2. 为支持的命令添加 `--in-frame` / `-f` 参数解析：
   ```typescript
   // 示例：click 命令
   case 'click': {
     const selector = rest[0];
     const inFrameIdx = rest.indexOf('--in-frame') !== -1 ? rest.indexOf('--in-frame') : rest.indexOf('-f');
     const inFrame = inFrameIdx !== -1 ? rest[inFrameIdx + 1] : undefined;
     return { id, action: 'click', selector, inFrame };
   }
   ```

**文件：`src/__tests__/utils/parseCli.ts`**

1. 同步修改，与 `bin/cli.ts` 保持一致

---

### 第五阶段：Protocol 修改

**文件：`src/protocol.ts`**

1. 移除 frame 命令的 schema
2. 为相关命令的 schema 添加 `inFrame` 字段

---

### 第六阶段：测试修改

**文件：`src/__tests__/e2e/iframe.e2e.test.ts`**

重写所有测试用例：
```typescript
// 旧写法
await executeCommand(parseCliArgs(['frame', '#frame1']), browser);
await executeCommand(parseCliArgs(['frame', '#frame2']), browser);
await executeCommand(parseCliArgs(['frame', '#frame3']), browser);
const textResult = await executeCommand(parseCliArgs(['get', 'text', '#level4-text']), browser);

// 新写法
const textResult = await executeCommand(
  parseCliArgs(['get', 'text', '#level4-text', '--in-frame', '#frame1/#frame2/#frame3']),
  browser
);
```

**文件：`src/__tests__/cli.tab.test.ts`**

1. 移除 frame 相关测试
2. 添加 `--in-frame` 参数测试

**文件：`src/protocol.test.ts`**

1. 移除 frame 命令测试
2. 添加 inFrame 字段测试

---

### 第七阶段：文档修改

**文件：`skills/agent-browser/references/commands.md`**

1. 移除 frame 命令文档
2. 添加 `--in-frame` / `-f` 参数说明：
   ```markdown
   ## Frame Operations
   
   All interaction commands support `--in-frame` / `-f` to specify target iframe:
   
   ```bash
   click '#btn' --in-frame '#frame1/#frame2'
   fill '#input' 'hello' -f '#frame1/#frame2'
   get text '#result' --in-frame '#frame1/#frame2/#frame3'
   ```
   
   Frame path is absolute from main frame, using `/` as separator.
   ```

**文件：`API_DOCUMENTATION.md`**

1. 更新 frame 相关文档
2. 添加 `--in-frame` 参数说明

---

### 执行顺序

1. 类型定义 (`types.ts`)
2. BrowserManager (`browser.ts`)
3. Actions (`actions.ts`)
4. CLI 解析 (`bin/cli.ts`, `parseCli.ts`)
5. Protocol (`protocol.ts`)
6. 测试文件
7. 文档

---

### 验证步骤

1. `npm run typecheck` - 类型检查
2. `npm run test` - 单元测试
3. `npm run test:e2e` - E2E 测试
4. 手动测试 iframe 操作