# Diff 模块补充测试计划

## 测试概述

为 `src/diff.ts` 模块补充多层 iframe、Fragment 和 Shadow DOM 的测试用例。

## 测试文件位置

| 类型 | 文件路径 |
|------|----------|
| E2E 测试 | `src/__tests__/e2e/diff-iframe.e2e.test.ts` |
| Fixture | `src/__tests__/e2e/fixtures/diff-iframe-*.html` |
| Fixture | `src/__tests__/e2e/fixtures/diff-fragment.html` |
| Fixture | `src/__tests__/e2e/fixtures/diff-shadow.html` |

---

## 一、多层 iframe Diff 测试 (15 个测试用例)

### Fixture 文件设计

#### `diff-iframe-main.html` - 主页面
```html
<!DOCTYPE html>
<html>
<head><title>Diff iframe Main</title></head>
<body>
  <h1>Main Page</h1>
  <p id="main-counter">Main Counter: 0</p>
  <button id="main-btn">Main Button</button>
  <iframe id="frame1" src="diff-iframe-level1.html"></iframe>
</body>
</html>
```

#### `diff-iframe-level1.html` - 第一层 iframe
```html
<!DOCTYPE html>
<html>
<head><title>Diff iframe Level 1</title></head>
<body>
  <h2>Level 1 iframe</h2>
  <p id="level1-counter">Level1 Counter: 0</p>
  <input type="text" id="level1-input" placeholder="Level 1 input">
  <button id="level1-btn">Level 1 Button</button>
  <iframe id="frame2" src="diff-iframe-level2.html"></iframe>
</body>
</html>
```

#### `diff-iframe-level2.html` - 第二层 iframe
```html
<!DOCTYPE html>
<html>
<head><title>Diff iframe Level 2</title></head>
<body>
  <h3>Level 2 iframe</h3>
  <p id="level2-counter">Level2 Counter: 0</p>
  <input type="email" id="level2-email" placeholder="Email in iframe">
  <select id="level2-select">
    <option value="">Select...</option>
    <option value="a">Option A</option>
    <option value="b">Option B</option>
  </select>
  <button id="level2-btn">Level 2 Button</button>
  <button id="level2-toggle">Toggle Secret</button>
  <p id="level2-secret" style="display:none">Secret in Level 2!</p>
</body>
</html>
```

### 测试用例

| # | 测试场景 | 操作 | 预期 diff |
|---|----------|------|-----------|
| 1 | 第一层 iframe 内点击按钮 | click #level1-btn --in-frame #frame1 --diff | 显示按钮状态变化 |
| 2 | 第一层 iframe 内填写输入框 | fill #level1-input "test" --in-frame #frame1 --diff | 显示 value 变化 |
| 3 | 第二层 iframe 内点击按钮 | click #level2-btn --in-frame #frame1/#frame2 --diff | 显示按钮状态变化 |
| 4 | 第二层 iframe 内填写邮箱 | fill #level2-email "test@example.com" --in-frame #frame1/#frame2 --diff | 显示 value 变化 |
| 5 | 第二层 iframe 内选择下拉框 | select #level2-select "a" --in-frame #frame1/#frame2 --diff | 显示 value 变化 |
| 6 | 第二层 iframe 内显示隐藏元素 | click #level2-toggle --in-frame #frame1/#frame2 --diff | 显示 + paragraph |
| 7 | 第二层 iframe 内隐藏显示元素 | 再次 click #level2-toggle --diff | 显示 - paragraph |
| 8 | 主页面操作不影响 iframe | click #main-btn --diff | 不应包含 iframe 内元素 |
| 9 | 第一层 iframe 内计数器变化 | 模拟计数器增加 --diff | 显示数值变化 |
| 10 | 第二层 iframe 内计数器变化 | 模拟计数器增加 --diff | 显示数值变化 |
| 11 | 跨层级操作 - 主页面影响第一层 | 特殊场景测试 | 验证 diff scope |
| 12 | full scope 在 iframe 内 | --diff full --in-frame | 显示整个 iframe 内容变化 |
| 13 | CSS selector scope 在 iframe 内 | --diff "#container" --in-frame | 显示指定区域变化 |
| 14 | 多层 iframe 同时变化 | 同时操作多层 | 验证 diff 正确性 |
| 15 | iframe 内表单重置 | reset 表单 --diff | 显示所有字段变化 |

---

## 二、Fragment Diff 测试 (8 个测试用例)

### Fixture 文件设计

