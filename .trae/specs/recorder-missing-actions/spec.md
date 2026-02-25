# Recorder 缺失功能 Spec

## Why
当前录制器缺少关键的浏览器级操作录制功能：Tab 切换/关闭、浏览器后退/前进/刷新、键盘操作（Enter/Tab/Escape等）都没有被记录，导致录制内容不完整，无法完整回放用户操作。

## What Changes
- 新增 Tab 操作录制：`tab_new`、`tab_switch`、`tab_close`
- 新增浏览器导航录制：`back`、`forward`、`reload`
- 新增键盘操作录制：`keyboard`
- 更新 RecordedStep 类型定义
- 更新 YAML 输出格式

## Impact
- Affected specs: 录制器功能
- Affected code: 
  - `src/recorder/types.ts` - 新增 action 类型
  - `src/recorder/inject.js` - 键盘事件监听
  - `src/browser.ts` - Tab/导航事件监听

## ADDED Requirements

### Requirement: Tab 操作录制
系统 SHALL 记录所有 Tab 相关操作。

#### Scenario: 新建 Tab
- **WHEN** 用户打开新的浏览器标签页
- **THEN** 系统记录 `tab_new` 步骤

#### Scenario: 切换 Tab
- **WHEN** 用户切换到不同的标签页
- **THEN** 系统记录 `tab_switch` 步骤，包含目标 Tab 索引

#### Scenario: 关闭 Tab
- **WHEN** 用户关闭标签页
- **THEN** 系统记录 `tab_close` 步骤，包含被关闭 Tab 的索引

### Requirement: 浏览器导航录制
系统 SHALL 记录浏览器导航操作。

#### Scenario: 后退操作
- **WHEN** 用户执行浏览器后退
- **THEN** 系统记录 `back` 步骤

#### Scenario: 前进操作
- **WHEN** 用户执行浏览器前进
- **THEN** 系统记录 `forward` 步骤

#### Scenario: 刷新操作
- **WHEN** 用户执行页面刷新
- **THEN** 系统记录 `reload` 步骤

### Requirement: 键盘操作录制
系统 SHALL 记录特殊键盘操作。

#### Scenario: 特殊键录制
- **WHEN** 用户按下 Enter、Tab、Escape、Backspace 或方向键
- **THEN** 系统记录 `keyboard` 步骤，包含按键信息和当前焦点元素

#### Scenario: 组合键录制
- **WHEN** 用户按下 Ctrl/Meta/Alt 组合键
- **THEN** 系统记录 `keyboard` 步骤，包含修饰键信息

## MODIFIED Requirements

### Requirement: RecordedStep 类型
系统 SHALL 支持新的 action 类型。

原有类型：
```typescript
action: 'click' | 'fill' | 'navigate' | 'annotate' | 'scroll' | 'select'
```

修改为：
```typescript
action: 'click' | 'fill' | 'navigate' | 'annotate' | 'scroll' | 'select' 
      | 'tab_new' | 'tab_switch' | 'tab_close' 
      | 'back' | 'forward' | 'reload' 
      | 'keyboard'
```
