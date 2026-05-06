import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import yaml from 'js-yaml';
import {
  recorderToFlow,
  parseRecorderYaml,
  recorderToFlowFromYamlString,
  recorderToFlowFromFile,
  siteToYamlString,
} from '../../flow/recorder-to-flow.js';
import type { RecorderYaml, SiteDefinition, FlowDefinition, FlowStep } from '../../flow/index.js';
import { parseYamlSiteFile } from '../../flow/yaml-parser.js';

interface FlowFromRecorderCommand {
  action: string;
  subcommand?: string;
  recorderFile?: string;
  siteName?: string;
  outputFile?: string;
  flowId?: string;
  baseUrl?: string;
  description?: string;
  maxPaginateIterations?: number;
  [key: string]: unknown;
}

const TEST_DIR = resolve('/tmp/flow-phase4-test');

const mockRecorderYaml: RecorderYaml = {
  session: { id: 'test-session', startTime: '10:00:00', endTime: '10:02:00', steps: 5 },
  pages: [{ url: 'https://example.com/search', title: 'Search', firstVisitTime: '10:00:01' }],
  steps: [
    { id: 'step-1', time: '10:00:05', action: 'fill', selector: '#search', value: 'test query' },
    { id: 'step-2', time: '10:00:08', action: 'click', selector: '#search-btn' },
    {
      id: 'step-3',
      time: '10:00:10',
      action: 'click',
      selector: '.results',
      annotation: {
        type: 'wait_element',
        label: 'Wait for results',
        selector: '.results',
        waitTimeout: 5000,
      },
    },
    {
      id: 'step-4',
      time: '10:00:12',
      action: 'click',
      selector: '.results',
      annotation: {
        type: 'data_container',
        label: 'Results container',
        selector: '.result-item',
        itemSelector: '.result-item',
      },
    },
    {
      id: 'step-5',
      time: '10:00:15',
      action: 'click',
      selector: '.next-page',
      annotation: {
        type: 'pagination',
        label: 'Next page',
        selector: '.next-page',
        nextSelector: '.next-page',
      },
    },
  ],
};

const mockLoginRecorderYaml: RecorderYaml = {
  session: { id: 'login-session', startTime: '10:00:00', endTime: '10:01:00', steps: 3 },
  pages: [{ url: 'https://example.com/profile', title: 'Profile', firstVisitTime: '10:00:01' }],
  steps: [
    { id: 's1', time: '10:00:05', action: 'navigate', url: 'https://example.com/profile' },
    {
      id: 's2',
      time: '10:00:08',
      action: 'click',
      selector: '.login-btn',
      annotation: {
        type: 'login_check',
        label: 'Login checkpoint',
        selector: '.login-btn',
        customNote: 'Please log in to continue',
      },
    },
    { id: 's3', time: '10:00:12', action: 'snapshot', selector: '.profile-content' },
  ],
};

const mockCheckpointYaml: RecorderYaml = {
  session: { id: 'checkpoint-session', startTime: '10:00:00', endTime: '10:01:00', steps: 3 },
  pages: [{ url: 'https://example.com/page', title: 'Page', firstVisitTime: '10:00:01' }],
  steps: [
    { id: 'c1', time: '10:00:05', action: 'navigate', url: 'https://example.com/page' },
    {
      id: 'c2',
      time: '10:00:08',
      action: 'click',
      selector: '.status',
      annotation: { type: 'checkpoint', label: 'Verify status', selector: '.status' },
    },
    { id: 'c3', time: '10:00:12', action: 'fill', selector: '#input', value: 'done' },
  ],
};

