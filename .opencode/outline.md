# 项目大纲

## 会话信息
- **会话ID**: ses_20260505_snapshot_selector
- **创建时间**: 2026-05-05
- **最后更新**: 2026-05-05

## 用户需求记录

### 需求 1：Snapshot ID + 稳定选择器系统（2026-05-05）
用户希望在 `snapshot -i` 输出中：
1. 每个 snapshot 有唯一 ID（如 snap_3）
2. 可通过 `snapshot_id + index/ref` 获取稳定的元素选择器（最短路径、最有语义）
3. 即使跑了几轮后，也能重新收集元素选择器
4. 输出底部增加 Tips 提示如何获取选择器

### 设计决策
- **选择器策略**: 两者结合 — 复用 inject.js 的 8 策略算法为主，保留 generateCSSPath 作为 fallback
- **输出风格**: 仅 Tips + 按需查询（snapshot -i 不内联选择器，通过 --selector-for 查询）
- **存储**: 纯内存（daemon 生命周期内有效）

## 任务分解

### T1: SnapshotStore 内存存储
- 创建 SnapshotStore 模块
- 存储 snapshot_id → { elements } 映射
- 递增 ID 生成器
- 状态: pending

### T2: 增强选择器生成器
- 从 inject.js 提取 getSelectorInternal() 的 8 策略核心逻辑
- 适配为 snapshot 流程中可用的 browser-evaluated 脚本
- 保留 generateCSSPath/generateXPath 作为 fallback
- 每个策略验证唯一性
- 状态: pending

### T3: snapshot -i 输出增强
- 输出顶部显示 Snapshot #snap_N (N elements)
- 底部显示 Tips 区块
- 选择器生成后存入 SnapshotStore
- 状态: pending

### T4: --selector-for 命令
- CLI 新 flag: `--selector-for snap_3:@e1` 或 `snap_3:1`
- 从 SnapshotStore 查询，输出 CSS selector + XPath
- 状态: pending

### T5: --selectors-of 命令
- CLI 新 flag: `--selectors-of snap_3`
- 批量列出该快照所有元素的选择器
- 状态: pending

### T6: --validate 命令
- CLI 新 flag: `--validate snap_3`
- 在当前页面验证旧选择器是否仍然匹配
- 输出 ✓/✗ 验证结果
- 状态: pending

### T7: CLI 参数解析（Rust 侧）
- commands.rs 新增 --selector-for, --selectors-of, --validate flag 定义
- 状态: pending

## 执行记录
（暂无）

## 关键决策

### KD1: 选择器生成策略
- **决策**: 两者结合
- **理由**: inject.js 的 8 策略算法最完善（有唯一性验证），generateCSSPath 作为 fallback 保证覆盖率
- **备选**: 纯 inject.js / 纯增强 generateCSSPath

### KD2: 输出风格
- **决策**: 仅 Tips + 按需查询
- **理由**: 保持 snapshot -i 输出简洁，选择器信息量大适合按需查询
- **备选**: 内联显示 / 可配置

### KD3: 存储策略
- **决策**: 纯内存
- **理由**: daemon 生命周期内够用，无需持久化复杂度
- **备选**: 文件持久化 / 内存+导出

## 进度跟踪
- [ ] T1: SnapshotStore 内存存储
- [ ] T2: 增强选择器生成器
- [ ] T3: snapshot -i 输出增强
- [ ] T4: --selector-for 命令
- [ ] T5: --selectors-of 命令
- [ ] T6: --validate 命令
- [ ] T7: CLI 参数解析（Rust 侧）

## 技术栈
- TypeScript (snapshot.ts, browser.ts)
- Rust (cli/src/commands.rs)
- Playwright (browser automation)
- Browser-evaluated scripts (selector generation)

## 详细设计规格

### 一、SnapshotStore 设计

