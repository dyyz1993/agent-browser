import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BrowserManager } from '../../browser/index.js';
import { FlowExecutor } from '../../flow/flow-executor.js';
import type { SiteDefinition } from '../../flow/types.js';
import {
  parseYamlSiteFile,
  loadAllSites,
  findFlow,
  validateYamlFile,
} from '../../flow/yaml-parser.js';
import { getFixturePath } from './utils/test-helpers.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync, rmSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const executablePath =
  process.env.AGENT_BROWSER_EXECUTABLE_PATH || '/Applications/Chromium.app/Contents/MacOS/Chromium';

const projectRoot = path.resolve(__dirname, '../../..');
const baiduYamlPath = path.join(projectRoot, 'sites/baidu-search.yaml');

describe('YAML Parser', () => {
  it('parseYamlSiteFile - parses baidu-search.yaml', () => {
    const site = parseYamlSiteFile(baiduYamlPath);

    expect(site.name).toBe('baidu-search');
    expect(site.description).toBe('Baidu search with pagination extraction');
    expect(site.baseUrl).toBe('https://www.baidu.com');
    expect(Object.keys(site.flows)).toContain('search-and-extract');
  });

  it('parseYamlSiteFile - parses flow params correctly', () => {
    const site = parseYamlSiteFile(baiduYamlPath);
    const flow = site.flows['search-and-extract'];

    expect(flow.id).toBe('search-and-extract');
    expect(flow.params).toHaveLength(2);
    expect(flow.params![0]).toEqual({
      name: 'keyword',
      type: 'string',
      required: true,
      description: undefined,
      default: undefined,
    });
    expect(flow.params![1]).toEqual({
      name: 'maxPages',
      type: 'number',
      required: undefined,
      description: undefined,
      default: 2,
    });
  });

  it('parseYamlSiteFile - parses flow steps correctly', () => {
    const site = parseYamlSiteFile(baiduYamlPath);
    const flow = site.flows['search-and-extract'];

    expect(flow.steps).toHaveLength(5);
    expect(flow.steps[0]).toEqual({
      id: 'navigate',
      action: 'navigate',
      url: '${baseUrl}',
    });
    expect(flow.steps[1].action).toBe('fill');
    expect(flow.steps[1].selector).toBe('#kw');
    expect(flow.steps[1].value).toBe('${keyword}');
    expect(flow.steps[3].action).toBe('wait');
    expect(flow.steps[3].selector).toBe('#content_left');
    expect(flow.steps[4].action).toBe('extract');
    expect(flow.steps[4].container).toBe('.result');
    expect(flow.steps[4].outputVar).toBe('results');
  });

  it('parseYamlSiteFile - parses output array', () => {
    const site = parseYamlSiteFile(baiduYamlPath);
    const flow = site.flows['search-and-extract'];

    expect(flow.output).toEqual(['results']);
  });
});

describe('Site Loading', () => {
  it('loadAllSites - loads from sites/ directory', () => {
    const sites = loadAllSites();

    expect(sites.size).toBeGreaterThanOrEqual(1);
    expect(sites.has('baidu-search')).toBe(true);
  });
});

describe('findFlow', () => {
  it('finds flow by full reference "site.flow"', () => {
    const site = parseYamlSiteFile(baiduYamlPath);
    const sites = new Map([[site.name, site]]);
    const result = findFlow(sites, 'baidu-search.search-and-extract');

    expect(result).not.toBeNull();
    expect(result!.site.name).toBe('baidu-search');
    expect(result!.flowName).toBe('search-and-extract');
    expect(result!.flow.id).toBe('search-and-extract');
  });

  it('finds flow by short name (search all sites)', () => {
    const site = parseYamlSiteFile(baiduYamlPath);
    const sites = new Map([[site.name, site]]);
    const result = findFlow(sites, 'search-and-extract');

    expect(result).not.toBeNull();
    expect(result!.flowName).toBe('search-and-extract');
    expect(result!.site.name).toBe('baidu-search');
  });

  it('returns null for non-existent flow', () => {
    const site = parseYamlSiteFile(baiduYamlPath);
    const sites = new Map([[site.name, site]]);
    const result = findFlow(sites, 'non-existent-flow');

    expect(result).toBeNull();
  });

  it('returns null for non-existent site.flow reference', () => {
    const site = parseYamlSiteFile(baiduYamlPath);
    const sites = new Map([[site.name, site]]);
    const result = findFlow(sites, 'fake-site.fake-flow');

    expect(result).toBeNull();
  });
});

describe('validateYamlFile', () => {
  const tmpDir = path.join(__dirname, '__tmp_yaml_validate__');

  beforeAll(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('validates a correct YAML file', () => {
    const result = validateYamlFile(baiduYamlPath);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('reports errors for invalid YAML', () => {
    const badFile = path.join(tmpDir, 'bad.yaml');
    writeFileSync(badFile, 'site:\n  description: "missing name"');
    const result = validateYamlFile(badFile);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('reports errors for YAML with no flows', () => {
    const noFlowsFile = path.join(tmpDir, 'noflows.yaml');
    writeFileSync(noFlowsFile, 'site:\n  name: test-site');
    const result = validateYamlFile(noFlowsFile);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('No flows defined');
  });
});

describe('Flow run via FlowExecutor with parsed YAML', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'yaml-flow-test',
      headless: true,
      executablePath,
    });
  }, 30000);

  afterAll(async () => {
    await browser.close();
  });

  it('parses YAML and executes flow against local fixture', async () => {
    const site: SiteDefinition = {
      name: 'yaml-test',
      description: 'Parsed from YAML and executed',
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
            {
              id: 'wait-results',
              action: 'wait',
              selector: '#content_left.visible',
              timeout: 5000,
            },
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

    const executor = new FlowExecutor(browser);
    const result = await executor.execute(site, 'search-and-extract', { keyword: 'test query' });

    expect(result.success).toBe(true);
    expect(result.site).toBe('yaml-test');
    expect(result.flow).toBe('search-and-extract');
    expect(result.errors).toHaveLength(0);
    expect(Array.isArray(result.data.results)).toBe(true);
    expect(result.data.results.length).toBeGreaterThan(0);
    expect(result.duration).toBeGreaterThan(0);
  });
});
