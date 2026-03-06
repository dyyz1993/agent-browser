# 测试验证和代码提交计划

## 背景

之前修复了 recorder 测试失败的问题，原因是 Playwright 的 `addInitScript` 累积导致事件监听器泄漏。修改了以下文件：
- `src/recorder/inject.js` - 添加会话时间戳检查
- `src/browser.ts` - 保留 xyzSessionId 不清除

## 当前状态

- 修改的文件：`src/browser.ts`, `src/recorder/inject.js`
- 已验证 recorder 相关测试通过（141 个测试）
- 还需要验证所有测试是否通过

## 测试文件分类

### 1. E2E 测试（需要浏览器）
- recorder 相关测试（11 个文件，已验证通过）
- 其他 e2e 测试（22 个文件）

### 2. 单元测试（不需要浏览器）
- cli.*.test.ts（约 20 个文件）
- 其他单元测试

## 实施步骤

### 步骤 1：运行类型检查
```bash
npm run typecheck
```

### 步骤 2：运行所有测试
```bash
npm run test
```

### 步骤 3：如果测试失败，分析并修复
- 记录失败的测试
- 分析失败原因
- 修复问题

### 步骤 4：提交代码
```bash
git add src/browser.ts src/recorder/inject.js
git commit -m "fix: prevent event listener leakage in recorder due to addInitScript accumulation

- Add session timestamp check in inject.js to prevent old listeners from recording events
- Keep xyzSessionId in stopRecorder to allow old listeners to detect new sessions
- Fixes test failures in recorder-integration.e2e.test.ts and recorder-replay.e2e.test.ts"
```

### 步骤 5：清理计划文件（可选）
```bash
# 如果需要，可以删除计划文件
rm .trae/documents/recorder-test-fix-plan.md
```

## 预期结果

- 所有测试通过
- 代码已提交到本地仓库
- 修复的问题已记录在 commit message 中