#### `diff-fragment.html` - Fragment 测试页面
```html
<!DOCTYPE html>
<html>
<head><title>Diff Fragment Test</title></head>
<body>
  <h1>Fragment Test</h1>
  <nav>
    <a href="#section1">Section 1</a>
    <a href="#section2">Section 2</a>
    <a href="#section3">Section 3</a>
  </nav>
  
  <section id="section1">
    <h2>Section 1</h2>
    <p id="s1-counter">Section 1 Counter: 0</p>
    <button id="s1-btn">Increment Section 1</button>
  </section>
  
  <section id="section2">
    <h2>Section 2</h2>
    <input type="text" id="s2-input" placeholder="Section 2 input">
    <button id="s2-btn">Fill Section 2</button>
  </section>
  
  <section id="section3">
    <h2>Section 3</h2>
    <p id="s3-status">Status: idle</p>
    <button id="s3-btn">Change Status</button>
  </section>
  
  <p id="fragment-display">Current fragment: (none)</p>
  
  <script>
    window.addEventListener('hashchange', function() {
      document.getElementById('fragment-display').textContent = 
        'Current fragment: ' + (location.hash || '(none)');
    });
    
    document.getElementById('s1-btn').addEventListener('click', function() {
      const el = document.getElementById('s1-counter');
      const match = el.textContent.match(/(\d+)/);
      const count = match ? parseInt(match[1]) + 1 : 1;
      el.textContent = 'Section 1 Counter: ' + count;
    });
    
    document.getElementById('s2-btn').addEventListener('click', function() {
      document.getElementById('s2-input').value = 'Filled from button';
    });
    
    document.getElementById('s3-btn').addEventListener('click', function() {
      const el = document.getElementById('s3-status');
      el.textContent = el.textContent.includes('idle') ? 
        'Status: active' : 'Status: idle';
    });
  </script>
</body>
</html>
```

### 测试用例

| # | 测试场景 | 操作 | 预期 diff |
|---|----------|------|-----------|
| 16 | 导航到 fragment | click a[href="#section1"] --diff | 显示 fragment 变化 |
| 17 | fragment 变化后操作元素 | click #s1-btn --diff | 显示计数器变化 |
| 18 | 在不同 fragment 间切换 | click a[href="#section2"] --diff | 显示 fragment 变化 |
| 19 | 在 section2 内填写表单 | fill #s2-input "test" --diff | 显示 value 变化 |
| 20 | 使用 CSS selector scope 定位 section | click #s1-btn --diff "#section1" | 只显示 section1 内变化 |
| 21 | fragment 变化影响页面状态 | 连续切换 fragment --diff | 显示多次变化 |
| 22 | 在 section3 内切换状态 | click #s3-btn --diff | 显示状态变化 |
| 23 | full scope 包含所有 section | click #s1-btn --diff full | 显示完整页面变化 |

---

## 三、Shadow DOM Diff 测试 (12 个测试用例)

### Fixture 文件设计

