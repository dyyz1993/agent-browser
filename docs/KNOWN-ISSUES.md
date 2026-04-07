# Known Issues & Tech Debt

## [CRITICAL] isTouchDevice 一次检测永久锁定，无法从移动端切换回 PC 端

**Severity**: Critical  
**Status**: Open  
**Files**: `src/viewer-script.ts:194`

### Problem

`isTouchDevice` 用 `const` 声明，脚本加载时通过 UA regex 计算一次后永远不变。一旦判定为移动端，以下 8 个行为永久锁定：

1. `hiddenInput` 不创建 → PC 键盘捕获不可用
2. 触控板始终显示（display 不是 none）
3. 虚拟光标始终初始化
4. 整个 touch 事件系统注册（touchstart/move/end）
5. `input_focused` 走移动端路径（弹出输入面板而非 hiddenInput focus）
6. 键盘事件被 #input-field 拦截
7. `exitInputMode` 后 touchpad 恢复显示
8. `focusHiddenInput()` 初始调用被跳过

### 根因

- `const isTouchDevice = /regex/.test(ua)` — 不可变，无重检测机制
- 无 resize/orientationchange/matchMedia 监听
- 整个 touch 处理块在 `if (isTouchDevice)` 一次性 init 块内，无法 attach/detach

### 修复方向（较大重构）

1. `const` → `let`，提取为 `detectTouchDevice()` 函数
2. 加入 capability-based 检测：`'ontouchstart' in window || navigator.maxTouchPoints > 0`
3. 加 resize/orientationchange 监听重检测
4. 把一次性 init 块重构为可动态切换的 attach/detach 函数
5. UA regex 中 `/mobile/i` 匹配过宽，需收紧

### 相关

- 触控板快捷键工具栏（v0.11.0 新增）
- 移动端输入面板（v0.10.0 新增）
- PC 端 hiddenInput 键盘捕获路径
