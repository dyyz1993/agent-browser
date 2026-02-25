/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import {
  generateXPath,
  generateCSSPath,
  getSemanticClass,
  collectAttributes,
} from '../snapshot.js';

function createElement(html: string): Element {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.firstElementChild!;
}

function createDOM(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('generateXPath', () => {
  describe('优先使用 ID', () => {
    it('有 id 时生成 //*[@id="xxx"]', () => {
      const el = createElement('<button id="submit-btn">Submit</button>');
      expect(generateXPath(el)).toBe('//*[@id="submit-btn"]');
    });

    it('有 id 时忽略其他属性', () => {
      const el = createElement('<button id="submit" class="btn" data-testid="test">');
      expect(generateXPath(el)).toBe('//*[@id="submit"]');
    });
  });

  describe('使用 data-* 属性', () => {
    it('有 data-testid 时生成 //*[@data-testid="xxx"]', () => {
      const el = createElement('<button data-testid="login">Login</button>');
      expect(generateXPath(el)).toBe('//*[@data-testid="login"]');
    });

    it('有 data-id 时生成 //*[@data-id="xxx"]', () => {
      const el = createElement('<button data-id="123">Click</button>');
      expect(generateXPath(el)).toBe('//*[@data-id="123"]');
    });

    it('data-testid 优先于 data-id', () => {
      const el = createElement('<button data-testid="login" data-id="123">');
      expect(generateXPath(el)).toBe('//*[@data-testid="login"]');
    });
  });

  describe('使用语义化 class', () => {
    it('有语义化 class 时生成 contains(@class, "xxx")', () => {
      const el = createElement('<button class="btn-primary submit">Submit</button>');
      expect(generateXPath(el)).toBe(
        '//button[contains(@class, "btn-primary") and contains(@class, "submit")]'
      );
    });

    it('过滤纯样式类', () => {
      const el = createElement('<button class="mt-4 flex btn-primary">Submit</button>');
      expect(generateXPath(el)).toBe('//button[contains(@class, "btn-primary")]');
    });

    it('只取前 2 个语义化 class', () => {
      const el = createElement('<button class="btn primary large active">');
      expect(generateXPath(el)).toBe(
        '//button[contains(@class, "btn") and contains(@class, "primary")]'
      );
    });

    it('只有工具类时使用相对路径', () => {
      const el = createElement('<button class="flex items-center px-4">');
      expect(generateXPath(el)).toMatch(/^\/\//);
    });
  });

  describe('使用相对路径', () => {
    it('使用父级 id 作为锚点', () => {
      const container = createDOM('<div id="form"><button>Click</button></div>');
      const btn = container.querySelector('button')!;
      expect(generateXPath(btn)).toBe('//*[@id="form"]/button[1]');
    });

    it('使用语义化标签作为锚点', () => {
      const container = createDOM('<main><div><button>Click</button></div></main>');
      const btn = container.querySelector('button')!;
      expect(generateXPath(btn)).toBe('//main[1]/div[1]/button[1]');
    });
  });

  describe('边界情况', () => {
    it('没有 class 时生成相对路径', () => {
      const el = createElement('<button>Click</button>');
      expect(generateXPath(el)).toMatch(/^\/\//);
    });

    it('空 class 时生成相对路径', () => {
      const el = createElement('<button class="">Click</button>');
      expect(generateXPath(el)).toMatch(/^\/\//);
    });

    it('自定义元素有 id 时使用 id', () => {
      const el = createElement('<my-button id="custom">Custom</my-button>');
      expect(generateXPath(el)).toBe('//*[@id="custom"]');
    });
  });

  describe('深度嵌套元素', () => {
    it('应该处理 5 层以上嵌套', () => {
      const html = `
        <main>
          <section>
            <article>
              <div>
                <span>
                  <button>Deep</button>
                </span>
              </div>
            </article>
          </section>
        </main>
      `;
      const container = createDOM(html);
      const btn = container.querySelector('button')!;
      expect(generateXPath(btn, 10)).toMatch(/^\/\//);
    });

    it('应该使用语义化标签作为锚点', () => {
      const html = `
        <main>
          <div><div><div><div><button>Deep</button></div></div></div></div>
        </main>
      `;
      const container = createDOM(html);
      const btn = container.querySelector('button')!;
      expect(generateXPath(btn, 10)).toContain('main');
    });
  });

  describe('特殊字符处理', () => {
    it('应该处理 ID 中的连字符', () => {
      const el = createElement('<button id="btn-with-dashes">Click</button>');
      expect(generateXPath(el)).toBe('//*[@id="btn-with-dashes"]');
    });

    it('应该处理 ID 中的下划线', () => {
      const el = createElement('<button id="btn_with_underscore">Click</button>');
      expect(generateXPath(el)).toBe('//*[@id="btn_with_underscore"]');
    });

    it('应该处理 class 中的 Unicode 字符', () => {
      const el = createElement('<button class="按钮-primary">Click</button>');
      const xpath = generateXPath(el);
      expect(xpath).toMatch(/^\/\//);
    });
  });

  describe('同层级多元素', () => {
    it('应该为第 N 个相同元素生成正确的索引', () => {
      const html = `
        <div>
          <span>First</span>
          <span>Second</span>
          <span>Third</span>
        </div>
      `;
      const container = createDOM(html);
      const spans = container.querySelectorAll('span');
      expect(generateXPath(spans[0], 5)).toContain('[1]');
      expect(generateXPath(spans[1], 5)).toContain('[2]');
      expect(generateXPath(spans[2], 5)).toContain('[3]');
    });

    it('应该处理混合标签的同级元素', () => {
      const html = `
        <div>
          <p>Paragraph</p>
          <span>Span</span>
          <button>Button</button>
        </div>
      `;
      const container = createDOM(html);
      const btn = container.querySelector('button')!;
      const xpath = generateXPath(btn, 5);
      expect(xpath).toMatch(/^\/\//);
    });
  });
});

describe('generateCSSPath', () => {
  it('有 id 时生成 #xxx', () => {
    const el = createElement('<button id="submit">Submit</button>');
    expect(generateCSSPath(el)).toBe('#submit');
  });

  it('有 data-testid 时生成 [data-testid="xxx"]', () => {
    const el = createElement('<button data-testid="login">Login</button>');
    expect(generateCSSPath(el)).toBe('[data-testid="login"]');
  });

  it('有语义化 class 时生成 tag.class', () => {
    const el = createElement('<button class="btn-primary submit">Submit</button>');
    expect(generateCSSPath(el)).toBe('div > button.btn-primary.submit');
  });

  it('过滤纯样式类', () => {
    const el = createElement('<button class="mt-4 flex btn-primary">Submit</button>');
    expect(generateCSSPath(el)).toBe('div > button.btn-primary');
  });

  it('使用父级 id 作为锚点', () => {
    const container = createDOM('<div id="form"><button class="submit"></button></div>');
    const btn = container.querySelector('button')!;
    expect(generateCSSPath(btn)).toBe('#form > button.submit');
  });

  describe('多 class 组合处理', () => {
    it('应该处理多 class 元素', () => {
      const el = createElement('<button class="btn primary large active">Click</button>');
      const path = generateCSSPath(el);
      expect(path).toMatch(/button\.(btn|primary)/);
    });

    it('应该只保留前 2 个语义化 class', () => {
      const el = createElement('<button class="btn primary large active">Click</button>');
      const path = generateCSSPath(el);
      // 检查路径中不包含所有 4 个 class
      expect(path).not.toContain('large');
      expect(path).not.toContain('active');
    });
  });

  describe(':nth-child 处理重复元素', () => {
    it('应该使用 :nth-child 处理重复元素', () => {
      const html = `
        <ul>
          <li>Item 1</li>
          <li>Item 2</li>
          <li>Item 3</li>
        </ul>
      `;
      const container = createDOM(html);
      const items = container.querySelectorAll('li');
      // 第二个 li 应该包含 nth-child
      expect(generateCSSPath(items[1])).toContain(':nth-child');
    });
  });

  describe('语义化标签锚点', () => {
    it('应该在 nav 标签处停止', () => {
      const html = `
        <nav>
          <div><div><button>Nav Button</button></div></div>
        </nav>
      `;
      const container = createDOM(html);
      const btn = container.querySelector('button')!;
      expect(generateCSSPath(btn)).toMatch(/^nav/);
    });

    it('应该在 form 标签处停止', () => {
      const html = `
        <form id="login">
          <div><input type="text" class="input-field"></div>
        </form>
      `;
      const container = createDOM(html);
      const input = container.querySelector('input')!;
      // form 标签会作为锚点，路径以 #login 开头
      expect(generateCSSPath(input)).toMatch(/^#login/);
    });

    it('应该在 article 标签处停止', () => {
      const html = `
        <article>
          <div><p>Content</p></div>
        </article>
      `;
      const container = createDOM(html);
      const p = container.querySelector('p')!;
      expect(generateCSSPath(p)).toMatch(/^article/);
    });
  });
});

describe('getSemanticClass', () => {
  it('没有 class 时返回 null', () => {
    const el = createElement('<button>Click</button>');
    expect(getSemanticClass(el)).toBeNull();
  });

  it('只有工具类时返回 null', () => {
    const el = createElement('<button class="flex mt-4 bg-red">Click</button>');
    expect(getSemanticClass(el)).toBeNull();
  });

  it('返回语义化 class', () => {
    const el = createElement('<button class="btn-primary submit">Click</button>');
    expect(getSemanticClass(el)).toBe(
      'contains(@class, "btn-primary") and contains(@class, "submit")'
    );
  });

  it('过滤工具类', () => {
    const el = createElement('<button class="flex btn-primary mt-4 submit">Click</button>');
    expect(getSemanticClass(el)).toBe(
      'contains(@class, "btn-primary") and contains(@class, "submit")'
    );
  });

  describe('Tailwind 工具类过滤', () => {
    it('应该过滤已支持的 Tailwind 工具类', () => {
      // 现有实现支持过滤: flex, mt-*, mb-*, bg-*, text-*, rounded-* 等
      const el = createElement('<button class="flex mt-4 mb-2 bg-red text-sm">Click</button>');
      expect(getSemanticClass(el)).toBeNull();
    });

    it('应该过滤尺寸类', () => {
      const el = createElement('<button class="w-full h-12 p-3">Click</button>');
      expect(getSemanticClass(el)).toBeNull();
    });

    it('应该保留语义化的 class', () => {
      // 语义化 class 不应该被过滤
      const el = createElement('<button class="btn-primary card-title">Click</button>');
      expect(getSemanticClass(el)).toContain('btn-primary');
    });
  });

  describe('CSS-in-JS 类过滤', () => {
    // 注意: 当前实现不支持过滤 CSS-in-JS 类
    // 这些测试标记了期望的行为，未来可以实现
    it('不应该过滤 emotion 生成的类（当前行为）', () => {
      const el = createElement('<button class="css-1a2b3c">Click</button>');
      // 当前实现会保留 css-* 类
      expect(getSemanticClass(el)).not.toBeNull();
    });

    it('不应该过滤 styled-components 生成的类（当前行为）', () => {
      const el = createElement('<button class="sc-bdVaJa-bZkQJt">Click</button>');
      // 当前实现会保留 sc-* 类
      expect(getSemanticClass(el)).not.toBeNull();
    });
  });

  describe('BEM 命名保留', () => {
    it('应该保留 BEM 块名', () => {
      const el = createElement('<button class="button">Click</button>');
      expect(getSemanticClass(el)).toBe('contains(@class, "button")');
    });

    it('应该保留 BEM 元素名', () => {
      const el = createElement('<span class="button__icon">Icon</span>');
      expect(getSemanticClass(el)).toBe('contains(@class, "button__icon")');
    });

    it('应该保留 BEM 修饰符名', () => {
      const el = createElement('<button class="button--primary">Click</button>');
      expect(getSemanticClass(el)).toBe('contains(@class, "button--primary")');
    });

    it('应该保留组合 BEM 类', () => {
      const el = createElement(
        '<button class="button button--large button--primary">Click</button>'
      );
      const result = getSemanticClass(el);
      expect(result).toContain('button');
      expect(result).toContain('button--large');
    });
  });
});

describe('collectAttributes', () => {
  it('收集所有属性', () => {
    const el = createElement('<button id="submit" class="btn" type="submit">');
    expect(collectAttributes(el)).toEqual({
      id: 'submit',
      class: 'btn',
      type: 'submit',
    });
  });

  it('没有属性时返回空对象', () => {
    const el = createElement('<button>Click</button>');
    expect(collectAttributes(el)).toEqual({});
  });

  it('处理 data-* 属性', () => {
    const el = createElement('<button data-testid="submit" data-id="123">');
    expect(collectAttributes(el)).toEqual({
      'data-testid': 'submit',
      'data-id': '123',
    });
  });

  it('处理布尔属性', () => {
    const el = createElement('<input type="checkbox" checked disabled>');
    expect(collectAttributes(el)).toEqual({
      type: 'checkbox',
      checked: '',
      disabled: '',
    });
  });

  it('处理空值属性', () => {
    const el = createElement('<input type="text" value="">');
    expect(collectAttributes(el)).toEqual({
      type: 'text',
      value: '',
    });
  });

  describe('aria-* 属性', () => {
    it('应该收集 aria-label 属性', () => {
      const el = createElement('<button aria-label="Close">X</button>');
      expect(collectAttributes(el)).toEqual({
        'aria-label': 'Close',
      });
    });

    it('应该收集多个 aria-* 属性', () => {
      const el = createElement(
        '<button aria-label="Close" aria-hidden="false" aria-describedby="tooltip">X</button>'
      );
      expect(collectAttributes(el)).toEqual({
        'aria-label': 'Close',
        'aria-hidden': 'false',
        'aria-describedby': 'tooltip',
      });
    });

    it('应该收集 aria-expanded 和 aria-controls', () => {
      const el = createElement('<button aria-expanded="true" aria-controls="menu">Menu</button>');
      expect(collectAttributes(el)).toEqual({
        'aria-expanded': 'true',
        'aria-controls': 'menu',
      });
    });
  });

  describe('事件处理属性', () => {
    it('应该收集 onclick 属性', () => {
      const el = createElement('<button onclick="alert(1)">Click</button>');
      const attrs = collectAttributes(el);
      expect(attrs['onclick']).toBe('alert(1)');
    });

    it('应该收集多个事件处理属性', () => {
      const el = createElement(
        '<button onclick="click()" onmouseover="hover()" onfocus="focus()">Click</button>'
      );
      const attrs = collectAttributes(el);
      expect(attrs['onclick']).toBe('click()');
      expect(attrs['onmouseover']).toBe('hover()');
      expect(attrs['onfocus']).toBe('focus()');
    });
  });

  describe('href 和 src 属性', () => {
    it('应该收集 a 标签的 href 和 target', () => {
      const el = createElement('<a href="https://example.com" target="_blank">Link</a>');
      expect(collectAttributes(el)).toEqual({
        href: 'https://example.com',
        target: '_blank',
      });
    });

    it('应该收集 img 标签的 src 和 alt', () => {
      const el = createElement('<img src="image.png" alt="Description" width="100" height="100">');
      expect(collectAttributes(el)).toEqual({
        src: 'image.png',
        alt: 'Description',
        width: '100',
        height: '100',
      });
    });

    it('应该收集相对路径 href', () => {
      const el = createElement('<a href="/path/to/page?query=value#hash">Link</a>');
      expect(collectAttributes(el)).toEqual({
        href: '/path/to/page?query=value#hash',
      });
    });
  });

  describe('name 和 value 属性', () => {
    it('应该收集 input 的 name 和 value', () => {
      const el = createElement('<input type="text" name="username" value="default">');
      expect(collectAttributes(el)).toEqual({
        type: 'text',
        name: 'username',
        value: 'default',
      });
    });

    it('应该收集 select 的 name', () => {
      const el = createElement('<select name="country"><option value="cn">China</option></select>');
      expect(collectAttributes(el)).toEqual({
        name: 'country',
      });
    });

    it('应该收集 button 的 name 和 value', () => {
      const el = createElement('<button type="submit" name="action" value="save">Save</button>');
      expect(collectAttributes(el)).toEqual({
        type: 'submit',
        name: 'action',
        value: 'save',
      });
    });
  });

  describe('属性值边界情况', () => {
    it('应该处理包含引号的属性值', () => {
      const el = createElement('<button title="He said \'Hello\'">Click</button>');
      const attrs = collectAttributes(el);
      expect(attrs['title']).toBe("He said 'Hello'");
    });

    it('应该处理包含空格的属性值', () => {
      const el = createElement('<button title="Multiple   spaces   here">Click</button>');
      const attrs = collectAttributes(el);
      expect(attrs['title']).toBe('Multiple   spaces   here');
    });

    it('应该处理超长属性值', () => {
      const longValue = 'a'.repeat(1000);
      const el = createElement(`<button data-long="${longValue}">Click</button>`);
      const attrs = collectAttributes(el);
      expect(attrs['data-long']).toBe(longValue);
    });

    it('应该处理特殊 HTML 字符', () => {
      const el = createElement('<button data-html="<div>&amp;</div>">Click</button>');
      const attrs = collectAttributes(el);
      // HTML 实体在 DOM 中会被解析，所以 &amp; 会变成 &
      expect(attrs['data-html']).toBe('<div>&</div>');
    });
  });

  describe('role 和 tabindex 属性', () => {
    it('应该收集 role 属性', () => {
      const el = createElement('<div role="button" tabindex="0">Clickable</div>');
      expect(collectAttributes(el)).toEqual({
        role: 'button',
        tabindex: '0',
      });
    });

    it('应该收集 role="dialog"', () => {
      const el = createElement('<div role="dialog" aria-modal="true">Dialog</div>');
      expect(collectAttributes(el)).toEqual({
        role: 'dialog',
        'aria-modal': 'true',
      });
    });
  });
});
