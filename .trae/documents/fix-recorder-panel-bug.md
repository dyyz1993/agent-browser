# 修复录制器记录面板按钮操作的 Bug

## 问题描述

录制器在录制过程中，会错误地记录录制面板上的按钮操作（如"数据标注"、"分页标注"按钮），这些按钮属于录制器 UI，不应该被记录。

## 问题原因

在 `src/recorder/inject.js` 中，`isInRecorderPanel` 函数只检查了 `.recorder-panel` 元素，但没有检查 `.recorder-toolbar` 元素：

```javascript
function isInRecorderPanel(element) {
  if (!element) return false;
  if (!recorderPanelElement) {
    recorderPanelElement = document.querySelector('.recorder-panel');
  }
  if (!recorderPanelElement) return false;
  return element === recorderPanelElement || recorderPanelElement.contains(element);
}
```

而 `.recorder-toolbar` 是一个独立的元素，不是 `.recorder-panel` 的子元素，所以点击 toolbar 上的按钮时，`isInRecorderPanel` 返回 `false`，导致这些点击被错误地记录。

## 解决方案

修改 `isInRecorderPanel` 函数，同时检查 `.recorder-panel` 和 `.recorder-toolbar`：

```javascript
function isInRecorderPanel(element) {
  if (!element) return false;
  
  // 检查是否在 recorder-panel 内
  if (!recorderPanelElement) {
    recorderPanelElement = document.querySelector('.recorder-panel');
  }
  if (recorderPanelElement && (element === recorderPanelElement || recorderPanelElement.contains(element))) {
    return true;
  }
  
  // 检查是否在 recorder-toolbar 内
  const toolbar = document.querySelector('.recorder-toolbar');
  if (toolbar && (element === toolbar || toolbar.contains(element))) {
    return true;
  }
  
  return false;
}
```

## 修改文件

- `src/recorder/inject.js` - 修改 `isInRecorderPanel` 函数

## 验证方法

1. 启动录制器
2. 打开任意网页
3. 点击录制面板上的按钮（如"数据标注"、"分页标注"）
4. 确认这些操作没有被记录到步骤列表中
