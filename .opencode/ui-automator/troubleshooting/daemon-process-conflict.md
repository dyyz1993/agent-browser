# Daemon 进程冲突排查

> 最后更新：2026-05-15 | 来源：v0.30.0 升级后实测

## 摘要
agent-browser 升级后，旧版 daemon 进程残留会导致所有 CLI 命令无限超时。需要手动清理。

## 症状

| 症状 | 原因 |
|------|------|
| `agent-browser status` 无输出然后超时 | 多个 daemon 进程竞争同一个端口/锁文件 |
| `agent-browser tabs` 超时 | daemon 进程无响应但未退出 |
| `agent-browser connect` 成功但后续命令卡住 | 连接到了错误的（旧的）daemon |
| `agent-browser click/fill/screenshot` 等操作超时 | daemon 间消息路由混乱 |

## 根本原因

1. agent-browser daemon 在 `SIGHUP`/终端关闭时可能不会自动退出
2. 升级版本后（如 v0.29.1 → v0.30.0），旧版 daemon 进程仍在运行
3. 新版 CLI 启动新 daemon，但旧 daemon 仍占用资源
4. 两个 daemon 进程竞争同一个端口，导致消息路由混乱

## 排查步骤

```bash
# 1. 检查所有 daemon 进程
ps aux | grep 'agent-browser/dist/daemon' | grep -v grep

# 2. 查看进程启动时间和 PID
ps -p <PID1>,<PID2> -o pid,lstart,args

# 3. 检查端口占用
lsof -i -P | grep LISTEN | grep node

# 4. 如果发现多个 daemon → 全部清理
# 注意：通过 PID kill，不要通过进程名 kill（避免误杀其他 Node 进程）
kill -9 <PID1> <PID2> ...

# 5. 验证已清理
ps aux | grep 'agent-browser/dist/daemon' | grep -v grep
# 应该无输出

# 6. 重新连接
agent-browser connect 9221
```

## 预防措施

### 启动前检查
```bash
# 在执行自动化任务前，先检查 daemon 状态
ps aux | grep 'agent-browser/dist/daemon' | grep -v grep | wc -l
# 如果 > 1，说明有残留，需要清理
```

### 一键清理脚本
```bash
# 清理所有 agent-browser daemon 进程（通过 PID，不通过进程名）
ps aux | grep 'agent-browser/dist/daemon.js' | grep -v grep | awk '{print $2}' | xargs kill -9 2>/dev/null
```

## 重要约束

- **端口 9221 是用户浏览器（cdp-tunnel），绝对不能 kill**
- daemon 进程的命令行是 `node .../agent-browser/dist/daemon.js`
- cdp-tunnel 进程完全不同，不会与 daemon 混淆
- kill 时必须用 PID，禁止用 `pkill agent-browser`（可能误杀用户的其他 agent-browser 相关进程）

## 是否需要框架级修复？

是的。这是 agent-browser 框架的 bug：
1. **daemon 应该检测端口冲突**: 启动时如果发现已有 daemon 在监听同一端口，应该复用或提示
2. **daemon 应该响应 graceful shutdown**: 收到 SIGTERM/SIGINT 时应该清理退出
3. **CLI 应该有 daemon 清理命令**: `agent-browser daemon cleanup` 或类似命令
4. **锁文件机制**: 使用 PID 锁文件防止多实例

**建议提 issue**: https://github.com/nicepkg/agent-browser/issues

## 变更记录
- 2026-05-15：初始创建（v0.30.0 升级后遇到，5 个残留 daemon 导致所有命令超时）
