# Ref 序号获取元素信息分析

## 问题

用户拿到了 ref 序号（如 `e1`, `e2`），想知道能否获取到该元素的：

1. **path 地址**（如 XPath、CSS Selector 路径）
2. **元素属性**（如 id, class, href, src 等）

***

## 解决方案

### 参数设计

在 `snapshot` 命令中添加两个参数：

| 参数      | 类型        | 说明                            | 必须配合 selector |
| ------- | --------- | ----------------------------- | ------------- |
| `path`  | `boolean` | 在 refs 中增加 xpath 和 cssPath 字段 | 是             |
| `attrs` | `boolean` | 在 refs 中增加 attributes 字段      | 是             |

### 响应结构变化

**普通 snapshot 响应**：

```json
{
  "tree": "- button \"Submit\" [ref=e1]",
  "refs": {
    "e1": {
      "role": "button",
      "name": "Submit",
      "nth": 0
    }
  }
}
```

**path=true 时的响应**：

```json
{
  "tree": "- button \"Submit\" [ref=e1]",
  "refs": {
    "e1": {
      "role": "button",
      "name": "Submit",
      "nth": 0,
      "xpath": "//*[@id=\"submit-btn\"]",
      "cssPath": "#submit-btn"
    }
  }
}
```

**attrs=true 时的响应**：

```json
{
  "tree": "- button \"Submit\" [ref=e1]",
  "refs": {
    "e1": {
      "role": "button",
      "name": "Submit",
      "nth": 0,
      "attributes": {
        "id": "submit-btn",
        "class": "btn-primary",
        "type": "submit"
      }
    }
  }
}
```

***

## XPath 生成规范

### 优先级

1. **ID** - `//*[@id="xxx"]`
2. **data-testid** - `//*[@data-testid="xxx"]`
3. **data-id** - `//*[@data-id="xxx"]`
4. **语义化 class** - `//tag[contains(@class, "xxx")]`
5. **相对路径** - 使用父级锚点，最多 5 层

### 过滤规则

过滤纯样式类（Tailwind 等）：

* `flex`, `grid`, `block`, `inline`, `hidden`

* `mt-*`, `mb-*`, `ml-*`, `mr-*`, `pt-*`, `pb-*`, `pl-*`, `pr-*`

* `w-*`, `h-*`, `min-*`, `max-*`

* `text-*`, `font-*`, `bg-*`, `border-*`

* `rounded-*`, `shadow-*`, `opacity-*`

* `hover:*`, `focus:*`, `active:*`

### 示例

| 元素                                    | XPath                                                                      | CSS Path                     |
| ------------------------------------- | -------------------------------------------------------------------------- | ---------------------------- |
| `<button id="submit">`                | `//*[@id="submit"]`                                                        | `#submit`                    |
| `<button data-testid="login">`        | `//*[@data-testid="login"]`                                                | `[data-testid="login"]`      |
| `<button class="btn-primary submit">` | `//button[contains(@class, "btn-primary") and contains(@class, "submit")]` | `button.btn-primary.submit`  |
| `<button class="mt-4 flex">`          | `//main/button[1]`                                                         | `main > button:nth-child(1)` |

***

## 单元测试

### `src/__tests__/snapshot.path.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { generateXPath, generateCSSPath, getSemanticClass } from '../snapshot.js';

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
      expect(generateXPath(el)).toBe('//button[contains(@class, "btn-primary") and contains(@class, "submit")]');
    });

    it('过滤纯样式类', () => {
      const el = createElement('<button class="mt-4 flex btn-primary">Submit</button>');
      expect(generateXPath(el)).toBe('//button[contains(@class, "btn-primary")]');
    });

    it('只取前 2 个语义化 class', () => {
      const el = createElement('<button class="btn primary large active">');
      expect(generateXPath(el)).toBe('//button[contains(@class, "btn") and contains(@class, "primary")]');
    });

    it('只有工具类时使用相对路径', () => {
      const el = createElement('<button class="flex items-center px-4">');
      expect(generateXPath(el)).toMatch(/^\/\//);
    });
  });

  describe('使用相对路径', () => {
    it('使用父级 id 作为锚点', () => {
      const container = createDOM('<div id="form"><button class="submit"></button></div>');
      const btn = container.querySelector('button')!;
      expect(generateXPath(btn)).toBe('//*[@id="form"]/button[1]');
    });

    it('使用语义化标签作为锚点', () => {
      const container = createDOM('<main><div><button class="submit"></button></div></main>');
      const btn = container.querySelector('button')!;
      expect(generateXPath(btn)).toBe('//main/div/button[1]');
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
    expect(generateCSSPath(el)).toBe('button.btn-primary.submit');
  });

  it('过滤纯样式类', () => {
    const el = createElement('<button class="mt-4 flex btn-primary">Submit</button>');
    expect(generateCSSPath(el)).toBe('button.btn-primary');
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
    expect(getSemanticClass(el)).toBe('contains(@class, "btn-primary") and contains(@class, "submit")');
  });

  it('过滤工具类', () => {
    const el = createElement('<button class="flex btn-primary mt-4 submit">Click</button>');
    expect(getSemanticClass(el)).toBe('contains(@class, "btn-primary") and contains(@class, "submit")');
  });
});

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
```

### `src/__tests__/snapshot.attrs.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { collectAttributes } from '../snapshot.js';

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

  it('处理特殊字符属性值', () => {
    const el = createElement('<a href="https://example.com?foo=bar&baz=qux">');
    expect(collectAttributes(el)).toEqual({
      href: 'https://example.com?foo=bar&baz=qux',
    });
  });
});

