# Diff 模块测试计划

## 测试概述

为 `src/diff.ts` 模块设计全面的单元测试和 E2E 测试，确保覆盖至少 50 种测试场景。

## 测试文件位置

| 类型 | 文件路径 |
|------|----------|
| 单元测试 | `src/__tests__/diff.test.ts` |
| E2E 测试 | `src/__tests__/e2e/diff.e2e.test.ts` |
| Fixture | `src/__tests__/e2e/fixtures/diff-*.html` |

## 测试框架

- **测试框架**: Vitest
- **断言库**: Vitest 内置 expect
- **浏览器**: Playwright (headless)

---

## 一、单元测试分类 (35+ 测试用例)

### 1. parseSnapshotLine 解析测试 (10 个测试)

测试 snapshot 行解析的各种情况：

| # | 测试场景 | 输入 | 预期输出 |
|---|----------|------|----------|
| 1 | 解析带 ref 的按钮 | `- button "Submit" [ref=e1]` | `{ role: 'button', name: 'Submit', ref: 'e1' }` |
| 2 | 解析带 value 的输入框 | `- textbox "Email" [ref=e2] [value: "test@example.com"]` | `{ role: 'textbox', name: 'Email', ref: 'e2', value: 'test@example.com' }` |
| 3 | 解析带引号的文本 | `- paragraph: "Counter: 0"` | `{ role: 'paragraph', value: 'Counter: 0' }` |
| 4 | 解析不带引号的文本 | `- paragraph: This is a secret message!` | `{ role: 'paragraph', value: 'This is a secret message!' }` |
| 5 | 解析 heading 元素 | `- heading "Welcome" [ref=e3] [level=1]` | `{ role: 'heading', name: 'Welcome', ref: 'e3' }` |
| 6 | 解析 link 元素 | `- link "Learn more" [ref=e4]` | `{ role: 'link', name: 'Learn more', ref: 'e4' }` |
| 7 | 解析 checkbox 元素 | `- checkbox "Remember me" [ref=e5]` | `{ role: 'checkbox', name: 'Remember me', ref: 'e5' }` |
| 8 | 解析 radio 元素 | `- radio "Option A" [ref=e6]` | `{ role: 'radio', name: 'Option A', ref: 'e6' }` |
| 9 | 解析空行 | `  ` | `null` |
| 10 | 解析无效格式 | `invalid line` | `null` |

### 2. parseSnapshot 解析测试 (5 个测试)

测试完整 snapshot 文本解析：

| # | 测试场景 | 描述 |
|---|----------|------|
| 11 | 解析多行 snapshot | 验证多行文本正确解析为元素列表 |
| 12 | 解析空 snapshot | 验证空文本返回空 Map |
| 13 | 解析带缩进的 snapshot | 验证缩进行正确处理 |
| 14 | 解析嵌套结构 | 验证 document 嵌套结构解析 |
| 15 | 解析混合格式 | 验证多种元素格式混合解析 |

### 3. elementsMatch 匹配测试 (5 个测试)

测试元素匹配逻辑：

| # | 测试场景 | 描述 |
|---|----------|------|
| 16 | 相同 ref 匹配 | 两个元素有相同 ref 时应匹配 |
| 17 | 相同 role+name 匹配 | 无 ref 但 role 和 name 相同时应匹配 |
| 18 | 不同 role 不匹配 | role 不同时不应匹配 |
| 19 | 不同 name 不匹配 | name 不同时不应匹配 |
| 20 | 空元素不匹配 | 空元素不应匹配 |

### 4. computeDiff 计算测试 (10 个测试)

测试差异计算核心逻辑：

| # | 测试场景 | 描述 |
|---|----------|------|
| 21 | 检测新增元素 | before 无，after 有 |
| 22 | 检测移除元素 | before 有，after 无 |
| 23 | 检测值变化 | value 从 A 变为 B |
| 24 | 检测名称变化 | name 从 A 变为 B |
| 25 | 无变化检测 | before 和 after 完全相同 |
| 26 | 多个新增元素 | 同时新增多个元素 |
| 27 | 多个移除元素 | 同时移除多个元素 |
| 28 | 混合变化 | 同时有新增、移除、变化 |
| 29 | 相同 role 不同值 | 同 role 元素值变化 |
| 30 | 顺序变化 | 元素顺序改变但内容不变 |

### 5. formatDiff 格式化测试 (5 个测试)

测试输出格式化：

| # | 测试场景 | 预期输出 |
|---|----------|----------|
| 31 | 格式化新增元素 | `+ button "Submit"` |
| 32 | 格式化移除元素 | `- button "Submit"` |
| 33 | 格式化值变化 | `- paragraph: "old"`<br>`+ paragraph: "new"` |
| 34 | 格式化无变化 | `(no changes detected)` |
| 35 | 格式化复杂变化 | 多行输出，正确使用 +/- |

---

## 二、E2E 测试分类 (20+ 测试用例)

### 1. 表单值变化测试 (6 个测试)

| # | 测试场景 | 操作 | 预期 diff |
|---|----------|------|-----------|
| 36 | 文本输入值变化 | fill 文本框 | 显示 value 变化 |
| 37 | 密码输入值变化 | fill 密码框 | 显示 value 变化 |
| 38 | 邮箱输入值变化 | fill 邮箱框 | 显示 value 变化 |
| 39 | textarea 值变化 | fill textarea | 显示 value 变化 |
| 40 | select 值变化 | select 下拉框 | 显示 value 变化 |
| 41 | checkbox 状态变化 | check/uncheck | 显示 checked 变化 |

