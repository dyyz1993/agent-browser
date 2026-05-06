import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import {
  parseYamlSiteFile,
  loadSitesFromDirectory,
  findFlow,
  validateYamlFile,
  getDefaultSitesDirs,
} from '../flow/yaml-parser.js';
import type { SiteDefinition } from '../flow/types.js';

const TMP_DIR = join(process.cwd(), 'tmp-test-yaml-parser');

beforeEach(() => {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('yaml-parser', () => {
  describe('parseYamlSiteFile', () => {
    it('should parse a valid site YAML with flows', () => {
      const yaml = `
site:
  name: test-site
  description: A test site
  baseUrl: "https://example.com"
flows:
  searchFlow:
    description: Search something
    params:
      - name: query
        type: string
        required: true
    steps:
      - id: nav1
        action: navigate
        url: "https://example.com"
      - id: click1
        action: click
        selector: "#btn"
    output:
      - results
`;
      const filePath = join(TMP_DIR, 'valid.yaml');
      writeFileSync(filePath, yaml, 'utf-8');

      const result = parseYamlSiteFile(filePath);
      expect(result.name).toBe('test-site');
      expect(result.description).toBe('A test site');
      expect(result.baseUrl).toBe('https://example.com');
      expect(result.flows.searchFlow.steps).toHaveLength(2);
      expect(result.flows.searchFlow.steps[0].id).toBe('nav1');
      expect(result.flows.searchFlow.steps[0].action).toBe('navigate');
      expect(result.flows.searchFlow.params).toHaveLength(1);
      expect(result.flows.searchFlow.params![0].name).toBe('query');
      expect(result.flows.searchFlow.output).toEqual(['results']);
    });

    it('should parse healing and retry config', () => {
      const yaml = `
site:
  name: healing-site
flows:
  flow1:
    steps:
      - id: s1
        action: click
        selector: "#btn"
    healing:
      enabled: true
      strategies:
        - fallback
        - identity_text
      maxAttempts: 5
      attemptDelayMs: 300
    retry:
      maxAttempts: 3
      delayMs: 1000
      strategy: exponential
      backoffMultiplier: 2
`;
      const filePath = join(TMP_DIR, 'healing.yaml');
      writeFileSync(filePath, yaml, 'utf-8');

      const result = parseYamlSiteFile(filePath);
      const flow = result.flows.flow1;
      expect(flow.healing?.enabled).toBe(true);
      expect(flow.healing?.strategies).toEqual(['fallback', 'identity_text']);
      expect(flow.healing?.maxAttempts).toBe(5);
      expect(flow.retry?.maxAttempts).toBe(3);
      expect(flow.retry?.strategy).toBe('exponential');
      expect(flow.retry?.backoffMultiplier).toBe(2);
    });

    it('should throw for missing site key', () => {
      const yaml = `
flows:
  f1:
    steps:
      - id: s1
        action: navigate
        url: "https://example.com"
`;
      const filePath = join(TMP_DIR, 'no-site.yaml');
      writeFileSync(filePath, yaml, 'utf-8');

      expect(() => parseYamlSiteFile(filePath)).toThrow('missing "site" root key');
    });

    it('should throw for missing site.name', () => {
      const yaml = `
site:
  description: no name
`;
      const filePath = join(TMP_DIR, 'no-name.yaml');
      writeFileSync(filePath, yaml, 'utf-8');

      expect(() => parseYamlSiteFile(filePath)).toThrow('missing "site.name"');
    });

    it('should parse site with no flows', () => {
      const yaml = `
site:
  name: empty-flows
`;
      const filePath = join(TMP_DIR, 'no-flows.yaml');
      writeFileSync(filePath, yaml, 'utf-8');

      const result = parseYamlSiteFile(filePath);
      expect(result.name).toBe('empty-flows');
      expect(Object.keys(result.flows)).toHaveLength(0);
    });

    it('should parse nested step types (thenSteps, elseSteps, loopSteps, etc.)', () => {
      const yaml = `
site:
  name: nested
flows:
  condFlow:
    steps:
      - id: cond1
        action: condition
        condition: "mode==advanced"
        thenSteps:
          - id: then1
            action: click
            selector: "#adv-btn"
        elseSteps:
          - id: else1
            action: click
            selector: "#basic-btn"
`;
      const filePath = join(TMP_DIR, 'nested.yaml');
      writeFileSync(filePath, yaml, 'utf-8');

      const result = parseYamlSiteFile(filePath);
      const step = result.flows.condFlow.steps[0];
      expect(step.thenSteps).toHaveLength(1);
      expect(step.thenSteps![0].id).toBe('then1');
      expect(step.elseSteps).toHaveLength(1);
      expect(step.elseSteps![0].id).toBe('else1');
    });

    it('should parse blockingConditions and intervention', () => {
      const yaml = `
site:
  name: blocking
flows:
  f1:
    steps:
      - id: detect1
        action: detectBlocking
        blockingConditions:
          - selector: "#cookie-banner"
          - urlPattern: "/login"
          - textContains: "blocked"
        intervention:
          message: "Please resolve"
          openViewer: true
          mode: askAndWait
`;
      const filePath = join(TMP_DIR, 'blocking.yaml');
      writeFileSync(filePath, yaml, 'utf-8');

      const result = parseYamlSiteFile(filePath);
      const step = result.flows.f1.steps[0];
      expect(step.blockingConditions).toHaveLength(3);
      expect(step.intervention?.message).toBe('Please resolve');
      expect(step.intervention?.mode).toBe('askAndWait');
    });

    it('should parse extract fields (string and ExtractField)', () => {
      const yaml = `
site:
  name: extract
flows:
  f1:
    steps:
      - id: ext1
        action: extract
        container: ".results"
        fields:
          title: "h1"
          link:
            selector: "a"
            attribute: "href"
        outputVar: data
`;
      const filePath = join(TMP_DIR, 'extract.yaml');
      writeFileSync(filePath, yaml, 'utf-8');

      const result = parseYamlSiteFile(filePath);
      const step = result.flows.f1.steps[0];
      expect(step.fields).toBeDefined();
      expect(step.fields!['title']).toBe('h1');
      expect(step.fields!['link']).toEqual({ selector: 'a', attribute: 'href' });
    });
  });

  describe('findFlow', () => {
    function makeSitesMap(entries: Array<[string, SiteDefinition]>): Map<string, SiteDefinition> {
      return new Map(entries);
    }

    it('should find flow with site.flow dot notation', () => {
      const sites = makeSitesMap([
        [
          'mysite',
          {
            name: 'mysite',
            flows: {
              login: {
                id: 'login',
                steps: [{ id: 's1', action: 'navigate', url: 'https://example.com' }],
              },
            },
          },
        ],
      ]);

      const result = findFlow(sites, 'mysite.login');
      expect(result).not.toBeNull();
      expect(result!.flowName).toBe('login');
      expect(result!.site.name).toBe('mysite');
    });

    it('should find flow by name only (no dot)', () => {
      const sites = makeSitesMap([
        [
          'site-a',
          {
            name: 'site-a',
            flows: {
              search: { id: 'search', steps: [{ id: 's1', action: 'click', selector: '#btn' }] },
            },
          },
        ],
      ]);

      const result = findFlow(sites, 'search');
      expect(result).not.toBeNull();
      expect(result!.flowName).toBe('search');
    });

    it('should return null for missing flow', () => {
      const sites = makeSitesMap([
        [
          'site-a',
          {
            name: 'site-a',
            flows: {
              login: { id: 'login', steps: [] },
            },
          },
        ],
      ]);

      expect(findFlow(sites, 'nonexistent')).toBeNull();
      expect(findFlow(sites, 'site-a.nonexistent')).toBeNull();
    });

    it('should return null for empty sites map', () => {
      expect(findFlow(new Map(), 'anything')).toBeNull();
    });

    it('should prefer dotted lookup over scanning all sites', () => {
      const sites = makeSitesMap([
        [
          'site-a',
          {
            name: 'site-a',
            flows: {
              flow1: { id: 'flow1', steps: [] },
            },
          },
        ],
        [
          'site-b',
          {
            name: 'site-b',
            flows: {
              flow1: { id: 'flow1', steps: [{ id: 'x', action: 'click', selector: '#x' }] },
            },
          },
        ],
      ]);

      const result = findFlow(sites, 'site-b.flow1');
      expect(result).not.toBeNull();
      expect(result!.site.name).toBe('site-b');
    });
  });

  describe('validateYamlFile', () => {
    it('should validate a correct YAML file', () => {
      const yaml = `
site:
  name: valid
flows:
  f1:
    steps:
      - id: s1
        action: navigate
        url: "https://example.com"
`;
      const filePath = join(TMP_DIR, 'valid-check.yaml');
      writeFileSync(filePath, yaml, 'utf-8');

      const result = validateYamlFile(filePath);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing site key', () => {
      const yaml = `flows:\n  f1:\n    steps:\n      - id: s1\n        action: navigate`;
      const filePath = join(TMP_DIR, 'no-site-check.yaml');
      writeFileSync(filePath, yaml, 'utf-8');

      const result = validateYamlFile(filePath);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing "site" root key');
    });

    it('should detect missing site.name', () => {
      const yaml = `site:\n  description: no name`;
      const filePath = join(TMP_DIR, 'check-no-name.yaml');
      writeFileSync(filePath, yaml, 'utf-8');

      const result = validateYamlFile(filePath);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing "site.name"');
    });

    it('should detect flows with no steps', () => {
      const yaml = `site:\n  name: test\nflows:\n  f1:\n    steps: []`;
      const filePath = join(TMP_DIR, 'no-steps.yaml');
      writeFileSync(filePath, yaml, 'utf-8');

      const result = validateYamlFile(filePath);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('no steps'))).toBe(true);
    });

    it('should detect steps without id', () => {
      const yaml = `site:\n  name: test\nflows:\n  f1:\n    steps:\n      - action: click\n        selector: "#btn"`;
      const filePath = join(TMP_DIR, 'no-step-id.yaml');
      writeFileSync(filePath, yaml, 'utf-8');

      const result = validateYamlFile(filePath);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('without an id'))).toBe(true);
    });

    it('should detect steps without action', () => {
      const yaml = `site:\n  name: test\nflows:\n  f1:\n    steps:\n      - id: s1\n        selector: "#btn"`;
      const filePath = join(TMP_DIR, 'no-action.yaml');
      writeFileSync(filePath, yaml, 'utf-8');

      const result = validateYamlFile(filePath);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('no action'))).toBe(true);
    });

    it('should detect invalid YAML syntax', () => {
      const filePath = join(TMP_DIR, 'bad-syntax.yaml');
      writeFileSync(filePath, ': : invalid yaml {{{{', 'utf-8');

      const result = validateYamlFile(filePath);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('YAML parse error'))).toBe(true);
    });

    it('should detect no flows defined', () => {
      const yaml = `site:\n  name: test`;
      const filePath = join(TMP_DIR, 'no-flows-at-all.yaml');
      writeFileSync(filePath, yaml, 'utf-8');

      const result = validateYamlFile(filePath);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No flows defined');
    });
  });

  describe('loadSitesFromDirectory', () => {
    it('should load .yaml and .yml files', () => {
      writeFileSync(
        join(TMP_DIR, 'a.yaml'),
        `site:\n  name: site-a\nflows:\n  f1:\n    steps:\n      - id: s1\n        action: navigate\n        url: "https://example.com"`,
        'utf-8'
      );
      writeFileSync(
        join(TMP_DIR, 'b.yml'),
        `site:\n  name: site-b\nflows:\n  f2:\n    steps:\n      - id: s2\n        action: click\n        selector: "#btn"`,
        'utf-8'
      );

      const sites = loadSitesFromDirectory(TMP_DIR);
      expect(sites.size).toBe(2);
      expect(sites.has('site-a')).toBe(true);
      expect(sites.has('site-b')).toBe(true);
    });

    it('should skip non-yaml files', () => {
      writeFileSync(join(TMP_DIR, 'readme.txt'), 'hello', 'utf-8');
      writeFileSync(join(TMP_DIR, 'data.json'), '{}', 'utf-8');

      const sites = loadSitesFromDirectory(TMP_DIR);
      expect(sites.size).toBe(0);
    });

    it('should return empty map for non-existent directory', () => {
      const sites = loadSitesFromDirectory('/nonexistent/path/12345');
      expect(sites.size).toBe(0);
    });

    it('should skip files that fail to parse', () => {
      writeFileSync(join(TMP_DIR, 'bad.yaml'), 'not valid yaml {{{{', 'utf-8');
      writeFileSync(
        join(TMP_DIR, 'good.yaml'),
        `site:\n  name: good\nflows:\n  f1:\n    steps:\n      - id: s1\n        action: navigate\n        url: "https://example.com"`,
        'utf-8'
      );

      const sites = loadSitesFromDirectory(TMP_DIR);
      expect(sites.size).toBe(1);
      expect(sites.has('good')).toBe(true);
    });
  });

  describe('getDefaultSitesDirs', () => {
    it('should return an array', () => {
      const dirs = getDefaultSitesDirs();
      expect(Array.isArray(dirs)).toBe(true);
    });
  });
});
