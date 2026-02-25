# 录制器面板可见性测试计划

## 一、问题描述

当 URL 地址发生变化时，录制器面板没有正确展示。需要在以下场景中验证面板可见性：

1. 页面导航（navigate）
2. 页面内部跳转（hash change, SPA 路由）
3. Tab 切换
4. 后退/前进/刷新

## 二、当前实现分析

### 2.1 面板结构

录制器面板在 `src/recorder/inject.js` 中创建：
- 面板类名：`.recorder-panel`
- 状态显示：`#recorder-status`（显示 "Steps: N"）
- 步骤容器：`#recorder-steps`

### 2.2 问题原因

当页面导航时，整个页面 DOM 被替换，录制器面板也会被移除。需要在导航后重新注入面板。

## 三、测试方案

### 3.1 新增辅助函数

```typescript
// 验证录制器面板是否可见
async function verifyRecorderPanelVisible(page: Page): Promise<boolean> {
  const panel = await page.$('.recorder-panel');
  if (!panel) return false;
  
  const isVisible = await panel.isVisible();
  const status = await page.$('#recorder-status');
  if (!status) return false;
  
  const statusText = await status.textContent();
  return isVisible && statusText?.includes('Steps:');
}
```

### 3.2 测试场景

#### 场景 1: 页面导航后面板可见
- 启动录制
- 执行点击操作
- 导航到新页面
- **验证面板可见**
- 继续操作
- **验证面板可见**

#### 场景 2: Tab 切换后面板可见
- 启动录制
- 打开新 Tab
- **验证原 Tab 面板可见**
- 切换到新 Tab
- **验证新 Tab 面板可见**

#### 场景 3: 后退/前进后面板可见
- 启动录制
- 导航到页面 A
- 导航到页面 B
- 执行后退
- **验证面板可见**
- 执行前进
- **验证面板可见**

#### 场景 4: 刷新后面板可见
- 启动录制
- 执行操作
- 刷新页面
- **验证面板可见**

## 四、修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/__tests__/e2e/recorder-enhanced.e2e.test.ts` | 添加面板可见性验证 |
| `src/__tests__/e2e/recorder-missing-features.e2e.test.ts` | 添加面板可见性验证 |
| `src/browser.ts` | 确保导航后重新注入面板（已修复） |

## 五、实施步骤

1. 在测试文件中添加 `verifyRecorderPanelVisible` 辅助函数
2. 在所有录制测试中添加面板可见性断言
3. 运行测试验证