```typescript
// src/snapshot-store.ts（新文件）

interface SnapshotElement {
  ref: string;           // "e1"
  index: number;         // 1
  role: string;          // "button"
  name?: string;         // "百度一下"
  cssSelector: string;   // "#su"
  xpath: string;         // "//*[@id='su']"
}

interface SnapshotEntry {
  id: string;            // "snap_3"
  timestamp: number;
  url: string;
  framePath?: string;
  elements: Map<string, SnapshotElement>;  // key = ref ("e1")
}

class SnapshotStore {
  private snapshots: Map<string, SnapshotEntry> = new Map();
  private counter: number = 0;

  create(url: string, elements: SnapshotElement[], framePath?: string): string {
    const id = `snap_${++this.counter}`;
    const elementMap = new Map(elements.map(e => [e.ref, e]));
    this.snapshots.set(id, { id, timestamp: Date.now(), url, framePath, elements: elementMap });
    return id;
  }

  get(id: string): SnapshotEntry | undefined {
    return this.snapshots.get(id);
  }

  getElement(snapId: string, refOrIndex: string): SnapshotElement | undefined {
    const entry = this.snapshots.get(snapId);
    if (!entry) return undefined;
    
    // 尝试作为 ref 查找 (e.g., "e1")
    const ref = refOrIndex.startsWith('@') ? refOrIndex.slice(1) : refOrIndex;
    
    if (entry.elements.has(ref)) {
      return entry.elements.get(ref);
    }
    
    // 尝试作为 index 查找 (e.g., "1")
    const index = parseInt(refOrIndex, 10);
    if (!isNaN(index)) {
      for (const el of entry.elements.values()) {
        if (el.index === index) return el;
      }
    }
    
    return undefined;
  }
}
```

### 二、选择器生成器设计

#### 核心算法（从 inject.js 移植，在 browser context 中执行）

```javascript
// 在 browser 中 evaluate 的脚本
function generateStableSelector(element, root = document) {
  // 策略 1: ID
  if (element.id) {
    const sel = '#' + CSS.escape(element.id);
    if (isUnique(root, sel)) return sel;
  }
  
  // 策略 2: data-testid
  const testid = element.getAttribute('data-testid');
  if (testid) {
    const sel = '[data-testid="' + CSS.escape(testid) + '"]';
    if (isUnique(root, sel)) return sel;
  }
  
  // 策略 3: name attribute
  const nameAttr = element.getAttribute('name');
  if (nameAttr) {
    const sel = element.tagName.toLowerCase() + '[name="' + nameAttr + '"]';
    if (isUnique(root, sel)) return sel;
  }
  
  // 策略 4: aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    const sel = element.tagName.toLowerCase() + '[aria-label="' + ariaLabel + '"]';
    if (isUnique(root, sel)) return sel;
  }
  
  // 策略 5: 语义 class
  const usefulClasses = filterUsefulClasses(element);
  if (usefulClasses.length > 0) {
    // 尝试单个 class
    for (const cls of usefulClasses) {
      const sel = element.tagName.toLowerCase() + '.' + CSS.escape(cls);
      if (isUnique(root, sel)) return sel;
    }
    // 尝试 class 组合
    const sel = element.tagName.toLowerCase() + '.' + 
      usefulClasses.slice(0, 2).map(c => CSS.escape(c)).join('.');
    if (isUnique(root, sel)) return sel;
  }
  
  // 策略 6: class + attribute 组合
  if (usefulClasses.length > 0) {
    const attrs = ['name', 'role', 'aria-label', 'type', 'placeholder'];
    for (const cls of usefulClasses.slice(0, 1)) {
      for (const attr of attrs) {
        const val = element.getAttribute(attr);
        if (val) {
          const sel = element.tagName.toLowerCase() + '.' + CSS.escape(cls) +
            '[' + attr + '="' + val + '"]';
          if (isUnique(root, sel)) return sel;
        }
      }
    }
  }
  
  // 策略 7: 组合路径（向上有语义锚点的祖先）
  const composed = buildComposedSelector(element, root);
  if (composed) return composed;
  
  // 策略 8: fallback — generateCSSPath（现有逻辑）
  return generateCSSPathFallback(element);
}

function isUnique(root, selector) {
  try {
    return root.querySelectorAll(selector).length === 1;
  } catch { return false; }
}

function filterUsefulClasses(element) {
  // 复用 inject.js 的 STYLE_CLASS_PATTERNS 过滤 Tailwind/utility classes
  return Array.from(element.classList).filter(cls => {
    return !STYLE_CLASS_PATTERNS.some(p => p.test(cls));
  });
}

function buildComposedSelector(element, root) {
  const parts = [getElementSelector(element)];
  let current = element.parentElement;
  let depth = 0;
  const maxDepth = 4;
  
  while (current && current !== document.body && depth < maxDepth) {
    // 找到有语义锚点的祖先就停
    if (current.id || current.getAttribute('data-testid')) {
      const anchor = current.id ? '#' + CSS.escape(current.id) : 
        '[data-testid="' + current.getAttribute('data-testid') + '"]';
      parts.unshift(anchor);
      const sel = parts.join(' > ');
      if (isUnique(root, sel)) return sel;
      break;
    }
    
    parts.unshift(getElementSelector(current));
    current = current.parentElement;
    depth++;
  }
  
  // 验证最终路径
  const sel = parts.join(' > ');
  return isUnique(root, sel) ? sel : null;
}
```

