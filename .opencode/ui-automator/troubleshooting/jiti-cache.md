# jiti 编译缓存问题排查

> 最后更新：2026-05-12 | 来源：opencode-usage 插件开发

## 问题现象

修改 agent-browser 插件的 `index.ts` 文件后，`plugin run` 仍然执行旧的代码逻辑（旧错误信息、旧行为）。

即使 `plugin uninstall` + `plugin install` 重装后问题依旧。

## 根因

agent-browser 的插件系统使用 [jiti](https://github.com/unjs/jiti) 实时编译 TypeScript 插件。jiti 有两层缓存：

1. **In-memory cache**（进程级别）— `PluginCache` Map（按 mtime 校验）
2. **Disk cache**（持久化）— 编译产物缓存到 `os.tmpdir()/jiti/`

## 排查步骤

### 1. 确认文件内容已更新

```bash
diff /tmp/my-plugin/index.ts ~/.agent-browser/plugins/my-plugin/index.ts
grep "关键字符串" ~/.agent-browser/plugins/my-plugin/index.ts
```

### 2. 清除 jiti 磁盘缓存

```bash
rm -rf $(node -e "console.log(require('os').tmpdir())")/jiti
# macOS 通常在:
rm -rf /var/folders/*/*/T/jiti
```

### 3. 重启 agent-browser daemon

```bash
# 找到 daemon 进程并 kill
lsof -ti :5005 | xargs kill -9
```

### 4. 终极方案：换插件名

如果以上步骤无效，创建同名但改名的新插件可绕过缓存：

```bash
cp -r /tmp/my-plugin /tmp/my-plugin-v2
# 修改 index.ts 中 meta.name
agent-browser plugin install /tmp/my-plugin-v2
```

## 预防措施

1. 插件开发完成后尽量减少源码修改
2. 需要频繁迭代时，每次用 `plugin uninstall + plugin install` 完整流程
3. 发现旧代码执行时，同时清理磁盘缓存和重启 daemon

## 变更记录
- 2026-05-12：初始创建（opencode-usage 插件遇到 jiti 缓存问题）