describe('Flow Engine Phase 4 - Recorder to Flow Converter', { sequential: true }, () => {
  beforeAll(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  describe('recorderToFlow - basic conversion', () => {
    it('should convert mock recorder YAML to SiteDefinition', () => {
      const { site, warnings } = recorderToFlow(mockRecorderYaml, {
        flowId: 'search-flow',
        baseUrl: 'https://example.com',
        siteName: 'example-search',
      });

      expect(site.name).toBe('example-search');
      expect(site.baseUrl).toBe('https://example.com');
      expect(site.flows['search-flow']).toBeDefined();

      const flow = site.flows['search-flow'];
      expect(flow.steps.length).toBeGreaterThan(0);
      expect(flow.output).toContain('results');
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('should extract baseUrl from pages when not provided', () => {
      const { site } = recorderToFlow(mockRecorderYaml);
      expect(site.baseUrl).toBe('https://example.com');
    });

    it('should convert fill actions', () => {
      const { site } = recorderToFlow(mockRecorderYaml);
      const flow = Object.values(site.flows)[0];
      const fillStep = flow.steps.find((s) => s.action === 'fill');
      expect(fillStep).toBeDefined();
      expect(fillStep?.selector).toBe('#search');
      expect(fillStep?.value).toBe('test query');
    });

    it('should convert click actions', () => {
      const { site } = recorderToFlow(mockRecorderYaml);
      const flow = Object.values(site.flows)[0];
      const clickStep = flow.steps.find((s) => s.action === 'click');
      expect(clickStep).toBeDefined();
      expect(clickStep?.selector).toBe('#search-btn');
    });
  });

  describe('wait_element annotation', () => {
    it('should convert wait_element to wait step', () => {
      const { site } = recorderToFlow(mockRecorderYaml);
      const flow = Object.values(site.flows)[0];

      const waitStep = flow.steps.find((s) => s.action === 'wait');
      expect(waitStep).toBeDefined();
      expect(waitStep?.selector).toBe('.results');
      expect(waitStep?.timeout).toBe(5000);
    });
  });

  describe('data_container + pagination annotations', () => {
    it('should produce a clickPaginate step with extractBeforeClick', () => {
      const { site, warnings } = recorderToFlow(mockRecorderYaml, {
        flowId: 'paginated',
      });
      const flow = site.flows['paginated'];

      const paginateStep = flow.steps.find((s) => s.action === 'clickPaginate');
      expect(paginateStep).toBeDefined();
      expect(paginateStep?.nextSelector).toBe('.next-page');
      expect(paginateStep?.termination?.maxIterations).toBe(10);
      expect(paginateStep?.termination?.elementDisappears).toBe('.next-page');

      expect(paginateStep?.extractBeforeClick).toBeDefined();
      expect(paginateStep?.extractBeforeClick?.action).toBe('extract');
      expect(paginateStep?.extractBeforeClick?.container).toBe('.result-item');
      expect(paginateStep?.extractBeforeClick?.outputVar).toBe('results');

      expect(warnings.some((w) => w.includes('Pagination'))).toBe(true);
      expect(warnings.some((w) => w.includes('Data container'))).toBe(true);
    });

    it('should respect maxPaginateIterations option', () => {
      const { site } = recorderToFlow(mockRecorderYaml, { maxPaginateIterations: 5 });
      const flow = Object.values(site.flows)[0];
      const paginateStep = flow.steps.find((s) => s.action === 'clickPaginate');
      expect(paginateStep?.termination?.maxIterations).toBe(5);
    });
  });

  describe('login_check annotation', () => {
    it('should convert login_check to autoRecover step', () => {
      const { site, warnings } = recorderToFlow(mockLoginRecorderYaml);
      const flow = Object.values(site.flows)[0];

      const recoverStep = flow.steps.find((s) => s.action === 'autoRecover');
      expect(recoverStep).toBeDefined();
      expect(recoverStep?.blockingConditions).toBeDefined();
      expect(recoverStep?.blockingConditions?.length).toBeGreaterThan(0);
      expect(recoverStep?.intervention?.mode).toBe('wait');
      expect(recoverStep?.intervention?.openViewer).toBe(true);
      expect(recoverStep?.resolveTimeout).toBe(120000);
      expect(recoverStep?.checkInterval).toBe(2000);

      expect(warnings.some((w) => w.toLowerCase().includes('login'))).toBe(true);
    });
  });

  describe('checkpoint annotation', () => {
    it('should convert checkpoint to snapshot step', () => {
      const { site } = recorderToFlow(mockCheckpointYaml);
      const flow = Object.values(site.flows)[0];

      const snapshotStep = flow.steps.find((s) => s.action === 'snapshot');
      expect(snapshotStep).toBeDefined();
      expect(snapshotStep?.selector).toBe('.status');
    });
  });

  describe('siteToYamlString - YAML serialization', () => {
    it('should serialize SiteDefinition to valid YAML', () => {
      const { site } = recorderToFlow(mockRecorderYaml, {
        flowId: 'search-flow',
        siteName: 'example-search',
      });

      const yamlStr = siteToYamlString(site);
      expect(yamlStr).toContain('example-search');
      expect(yamlStr).toContain('search-flow');
      expect(yamlStr).toContain('clickPaginate');
      expect(yamlStr).toContain('extractBeforeClick');
    });
  });

  describe('parseRecorderYaml', () => {
    it('should parse a YAML string into RecorderYaml', () => {
      const yamlContent = `
session:
  id: yaml-test
  startTime: "10:00:00"
  endTime: "10:01:00"
  steps: 2
steps:
  - id: step-1
    action: fill
    selector: "#input"
    value: hello
  - id: step-2
    action: click
    selector: "#btn"
`;
      const parsed = parseRecorderYaml(yamlContent);
      expect(parsed.session.id).toBe('yaml-test');
      expect(parsed.steps.length).toBe(2);
      expect(parsed.steps[0].action).toBe('fill');
      expect(parsed.steps[1].action).toBe('click');
    });

    it('should throw on invalid YAML', () => {
      expect(() => parseRecorderYaml('')).toThrow();
    });
  });

  describe('Round-trip: recorder YAML -> SiteDefinition -> YAML -> parse again', () => {
    it('should survive a full round-trip conversion', () => {
      const { site } = recorderToFlow(mockRecorderYaml, {
        flowId: 'round-trip-flow',
        siteName: 'round-trip-site',
      });

      const yamlStr = siteToYamlString(site);
      const roundTripPath = join(TEST_DIR, 'round-trip.yaml');
      writeFileSync(roundTripPath, yamlStr, 'utf-8');

      const reparsed = parseYamlSiteFile(roundTripPath);
      expect(reparsed.name).toBe('round-trip-site');
      expect(reparsed.flows['round-trip-flow']).toBeDefined();

      const flow = reparsed.flows['round-trip-flow'];
      expect(flow.steps.length).toBeGreaterThan(0);

      const paginateStep = flow.steps.find((s) => s.action === 'clickPaginate');
      expect(paginateStep).toBeDefined();
      expect(paginateStep?.nextSelector).toBe('.next-page');
    });
  });

  describe('recorderToFlowFromFile', () => {
    it('should read from a file and convert', () => {
      const yamlContent = `
session:
  id: file-test
  startTime: "10:00:00"
  endTime: "10:01:00"
  steps: 1
steps:
  - id: s1
    action: navigate
    url: "https://example.com"
`;
      const filePath = join(TEST_DIR, 'recorder-output.yaml');
      writeFileSync(filePath, yamlContent, 'utf-8');

      const { site } = recorderToFlowFromFile(filePath, {
        flowId: 'file-flow',
        siteName: 'file-site',
      });

      expect(site.name).toBe('file-site');
      const flow = site.flows['file-flow'];
      expect(flow.steps.length).toBe(1);
      expect(flow.steps[0].action).toBe('navigate');
    });
  });

  describe('recorderToFlowFromYamlString', () => {
    it('should parse YAML string and convert', () => {
      const yamlContent = `
session:
  id: str-test
  startTime: "10:00:00"
  endTime: "10:01:00"
  steps: 1
steps:
  - id: s1
    action: click
    selector: "#btn"
`;
      const { site } = recorderToFlowFromYamlString(yamlContent, {
        flowId: 'str-flow',
      });

      expect(site.flows['str-flow'].steps[0].action).toBe('click');
    });
  });

  describe('data_item fields annotation', () => {
    it('should use data_item fields in extract step', () => {
      const yamlWithFields: RecorderYaml = {
        session: { id: 'fields-test', startTime: '10:00:00', endTime: '10:01:00', steps: 4 },
        pages: [{ url: 'https://example.com', title: 'Test', firstVisitTime: '10:00:01' }],
        steps: [
          { id: 's1', time: '10:00:01', action: 'navigate', url: 'https://example.com' },
          {
            id: 's2',
            time: '10:00:05',
            action: 'click',
            selector: '.list',
            annotation: {
              type: 'data_container',
              label: 'List',
              selector: '.list',
              itemSelector: '.item',
            },
          },
          {
            id: 's3',
            time: '10:00:08',
            action: 'click',
            selector: '.item',
            annotation: { type: 'data_item', label: 'Item', fields: ['title', 'price', 'url'] },
          },
          { id: 's4', time: '10:00:12', action: 'snapshot' },
        ],
      };

      const { site } = recorderToFlow(yamlWithFields);
      const flow = Object.values(site.flows)[0];

      const extractStep = flow.steps.find((s) => s.action === 'extract');
      expect(extractStep).toBeDefined();
      expect(extractStep?.container).toBe('.item');
      expect(extractStep?.fields).toHaveProperty('title');
      expect(extractStep?.fields).toHaveProperty('price');
      expect(extractStep?.fields).toHaveProperty('url');
    });
  });

  describe('empty/minimal recorder YAML', () => {
    it('should handle empty steps gracefully', () => {
      const emptyYaml: RecorderYaml = {
        session: { id: 'empty', startTime: '10:00:00', endTime: '10:00:01', steps: 0 },
        steps: [],
      };

      const { site, warnings } = recorderToFlow(emptyYaml);
      expect(site.flows).toBeDefined();
      const flow = Object.values(site.flows)[0];
      expect(flow.steps.length).toBe(0);
    });
  });

  describe('CLI parseCommand for from-recorder', () => {
    it('should parse flow from-recorder command with options', async () => {
      const { parseCommand } = await import('../../cli/commands.js');
      const cmd = parseCommand([
        'flow',
        'from-recorder',
        'recording.yaml',
        '--name',
        'my-site',
        '--output',
        'out.yaml',
      ]);

      expect(cmd.action).toBe('flow');
      expect((cmd as FlowFromRecorderCommand).subcommand).toBe('from-recorder');
      expect((cmd as FlowFromRecorderCommand).recorderFile).toBe('recording.yaml');
      expect((cmd as FlowFromRecorderCommand).siteName).toBe('my-site');
      expect((cmd as FlowFromRecorderCommand).outputFile).toBe('out.yaml');
    });

    it('should parse all from-recorder options', async () => {
      const { parseCommand } = await import('../../cli/commands.js');
      const cmd = parseCommand([
        'flow',
        'from-recorder',
        'rec.yaml',
        '--name',
        'site1',
        '--flow-id',
        'my-flow',
        '--base-url',
        'https://example.com',
        '--description',
        'Test flow',
        '--max-pages',
        '5',
      ]);

      expect((cmd as FlowFromRecorderCommand).flowId).toBe('my-flow');
      expect((cmd as FlowFromRecorderCommand).baseUrl).toBe('https://example.com');
      expect((cmd as FlowFromRecorderCommand).description).toBe('Test flow');
      expect((cmd as FlowFromRecorderCommand).maxPaginateIterations).toBe(5);
    });
  });
});
