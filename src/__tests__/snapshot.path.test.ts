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
});
