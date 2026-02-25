## 修复计划

### 1. 修复 `frame` 命令
- 添加 `--url` 和 `--name` 参数支持
- 保持与 Rust 版本一致的输出格式

### 2. 修复 `set media` 命令
- 输出 `colorScheme` 和 `reducedMotion` 字段
- 支持 `dark`、`light`、`no-preference` 和 `reduced-motion` 参数

### 3. 修复 `set offline` 命令
- 输出 `offline` 字段（而不是 `enabled`）

### 4. 修复 `network route` 命令
- 使用 `body` 字段（而不是 `response`）

### 5. 创建单元测试文件 `bin/cli.test.ts`
- 参考 Rust 版本的测试用例
- 覆盖所有命令的解析逻辑
- 确保输出与 Rust 版本一致

### 涉及的文件
- `bin/cli.ts` - 修复命令解析逻辑
- `bin/cli.test.ts` - 新建测试文件