### 2. 文本内容变化测试 (4 个测试)

| # | 测试场景 | 操作 | 预期 diff |
|---|----------|------|-----------|
| 42 | 按钮文本变化 | 点击按钮后文本改变 | 显示 name 变化 |
| 43 | 段落文本变化 | 点击后段落内容改变 | 显示 value 变化 |
| 44 | 计数器变化 | 点击 increment/decrement | 显示数值变化 |
| 45 | 链接文本变化 | 点击后链接文本改变 | 显示 name 变化 |

### 3. 元素增删测试 (4 个测试)

| # | 测试场景 | 操作 | 预期 diff |
|---|----------|------|-----------|
| 46 | 显示隐藏元素 | 点击 toggle 按钮 | 显示 `+ element` |
| 47 | 隐藏显示元素 | 再次点击 toggle | 显示 `- element` |
| 48 | 动态添加元素 | 点击添加按钮 | 显示 `+ element` |
| 49 | 动态移除元素 | 点击删除按钮 | 显示 `- element` |

### 4. 异常情况测试 (6 个测试)

| # | 测试场景 | 描述 |
|---|----------|------|
| 50 | 元素不存在 | 点击不存在的元素，验证错误处理 |
| 51 | iframe 内变化 | iframe 内元素变化检测 |
| 52 | 快速连续操作 | 连续快速操作，验证 diff 稳定性 |
| 53 | 大量元素变化 | 页面有大量元素时性能测试 |
| 54 | 特殊字符处理 | value 包含特殊字符时的处理 |
| 55 | Unicode 字符处理 | value 包含中文/emoji 时的处理 |

---

## 三、Fixture 文件设计

### 1. `diff-form.html` - 表单测试

```html
<!DOCTYPE html>
<html>
<head><title>Diff Form Test</title></head>
<body>
  <form id="test-form">
    <input type="text" id="name" placeholder="Name">
    <input type="email" id="email" placeholder="Email">
    <input type="password" id="password" placeholder="Password">
    <textarea id="bio" placeholder="Bio"></textarea>
    <select id="country">
      <option value="">Select country</option>
      <option value="us">USA</option>
      <option value="uk">UK</option>
    </select>
    <input type="checkbox" id="agree">
    <input type="radio" name="gender" value="male"> Male
    <input type="radio" name="gender" value="female"> Female
    <button type="submit">Submit</button>
  </form>
</body>
</html>
```

### 2. `diff-counter.html` - 计数器测试

```html
<!DOCTYPE html>
<html>
<head><title>Diff Counter Test</title></head>
<body>
  <p id="counter">Counter: 0</p>
  <button id="increment">+</button>
  <button id="decrement">-</button>
  <button id="reset">Reset</button>
</body>
</html>
```

### 3. `diff-toggle.html` - 显示/隐藏测试

```html
<!DOCTYPE html>
<html>
<head><title>Diff Toggle Test</title></head>
<body>
  <button id="toggle">Toggle Secret</button>
  <p id="secret" style="display:none">This is a secret!</p>
  <button id="add">Add Item</button>
  <button id="remove">Remove Item</button>
  <div id="container"></div>
</body>
</html>
```

### 4. `diff-special-chars.html` - 特殊字符测试

```html
<!DOCTYPE html>
<html>
<head><title>Diff Special Characters Test</title></head>
<body>
  <input type="text" id="special" placeholder="Special chars">
  <p id="unicode">中文测试 🎉</p>
  <p id="html">&lt;script&gt;alert('xss')&lt;/script&gt;</p>
</body>
</html>
```

### 5. `diff-large.html` - 大量元素测试

```html
<!DOCTYPE html>
<html>
<head><title>Diff Large Page Test</title></head>
<body>
  <div id="container">
    <!-- 100 个按钮 -->
  </div>
  <button id="add-more">Add 50 More</button>
  <button id="remove-half">Remove Half</button>
</body>
</html>
```

---

## 四、测试实现计划

### Step 1: 创建单元测试文件

创建 `src/__tests__/diff.test.ts`，实现所有单元测试。

### Step 2: 创建 Fixture 文件

在 `src/__tests__/e2e/fixtures/` 目录创建测试 HTML 文件。

### Step 3: 创建 E2E 测试文件

创建 `src/__tests__/e2e/diff.e2e.test.ts`，实现所有 E2E 测试。

### Step 4: 运行测试验证

```bash
npm run test
```

---

## 五、测试覆盖率目标

| 指标 | 目标 |
|------|------|
| 语句覆盖率 | ≥ 90% |
| 分支覆盖率 | ≥ 85% |
| 函数覆盖率 | 100% |
| 行覆盖率 | ≥ 90% |

---

## 六、注意事项

1. **隔离性**: 每个测试用例独立，不依赖其他测试
2. **可重复性**: 测试结果稳定，不因环境变化而失败
3. **性能**: E2E 测试使用 headless 模式，避免启动实际浏览器
4. **清理**: 每个测试后正确关闭浏览器和清理资源
