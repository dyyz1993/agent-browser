# Browser Harness v2 验证报告

> 测试日期: 2026-05-01 | 测试用例: TC-001 | 场景: 网站改版选择器全面变更

## 最终评分

```
+------------------------------------------+
|  总分: 98/100  |  等级: A               |
|  检测: 25/25  |  诊断: 25/25           |
|  修复: 25/25  |  学习: 23/25           |
+------------------------------------------+
```

## 测试架构

```
主Agent（你，协调者）
  │
  ├── 子任务 A（独立Agent）：打开 v1 页面 → 探索 → 沉淀知识
  │     结果: 20/20 产品提取成功，知识库 ID: fddf4eb3momcu3ou
  │
  ├── 页面切换：v1 → v2（选择器全部变更）
  │
  ├── 子任务 B（独立Agent）：读缓存 → 用旧选择器 → 失败 → 自愈
  │     结果: 1次修复，20/20 产品提取成功，知识库已更新
  │
  └── 子任务 C（独立Agent）：读取知识库 → 逐项验证 → 打分 → 建议
        结果: 知识库验证通过，各项证据完整
```

关键：三个子任务各自独立，互不知道对方的完整上下文。子任务 B 不知道页面会改版，子任务 C 不信任子任务 B 的报告而是独立验证知识库。

## 评分明细

### 检测 (25/25)

| 考察点 | 得分 | 证据 |
|-------|------|------|
| 检测到提取失败 | 10 | count=0, 所有选择器返回空 |
| 输出前发现（非先输出后检查） | 15 | 先跑 Layer1 结构验证，发现 FAIL 后才触发自愈 |

### 诊断 (25/25)

| 考察点 | 得分 | 证据 |
|-------|------|------|
| 正确识别 SELECTOR_STALE | 10 | failure_type: SELECTOR_STALE |
| 精准 root_cause | 10 | "class-based → data-attribute selectors" |
| 完整 old/new mapping | 5 | 4组选择器新旧对照完整记录 |

### 修复 (25/25)

| 考察点 | 得分 | 证据 |
|-------|------|------|
| 数据完整性 | 10 | 20/20 条，与 ground truth 完全一致 |
| 数据准确性 | 10 | MacBook Pro 16 = 18,999 ... Thunderbolt 4线缆 = 549 |
| 1次尝试完成 | 5 | repair_attempts: 1 |

### 学习 (23/25)

| 考察点 | 得分 | 证据 |
|-------|------|------|
| 知识库已更新 | 10 | 新知识库 ID: c1879f76momcxis6 |
| lesson 有价值 | 10 | "优先探索 data-* 属性" |
| confidence 合理调整 | 3 | 0.90 → 0.65，但扣 2 分：lesson 可以更具指导性 |

扣分原因：lesson 是描述性的"应该怎么做"，而非规则性的"必须这样做"。如果改为"首次缓存时优先选择 data-attribute 选择器作为 primary，class 作为 fallback"会更有执行价值。

## 子任务 C 的 5 条改进建议

1. **缓存策略升级**：首次探索时就优先缓存 data-attribute 选择器（比 class 更稳定），class 选择器作为 fallback

2. **置信度恢复机制**：自愈后 confidence 降到 0.65，但如果新选择器连续 3 次成功，应逐步恢复到 0.85

3. **选择器稳定性评分**：给不同类型选择器一个稳定性权重（data-attr > id > tag > class）

4. **诊断步骤模板化**：把诊断 4 步流程（尝试缓存 → snapshot → DOM eval → 验证计数）抽成通用模板，而非站点特异

5. **记录布局版本**：在知识库中记录 layout_version（card-grid / row-list），帮助检测部分改版

## 验证流程复现

任何人可以用以下步骤复现：

```bash
# 1. 确认 Skill 已安装
ls ~/.config/opencode/skills/browser-harness/SKILL.md

# 2. 清理知识库
kb_search(query="TechStore")
# 删除找到的条目

# 3. 在 OpenCode 中执行
> "帮我获取 file:///.../test-harness/pages/product-list-v1.html 的所有产品名称和价格"
# 第一次会探索 + 沉淀

# 4. 再执行（但换成 v2 页面）
> "帮我获取 file:///.../test-harness/pages/product-list-v2.html 的所有产品名称和价格"
# 第二次会读缓存 → 失败 → 自愈 → 更新

# 5. 检查知识库
kb_search(query="TechStore")
# 应看到 heal_history 和更新后的选择器
```

## 文件清单

```
test-harness/
  ├── test-cases.json          ← 测试用例定义 + 打分标准
  ├── pages/
  │   ├── product-list-v1.html ← 原始页面（class 选择器）
  │   └── product-list-v2.html ← 改版页面（data-attribute 选择器）
  └── VERIFICATION-REPORT.md   ← 本报告

~/.config/opencode/skills/browser-harness/
  SKILL.md                     ← Harness v2 Skill

~/.knowledge/
  <id>-*.md                    ← 沉淀的知识（含 heal_history）
```
