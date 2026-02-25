# 录制器 API 统一重构方案

## 问题分析

当前录制器的 API 设计不够统一：
- `__recorderSync` 函数处理多种不同类型的操作
- 删除操作使用 `stepIndex` 而不是 `id`
- 没有统一的返回格式

## 设计方案

### 1. 统一 API 方法

暴露一个统一的方法 `window.__recorderAction`，处理所有操作：

```typescript
interface RecorderAction {
  type: 'add' | 'update' | 'delete' | 'list' | 'clear';
  data?: any;
  id?: string;  // 6位数的步骤ID
}

interface RecorderResponse {
  success: boolean;
  steps: Step[];  // 返回最新的步骤列表
  error?: string;
}
```

### 2. 步骤 ID 格式

使用 6 位数的 ID：
```javascript
function generateId() {
  return String(Date.now()).slice(-6);
}
// 例如: "123456"
```

### 3. 操作类型

| 操作 | 参数 | 返回 |
|------|------|------|
| `add` | `{ type: 'add', data: Step }` | `{ success: true, steps: [...] }` |
| `update` | `{ type: 'update', id: '123456', data: { annotation: {...} } }` | `{ success: true, steps: [...] }` |
| `delete` | `{ type: 'delete', id: '123456' }` | `{ success: true, steps: [...] }` |
| `list` | `{ type: 'list' }` | `{ success: true, steps: [...] }` |
| `clear` | `{ type: 'clear' }` | `{ success: true, steps: [] }` |

### 4. 修改文件

| 文件 | 修改内容 |
|------|------|
| `src/recorder/inject.js` | 1. 修改 ID 生成逻辑<br>2. 添加 `__recorderAction` 方法<br>3. 修改删除逻辑使用 ID<br>4. 修改更新逻辑使用 ID |

## 实现步骤

1. 修改 ID 生成逻辑，使用 6 位数
2. 添加 `__recorderAction` 统一方法
3. 修改 `deleteStep` 函数使用 ID 删除
4. 修改 `addToolAnnotation` 函数使用 ID 更新
5. 保持 `__recorderSync` 兼容性（内部调用 `__recorderAction`）
6. 重新构建并测试

## 代码示例

### ID 生成
```javascript
let stepIdCounter = 0;
function generateStepId() {
  stepIdCounter = (stepIdCounter + 1) % 1000000;
  return String(stepIdCounter).padStart(6, '0');
}
```

### 统一 API
```javascript
window.__recorderAction = function(action) {
  const steps = window.__recorderSteps || [];
  
  switch (action.type) {
    case 'add':
      const newStep = { ...action.data, id: generateStepId() };
      steps.push(newStep);
      window.__recorderSteps = steps;
      return { success: true, steps };
      
    case 'update':
      const updateIndex = steps.findIndex(s => s.id === action.id);
      if (updateIndex >= 0) {
        steps[updateIndex] = { ...steps[updateIndex], ...action.data };
        window.__recorderSteps = steps;
        return { success: true, steps };
      }
      return { success: false, steps, error: 'Step not found' };
      
    case 'delete':
      const deleteIndex = steps.findIndex(s => s.id === action.id);
      if (deleteIndex >= 0) {
        steps.splice(deleteIndex, 1);
        window.__recorderSteps = steps;
        return { success: true, steps };
      }
      return { success: false, steps, error: 'Step not found' };
      
    case 'list':
      return { success: true, steps };
      
    case 'clear':
      window.__recorderSteps = [];
      return { success: true, steps: [] };
      
    default:
      return { success: false, steps, error: 'Unknown action type' };
  }
};
```
