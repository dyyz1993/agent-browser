# Browser Harness 操作手册

> 浏览器自动化的知识沉淀闭环系统 —— 探索 → 沉淀 → 复用 → 自愈

## 它是什么

一个带 **验证 + 诊断 + 自愈** 能力的浏览器自动化闭环系统。与 v1 的区别：

| 能力 | v1 | v2 (当前) |
|------|----|-----------|
| 缓存复用 | 有 | 有 |
| 失败重试 | 有（盲目重试） | 有（带诊断） |
| 数据验证 | 无 | 3 层验证（结构/语义/对比） |
| 失败诊断 | 无 | 6 种失败类型分类 |
| 自愈学习 | 无 | 记录 lesson，跨会话积累经验 |
| 置信度管理 | 简单衰减 | 基于实际表现的动态评分 |

## 验收结果

四轮验证全部通过：

| 轮次 | 模式 | 核心行为 | 结果 |
|------|------|---------|------|
| 第1轮 | 探索模式 | open → snapshot → 提取 → kb_write | 沉淀成功 |
| 第2轮 | 复用模式 | kb_search → 命中缓存 → 跳过 snapshot | 数据一致 |
| 第3轮 | 自愈模式（v1） | 缓存失效 → 返回 null → 重试 | 能修复，但无诊断 |
| 第4轮 | 自愈模式（v2） | 缓存失效 → 结构验证失败 → 诊断 SELECTOR_STALE → 重探索 → 记录 lesson | 带诊断的完整自愈 |

v2 自愈的关键输出：

```json
{
  "diagnosis": {
    "failure_type": "SELECTOR_STALE",
    "root_cause": "Selectors changed: class-based → tag-based",
    "old_selectors": {".broken-heading-xxx": "h1"},
    "new_selectors": {".broken-desc-xxx": "div > p:first-of-type"},
    "lesson": "This page uses semantic HTML tags, not class-based selectors"
  }
}
```

## 文件结构

```
~/.config/opencode/skills/browser-harness/
  SKILL.md              ← Harness v2 规则（自动加载）

~/.knowledge/
  <id>-*.md             ← 沉淀的知识文档（含验证规则 + 失败历史）
```

## 系统架构

```
提取数据
  ↓
【Layer 1: 结构验证】null? 类型错? 字段缺失? → FAIL → 自愈
  ↓ PASS
【Layer 2: 语义验证】值异常? 数量突变? 格式变? → 多个 WARNING → 自愈
  ↓ PASS
【Layer 3: 对比验证】和上次结果差异 > 阈值? → FAIL → 自愈
  ↓ PASS
  输出结果
```

### 6 种失败类型诊断

| 失败类型 | 信号 | 严重度 | 修复策略 |
|---------|------|--------|---------|
| SELECTOR_STALE | 所有缓存选择器返回 null | 高 | 重新 snapshot |
| SELECTOR_PARTIAL | 部分选择器返回 null | 中 | 只修复失效的选择器 |
| COUNT_MISMATCH | 数据量超出预期范围 | 中 | 检查数据源是否变更 |
| VALUE_ANOMALY | 值与上次差异巨大 | 低 | 可能是正常数据变化 |
| API_DOWN | fetch 返回错误状态 | 高 | 降级为 DOM 提取 |
| API_CHANGED | fetch 返回格式变更 | 高 | 重新 network 监控 |

## 知识库 Schema (v2)

每个沉淀文档包含：

```json
{
  "site": "example.com",
  "task_type": "page-info",
  "url": "...",

  "api": { "endpoint": "...", "method": "GET", "full_url": "..." },
  "selectors": { "field": "css-selector" },
  "workflow": [{ "step": 1, "action": "...", "target": "..." }],

  "validation_rules": {
    "expected_fields": ["title", "desc"],
    "field_types": { "title": "string", "price": "number" },
    "expected_count": { "min": 900, "max": 1100 },
    "field_constraints": { "price": { "min": 0, "max": 100000 } }
  },

  "last_extraction": {
    "count": 1000,
    "sample": { "...": "..." },
    "timestamp": "..."
  },

  "confidence": 1.0,
  "last_success": "2026-05-01",
  "failure_history": [{ "date": "...", "failure_type": "SELECTOR_STALE" }],
  "heal_history": [{
    "date": "...",
    "failure_type": "SELECTOR_STALE",
    "old_selectors": { "...": "..." },
    "new_selectors": { "...": "..." },
    "root_cause": "...",
    "lesson": "..."
  }]
}
```

关键新增：
- `validation_rules` — 定义"正确"长什么样
- `last_extraction` — 存上次结果用于对比
- `failure_history` — 失败记录
- `heal_history` — 自愈记录 + lesson（核心价值）

## 使用方式

Skill 已安装，自动激活。直接下任务即可：

```
你: 帮我去 example.com 获取页面信息

Agent 自动:
  1. kb_search("example.com") → 命中
  2. 用缓存选择器 eval 提取
  3. 跑 Layer 1 结构验证 → PASS
  4. 返回结果（省掉 snapshot）

你: 帮我去 xxx.com 抓数据（新站点）

Agent 自动:
  1. kb_search("xxx.com") → 空
  2. 探索：open → network → snapshot → 提取
  3. 跑验证 → PASS
  4. kb_write 沉淀（含 validation_rules）
```

## 知识库管理

```bash
# 查看所有沉淀
kb_search(query="browser-automation")

# 清除某个站点缓存
kb_search(query="example.com")
rm ~/.knowledge/<id>-*.md

# 强制重新探索
在对话中说："忽略缓存，重新探索 xxx.com"
```

## 置信度机制

| 事件 | 变化 |
|------|------|
| 首次成功提取 | 1.0 |
| 每次成功复用 | +0.05 (max 1.0) |
| 自愈成功（1次尝试） | -0.1 (min 0.5) |
| 自愈成功（多次尝试） | -0.2 (min 0.3) |
| 无法自愈 | -0.3 → 标记需人工 |
| 7天未更新 | 每周衰减 0.1 |

## 扩展方向

- **语义验证加强**：用 LLM 判断提取内容是否合理（价格是否在正常范围）
- **跨站点模板**：沉淀通用模式（登录、翻页、虚拟滚动），跨站点复用
- **主动巡检**：cron 定时验证缓存是否仍然有效
- **lesson 复用**：新的提取任务先查 heal_history 的 lesson，优先使用历史证明稳定的选择器策略
