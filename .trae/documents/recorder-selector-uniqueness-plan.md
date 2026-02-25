# 录制器选择器唯一性优化规划

## 背景

录制器生成的选择器需要确保唯一性，否则回放时会失败。例如：
- 原问题：`a:nth-child(2)` 匹配了 42 个元素
- 原因：选择器生成时没有验证唯一性

## 当前状态

### 已完成 ✅

1. **CSS 选择器唯一性验证** ([inject.js](file:///Users/xuyingzhou/Project/temporary/agent-browser/src/recorder/inject.js))
   - ✅ `isUniqueSelector()` - 验证选择器唯一性
   - ✅ `getBaseSelector()` - 获取基础选择器
   - ✅ `makeUniqueWithNth()` - 添加 nth-child 索引
   - ✅ `buildUniquePath()` - 向上构建父元素路径
   - ✅ `getSelector()` - 按优先级生成唯一选择器

2. **XPath 唯一性验证** 
   - ✅ `isUniqueXPath()` - 验证 XPath 唯一性
   - ✅ `buildUniqueXPath()` - 构建唯一 XPath
   - ✅ `getXPath()` - 按优先级生成唯一 XPath

3. **性能优化**
   - ✅ `selectorCache` - CSS 选择器缓存 (WeakMap)
   - ✅ `xpathCache` - XPath 缓存 (WeakMap)

4. **Shadow DOM 支持**
   - ✅ `getShadowHost()` - 获取 Shadow DOM 宿主
   - ✅ `getSelectorWithShadow()` - 生成 Shadow DOM 选择器
   - ✅ `getSelectorInternal()` - 内部选择器生成

5. **E2E 测试** (10/13 通过)
   - ✅ ID 选择器测试
   - ✅ 语义属性选择器测试
   - ✅ nth-child 选择器测试
   - ✅ 路径选择器测试
   - ✅ 分页链接测试
   - ✅ 动态 class 过滤测试
   - ❌ Shadow DOM 测试 (浏览器兼容性问题)
   - ❌ Recorder Integration 测试 (超时)

### 待解决问题

1. **Shadow DOM 测试失败**
   - 原因：Declarative Shadow DOM 在 Playwright headless 模式下不被支持
   - 解决方案：使用 JavaScript 动态创建 Shadow DOM 或跳过该测试

2. **Recorder Integration 测试超时**
   - 原因：可能是页面状态问题
   - 解决方案：需要调试或增加超时时间

## 任务列表

| # | 任务 | 优先级 | 状态 |
|---|------|--------|------|
| 1 | XPath 唯一性验证 | 高 | ✅ 完成 |
| 2 | Shadow DOM 支持 | 中 | ✅ 完成 (测试待修复) |
| 3 | 选择器缓存优化 | 中 | ✅ 完成 |
| 4 | 置信度评分 | 低 | 待实现 |
| 5 | 修复 Shadow DOM 测试 | 中 | 待实现 |
| 6 | 修复 Recorder Integration 测试 | 中 | 待实现 |

## 下一步行动

### 选项 A: 修复测试
1. 修改 Shadow DOM 测试页面，使用 JavaScript 动态创建 Shadow DOM
2. 调试 Recorder Integration 测试超时问题

### 选项 B: 跳过问题测试
1. 标记 Shadow DOM 测试为 skip（浏览器兼容性限制）
2. 简化 Recorder Integration 测试

### 选项 C: 继续其他优化
1. 实现置信度评分
2. 添加更多边界情况测试

## 预期效果

| 场景 | 优化前 | 优化后 |
|------|--------|--------|
| 分页链接 | `a` (42 个匹配) | `a.page-link:nth-child(3)` (唯一) |
| 动态 class | `div.css-abc123` | `div:nth-child(1)` |
| 嵌套元素 | `span` | `div.level-1 > div.level-2 > span.target` |
| Shadow DOM | 不支持 | `my-component >>> button` |
