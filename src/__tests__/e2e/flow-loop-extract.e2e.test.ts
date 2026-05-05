import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { FlowExecutor } from '../../flow/flow-executor.js';
import type { SiteDefinition } from '../../flow/types.js';
import { getFixturePath } from './utils/test-helpers.js';

const executablePath = process.env.AGENT_BROWSER_EXECUTABLE_PATH;

const infiniteScrollSite: SiteDefinition = {
  name: 'infinite-scroll',
  baseUrl: getFixturePath('flow-infinite-scroll.html'),
  flows: {
    'scroll-and-collect': {
      id: 'scroll-and-collect',
      steps: [
        { id: 'nav', action: 'navigate', url: '${baseUrl}' },
        {
          id: 'scroll-loop',
          action: 'scrollUntil',
          selector: '.item',
          scrollDirection: 'down',
          scrollAmount: 600,
          termination: { maxIterations: 15, noNewItemsCount: 3 },
          extractOnEachScroll: {
            id: 'extract-items',
            action: 'extract',
            container: '.item',
            fields: { title: '.title', desc: '.desc' },
            outputVar: 'items',
          },
        },
      ],
      output: ['items'],
    },
  },
};

const paginatedSite: SiteDefinition = {
  name: 'paginated',
  baseUrl: getFixturePath('flow-paginated.html'),
  flows: {
    'paginate-and-collect': {
      id: 'paginate-and-collect',
      steps: [
        { id: 'nav', action: 'navigate', url: '${baseUrl}' },
        {
          id: 'paginate',
          action: 'clickPaginate',
          nextSelector: '#next-btn',
          waitForNavigation: 'domcontentloaded',
          termination: { maxIterations: 5 },
          extractBeforeClick: {
            id: 'extract-page',
            action: 'extract',
            container: '.item',
            fields: { name: '.name', price: '.price' },
            outputVar: 'products',
          },
        },
      ],
      output: ['products'],
    },
  },
};

const forEachItemSite: SiteDefinition = {
  name: 'foreach-item',
  baseUrl: getFixturePath('flow-item-list.html'),
  flows: {
    'iterate-items': {
      id: 'iterate-items',
      steps: [
        { id: 'nav', action: 'navigate', url: '${baseUrl}' },
        {
          id: 'loop-items',
          action: 'forEachItem',
          itemSelector: '.item-card',
          itemSteps: [
            {
              id: 'eval-detail',
              action: 'eval',
              value:
                "((() => { const items = document.querySelectorAll('.item-card'); const idx = ${currentItemIndex}; const el = items[idx]; return el ? el.querySelector('.name')?.textContent || '' : ''; })())",
            },
          ],
        },
      ],
      output: [],
    },
  },
};

const repeatWhileSite: SiteDefinition = {
  name: 'repeat-while',
  baseUrl: getFixturePath('flow-counter.html'),
  flows: {
    'click-until-done': {
      id: 'click-until-done',
      steps: [
        { id: 'nav', action: 'navigate', url: '${baseUrl}' },
        {
          id: 'repeat',
          action: 'repeatWhile',
          conditionJs: "document.getElementById('increment-btn').disabled === false",
          termination: { maxIterations: 10 },
          loopSteps: [
            { id: 'click-btn', action: 'click', selector: '#increment-btn' },
            { id: 'wait-a-bit', action: 'wait', timeout: 200 },
          ],
        },
        {
          id: 'get-counter',
          action: 'eval',
          value: "document.getElementById('counter').textContent.trim()",
          outputVar: 'counterValue',
        },
      ],
      output: ['counterValue'],
    },
  },
};

describe('Flow Engine - Loop/Iteration Actions', () => {
  let browser: BrowserManager;
  let executor: FlowExecutor;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'flow-loop-test',
      headless: true,
      executablePath,
    });
    executor = new FlowExecutor(browser);
  }, 30000);

  afterAll(async () => {
    await browser.close();
  });

  describe('scrollUntil', () => {
    it('should scroll and collect all items from infinite scroll page', async () => {
      const result = await executor.execute(infiniteScrollSite, 'scroll-and-collect', {});

      console.log('scrollUntil result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.data.items).toBeDefined();

      const items = result.data.items as Array<Record<string, unknown>>;
      expect(items.length).toBeGreaterThan(10);

      const allTitles = items.map((i) => i.title as string);
      expect(allTitles).toContain('Item 1');
      expect(allTitles).toContain('Item 50');
    }, 60000);
  });

  describe('clickPaginate', () => {
    it('should click through pagination and extract data from each page', async () => {
      const result = await executor.execute(paginatedSite, 'paginate-and-collect', {});

      console.log('clickPaginate result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.data.products).toBeDefined();

      const products = result.data.products as Array<Record<string, unknown>>;
      expect(products.length).toBeGreaterThan(10);

      const hasMultiPage = products.some(
        (p) =>
          (p.name as string)?.includes('Product 11') || (p.name as string)?.includes('Product 15')
      );
      expect(hasMultiPage).toBe(true);
    }, 60000);
  });

  describe('forEachItem', () => {
    it('should iterate over items and execute sub-steps for each', async () => {
      const result = await executor.execute(forEachItemSite, 'iterate-items', {});

      console.log('forEachItem result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);

      const ctx = executor.getContext();
      expect(ctx.variables['totalItems']).toBe(5);
      expect(ctx.variables['currentItemIndex']).toBe(4);
    }, 60000);
  });

  describe('repeatWhile', () => {
    it('should repeat steps while condition is true then stop', async () => {
      const result = await executor.execute(repeatWhileSite, 'click-until-done', {});

      console.log('repeatWhile result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);

      const counterValue = result.data.counterValue;
      expect(counterValue).toBeDefined();
      expect(String(counterValue)).toBe('5');
    }, 60000);
  });
});
