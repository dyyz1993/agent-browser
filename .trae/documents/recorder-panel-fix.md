# 录制器面板功能修复和优化计划

## 问题分析

### 1. 无法为步骤增加标签
- 底部工具按钮点击后调用 `addToolAnnotation`，但可能存在作用域问题
- 需要确保 `currentStepIndex` 变量在正确的作用域中

### 2. 滚动强制到底部
- 当前代码 `container.scrollTop = container.scrollHeight;` 每次更新都强制滚动到底部
- 应该只在用户滚动到底部时才自动滚动

### 3. 面板滚动穿透
- 面板滚动可能穿透到底层页面
- 需要阻止滚动事件冒泡

### 4. 已有标注无法修改
- 当前只能添加标注，不能修改已有标注
- 需要支持修改已有标注

### 5. 交互优化
- 选中步骤后点击工具按钮添加/修改标注
- 如果已有标注，直接覆盖

### 6. 冗余代码
- 移除旧的 +Tool 按钮相关样式和代码
- 移除下拉菜单相关代码

## 解决方案

### 1. 修复标签功能
- 确保 `currentStepIndex` 变量在正确的作用域
- 确保 `addToolAnnotation` 函数可被正确调用

### 2. 智能滚动
```javascript
// 记录用户是否滚动到底部
let autoScroll = true;

container.addEventListener('scroll', () => {
  const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 10;
  autoScroll = isAtBottom;
});

// 更新时只在用户滚动到底部时才自动滚动
if (autoScroll) {
  container.scrollTop = container.scrollHeight;
}
```

### 3. 阻止滚动穿透
```javascript
panelBody.addEventListener('wheel', (e) => {
  const { scrollTop, scrollHeight, clientHeight } = panelBody;
  const atTop = scrollTop === 0;
  const atBottom = scrollTop + clientHeight >= scrollHeight;
  
  if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
    e.preventDefault();
  }
}, { passive: false });
```

### 4. 支持修改标注
- 选中已有标注的步骤后，点击工具按钮可以覆盖原标注

### 5. 清理冗余代码
- 移除 `.add-tool-btn` 相关样式
- 移除 `.recorder-tool-dropdown` 相关样式和代码

## 修改文件

| 文件 | 修改内容 |
|------|------|
| `src/recorder/inject.js` | 1. 修复标签功能<br>2. 智能滚动<br>3. 阻止滚动穿透<br>4. 清理冗余代码 |

## 实现步骤

1. 修复 `currentStepIndex` 作用域问题
2. 添加智能滚动逻辑
3. 添加滚动穿透阻止
4. 清理冗余样式和代码
5. 重新构建项目
6. E2E 测试验证
