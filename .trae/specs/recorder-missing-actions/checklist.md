# Checklist

## Tab 操作录制
- [x] 新建 Tab 时记录 `tab_new` 步骤
- [x] 切换 Tab 时记录 `tab_switch` 步骤，包含正确的 index
- [x] 关闭 Tab 时记录 `tab_close` 步骤，包含正确的 index

## 浏览器导航录制
- [x] 执行后退操作时记录 `back` 步骤
- [x] 执行前进操作时记录 `forward` 步骤
- [x] 执行刷新操作时记录 `reload` 步骤

## 键盘操作录制
- [x] 按 Enter 键时记录 `keyboard` 步骤
- [x] 按 Tab 键时记录 `keyboard` 步骤
- [x] 按 Escape 键时记录 `keyboard` 步骤
- [x] 按方向键时记录 `keyboard` 步骤
- [x] 按组合键（Ctrl+A 等）时记录 `keyboard` 步骤，包含修饰键信息

## YAML 输出
- [x] YAML 输出包含 tab_new/tab_switch/tab_close action
- [x] YAML 输出包含 back/forward/reload action
- [x] YAML 输出包含 keyboard action 及相关字段

## 类型定义
- [x] RecordedStep 类型包含所有新 action 类型
- [x] TypeScript 编译无错误

## 测试验证
- [x] 单元测试通过 (19 tests)
- [x] E2E 测试通过 (recorder-missing-features: 15 tests)
- [x] E2E 测试通过 (recorder-enhanced: 32 tests)
