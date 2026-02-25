# Tasks

- [x] Task 1: 更新 RecordedStep 类型定义
  - [x] 在 `src/recorder/types.ts` 中添加新的 action 类型
  - [x] 添加 Tab 操作相关字段（index）
  - [x] 添加键盘操作相关字段（key, code, ctrlKey, metaKey, altKey, shiftKey）

- [x] Task 2: 实现 Tab 操作录制
  - [x] 在 `src/browser.ts` 的 startRecorder 中监听 `page.context().on('page')` 事件记录 tab_new
  - [x] 监听 Tab 切换事件（通过 visibilitychange 或 pages 数组变化检测）
  - [x] 监听 Tab 关闭事件 `page.on('close')`
  - [x] 在 generateRecorderYaml 中输出新的 action 类型

- [x] Task 3: 实现浏览器导航录制
  - [x] 在 `src/browser.ts` 中追踪导航历史
  - [x] 检测 back/forward 操作（通过历史栈变化）
  - [x] 检测 reload 操作（通过页面加载类型）
  - [x] 记录对应的 action 步骤

- [x] Task 4: 实现键盘操作录制
  - [x] 在 `src/recorder/inject.js` 中添加 keydown 事件监听
  - [x] 过滤特殊键：Enter, Tab, Escape, Backspace, ArrowUp, ArrowDown, ArrowLeft, ArrowRight
  - [x] 记录组合键：Ctrl/Meta/Alt + 任意键
  - [x] 记录当前焦点元素选择器

- [x] Task 5: 更新 YAML 输出格式
  - [x] 在 `src/browser.ts` 的 generateRecorderYaml 方法中处理新字段
  - [x] 输出 index 字段（Tab 操作）
  - [x] 输出 key/code/修饰键字段（键盘操作）

# Task Dependencies
- Task 2, Task 3, Task 4 可并行执行
- Task 5 依赖 Task 1（类型定义）
- Task 1 无依赖，应最先完成