#### XPath 生成

复用现有 `generateXPath()` 逻辑（已经较完善），增加唯一性验证。

### 三、CLI 交互设计

#### snapshot -i（增强后）

```
Snapshot #snap_3 (3 interactive elements)
---
[1] searchbox "搜索" ref=@e1
[2] button "百度一下" ref=@e2
[3] link "新闻" ref=@e3
---
Tips:
  Get selector:  snapshot --selector-for snap_3:@e1
  Or by index:   snapshot --selector-for snap_3:1
  List all:      snapshot --selectors-of snap_3
  Validate:      snapshot --validate snap_3
```

#### snapshot --selector-for snap_3:@e1

```
snap_3 @e1 (searchbox "搜索")
  CSS:      #kw
  XPath:    //*[@id="kw"]
```

#### snapshot --selectors-of snap_3

```
snap_3 Selectors (3 elements):
  [1] @e1 searchbox "搜索"     →  #kw
  [2] @e2 button "百度一下"     →  #su
  [3] @e3 link "新闻"           →  a.to-news
```

#### snapshot --validate snap_3

```
snap_3 Selector Validation (3 elements):
  [1] @e1 #kw           →  ✓ valid (1 match)
  [2] @e2 #su           →  ✓ valid (1 match)
  [3] @e3 a.to-news     →  ✗ no match (element removed)
---
Tips: Re-run 'snapshot -i' for fresh selectors.
```

### 四、集成流程

#### snapshot 命令入口修改

```
snapshot -i 执行流程:
  1. 现有 getEnhancedSnapshot() → 获取 ref 树
  2. [新] generateStableSelectors(page, refs) → 为每个 ref 生成稳定选择器
     - 在 browser context 中执行 8 策略算法
     - 返回 { ref → { cssSelector, xpath } } 映射
  3. [新] SnapshotStore.create(url, elements) → 存储，获得 snap_N ID
  4. 格式化输出（现有格式 + snapshot header + tips）
```

#### --selector-for 执行流程

```
  1. 解析参数: snap_3:@e1 → snapId="snap_3", refOrIndex="e1"
  2. SnapshotStore.getElement("snap_3", "e1") → SnapshotElement
  3. 格式化输出 CSS + XPath
```

#### --validate 执行流程

```
  1. SnapshotStore.get("snap_3") → SnapshotEntry
  2. 对每个 element.cssSelector 执行 page.querySelectorAll(selector)
  3. 报告匹配数: 0 → ✗, 1 → ✓, >1 → ⚠ (multiple matches)
```

### 五、影响范围

| 文件 | 变更类型 | 描述 |
|------|----------|------|
| src/snapshot-store.ts | 新建 | SnapshotStore 类 |
| src/snapshot.ts | 修改 | 集成选择器生成 + SnapshotStore |
| src/browser.ts | 修改 | 暴露 SnapshotStore 实例 |
| cli/src/commands.rs | 修改 | 新增 --selector-for, --selectors-of, --validate |
| src/cli/help.ts | 修改 | 帮助文档更新 |
| skills/agent-browser/SKILL.md | 修改 | 技能文档更新 |
