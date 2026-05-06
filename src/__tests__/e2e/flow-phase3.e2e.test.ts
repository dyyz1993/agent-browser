import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import yaml from 'js-yaml';
import { SiteManager } from '../../flow/site-manager.js';
import { parseYamlSiteFile } from '../../flow/yaml-parser.js';
import { parseCommand } from '../../cli/commands.js';
import { parseFlags } from '../../cli/flags.js';
import type { SiteDefinition } from '../../flow/types.js';

interface FlowCommand {
  action: string;
  subcommand?: string;
  json?: boolean;
  sourceFile?: string;
  sourceUrl?: string;
  siteName?: string;
  siteFlow?: string;
  params?: Record<string, string>;
  outputFormat?: string;
  outputFile?: string;
  [key: string]: unknown;
}

const TEST_DIR = resolve('/tmp/flow-phase3-test-sites');
const TEST_YAML_CONTENT = `site:
  name: test-register
  description: "Test site for registration"
  baseUrl: "https://example.com"

flows:
  hello:
    description: "Simple hello flow"
    steps:
      - id: nav
        action: navigate
        url: "\${baseUrl}"
      - id: greet
        action: fill
        selector: "#input"
        value: "hello"
`;

describe('Flow Engine Phase 3 - Site Manager & CLI', { sequential: true }, () => {
  let manager: SiteManager;
  let testYamlPath: string;

  beforeAll(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
    testYamlPath = join(TEST_DIR, 'test-register.yaml');
    writeFileSync(testYamlPath, TEST_YAML_CONTENT, 'utf-8');
    manager = new SiteManager([TEST_DIR]);
  });

  afterAll(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  describe('SiteManager.listSites', () => {
    it('should load all sites from the project sites directory', () => {
      const projectSitesDir = resolve(process.cwd(), 'sites');
      const defaultManager = new SiteManager(existsSync(projectSitesDir) ? [projectSitesDir] : []);
      const sites = defaultManager.listSites();
      if (existsSync(join(projectSitesDir, 'baidu-search.yaml'))) {
        expect(sites.has('baidu-search')).toBe(true);
      }
    });

    it('should return a Map of SiteDefinition', () => {
      const sites = manager.listSites();
      expect(sites).toBeInstanceOf(Map);
      for (const [, site] of sites) {
        expect(site.name).toBeDefined();
        expect(site.flows).toBeDefined();
      }
    });
  });

  describe('SiteManager.registerFromFile', () => {
    it('should register a site from a YAML file', () => {
      const result = manager.registerFromFile(testYamlPath);
      expect(result.siteName).toBe('test-register');
      expect(existsSync(result.targetPath)).toBe(true);

      const parsed = parseYamlSiteFile(result.targetPath);
      expect(parsed.name).toBe('test-register');
      expect(parsed.flows.hello).toBeDefined();
      expect(parsed.flows.hello.steps.length).toBe(2);
    });

    it('should register with a custom name', () => {
      const result = manager.registerFromFile(testYamlPath, 'custom-name');
      expect(result.targetPath).toContain('custom-name.yaml');
      expect(existsSync(result.targetPath)).toBe(true);
      unlinkSync(result.targetPath);
    });
  });

  describe('SiteManager.registerFromDefinition', () => {
    it('should register a site from a SiteDefinition object', () => {
      const site: SiteDefinition = {
        name: 'from-def',
        description: 'Created from definition',
        baseUrl: 'https://example.org',
        flows: {
          scrape: {
            id: 'scrape',
            steps: [
              { id: 'nav', action: 'navigate', url: '${baseUrl}' },
              {
                id: 'ext',
                action: 'extract',
                container: '.item',
                fields: { title: '.title' },
                outputVar: 'items',
              },
            ],
            output: ['items'],
          },
        },
      };

      const result = manager.registerFromDefinition(site);
      expect(result.siteName).toBe('from-def');
      expect(existsSync(result.targetPath)).toBe(true);

      const parsed = parseYamlSiteFile(result.targetPath);
      expect(parsed.name).toBe('from-def');
      expect(parsed.flows.scrape).toBeDefined();
    });
  });

  describe('SiteManager.unregister', () => {
    it('should remove a registered site', () => {
      const site: SiteDefinition = {
        name: 'to-remove',
        flows: { noop: { id: 'noop', steps: [] } },
      };
      manager.registerFromDefinition(site);
      expect(manager.exists('to-remove')).toBe(true);

      const result = manager.unregister('to-remove');
      expect(result).toBe(true);
      expect(manager.exists('to-remove')).toBe(false);
    });

    it('should return false for non-existent site', () => {
      const result = manager.unregister('does-not-exist');
      expect(result).toBe(false);
    });
  });

  describe('SiteManager.exists', () => {
    it('should return true for existing site', () => {
      const site: SiteDefinition = {
        name: 'exists-check',
        flows: { noop: { id: 'noop', steps: [] } },
      };
      manager.registerFromDefinition(site);
      expect(manager.exists('exists-check')).toBe(true);
    });

    it('should return false for missing site', () => {
      expect(manager.exists('no-such-site')).toBe(false);
    });
  });

  describe('SiteManager.siteToYaml round-trip', () => {
    it('should round-trip: SiteDefinition -> YAML -> parse -> verify', () => {
      const original: SiteDefinition = {
        name: 'round-trip',
        description: 'Round trip test',
        baseUrl: 'https://example.com',
        flows: {
          search: {
            id: 'search',
            description: 'Search flow',
            params: [
              { name: 'keyword', type: 'string', required: true },
              { name: 'maxPages', type: 'number', default: 2 },
            ],
            steps: [
              { id: 'nav', action: 'navigate', url: '${baseUrl}' },
              { id: 'fill', action: 'fill', selector: '#q', value: '${keyword}' },
              { id: 'click', action: 'click', selector: '#btn' },
              {
                id: 'extract',
                action: 'extract',
                container: '.result',
                fields: {
                  title: 'h3 a',
                  url: { selector: 'h3 a', attribute: 'href' },
                },
                outputVar: 'results',
              },
            ],
            output: ['results'],
          },
        },
      };

      const yamlStr = manager.siteToYaml(original);
      const tmpPath = join(TEST_DIR, 'round-trip.yaml');
      writeFileSync(tmpPath, yamlStr, 'utf-8');

      const parsed = parseYamlSiteFile(tmpPath);
      expect(parsed.name).toBe('round-trip');
      expect(parsed.description).toBe('Round trip test');
      expect(parsed.baseUrl).toBe('https://example.com');
      expect(parsed.flows.search).toBeDefined();
      expect(parsed.flows.search.steps.length).toBe(4);
      expect(parsed.flows.search.params).toBeDefined();
      expect(parsed.flows.search.params![0].name).toBe('keyword');
      expect(parsed.flows.search.params![0].required).toBe(true);
      expect(parsed.flows.search.output).toEqual(['results']);

      unlinkSync(tmpPath);
    });
  });

  describe('CLI flow commands parsing', () => {
    function parse(args: string[]) {
      const flags = parseFlags(args);
      return parseCommand(args, flags);
    }

    it('should parse flow list --json', () => {
      const cmd = parse(['flow', 'list', '--json']);
      expect(cmd.action).toBe('flow');
      expect((cmd as FlowCommand).subcommand).toBe('list');
      expect((cmd as FlowCommand).json).toBe(true);
    });

    it('should parse flow register --file', () => {
      const cmd = parse(['flow', 'register', '--file', '/path/to/site.yaml']);
      expect(cmd.action).toBe('flow');
      expect((cmd as FlowCommand).subcommand).toBe('register');
      expect((cmd as FlowCommand).sourceFile).toBe('/path/to/site.yaml');
    });

    it('should parse flow register --url', () => {
      const cmd = parse(['flow', 'register', '--url', 'https://example.com/site.yaml']);
      expect(cmd.action).toBe('flow');
      expect((cmd as FlowCommand).subcommand).toBe('register');
      expect((cmd as FlowCommand).sourceUrl).toBe('https://example.com/site.yaml');
    });

    it('should parse flow register --file --name', () => {
      const cmd = parse(['flow', 'register', '--file', '/p.yaml', '--name', 'my-site']);
      expect((cmd as FlowCommand).sourceFile).toBe('/p.yaml');
      expect((cmd as FlowCommand).siteName).toBe('my-site');
    });

    it('should parse flow unregister <name>', () => {
      const cmd = parse(['flow', 'unregister', 'my-site']);
      expect(cmd.action).toBe('flow');
      expect((cmd as FlowCommand).subcommand).toBe('unregister');
      expect((cmd as FlowCommand).siteName).toBe('my-site');
    });

    it('should parse flow run with --output and --output-file', () => {
      const cmd = parse([
        'flow',
        'run',
        'baidu.search',
        '--param',
        'keyword=test',
        '--output',
        'json',
        '--output-file',
        './results.json',
      ]);
      expect(cmd.action).toBe('flow');
      expect((cmd as FlowCommand).subcommand).toBe('run');
      expect((cmd as FlowCommand).siteFlow).toBe('baidu.search');
      expect((cmd as FlowCommand).params).toEqual({ keyword: 'test' });
      expect((cmd as FlowCommand).outputFormat).toBe('json');
      expect((cmd as FlowCommand).outputFile).toBe('./results.json');
    });

    it('should error on flow register without --file or --url', () => {
      expect(() => parse(['flow', 'register'])).toThrow();
    });

    it('should error on flow unregister without name', () => {
      expect(() => parse(['flow', 'unregister'])).toThrow();
    });
  });
});
