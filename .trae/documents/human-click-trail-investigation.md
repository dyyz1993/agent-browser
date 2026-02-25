# 调研：agent-browser click --human 轨迹不可见问题

## 问题描述
- `agent-browser mouse wander 5000` 能看到明显的鼠标轨迹
- `agent-browser click "#btn2" --human` 看不到轨迹

## 调研分析

### 1. 坐标计算方式

**handleClick 中的坐标计算：**
```typescript
const box = await locator.boundingBox();
const targetX = box.x + box.width / 2;  // 元素中心点 X
const targetY = box.y + box.height / 2;  // 元素中心点 Y
```

**boundingBox 返回值：**
- `box.x` - 元素左上角相对于**视口**的 X 坐标
- `box.y` - 元素左上角相对于**视口**的 Y 坐标
- `box.width` - 元素宽度
- `box.height` - 元素高度

### 2. 可能的问题原因

#### 原因 A：起始位置和目标位置距离太短
- `lastPos` 初始化为视口内随机位置
- 如果 `lastPos` 恰好在 `#btn2` 附近，距离很短
- 即使有 25 步，轨迹也很短，几乎看不到

#### 原因 B：wander 和 click 的区别
- `wander`：每次移动到**随机位置**，距离通常很大（几百像素）
- `click`：移动到**固定目标**，距离可能很小

#### 原因 C：轨迹步数计算
```typescript
const steps = Math.max(25, Math.floor(dist / preset.speed * 70));
```
- 如果 `dist = 100px`，`steps = max(25, 100/120*70) = max(25, 58) = 58`
- 如果 `dist = 50px`，`steps = max(25, 50/120*70) = max(25, 29) = 29`
- 步数足够，但**距离太短**导致轨迹不可见

### 3. 验证方案

在 `handleClick` 中添加详细日志：
```typescript
console.log('[handleClick] boundingBox:', box);
console.log('[handleClick] targetX:', targetX, 'targetY:', targetY);
```

在 `moveTo` 中添加日志：
```typescript
console.log('[moveTo] from:', lastPos, 'to:', to, 'dist:', dist, 'steps:', steps);
```

### 4. 解决方案

**方案 1：强制先移动到远离目标的位置**
在 `humanClick` 中，先移动到距离目标较远的随机位置，再移动到目标。

**方案 2：确保最小移动距离**
如果距离太短，先移动到远处再回来。

**方案 3：增加轨迹可视化**
在 canvas 上绘制轨迹点，便于调试。

## 下一步
1. 添加详细日志，运行命令查看实际坐标
2. 根据日志结果确定问题原因
3. 实施相应修复方案
