# Tasks

- [x] Task 1: CLI 命令支持
  - [x] 在 `commands.ts` 添加 `record` 子命令解析
  - [x] 支持 `record start [url]` 启动录制
  - [x] 支持 `record stop [--output file.yaml]` 停止录制并输出
  - [x] 支持 `record status` 查看录制状态
  - [x] 更新 `help.ts` 添加帮助文档

- [x] Task 2: Actions 处理
  - [x] 在 `actions.ts` 添加 `record-start` action
  - [x] 添加 `record-stop` action
  - [x] 添加 `record-status` action
  - [x] 添加 `record-export` action（YAML 格式输出）
  - [x] 在 `browser.ts` 添加 `startRecorder`, `stopRecorder`, `getRecorderStatus` 方法
  - [x] 在 `types.ts` 添加类型定义

- [x] Task 3: Viewer 页面集成（简单模式）
  - [x] 在 `viewer-html.ts` 添加录制按钮
  - [x] 添加录制状态指示器（红点/绿点）
  - [x] 点击按钮切换录制状态

- [ ] Task 4: 导出功能
  - [x] 创建 `src/recorder/export.ts`（已在 browser.ts 中实现 YAML 导出）
  - [x] 实现 YAML 导出（便于 LLM 阅读）
  - [x] 支持 stdout 输出或文件保存

- [ ] Task 5: 同步 inject.js
  - [x] 将 `demo/recorder-inject.js` 同步到 `src/recorder/inject.js`（已内嵌到 browser.ts）

- [x] Task 6: E2E 测试
  - [x] 创建测试页面 `recorder-test.html`
  - [x] 测试 `recorder start` 命令
  - [x] 测试 `recorder stop` 命令
  - [x] 测试 YAML 输出格式

# Task Dependencies
- Task 2 依赖 Task 1
- Task 3 依赖 Task 2
- Task 4 依赖 Task 2
- Task 6 依赖 Task 1-5