function createElement(html: string): Element {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.firstElementChild!;
}
```

### `src/__tests__/e2e/snapshot.path.e2e.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserManager } from '../../browser.js';

describe('snapshot path 和 attrs E2E', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  describe('path 参数', () => {
    it('返回 xpath 和 cssPath', async () => {
      await browser.navigate('data:text/html,<button id="test-btn">Click</button>');
      const result = await browser.getSnapshot({ selector: 'body', path: true });
      
      expect(result.refs['e1'].xpath).toBe('//*[@id="test-btn"]');
      expect(result.refs['e1'].cssPath).toBe('#test-btn');
    });

    it('没有 id 时生成相对路径', async () => {
      await browser.navigate('data:text/html,<main><button class="submit">Click</button></main>');
      const result = await browser.getSnapshot({ selector: 'main', path: true });
      
      expect(result.refs['e1'].xpath).toContain('button');
      expect(result.refs['e1'].cssPath).toContain('button');
    });
  });

  describe('attrs 参数', () => {
    it('返回元素属性', async () => {
      await browser.navigate('data:text/html,<button id="test" class="btn" type="submit">Click</button>');
      const result = await browser.getSnapshot({ selector: 'body', attrs: true });
      
      expect(result.refs['e1'].attributes).toEqual({
        id: 'test',
        class: 'btn',
        type: 'submit',
      });
    });
  });

  describe('path 和 attrs 同时使用', () => {
    it('同时返回 xpath、cssPath 和 attributes', async () => {
      await browser.navigate('data:text/html,<button id="test" class="btn">Click</button>');
      const result = await browser.getSnapshot({ selector: 'body', path: true, attrs: true });
      
      expect(result.refs['e1'].xpath).toBe('//*[@id="test"]');
      expect(result.refs['e1'].cssPath).toBe('#test');
      expect(result.refs['e1'].attributes).toEqual({
        id: 'test',
        class: 'btn',
      });
    });
  });

  describe('错误处理', () => {
    it('path=true 但没有 selector 时返回错误', async () => {
      await browser.navigate('data:text/html,<button>Click</button>');
      
      await expect(browser.getSnapshot({ path: true })).rejects.toThrow(/selector/);
    });

    it('attrs=true 但没有 selector 时返回错误', async () => {
      await browser.navigate('data:text/html,<button>Click</button>');
      
      await expect(browser.getSnapshot({ attrs: true })).rejects.toThrow(/selector/);
    });
  });
});
```

***

## 实现步骤

### 1. 修改 `src/protocol.ts`

```typescript
const snapshotSchema = withFrame(baseCommandSchema.extend({
  action: z.literal('snapshot'),
  interactive: z.boolean().optional(),
  maxDepth: z.number().nonnegative().optional(),
  compact: z.boolean().optional(),
  selector: z.string().optional(),
  cursor: z.boolean().optional(),
  path: z.boolean().optional(),
  attrs: z.boolean().optional(),
}));
```

### 2. 修改 `src/snapshot.ts`

* 更新 `SnapshotOptions` 接口，添加 `path` 和 `attrs`

* 添加 `generateXPath()` 函数

* 添加 `generateCSSPath()` 函数

* 添加 `getSemanticClass()` 函数

* 添加 `collectAttributes()` 函数

* 修改 `getEnhancedSnapshot()` 逻辑

### 3. 修改 `src/browser.ts`

更新 `getSnapshot()` 方法，传递 `path` 和 `attrs` 参数。

### 4. 添加单元测试

### 5. 更新文档

***

## 总结

| 特性          | 说明                                         |
| ----------- | ------------------------------------------ |
| `path` 参数   | 在 refs 中增加 `xpath` 和 `cssPath` 字段          |
| `attrs` 参数  | 在 refs 中增加 `attributes` 字段                 |
| 必须性         | `path=true` 或 `attrs=true` 时 `selector` 必填 |
| XPath 规范    | 优先 id > data-\* > 语义class > 位置索引，最多 5 层    |
| CSS Path 规范 | 同 XPath                                    |

