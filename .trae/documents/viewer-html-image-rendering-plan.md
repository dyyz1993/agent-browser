# Viewer HTML 图片渲染方案分析

## 问题背景

当前 `viewer-html.ts` 使用 `<img>` 元素来显示从 WebSocket 接收的浏览器截图帧。用户反馈图片存在移动问题（可能是浏览器默认的拖拽行为）。

## 当前实现分析

```html
<img id="screen" style="display: none;">
```

当前存在的问题：
1. `<img>` 元素默认可以被拖拽
2. 浏览器可能有其他默认行为（如右键菜单、长按等）
3. 高频更新场景下（最高 60fps），频繁设置 `src` 属性可能不够高效

## 方案对比

### 方案一：禁止图片默认事件

**实现方式**：
```html
<img id="screen" style="display: none;" draggable="false">
```

```css
#screen {
  -webkit-user-drag: none;
  user-select: none;
  -webkit-user-select: none;
  pointer-events: none; /* 或者保留 pointer-events 以便交互 */
}
```

```javascript
screen.addEventListener('dragstart', (e) => e.preventDefault());
```

**优点**：
- 实现简单，改动最小（约 5-10 行代码）
- 性能开销几乎为零
- 不影响现有的帧处理逻辑
- 调试方便，可以直接看到图片

**缺点**：
- 可能还有其他浏览器默认行为需要处理
- 高频更新时，频繁创建 Blob URL 和设置 `src` 可能有性能开销
- 内存管理需要依赖 `URL.revokeObjectURL`

---

### 方案二：改用 Canvas

**实现方式**：
```html
<canvas id="screen" style="display: none;"></canvas>
```

```javascript
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');

function handleBinary(data) {
  if (!pendingBinary) return;
  pendingBinary = false;
  
  const blob = new Blob([data], {
    type: metadata.format === 'webp' ? 'image/webp' : 'image/jpeg'
  });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  
  img.onload = () => {
    // 设置 canvas 尺寸（只需在尺寸变化时设置）
    if (canvas.width !== metadata.deviceWidth || canvas.height !== metadata.deviceHeight) {
      canvas.width = metadata.deviceWidth;
      canvas.height = metadata.deviceHeight;
    }
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    connecting.style.display = 'none';
    canvas.style.display = 'block';
  };
  img.src = url;
}
```

**优点**：
- 完全控制渲染，不会有任何默认拖拽行为
- 更适合高频更新的场景
- 可以实现更复杂的图像处理（如缩放、标注、覆盖层等）
- 不需要频繁操作 DOM 的 `src` 属性
- 未来可以扩展功能（如绘制鼠标位置、选区等）

**缺点**：
- 代码复杂度增加
- 需要处理 DPI 缩放问题（高分辨率屏幕）
- 需要额外解码步骤（创建 Image 对象再绘制到 Canvas）
- 可能引入额外的内存开销

---

## 性能分析

### 帧率配置（来自 stream-server.ts）

| 状态 | 格式 | 质量 | 最大 FPS |
|------|------|------|----------|
| user_interacting | jpeg | 10 | 60 |
| screen_moving | webp | 50 | 2 |
| static | webp | 80 | 0.5 |

### 性能考虑

1. **Blob URL 创建/销毁频率**：
   - 最高 60fps 意味着每秒创建/销毁 60 个 Blob URL
   - 两种方案都需要这个过程（Canvas 也需要先解码图片）

2. **内存使用**：
   - `<img>` 方案：浏览器自动管理图片内存
   - Canvas 方案：需要手动管理 Canvas 尺寸，可能有额外的 Image 对象内存

3. **渲染效率**：
   - `<img>` 方案：浏览器原生渲染，GPU 加速
   - Canvas 方案：同样有 GPU 加速，但多了一层绘制

---

## 推荐方案

### 推荐：方案一（禁止图片默认事件）

**理由**：
1. **改动最小**：只需添加几行 CSS 和一个属性
2. **风险最低**：不改变现有的帧处理逻辑
3. **性能相当**：对于当前的使用场景，两种方案性能差异可以忽略
4. **维护简单**：代码更简洁，更容易理解和维护

**具体实现**：

```css
#screen {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  cursor: crosshair;
  /* 新增：禁止拖拽和选择 */
  -webkit-user-drag: none;
  user-select: none;
  -webkit-user-select: none;
}
```

```html
<img id="screen" style="display: none;" draggable="false">
```

```javascript
// 可选：额外阻止拖拽事件
screen.addEventListener('dragstart', (e) => e.preventDefault());
```

---

### 备选：方案二（Canvas）

如果未来需要以下功能，可以考虑迁移到 Canvas：
- 在画面上绘制标注（如鼠标轨迹、选区框）
- 实现图像滤镜或调整
- 需要像素级操作
- 需要更复杂的缩放/平移功能

---

## 实施计划

### 方案一实施步骤

1. 修改 CSS 样式，添加禁止拖拽相关属性
2. 给 `<img>` 元素添加 `draggable="false"` 属性
3. （可选）添加 `dragstart` 事件监听器

### 预期改动文件

- `src/viewer-html.ts`：约 5-10 行改动

---

## 总结

对于当前的需求（禁止图片移动/拖拽），**方案一（禁止图片默认事件）是最佳选择**。它实现简单、风险低、性能好，且完全满足需求。Canvas 方案虽然更灵活，但增加了不必要的复杂度。
