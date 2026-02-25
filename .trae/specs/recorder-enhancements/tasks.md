# Tasks

- [x] Task 1: 添加元素 XPath 路径记录
  - [x] 在 inject.js 中添加 getXPath 函数
  - [x] 在步骤记录中添加 xpath 字段

- [x] Task 2: 面板事件隔离
  - [x] 在 inject.js 中检测事件目标是否在录制面板内
  - [x] 如果在面板内则忽略事件

- [x] Task 3: 标注元素持久化边框
  - [x] 创建边框容器（position: fixed，pointer-events: none）
  - [x] 点击元素时添加边框标记
  - [x] 标注元素时添加彩色边框
  - [x] 边框跟随元素位置更新

- [x] Task 4: 步骤删除功能
  - [x] 在步骤面板每条记录添加删除按钮
  - [x] 点击删除时从数组中移除该步骤
  - [x] 更新面板显示

- [x] Task 5: 视口尺寸记录
  - [x] 初始化时记录视口尺寸
  - [x] 监听 resize 事件，存储待记录的尺寸变化
  - [x] 在下一个操作事件前插入 resize 步骤

# Task Dependencies
- Task 3 依赖 Task 2（面板隔离后才能正确处理边框交互）
- Task 5 无依赖，可并行
