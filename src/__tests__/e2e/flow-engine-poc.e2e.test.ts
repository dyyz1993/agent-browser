import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserManager } from '../../browser/index.js';
import { FlowExecutor } from '../../flow/flow-executor.js';
import type { SiteDefinition } from '../../flow/types.js';
import { getFixturePath } from './utils/test-helpers.js';

const executablePath = process.env.AGENT_BROWSER_EXECUTABLE_PATH;

const searchSite: SiteDefinition = {
  name: 'local-search',
  description: 'Local search page with extraction',
  baseUrl: getFixturePath('flow-search.html'),
  flows: {
    'search-and-extract': {
      id: 'search-and-extract',
      description: 'Search keyword and extract results',
      params: [{ name: 'keyword', type: 'string', required: true }],
      steps: [
        { id: 'navigate', action: 'navigate', url: '${baseUrl}' },
        { id: 'fill-search', action: 'fill', selector: '#kw', value: '${keyword}' },
        { id: 'click-search', action: 'click', selector: '#su' },
        { id: 'wait-results', action: 'wait', selector: '#content_left.visible', timeout: 5000 },
        {
          id: 'extract-results',
          action: 'extract',
          container: '.result',
          fields: {
            title: 'h3 a',
            url: { selector: 'h3 a', attribute: 'href' },
            abstract: '.c-abstract',
          },
          outputVar: 'results',
        },
      ],
      output: ['results'],
    },
  },
};

describe('Flow Engine POC - Local Search', () => {
  let browser: BrowserManager;
  let executor: FlowExecutor;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'flow-poc',
      headless: true,
      executablePath,
    });
    executor = new FlowExecutor(browser);
  }, 30000);

  afterAll(async () => {
    await browser.close();
  });

  it('should execute search-and-extract flow', async () => {
    const result = await executor.execute(searchSite, 'search-and-extract', {
      keyword: 'agent-browser',
    });

    console.log('Flow Result:', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.site).toBe('local-search');
    expect(result.flow).toBe('search-and-extract');
    expect(result.errors).toEqual([]);
    expect(result.data.results).toBeDefined();
    expect(Array.isArray(result.data.results)).toBe(true);
    expect((result.data.results as unknown[]).length).toBeGreaterThan(0);

    const firstResult = (result.data.results as Record<string, unknown>[])[0];
    expect(firstResult).toHaveProperty('title');
    expect(firstResult).toHaveProperty('url');
    expect(firstResult).toHaveProperty('abstract');
  }, 30000);
});
