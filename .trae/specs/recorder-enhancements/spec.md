# Recorder 增强功能 Spec

## Why
当前录制器缺少一些重要功能：元素路径记录不完整、面板事件会干扰录制、标注元素没有持久化视觉反馈、步骤无法删除、视口尺寸变化没有记录。

## What Changes
- 添加元素完整路径（XPath）记录
- 录制面板事件不触发录制
- 点击/标注过的元素显示持久化边框
- 步骤面板支持删除单条记录
- 记录初始视口尺寸和 resize 变化

## Impact
- Affected code: `demo/recorder-inject.js`, `demo/recorder-overlay.html`

## ADDED Requirements

### Requirement: 元素路径记录
系统 SHALL 为每个操作记录完整的元素路径信息。

#### Scenario: 记录 XPath
- **WHEN** 用户点击或操作元素
- **THEN** 系统记录该元素的 XPath 路径

### Requirement: 面板事件隔离
系统 SHALL 忽略录制面板上的所有事件，不触发录制。

#### Scenario: 面板点击不录制
- **WHEN** 用户点击录制面板内的元素
- **THEN** 系统不记录任何步骤

### Requirement: 标注元素持久化边框
系统 SHALL 为点击过或标注过的元素显示持久化边框，不影响页面交互。

#### Scenario: 点击后显示边框
- **WHEN** 用户点击元素
- **THEN** 该元素显示持久化边框标记

#### Scenario: 标注后显示彩色边框
- **WHEN** 用户标注元素为登录/采集/分页
- **THEN** 该元素显示对应颜色的边框

#### Scenario: 边框不影响交互
- **WHEN** 元素显示边框
- **THEN** 边框不阻挡点击、滚动等交互

### Requirement: 步骤删除功能
系统 SHALL 允许用户删除步骤面板中的单条记录。

#### Scenario: 删除步骤
- **WHEN** 用户点击步骤的删除按钮
- **THEN** 该步骤从列表中移除

### Requirement: 视口尺寸记录
系统 SHALL 记录初始视口尺寸和 resize 变化。

#### Scenario: 初始化记录尺寸
- **WHEN** 页面加载完成
- **THEN** 系统记录当前视口宽高

#### Scenario: resize 记录变化
- **WHEN** 视口尺寸发生变化
- **AND** 下一个操作事件触发
- **THEN** 系统在操作前插入 resize 步骤
