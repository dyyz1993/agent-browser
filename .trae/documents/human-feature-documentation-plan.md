# 计划：完善 --human 功能的文档和测试

## 调研结果

### 当前状态

1. **help.ts** - ❌ 没有 `--human` 参数的文档
2. **skills/agent-browser/SKILL.md** - ❌ 没有 `--human` 的说明
3. **skills/agent-browser/references/commands.md** - ❌ 没有 `--human` 的命令参考
4. **测试文件** - ❌ 没有针对 `--human` 功能的测试

### 需要更新的文件

## 任务列表

### 1. 更新 help.ts 文档

在以下命令的帮助文本中添加 `--human` 参数：
- `click` - 添加 `--human [bezier|arc|random|linear]`
- `dblclick` - 添加 `--human [bezier|arc|random|linear]`
- `fill` - 添加 `--human [bezier|arc|random|linear]`
- `type` - 添加 `--human [bezier|arc|random|linear]`
- `hover` - 添加 `--human [bezier|arc|random|linear]`
- `mouse wander` - 添加 `--human [bezier|arc|random|linear]`

### 2. 更新 skills/agent-browser 文档

**SKILL.md**:
- 在 "Essential Commands" 部分添加 `--human` 示例
- 添加 "Human-like Mouse Movement" 章节

**references/commands.md**:
- 在交互命令部分添加 `--human` 参数说明

### 3. 添加测试

创建测试文件验证：
- CLI 参数解析正确
- 命令正确传递到 daemon
- 轨迹生成正确
- 各轨迹类型（arc, bezier, random, linear）都能工作

## 文档内容草案

### --human 参数说明

```
--human [bezier|arc|random|linear]
  Simulate human-like mouse movement with natural trajectories.
  
  Types:
    arc     - Smooth arc trajectory (default, most natural)
    bezier  - Bezier curve with slight overshoot
    random  - Random path with jitter
    linear  - Straight line (fastest)
  
  Features:
    - Continues from last mouse position
    - Natural acceleration/deceleration
    - Randomized delays
  
  Examples:
    agent-browser click "#btn" --human
    agent-browser click "#btn" --human arc
    agent-browser fill "#input" "text" --human bezier
    agent-browser hover ".menu" --human random
```

## 执行顺序

1. 更新 help.ts
2. 更新 SKILL.md
3. 更新 commands.md
4. 添加测试文件
5. 运行测试验证
