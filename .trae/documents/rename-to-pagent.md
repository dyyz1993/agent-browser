# 重命名计划：agent-browser → pagent

## 概述

将项目从 `agent-browser` 重命名为 `pagent`，发布到 npm 组织 `@dyyz1993/pagent`，全局命令为 `pagent`。

## 命名映射

| 原名称 | 新名称 |
|--------|--------|
| `agent-browser` (包名) | `@dyyz1993/pagent` |
| `agent-browser` (CLI 命令) | `pagent` |
| `AGENT_BROWSER_*` (环境变量) | `PAGENT_*` |
| `agent-browser-*` (二进制文件) | `pagent-*` |

## 环境变量映射

| 原变量名 | 新变量名 |
|----------|----------|
| `AGENT_BROWSER_SESSION` | `PAGENT_SESSION` |
| `AGENT_BROWSER_PROFILE` | `PAGENT_PROFILE` |
| `AGENT_BROWSER_CLI` | `PAGENT_CLI` |
| `AGENT_BROWSER_EXECUTABLE_PATH` | `PAGENT_EXECUTABLE_PATH` |
| `AGENT_BROWSER_ARGS` | `PAGENT_ARGS` |
| `AGENT_BROWSER_USER_AGENT` | `PAGENT_USER_AGENT` |
| `AGENT_BROWSER_PROXY` | `PAGENT_PROXY` |
| `AGENT_BROWSER_PROXY_BYPASS` | `PAGENT_PROXY_BYPASS` |
| `AGENT_BROWSER_PROVIDER` | `PAGENT_PROVIDER` |
| `AGENT_BROWSER_IOS_DEVICE` | `PAGENT_IOS_DEVICE` |
| `AGENT_BROWSER_IOS_UDID` | `PAGENT_IOS_UDID` |
| `AGENT_BROWSER_STREAM_PORT` | `PAGENT_STREAM_PORT` |
| `AGENT_BROWSER_HUMAN` | `PAGENT_HUMAN` |

## 实施步骤

### 1. 核心配置文件

#### 1.1 package.json
- 修改 `name`: `agent-browser` → `@dyyz1993/pagent`
- 修改 `bin`: `agent-browser` → `pagent`
- 修改 `description` 中的描述
- 修改 `repository.url`
- 修改 `bugs.url`
- 修改 `homepage`

#### 1.2 cli/Cargo.toml (Rust CLI)
- 修改 `name`: `agent-browser` → `pagent`
- 修改 `description`

### 2. 二进制文件和入口

#### 2.1 bin/agent-browser.js → bin/pagent.js
- 重命名文件
- 修改内部注释和说明
- 修改环境变量引用: `AGENT_BROWSER_CLI` → `PAGENT_CLI`
- 修改二进制文件名查找: `agent-browser-*` → `pagent-*`

### 3. 源代码文件

#### 3.1 环境变量引用 (34 个文件)
全局替换所有 `AGENT_BROWSER_` 前缀为 `PAGENT_`：

- `src/browser.ts`
- `src/actions.ts`
- `src/browser.test.ts`
- `src/protocol.ts`
- `src/cli/help.ts`
- `src/cli/connection.ts`
- `src/cli/flags.ts`
- `src/cli.ts`
- `src/stream-server.ts`
- `src/human-mouse.ts`
- `src/snapshot.ts`
- `src/daemon.ts`
- `src/stream-server-standalone.ts`
- `src/ios-manager.ts`
- `src/daemon.test.ts`
- 以及所有测试文件

#### 3.2 CLI 命令引用 (62 个文件)
全局替换命令调用 `agent-browser` → `pagent`：

- 所有 `src/__tests__/*.test.ts` 测试文件
- `src/cli/help.ts` (帮助文本)
- `src/cli/commands.ts`
- `src/cli/connection.ts`
- `src/cli.ts`

### 4. Rust CLI 源代码

#### 4.1 cli/src/*.rs
- `cli/src/main.rs`
- `cli/src/commands.rs`
- `cli/src/connection.rs`
- `cli/src/output.rs`
- `cli/src/flags.rs`
- `cli/src/install.rs`

修改：
- 环境变量前缀: `AGENT_BROWSER_` → `PAGENT_`
- 帮助文本中的命令名
- 错误消息中的命令名

### 5. 文档文件

#### 5.1 README.md
- 标题和描述
- 所有命令示例
- 环境变量说明
- 安装说明
- GitHub 仓库链接

#### 5.2 其他文档
- `QUICKSTART.md`
- `CHANGELOG.md`
- `API_DOCUMENTATION.md`
- `README_JD_SCRAPER.md`
- `docs/src/app/*.mdx` (所有文档页面)

#### 5.3 skills 目录
- `skills/agent-browser/SKILL.md` → `skills/pagent/SKILL.md`
- `skills/agent-browser/references/*.md`

### 6. 构建和部署脚本

#### 6.1 scripts/
- 检查是否有引用 `agent-browser` 的脚本

#### 6.2 docker/
- `docker/docker-compose.yml` - 修改镜像名和容器名

### 7. 测试文件

#### 7.1 所有测试文件
- 修改命令调用
- 修改环境变量
- 修改断言中的字符串

## 执行顺序

1. **核心配置** - package.json, Cargo.toml
2. **入口文件** - bin/pagent.js
3. **源代码** - 所有 .ts 文件中的环境变量和命令引用
4. **Rust 代码** - cli/src/*.rs
5. **文档** - README.md, skills/, docs/
6. **测试** - 所有测试文件
7. **构建脚本** - scripts/, docker/
8. **验证** - 运行测试确保功能正常

## 验证清单

- [ ] `pnpm build` 构建成功
- [ ] `pnpm build:native` Rust CLI 构建成功
- [ ] `pnpm test` 所有测试通过
- [ ] `pagent --help` 显示正确的命令名
- [ ] `pagent open example.com` 功能正常
- [ ] 环境变量 `PAGENT_SESSION` 正常工作
- [ ] 文档中所有命令示例正确

## 注意事项

1. **向后兼容**: 考虑是否需要保留旧环境变量的支持（可选）
2. **发布策略**: 首次发布使用新版本号，在 CHANGELOG 中说明重命名
3. **GitHub 仓库**: 可能需要重命名仓库或创建新仓库
4. **npm 发布**: 使用 `npm publish --access public` 发布 scoped package
