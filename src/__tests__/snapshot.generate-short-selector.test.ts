/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { generateShortSelector } from '../snapshot/generate-short-selector.js';

function createDOM(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

function getElement(html: string): Element {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.firstElementChild!;
}

function appendToBody(el: Element): void {
  document.body.appendChild(el);
}

function cleanupBody(): void {
  document.body.innerHTML = '';
}

describe('generateShortSelector - ID 选择器', () => {
  it('简单 id 返回 #id', () => {
    const el = getElement('<button id="submit-btn">Submit</button>');
    appendToBody(el);
    expect(generateShortSelector(el)).toBe('#submit-btn');
    cleanupBody();
  });

  it('深层嵌套 id 元素返回 #id', () => {
    const container = createDOM('<div><div><span id="deep-target">deep</span></div></div>');
    appendToBody(container);
    const el = container.querySelector('#deep-target')!;
    expect(generateShortSelector(el)).toBe('#deep-target');
    cleanupBody();
  });

  it('包含特殊字符的 id 使用 CSS.escape', () => {
    const el = getElement('<button id="submit.btn">Submit</button>');
    appendToBody(el);
    const result = generateShortSelector(el);
    expect(result).toBeTruthy();
    expect(result).toMatch(/^#/);
    expect(() => document.querySelector(result)).not.toThrow();
    cleanupBody();
  });

  it('包含冒号的 id', () => {
    const el = getElement('<input id="user:name">');
    appendToBody(el);
    const result = generateShortSelector(el);
    expect(result).toBeTruthy();
    expect(result).toMatch(/^#/);
    cleanupBody();
  });

  it('包含方括号的 id', () => {
    const el = getElement('<span id="item[0]">item</span>');
    appendToBody(el);
    const result = generateShortSelector(el);
    expect(result).toBeTruthy();
    expect(result).toMatch(/^#/);
    cleanupBody();
  });

  it('同页面多个元素时 id 唯一且优先', () => {
    const container = createDOM(`
      <div id="unique-a" class="card">A</div>
      <div id="unique-b" class="card">B</div>
      <div id="unique-c" class="card">C</div>
    `);
    appendToBody(container);
    const elA = container.querySelector('#unique-a')!;
    const elB = container.querySelector('#unique-b')!;
    expect(generateShortSelector(elA)).toBe('#unique-a');
    expect(generateShortSelector(elB)).toBe('#unique-b');
    cleanupBody();
  });
});

describe('generateShortSelector - 语义属性选择器', () => {
  it('data-testid 属性', () => {
    const el = getElement('<button data-testid="submit-btn">Submit</button>');
    appendToBody(el);
    expect(generateShortSelector(el)).toBe('button[data-testid="submit-btn"]');
    cleanupBody();
  });

  it('aria-label 属性', () => {
    const el = getElement('<input aria-label="search-input">');
    appendToBody(el);
    expect(generateShortSelector(el)).toBe('input[aria-label="search-input"]');
    cleanupBody();
  });

  it('name 属性', () => {
    const el = getElement('<input name="email" type="email">');
    appendToBody(el);
    expect(generateShortSelector(el)).toBe('input[name="email"]');
    cleanupBody();
  });

  it('name 属性（密码）', () => {
    const el = getElement('<input name="password" type="password">');
    appendToBody(el);
    expect(generateShortSelector(el)).toBe('input[name="password"]');
    cleanupBody();
  });

  it('role 属性', () => {
    const el = getElement('<button role="submit">Submit</button>');
    appendToBody(el);
    expect(generateShortSelector(el)).toBe('button[role="submit"]');
    cleanupBody();
  });

  it('type 属性唯一时优先', () => {
    const container = createDOM(`
      <input type="text" name="search">
      <input type="submit" value="Go">
    `);
    appendToBody(container);
    const el = container.querySelector('input[type="submit"]')!;
    const result = generateShortSelector(el);
    expect(result).toBe('input[type="submit"]');
    cleanupBody();
  });

  it('placeholder 属性唯一时使用', () => {
    const container = createDOM(`
      <input placeholder="Search...">
      <input placeholder="Email">
    `);
    appendToBody(container);
    const el = container.querySelector('input[placeholder="Email"]')!;
    expect(generateShortSelector(el)).toBe('input[placeholder="Email"]');
    cleanupBody();
  });

  it('id 优先于 data-testid', () => {
    const el = getElement('<button id="my-btn" data-testid="submit-btn">Click</button>');
    appendToBody(el);
    expect(generateShortSelector(el)).toBe('#my-btn');
    cleanupBody();
  });

  it('data-testid 优先于 name', () => {
    const el = getElement('<input data-testid="email-input" name="email">');
    appendToBody(el);
    expect(generateShortSelector(el)).toBe('input[data-testid="email-input"]');
    cleanupBody();
  });

  it('title 属性', () => {
    const el = getElement('<div title="tooltip">Hover</div>');
    appendToBody(el);
    expect(generateShortSelector(el)).toBe('div[title="tooltip"]');
    cleanupBody();
  });

  it('alt 属性（图片）', () => {
    const el = getElement('<img alt="logo" src="logo.png">');
    appendToBody(el);
    expect(generateShortSelector(el)).toBe('img[alt="logo"]');
    cleanupBody();
  });

  it('双属性组合选择器（单属性不够唯一时）', () => {
    const container = createDOM(`
      <input data-testid="field" name="email" type="email">
      <input data-testid="field" name="phone" type="tel">
    `);
    appendToBody(container);
    const el = container.querySelector('input[name="email"]')!;
    const result = generateShortSelector(el);
    // data-testid alone is not unique, falls back to name or combo
    expect(result).toContain('email');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });
});

describe('generateShortSelector - class 选择器', () => {
  it('唯一 class', () => {
    const el = getElement('<div class="my-unique-class">content</div>');
    appendToBody(el);
    expect(generateShortSelector(el)).toBe('div.my-unique-class');
    cleanupBody();
  });

  it('唯一 class + tag 组合', () => {
    const container = createDOM(`
      <span class="label">Label</span>
      <div class="label">Div Label</div>
    `);
    appendToBody(container);
    const el = container.querySelector('span.label')!;
    expect(generateShortSelector(el)).toBe('span.label');
    cleanupBody();
  });

  it('多 class 组合', () => {
    const container = createDOM(`
      <div class="card primary">First</div>
      <div class="card secondary">Second</div>
    `);
    appendToBody(container);
    const el = container.querySelector('div.primary')!;
    // primary alone should be unique
    expect(generateShortSelector(el)).toBe('div.primary');
    cleanupBody();
  });

  it('跳过工具类名，使用有用类名', () => {
    const container = createDOM(`
      <div class="flex p-4 mt-2 my-article">Article</div>
      <div class="flex p-4 mt-2 my-post">Post</div>
    `);
    appendToBody(container);
    const el = container.querySelector('div.my-article')!;
    expect(generateShortSelector(el)).toBe('div.my-article');
    cleanupBody();
  });

  it('多 class 排序按长度取最长', () => {
    const container = createDOM(`
      <div class="short very-long-class-name unique">First</div>
      <div class="short very-long-class-name">Second</div>
    `);
    appendToBody(container);
    const el = container.querySelector('div.unique')!;
    const result = generateShortSelector(el);
    expect(result).toContain('unique');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('过滤高熵 class（驼峰+数字混合）', () => {
    const container = createDOM(`
      <div class="oMpq4HiN real-class">First</div>
      <div class="YoNA2Hyj real-class">Second</div>
    `);
    appendToBody(container);
    const el = container.querySelector('div.real-class')!;
    const result = generateShortSelector(el);
    expect(result).not.toContain('oMpq4HiN');
    expect(result).not.toContain('YoNA2Hyj');
    expect(result).toContain('real-class');
    cleanupBody();
  });

  it('过滤 Emotion sc-* 前缀 class', () => {
    const container = createDOM(`
      <div class="sc-dkzDqf normal-class">Styled</div>
      <div class="sc-xyzabc normal-class">Styled 2</div>
    `);
    appendToBody(container);
    const el = container.querySelector('div.normal-class')!;
    const result = generateShortSelector(el);
    expect(result).not.toContain('sc-');
    expect(result).toContain('normal-class');
    cleanupBody();
  });

  it('过滤交替大小写的高熵 class', () => {
    const container = createDOM(`
      <span class="xYzAbC content">A</span>
      <span class="DeFgHi content">B</span>
    `);
    appendToBody(container);
    const el = container.querySelector('span.content')!;
    const result = generateShortSelector(el);
    expect(result).not.toContain('xYzAbC');
    expect(result).not.toContain('DeFgHi');
    expect(result).toContain('content');
    cleanupBody();
  });

  it('过滤下划线前缀 class', () => {
    const container = createDOM(`
      <div class="_hidden real-content">First</div>
      <div class="_active real-content">Second</div>
    `);
    appendToBody(container);
    const el = container.querySelector('div.real-content')!;
    const result = generateShortSelector(el);
    expect(result).not.toContain('_hidden');
    expect(result).not.toContain('_active');
    expect(result).toContain('real-content');
    cleanupBody();
  });

  it('过滤单个/双字母 class', () => {
    const container = createDOM(`
      <div class="a b c meaningful-name">Content</div>
      <div class="a b c other-name">Other</div>
    `);
    appendToBody(container);
    const el = container.querySelector('div.meaningful-name')!;
    expect(generateShortSelector(el)).toBe('div.meaningful-name');
    cleanupBody();
  });

  it('过滤常用状态 class', () => {
    const container = createDOM(`
      <div class="active selected card-item">Item 1</div>
      <div class="active selected card-item">Item 2</div>
    `);
    appendToBody(container);
    const el = container.querySelector('div.card-item')!;
    // card-item alone should be unique if only two same elements, but they both have it
    const result = generateShortSelector(el);
    expect(result).toContain('card-item');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });
});

describe('generateShortSelector - nth-child 选择器', () => {
  it('同标签列表使用 nth-child', () => {
    const container = createDOM(`
      <ul>
        <li>Item 1</li>
        <li>Item 2</li>
        <li id="target-li">Item 3</li>
        <li>Item 4</li>
        <li>Item 5</li>
      </ul>
    `);
    appendToBody(container);
    const el = container.querySelector('#target-li')!;
    expect(generateShortSelector(el)).toBe('#target-li');
    cleanupBody();
  });

  it('无 id/attr/class 时使用 nth-child', () => {
    const container = createDOM(`
      <ul class="list">
        <li>First</li>
        <li>Second</li>
        <li>Third</li>
      </ul>
    `);
    appendToBody(container);
    const el = container.querySelectorAll('li')[2]!; // Third
    const result = generateShortSelector(el);
    expect(result).toContain(':nth-child');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('同 class 元素的 nth-child', () => {
    const container = createDOM(`
      <div class="item-group">
        <div class="item">A</div>
        <div class="item">B</div>
        <div class="item">C</div>
      </div>
    `);
    appendToBody(container);
    const el = container.querySelectorAll('div.item')[1]!; // B
    const result = generateShortSelector(el);
    expect(result).toContain(':nth-child');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('分页链接（第3页）', () => {
    const container = createDOM(`
      <div class="pagination">
        <a href="?page=1">1</a>
        <a href="?page=2">2</a>
        <a href="?page=3">3</a>
      </div>
    `);
    appendToBody(container);
    const el = container.querySelector('a[href="?page=3"]')!;
    const result = generateShortSelector(el);
    // Has href attr, might be used
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('列表第5项', () => {
    const container = createDOM(`
      <ul class="item-list">
        <li data-idx="1">I1</li><li data-idx="2">I2</li><li data-idx="3">I3</li>
        <li data-idx="4">I4</li><li data-idx="5">I5</li><li data-idx="6">I6</li>
      </ul>
    `);
    appendToBody(container);
    const el = container.querySelector('li[data-idx="5"]')!;
    const result = generateShortSelector(el);
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });
});

describe('generateShortSelector - 路径组合选择器', () => {
  it('多层嵌套使用父级 > 子级', () => {
    const container = createDOM(`
      <div class="level-1">
        <div class="level-2">
          <div class="level-3">
            <div class="target">Deep</div>
          </div>
        </div>
      </div>
    `);
    appendToBody(container);
    const el = container.querySelector('.target')!;
    const result = generateShortSelector(el);
    expect(result).not.toBe('div');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('兄弟元素 + 组合', () => {
    const container = createDOM(`
      <div id="sibling-a">A</div>
      <div class="target">Target after A</div>
      <div class="target">Target after unknown</div>
    `);
    appendToBody(container);
    const el = container.querySelector('#sibling-a + div')!;
    const result = generateShortSelector(el);
    // Should use sibling-based: #sibling-a + div.target
    expect(result).toContain('#sibling-a');
    expect(result).toContain('+');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('三层父级路径', () => {
    const container = createDOM(`
      <div id="root">
        <div class="section">
          <div class="subsection">
            <button class="action-btn">Click</button>
          </div>
        </div>
      </div>
    `);
    appendToBody(container);
    const el = container.querySelector('button')!;
    const result = generateShortSelector(el);
    expect(document.querySelectorAll(result).length).toBe(1);
    expect(result).not.toBe('button');
    cleanupBody();
  });
});

describe('generateShortSelector - 边界情况', () => {
  it('没有唯一选择器时回退到 tagName', () => {
    const container = createDOM(`
      <div>A</div>
      <div>B</div>
    `);
    appendToBody(container);
    const el = container.querySelectorAll('div')[0]!;
    const result = generateShortSelector(el);
    // With only two identical divs, nth-child still makes it unique
    expect(result).toContain('div');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('body 元素返回 body', () => {
    const result = generateShortSelector(document.body);
    expect(result).toBe('body');
  });

  it('html 元素返回 html', () => {
    const result = generateShortSelector(document.documentElement);
    expect(result).toBe('html');
  });

  it('自定义元素处理', () => {
    const el = getElement('<my-component>Custom</my-component>');
    appendToBody(el);
    const result = generateShortSelector(el);
    expect(result).toBe('my-component');
    cleanupBody();
  });

  it('input[type="hidden"] 隐式元素', () => {
    const el = getElement('<input type="hidden" name="csrf">');
    appendToBody(el);
    const result = generateShortSelector(el);
    expect(result).toBe('input[name="csrf"]');
    cleanupBody();
  });

  it('空 class 不会导致错误', () => {
    const el = getElement('<div class="">Empty</div>');
    appendToBody(el);
    const result = generateShortSelector(el);
    expect(typeof result).toBe('string');
    cleanupBody();
  });

  it('没有 class 的 span', () => {
    const container = createDOM('<div><span>No class</span></div>');
    appendToBody(container);
    const el = container.querySelector('span')!;
    const result = generateShortSelector(el);
    expect(result).toContain('span');
    cleanupBody();
  });
});

describe('generateShortSelector - 综合页面场景', () => {
  it('百度首页搜索框', () => {
    const container = createDOM(`
      <div id="wrapper">
        <form id="form">
          <span class="bg s_ipt_wr">
            <input id="kw" name="wd" class="s_ipt" value="" placeholder="搜索">
          </span>
          <span class="bg s_btn_wr">
            <input id="su" type="submit" class="btn_s" value="百度一下">
          </span>
        </form>
      </div>
    `);
    appendToBody(container);
    const kw = container.querySelector('#kw')!;
    const su = container.querySelector('#su')!;
    expect(generateShortSelector(kw)).toBe('#kw');
    expect(generateShortSelector(su)).toBe('#su');
    cleanupBody();
  });

  it('复杂导航列表', () => {
    const container = createDOM(`
      <nav>
        <ul class="nav-list">
          <li class="nav-item"><a href="/home" data-testid="nav-home">Home</a></li>
          <li class="nav-item"><a href="/about" data-testid="nav-about">About</a></li>
          <li class="nav-item"><a href="/contact" data-testid="nav-contact">Contact</a></li>
        </ul>
      </nav>
    `);
    appendToBody(container);
    const home = container.querySelector('[data-testid="nav-home"]')!;
    const about = container.querySelector('[data-testid="nav-about"]')!;
    expect(generateShortSelector(home)).toBe('a[data-testid="nav-home"]');
    expect(generateShortSelector(about)).toBe('a[data-testid="nav-about"]');
    cleanupBody();
  });

  it('表单混合场景', () => {
    const container = createDOM(`
      <form id="login-form">
        <div class="field">
          <label>Username</label>
          <input type="text" name="username" id="username" class="input" placeholder="Username">
        </div>
        <div class="field">
          <label>Password</label>
          <input type="password" name="password" id="password" class="input" placeholder="Password">
        </div>
        <button type="submit" id="login-btn" class="btn btn-primary">Login</button>
        <button type="reset" class="btn btn-secondary">Reset</button>
      </form>
    `);
    appendToBody(container);
    const username = container.querySelector('#username')!;
    const password = container.querySelector('#password')!;
    const loginBtn = container.querySelector('#login-btn')!;
    const resetBtn = container.querySelectorAll('button')[1]!;
    expect(generateShortSelector(username)).toBe('#username');
    expect(generateShortSelector(password)).toBe('#password');
    expect(generateShortSelector(loginBtn)).toBe('#login-btn');
    const resetResult = generateShortSelector(resetBtn);
    expect(resetResult).toContain('reset');
    cleanupBody();
  });

  it('动态 class 的组件', () => {
    const container = createDOM(`
      <div class="flex items-center justify-between p-4 css-1a2b3c _hidden cards-container">
        <div data-testid="card-1" class="flex-1 card-item-highlighted _active">Card 1</div>
        <div data-testid="card-2" class="flex-1 card-item-highlighted _active">Card 2</div>
      </div>
    `);
    appendToBody(container);
    const card1 = container.querySelector('[data-testid="card-1"]')!;
    const card2 = container.querySelector('[data-testid="card-2"]')!;
    expect(generateShortSelector(card1)).toBe('div[data-testid="card-1"]');
    expect(generateShortSelector(card2)).toBe('div[data-testid="card-2"]');
    cleanupBody();
  });

  it('深层嵌套 - 树形结构', () => {
    const container = createDOM(`
      <div id="app">
        <div class="sidebar">
          <ul class="tree">
            <li class="branch"><span class="folder">Folder 1</span>
              <ul>
                <li class="item selected"><span class="filename">file.js</span></li>
                <li class="item"><span class="filename">file.ts</span></li>
              </ul>
            </li>
          </ul>
        </div>
      </div>
    `);
    appendToBody(container);
    const app = container.querySelector('#app')!;
    expect(generateShortSelector(app)).toBe('#app');
    cleanupBody();
  });
});

describe('generateShortSelector - 唯一性验证', () => {
  it('生成的选择器在 document 中唯一', () => {
    const container = createDOM(`
      <button class="btn duplicate">Btn 1</button>
      <button class="btn duplicate">Btn 2</button>
      <button class="btn duplicate">Btn 3</button>
    `);
    appendToBody(container);
    for (const btn of container.querySelectorAll('button')) {
      const sel = generateShortSelector(btn);
      expect(document.querySelectorAll(sel).length).toBe(1);
    }
    cleanupBody();
  });

  it('10 个同标签同 class 元素均生成唯一选择器', () => {
    const items = Array.from(
      { length: 10 },
      (_, i) => `<li class="same-class" data-idx="${i}">Item ${i}</li>`
    ).join('');
    const container = createDOM(`<ul>${items}</ul>`);
    appendToBody(container);
    for (const li of container.querySelectorAll('li')) {
      const sel = generateShortSelector(li);
      expect(document.querySelectorAll(sel).length).toBe(1);
    }
    cleanupBody();
  });

  it('复杂结构 30+ 元素均唯一', () => {
    const rows = Array.from(
      { length: 10 },
      (_, i) => `
      <tr class="data-row">
        <td class="cell-id">${i}</td>
        <td class="cell-name">Name ${i}</td>
        <td class="cell-action"><button class="edit-btn" data-id="${i}">Edit</button></td>
      </tr>
    `
    ).join('');
    const container = createDOM(`<table><tbody>${rows}</tbody></table>`);
    appendToBody(container);
    const allElements = container.querySelectorAll('td, button, tr');
    for (const el of allElements) {
      const sel = generateShortSelector(el);
      expect(document.querySelectorAll(sel).length).toBe(1);
    }
    cleanupBody();
  });
});

describe('generateShortSelector - shortest guarantee', () => {
  it('picks #id over longer [data-testid] when both exist', () => {
    const el = getElement('<button id="x" data-testid="submit-button">Click</button>');
    appendToBody(el);
    const result = generateShortSelector(el);
    expect(result).toBe('#x');
    expect(result.length).toBeLessThan('button[data-testid="submit-button"]'.length);
    cleanupBody();
  });

  it('picks shorter class over longer class when both unique', () => {
    const container = createDOM(`
      <div class="abcd">Short</div>
      <div class="wxyz-longer">Long</div>
    `);
    appendToBody(container);
    const el = container.querySelector('div.abcd')!;
    const result = generateShortSelector(el);
    expect(result).toContain('abcd');
    expect(result.length).toBeLessThan('div.wxyz-longer'.length);
    cleanupBody();
  });

  it('picks tag[attr] over tag.class when shorter', () => {
    const el = getElement('<input name="x" class="very-long-class-name">');
    appendToBody(el);
    const result = generateShortSelector(el);
    expect(result).toBe('input[name="x"]');
    expect(result.length).toBeLessThan('input.very-long-class-name'.length);
    cleanupBody();
  });

  it('does not generate unnecessarily deep paths', () => {
    const container = createDOM(`
      <div class="wrapper">
        <div class="inner">
          <span id="shallow">Text</span>
        </div>
      </div>
    `);
    appendToBody(container);
    const el = container.querySelector('#shallow')!;
    const result = generateShortSelector(el);
    expect(result).toBe('#shallow');
    expect(result).not.toContain('>');
    cleanupBody();
  });

  it('prefers single class over multi-class combo', () => {
    const container = createDOM(`
      <div class="longer-unique-name first second">A</div>
      <div class="other">B</div>
    `);
    appendToBody(container);
    const el = container.querySelector('div.longer-unique-name')!;
    const result = generateShortSelector(el);
    expect(document.querySelectorAll(result).length).toBe(1);
    expect(result).not.toMatch(/\.\w+\.\w+/);
    cleanupBody();
  });

  it('ascending sort: tries short class before long class', () => {
    const container = createDOM(`
      <div class="short something-very-long">Text</div>
      <div class="other-item something-very-long">Other</div>
    `);
    appendToBody(container);
    const el = container.querySelector('div.short')!;
    const result = generateShortSelector(el);
    expect(document.querySelectorAll(result).length).toBe(1);
    expect(result).toContain('short');
    cleanupBody();
  });
});

describe('generateShortSelector - detached/shadow-like contexts', () => {
  it('element in DocumentFragment uses getRootNode', () => {
    const fragment = document.createDocumentFragment();
    const el = document.createElement('div');
    el.id = 'frag-el';
    el.textContent = 'Fragment';
    fragment.appendChild(el);
    const result = generateShortSelector(el);
    expect(result).toBe('#frag-el');
  });

  it('element not in body still generates selector', () => {
    const el = document.createElement('span');
    el.className = 'detached-item';
    const result = generateShortSelector(el);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('nested element outside body', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    const grandchild = document.createElement('em');
    grandchild.id = 'detached-deep';
    child.appendChild(grandchild);
    parent.appendChild(child);
    const result = generateShortSelector(grandchild);
    expect(result).toBe('#detached-deep');
  });
});

describe('generateShortSelector - SVG elements', () => {
  it('SVG with id', () => {
    const container = createDOM('<svg id="icon-svg"><circle r="10"/></svg>');
    appendToBody(container);
    const el = container.querySelector('#icon-svg')!;
    expect(generateShortSelector(el)).toBe('#icon-svg');
    cleanupBody();
  });

  it('SVG rect with class', () => {
    const container = createDOM(`
      <svg>
        <rect class="svg-rect-main" x="0" y="0" width="100" height="100"/>
        <rect class="svg-rect-secondary" x="100" y="0" width="100" height="100"/>
      </svg>
    `);
    appendToBody(container);
    const el = container.querySelector('.svg-rect-main')!;
    const result = generateShortSelector(el);
    expect(result).toContain('svg-rect-main');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('SVG path with data-testid', () => {
    const container = createDOM(`
      <svg>
        <path data-testid="icon-path" d="M10 10 L20 20"/>
      </svg>
    `);
    appendToBody(container);
    const el = container.querySelector('[data-testid="icon-path"]')!;
    const result = generateShortSelector(el);
    expect(result).toBe('path[data-testid="icon-path"]');
    cleanupBody();
  });

  it('nested SVG elements', () => {
    const container = createDOM(`
      <svg id="main-svg">
        <g class="layer-one">
          <g class="layer-two">
            <circle class="target-circle" cx="50" cy="50" r="25"/>
          </g>
        </g>
      </svg>
    `);
    appendToBody(container);
    const el = container.querySelector('.target-circle')!;
    const result = generateShortSelector(el);
    expect(result).toContain('target-circle');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });
});

describe('generateShortSelector - table structures', () => {
  it('table cell in named column', () => {
    const container = createDOM(`
      <table>
        <tr>
          <td data-testid="cell-1">A1</td>
          <td data-testid="cell-2">B1</td>
        </tr>
        <tr>
          <td data-testid="cell-3">A2</td>
          <td data-testid="cell-4">B2</td>
        </tr>
      </table>
    `);
    appendToBody(container);
    const el = container.querySelector('[data-testid="cell-1"]')!;
    expect(generateShortSelector(el)).toBe('td[data-testid="cell-1"]');
    cleanupBody();
  });

  it('header cell', () => {
    const container = createDOM(`
      <table>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Age</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Alice</td><td>30</td></tr>
          <tr><td>Bob</td><td>25</td></tr>
        </tbody>
      </table>
    `);
    appendToBody(container);
    const el = container.querySelector('th[scope="col"]')!;
    const result = generateShortSelector(el);
    expect(result).toContain('th');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('spanning 30+ row table - all cells unique', () => {
    const rows = Array.from({ length: 10 }, (_, r) => {
      const cells = Array.from(
        { length: 5 },
        (_, c) => `<td data-row="${r}" data-col="${c}">R${r}C${c}</td>`
      ).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    const container = createDOM(`<table><tbody>${rows}</tbody></table>`);
    appendToBody(container);
    const cells = container.querySelectorAll('td');
    expect(cells.length).toBe(50);
    const selectors = new Set<string>();
    for (const cell of cells) {
      const sel = generateShortSelector(cell);
      expect(document.querySelectorAll(sel).length).toBe(1);
      selectors.add(sel);
    }
    expect(selectors.size).toBe(50);
    cleanupBody();
  });

  it('nested tables', () => {
    const container = createDOM(`
      <table id="outer">
        <tr>
          <td>
            <table class="inner-table">
              <tr><td data-testid="inner-cell">Inner</td></tr>
            </table>
          </td>
          <td>Outer cell</td>
        </tr>
      </table>
    `);
    appendToBody(container);
    const el = container.querySelector('[data-testid="inner-cell"]')!;
    expect(generateShortSelector(el)).toBe('td[data-testid="inner-cell"]');
    cleanupBody();
  });
});

describe('generateShortSelector - form elements', () => {
  it('select with name', () => {
    const el = getElement('<select name="country"><option value="us">US</option></select>');
    appendToBody(el);
    expect(generateShortSelector(el)).toBe('select[name="country"]');
    cleanupBody();
  });

  it('textarea with placeholder', () => {
    const el = getElement('<textarea name="comment" placeholder="Write a comment..."></textarea>');
    appendToBody(el);
    const result = generateShortSelector(el);
    expect(result).toContain('textarea');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('radio buttons with same name but different values', () => {
    const container = createDOM(`
      <form>
        <input type="radio" name="color" value="red" id="color-red">
        <input type="radio" name="color" value="blue" id="color-blue">
        <input type="radio" name="color" value="green" id="color-green">
      </form>
    `);
    appendToBody(container);
    const red = container.querySelector('#color-red')!;
    const blue = container.querySelector('#color-blue')!;
    expect(generateShortSelector(red)).toBe('#color-red');
    expect(generateShortSelector(blue)).toBe('#color-blue');
    cleanupBody();
  });

  it('checkbox with id', () => {
    const el = getElement('<input type="checkbox" id="agree-terms" name="agree">');
    appendToBody(el);
    expect(generateShortSelector(el)).toBe('#agree-terms');
    cleanupBody();
  });

  it('fieldset > legend structure', () => {
    const container = createDOM(`
      <fieldset id="personal-info">
        <legend>Personal Information</legend>
        <input name="first-name" type="text">
        <input name="last-name" type="text">
      </fieldset>
    `);
    appendToBody(container);
    const fieldset = container.querySelector('#personal-info')!;
    const legend = container.querySelector('legend')!;
    expect(generateShortSelector(fieldset)).toBe('#personal-info');
    const legendResult = generateShortSelector(legend);
    expect(document.querySelectorAll(legendResult).length).toBe(1);
    cleanupBody();
  });

  it('datalist element', () => {
    const container = createDOM(`
      <div>
        <input list="browsers" name="browser">
        <datalist id="browsers">
          <option value="Chrome">
          <option value="Firefox">
        </datalist>
      </div>
    `);
    appendToBody(container);
    const datalist = container.querySelector('#browsers')!;
    expect(generateShortSelector(datalist)).toBe('#browsers');
    cleanupBody();
  });

  it('output element', () => {
    const el = getElement('<output name="result" for="a b">0</output>');
    appendToBody(el);
    const result = generateShortSelector(el);
    expect(result).toContain('output');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('progress bar', () => {
    const el = getElement('<progress value="70" max="100" id="upload-progress">70%</progress>');
    appendToBody(el);
    expect(generateShortSelector(el)).toBe('#upload-progress');
    cleanupBody();
  });

  it('meter element', () => {
    const el = getElement('<meter value="0.7" min="0" max="1" id="disk-usage">70%</meter>');
    appendToBody(el);
    expect(generateShortSelector(el)).toBe('#disk-usage');
    cleanupBody();
  });
});

describe('generateShortSelector - ARIA attributes', () => {
  it('aria-labelledby', () => {
    const container = createDOM(`
      <div>
        <h2 id="dialog-title">Confirm</h2>
        <div aria-labelledby="dialog-title" role="dialog">Content</div>
      </div>
    `);
    appendToBody(container);
    const el = container.querySelector('[aria-labelledby="dialog-title"]')!;
    const result = generateShortSelector(el);
    expect(result).toContain('aria-labelledby');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('role="button" on div', () => {
    const el = getElement('<div role="button" tabindex="0">Click me</div>');
    appendToBody(el);
    const result = generateShortSelector(el);
    expect(result).toBe('div[role="button"]');
    cleanupBody();
  });

  it('role="dialog" with aria-modal', () => {
    const el = getElement(
      '<div role="dialog" aria-modal="true" aria-label="Confirm action">Dialog</div>'
    );
    appendToBody(el);
    const result = generateShortSelector(el);
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('role="tablist" with tabs', () => {
    const container = createDOM(`
      <div role="tablist" aria-label="Settings tabs">
        <div role="tab" aria-selected="true" id="tab-general">General</div>
        <div role="tab" aria-selected="false" id="tab-security">Security</div>
        <div role="tab" aria-selected="false" id="tab-privacy">Privacy</div>
      </div>
    `);
    appendToBody(container);
    const tablist = container.querySelector('[role="tablist"]')!;
    const tab1 = container.querySelector('#tab-general')!;
    const tab2 = container.querySelector('#tab-security')!;
    expect(generateShortSelector(tablist)).toContain('aria-label');
    expect(generateShortSelector(tab1)).toBe('#tab-general');
    expect(generateShortSelector(tab2)).toBe('#tab-security');
    cleanupBody();
  });

  it('role="treeitem" in tree', () => {
    const container = createDOM(`
      <ul role="tree" aria-label="File tree">
        <li role="treeitem" aria-expanded="true" data-testid="folder-src">
          <span>src</span>
        </li>
        <li role="treeitem" aria-expanded="false" data-testid="folder-test">
          <span>test</span>
        </li>
      </ul>
    `);
    appendToBody(container);
    const item1 = container.querySelector('[data-testid="folder-src"]')!;
    const item2 = container.querySelector('[data-testid="folder-test"]')!;
    expect(generateShortSelector(item1)).toBe('li[data-testid="folder-src"]');
    expect(generateShortSelector(item2)).toBe('li[data-testid="folder-test"]');
    cleanupBody();
  });
});

describe('generateShortSelector - framework patterns', () => {
  it('React-style className with hash', () => {
    const container = createDOM(`
      <div class="Button_button__3k2jH real-wrapper">A</div>
      <div class="Button_button__3k2jH other-wrapper">B</div>
    `);
    appendToBody(container);
    const el = container.querySelector('div.real-wrapper')!;
    const result = generateShortSelector(el);
    expect(result).not.toContain('Button_button__3k2jH');
    expect(result).toContain('real-wrapper');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('Vue scoped style', () => {
    const container = createDOM(`
      <div class="btn-v-abc123 unique-section">Section A</div>
      <div class="btn-v-abc123 unique-section">Section B</div>
    `);
    appendToBody(container);
    const el = container.querySelectorAll('div.unique-section')[0]!;
    const result = generateShortSelector(el);
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('Angular generated classes', () => {
    const container = createDOM(`
      <div class="ng-tns-c123-456 ng-star-inserted panel-header">Header</div>
      <div class="ng-tns-c123-456 ng-star-inserted panel-body">Body</div>
    `);
    appendToBody(container);
    const el = container.querySelector('div.panel-header')!;
    const result = generateShortSelector(el);
    expect(result).not.toContain('ng-tns');
    expect(result).not.toContain('ng-star');
    expect(result).toContain('panel-header');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('Tailwind utility classes all filtered', () => {
    const container = createDOM(`
      <div class="flex items-center gap-4 p-6 bg-white rounded-lg shadow-md">A</div>
      <div class="flex items-center gap-4 p-6 bg-white rounded-lg shadow-md">B</div>
    `);
    appendToBody(container);
    const el = container.querySelectorAll('div')[0]!;
    const result = generateShortSelector(el);
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('CSS Modules hash class', () => {
    const container = createDOM(`
      <div class="_1a2b3c content-block">Block A</div>
      <div class="_1a2b3c content-block">Block B</div>
    `);
    appendToBody(container);
    const el = container.querySelectorAll('div.content-block')[0]!;
    const result = generateShortSelector(el);
    expect(result).not.toContain('_1a2b3c');
    expect(result).toContain('content-block');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('Styled-components pattern', () => {
    const container = createDOM(`
      <div class="sc-dkzDqf styled-wrapper">Styled A</div>
      <div class="sc-dkzDqf styled-wrapper">Styled B</div>
    `);
    appendToBody(container);
    const el = container.querySelectorAll('div.styled-wrapper')[0]!;
    const result = generateShortSelector(el);
    expect(result).not.toContain('sc-dkzDqf');
    expect(result).toContain('styled-wrapper');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });
});

describe('generateShortSelector - dual attribute combos', () => {
  it('data-test + name combo when single attr not unique', () => {
    const container = createDOM(`
      <input data-test="field" name="email" type="email">
      <input data-test="field" name="phone" type="tel">
    `);
    appendToBody(container);
    const el = container.querySelector('input[name="email"]')!;
    const result = generateShortSelector(el);
    expect(result).toContain('email');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('aria-label + role combo', () => {
    const container = createDOM(`
      <div aria-label="menu" role="navigation">Nav</div>
      <div aria-label="menu" role="banner">Banner</div>
    `);
    appendToBody(container);
    const el = container.querySelector('[role="navigation"]')!;
    const result = generateShortSelector(el);
    expect(result).toContain('navigation');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('type + placeholder combo for inputs', () => {
    const container = createDOM(`
      <input type="text" placeholder="Search" name="a">
      <input type="text" placeholder="Search" name="b">
    `);
    appendToBody(container);
    const el = container.querySelector('input[name="a"]')!;
    const result = generateShortSelector(el);
    expect(result).toContain('a');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('three attributes - picks shortest combo', () => {
    const container = createDOM(`
      <input data-testid="field" name="x" type="text" placeholder="Enter">
      <input data-testid="field" name="x" type="password" placeholder="Enter">
    `);
    appendToBody(container);
    const el = container.querySelector('input[type="password"]')!;
    const result = generateShortSelector(el);
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });
});

describe('generateShortSelector - sibling selectors', () => {
  it('immediately after element with id', () => {
    const container = createDOM(`
      <div id="sib-a">A</div>
      <div class="sib-target">Target</div>
      <div class="sib-target">Other</div>
    `);
    appendToBody(container);
    const el = container.querySelector('#sib-a + div')!;
    const result = generateShortSelector(el);
    expect(result).toContain('#sib-a');
    expect(result).toContain('+');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('after element with data-testid', () => {
    const container = createDOM(`
      <span data-testid="prev-label">Label</span>
      <span>Value A</span>
      <span>Value B</span>
    `);
    appendToBody(container);
    const el = container.querySelector('span[data-testid="prev-label"] + span')!;
    const result = generateShortSelector(el);
    expect(result).toContain('+');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('skips non-unique sibling', () => {
    const container = createDOM(`
      <div class="non-unique">Skip</div>
      <div class="non-unique">Skip2</div>
      <div class="unique-sib">Target</div>
    `);
    appendToBody(container);
    const el = container.querySelector('div.unique-sib')!;
    const result = generateShortSelector(el);
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('three same elements in a row - middle one', () => {
    const container = createDOM(`
      <div class="row-item">First</div>
      <div class="row-item">Middle</div>
      <div class="row-item">Last</div>
    `);
    appendToBody(container);
    const el = container.querySelectorAll('div.row-item')[1]!;
    const result = generateShortSelector(el);
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });
});

describe('generateShortSelector - stress tests', () => {
  it('100 identical list items all get unique selectors', () => {
    const items = Array.from(
      { length: 100 },
      (_, i) => `<li class="list-item">Item ${i}</li>`
    ).join('');
    const container = createDOM(`<ul class="big-list">${items}</ul>`);
    appendToBody(container);
    const listItems = container.querySelectorAll('li');
    expect(listItems.length).toBe(100);
    const selectors = new Set<string>();
    for (const li of listItems) {
      const sel = generateShortSelector(li);
      expect(document.querySelectorAll(sel).length).toBe(1);
      selectors.add(sel);
    }
    expect(selectors.size).toBe(100);
    cleanupBody();
  });

  it('deeply nested 10 levels', () => {
    let html = '<div class="level-0">';
    for (let i = 1; i < 10; i++) {
      html += `<div class="level-${i}">`;
    }
    html += '<span id="deep-leaf">Leaf</span>';
    for (let i = 9; i >= 0; i--) {
      html += '</div>';
    }
    const container = createDOM(html);
    appendToBody(container);
    const el = container.querySelector('#deep-leaf')!;
    const result = generateShortSelector(el);
    expect(result).toBe('#deep-leaf');
    expect(document.querySelectorAll(result).length).toBe(1);
    cleanupBody();
  });

  it('page with 500+ elements', () => {
    const sections = Array.from({ length: 10 }, (_, s) => {
      const cards = Array.from(
        { length: 50 },
        (_, c) => `<div class="card"><span class="card-title">S${s}C${c}</span></div>`
      ).join('');
      return `<section class="section"><h2>Section ${s}</h2>${cards}</section>`;
    }).join('');
    const container = createDOM(`<main>${sections}</main>`);
    appendToBody(container);
    const elements = container.querySelectorAll('span');
    expect(elements.length).toBe(500);
    const sample = [elements[0]!, elements[249]!, elements[499]!];
    for (const el of sample) {
      const sel = generateShortSelector(el);
      expect(document.querySelectorAll(sel).length).toBe(1);
    }
    cleanupBody();
  });

  it('all standard HTML elements', () => {
    const html = `
      <div id="test-container">
        <header><nav id="nav">Nav</nav></header>
        <main>
          <article id="art"><section id="sec">Content</section></article>
          <aside id="aside">Side</aside>
        </main>
        <footer id="foot">Footer</footer>
        <address id="addr">Address</address>
        <details id="det"><summary>Sum</summary><p>Detail</p></details>
        <dialog id="dlg">Dialog</dialog>
        <figure id="fig"><figcaption>Caption</figcaption></figure>
        <mark id="mark">Marked</mark>
        <time id="tm">2024-01-01</time>
        <abbr id="abbr" title="abbr">ABBR</abbr>
        <cite id="cite">Cite</cite>
        <code id="code">Code</code>
        <dfn id="dfn">Definition</dfn>
        <em id="em">Emphasis</em>
        <kbd id="kbd">Keyboard</kbd>
        <samp id="samp">Sample</samp>
        <var id="var">Variable</var>
        <strong id="strong">Strong</strong>
        <sub id="sub">Sub</sub>
        <sup id="sup">Sup</sup>
        <small id="small">Small</small>
        <del id="del">Deleted</del>
        <ins id="ins">Inserted</ins>
        <blockquote id="bq">Quote</blockquote>
        <pre id="pre">Preformatted</pre>
        <hr id="hr">
        <br id="br">
      </div>
    `;
    const container = createDOM(html);
    appendToBody(container);
    const ids = [
      'nav',
      'art',
      'sec',
      'aside',
      'foot',
      'addr',
      'det',
      'dlg',
      'fig',
      'mark',
      'tm',
      'abbr',
      'cite',
      'code',
      'dfn',
      'em',
      'kbd',
      'samp',
      'var',
      'strong',
      'sub',
      'sup',
      'small',
      'del',
      'ins',
      'bq',
      'pre',
      'hr',
      'br',
    ];
    for (const id of ids) {
      const el = container.querySelector('#' + id);
      if (el) {
        const result = generateShortSelector(el);
        expect(result).toBe('#' + id);
        expect(document.querySelectorAll(result).length).toBe(1);
      }
    }
    cleanupBody();
  });
});