#### `diff-shadow.html` - Shadow DOM 测试页面
```html
<!DOCTYPE html>
<html>
<head><title>Diff Shadow DOM Test</title></head>
<body>
  <h1>Shadow DOM Test</h1>
  
  <custom-counter id="shadow-counter"></custom-counter>
  
  <custom-form id="shadow-form"></custom-form>
  
  <custom-toggle id="shadow-toggle"></custom-toggle>
  
  <p id="outside-text">Outside Shadow DOM: 0</p>
  <button id="outside-btn">Increment Outside</button>
  
  <script>
    // Custom Counter Component
    class CustomCounter extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.count = 0;
        this.render();
      }
      
      render() {
        this.shadowRoot.innerHTML = `
          <style>
            .counter { padding: 10px; background: #f0f0f0; }
            button { margin: 5px; }
          </style>
          <div class="counter">
            <p id="count">Shadow Counter: ${this.count}</p>
            <button id="inc-btn">Increment</button>
            <button id="dec-btn">Decrement</button>
          </div>
        `;
        this.shadowRoot.getElementById('inc-btn').addEventListener('click', () => {
          this.count++;
          this.shadowRoot.getElementById('count').textContent = 'Shadow Counter: ' + this.count;
        });
        this.shadowRoot.getElementById('dec-btn').addEventListener('click', () => {
          this.count--;
          this.shadowRoot.getElementById('count').textContent = 'Shadow Counter: ' + this.count;
        });
      }
    }
    
    // Custom Form Component
    class CustomForm extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.render();
      }
      
      render() {
        this.shadowRoot.innerHTML = `
          <style>
            .form { padding: 10px; border: 1px solid #ccc; }
            input { margin: 5px; padding: 5px; }
          </style>
          <div class="form">
            <input type="text" id="shadow-input" placeholder="Shadow input">
            <input type="email" id="shadow-email" placeholder="Shadow email">
            <button id="shadow-submit">Shadow Submit</button>
            <p id="shadow-status"></p>
          </div>
        `;
        this.shadowRoot.getElementById('shadow-submit').addEventListener('click', () => {
          const input = this.shadowRoot.getElementById('shadow-input').value;
          const email = this.shadowRoot.getElementById('shadow-email').value;
          this.shadowRoot.getElementById('shadow-status').textContent = 
            'Submitted: ' + input + ' (' + email + ')';
        });
      }
    }
    
    // Custom Toggle Component
    class CustomToggle extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.visible = false;
        this.render();
      }
      
      render() {
        this.shadowRoot.innerHTML = `
          <style>
            .container { padding: 10px; }
            .secret { display: ${this.visible ? 'block' : 'none'}; background: #ffeb3b; }
          </style>
          <div class="container">
            <button id="toggle-btn">Toggle Shadow Secret</button>
            <p class="secret" id="secret-text">This is a shadow secret!</p>
          </div>
        `;
        this.shadowRoot.getElementById('toggle-btn').addEventListener('click', () => {
          this.visible = !this.visible;
          const secret = this.shadowRoot.getElementById('secret-text');
          secret.style.display = this.visible ? 'block' : 'none';
        });
      }
    }
    
    customElements.define('custom-counter', CustomCounter);
    customElements.define('custom-form', CustomForm);
    customElements.define('custom-toggle', CustomToggle);
    
    document.getElementById('outside-btn').addEventListener('click', function() {
      const el = document.getElementById('outside-text');
      const match = el.textContent.match(/(\d+)/);
      const count = match ? parseInt(match[1]) + 1 : 1;
      el.textContent = 'Outside Shadow DOM: ' + count;
    });
  </script>
</body>
</html>
```

### 测试用例

| # | 测试场景 | 操作 | 预期 diff |
|---|----------|------|-----------|
| 24 | Shadow DOM 外部操作 | click #outside-btn --diff | 显示外部计数器变化 |
| 25 | Shadow DOM 内计数器增加 | 点击 shadow 内 increment --diff | 显示 shadow 内计数器变化 |
| 26 | Shadow DOM 内计数器减少 | 点击 shadow 内 decrement --diff | 显示 shadow 内计数器变化 |
| 27 | Shadow DOM 内填写输入框 | 填写 shadow input --diff | 显示 value 变化 |
| 28 | Shadow DOM 内填写邮箱 | 填写 shadow email --diff | 显示 value 变化 |
| 29 | Shadow DOM 内提交表单 | 点击 shadow submit --diff | 显示状态变化 |
| 30 | Shadow DOM 内显示隐藏元素 | 点击 shadow toggle --diff | 显示 + paragraph |
| 31 | Shadow DOM 内隐藏显示元素 | 再次点击 shadow toggle --diff | 显示 - paragraph |
| 32 | full scope 包含 Shadow DOM | --diff full | 显示完整页面变化 |
| 33 | CSS selector scope 排除 Shadow DOM | --diff "#outside-text" | 只显示外部变化 |
| 34 | 多个 Shadow DOM 组件同时操作 | 操作多个组件 --diff | 显示所有变化 |
| 35 | Shadow DOM 与外部元素混合操作 | 同时操作内外元素 --diff | 显示所有变化 |

---

## 四、测试实现计划

### Step 1: 创建 Fixture 文件

创建以下 HTML 文件：
- `diff-iframe-main.html`
- `diff-iframe-level1.html`
- `diff-iframe-level2.html`
- `diff-fragment.html`
- `diff-shadow.html`

### Step 2: 创建 E2E 测试文件

创建 `src/__tests__/e2e/diff-iframe.e2e.test.ts`，实现所有测试用例。

### Step 3: 运行测试验证

```bash
npm run test -- src/__tests__/e2e/diff-iframe.e2e.test.ts
```

---

## 五、注意事项

1. **Shadow DOM 测试限制**: Playwright 对 Shadow DOM 的支持有限，可能需要使用特殊的选择器语法
2. **iframe 加载时序**: 确保 iframe 完全加载后再执行操作
3. **Fragment 变化**: URL fragment 变化可能不会触发 DOM 变化，需要监听 hashchange 事件
4. **跨域 iframe**: 本测试仅使用同源 iframe，跨域 iframe 需要特殊处理
