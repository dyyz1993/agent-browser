import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import yaml from 'js-yaml';
import type {
  SiteDefinition,
  FlowDefinition,
  FlowStep,
  FlowParam,
  StepAction,
  ExtractField,
} from './types.js';

interface YamlSiteFile {
  site: {
    name: string;
    description?: string;
    baseUrl?: string;
  };
  flows?: Record<string, YamlFlow>;
}

interface YamlFlow {
  description?: string;
  params?: YamlParam[];
  steps: YamlStep[];
  output?: string[];
}

interface YamlParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'string[]';
  required?: boolean;
  default?: unknown;
  description?: string;
}

interface YamlStep {
  id: string;
  action: string;
  selector?: string;
  value?: string;
  url?: string;
  waitAfter?: string;
  timeout?: number;
  inFrame?: string;
  container?: string;
  fields?: Record<string, any>;
  outputVar?: string;
  nextSelector?: string;
  strategy?: string;
  maxPages?: number | string;
  onEachPage?: string[];
  itemSelector?: string;
  itemSteps?: YamlStep[];
  condition?: string;
  thenSteps?: YamlStep[];
  elseSteps?: YamlStep[];
  loopSteps?: YamlStep[];
  collectSteps?: YamlStep[];
  termination?: {
    maxIterations?: number;
    noNewItemsCount?: number;
    elementDisappears?: string;
    elementDisabled?: string;
    jsExpression?: string;
  };
  scrollDirection?: 'down' | 'up';
  scrollAmount?: number;
  scrollContainer?: string;
  extractOnEachScroll?: YamlStep;
  extractBeforeClick?: YamlStep;
  waitForNavigation?: string;
  apiUrl?: string;
  captureFilter?: string;
  file?: string;
  mockResponse?: string;
  mockStatus?: number;
  abortRequests?: boolean;
  blockingConditions?: Array<{
    selector?: string;
    jsExpression?: string;
    hasDialog?: boolean;
    urlPattern?: string;
    textContains?: string;
  }>;
  intervention?: {
    message: string;
    openViewer?: boolean;
    screenshot?: boolean;
    timeout?: number;
    resolvedCondition?: any;
    mode?: 'ask' | 'wait' | 'askAndWait';
  };
  checkInterval?: number;
  resolveTimeout?: number;
  onResolved?: YamlStep[];
  onTimeout?: YamlStep[];
  conditionJs?: string;
  sourceVar?: string;
  subSteps?: YamlStep[];
  dedupField?: string;
}

export function parseYamlSiteFile(filePath: string): SiteDefinition {
  const content = readFileSync(filePath, 'utf-8');
  const parsed = yaml.load(content) as YamlSiteFile;

  if (!parsed.site) {
    throw new Error(`Invalid site YAML: missing "site" root key in ${filePath}`);
  }

  const site = parsed.site;
  if (!site.name) {
    throw new Error(`Invalid site YAML: missing "site.name" in ${filePath}`);
  }

  const flows: Record<string, FlowDefinition> = {};
  if (parsed.flows) {
    for (const [flowName, yamlFlow] of Object.entries(parsed.flows)) {
      flows[flowName] = parseYamlFlow(flowName, yamlFlow);
    }
  }

  return {
    name: site.name,
    description: site.description,
    baseUrl: site.baseUrl,
    flows,
  };
}

function parseYamlFlow(name: string, yamlFlow: YamlFlow): FlowDefinition {
  return {
    id: name,
    description: yamlFlow.description,
    params: yamlFlow.params?.map(parseYamlParam),
    steps: yamlFlow.steps?.map(parseYamlStep) || [],
    output: yamlFlow.output,
  };
}

function parseYamlParam(yamlParam: YamlParam): FlowParam {
  return {
    name: yamlParam.name,
    type: yamlParam.type || 'string',
    required: yamlParam.required,
    default: yamlParam.default,
    description: yamlParam.description,
  };
}

function parseYamlStep(yamlStep: YamlStep): FlowStep {
  const step: FlowStep = {
    id: yamlStep.id,
    action: yamlStep.action as StepAction,
  };

  const simpleFields: (keyof YamlStep)[] = [
    'selector',
    'value',
    'url',
    'waitAfter',
    'timeout',
    'inFrame',
    'container',
    'outputVar',
    'nextSelector',
    'strategy',
    'maxPages',
    'itemSelector',
    'condition',
    'conditionJs',
    'apiUrl',
    'captureFilter',
    'file',
    'mockResponse',
    'mockStatus',
    'abortRequests',
    'scrollDirection',
    'scrollAmount',
    'scrollContainer',
    'checkInterval',
    'resolveTimeout',
    'waitForNavigation',
    'sourceVar',
    'dedupField',
  ];

  for (const field of simpleFields) {
    if (yamlStep[field] !== undefined) {
      (step as any)[field] = yamlStep[field];
    }
  }

  if (yamlStep.fields) {
    step.fields = yamlStep.fields as Record<string, string | ExtractField>;
  }

  if (yamlStep.termination) {
    step.termination = yamlStep.termination;
  }

  if (yamlStep.itemSteps) step.itemSteps = yamlStep.itemSteps.map(parseYamlStep);
  if (yamlStep.loopSteps) step.loopSteps = yamlStep.loopSteps.map(parseYamlStep);
  if (yamlStep.collectSteps) step.collectSteps = yamlStep.collectSteps.map(parseYamlStep);
  if (yamlStep.thenSteps) step.thenSteps = yamlStep.thenSteps.map(parseYamlStep);
  if (yamlStep.elseSteps) step.elseSteps = yamlStep.elseSteps.map(parseYamlStep);
  if (yamlStep.subSteps) step.subSteps = yamlStep.subSteps.map(parseYamlStep);
  if (yamlStep.extractOnEachScroll)
    step.extractOnEachScroll = parseYamlStep(yamlStep.extractOnEachScroll);
  if (yamlStep.extractBeforeClick)
    step.extractBeforeClick = parseYamlStep(yamlStep.extractBeforeClick);
  if (yamlStep.onResolved) step.onResolved = yamlStep.onResolved.map(parseYamlStep);
  if (yamlStep.onTimeout) step.onTimeout = yamlStep.onTimeout.map(parseYamlStep);

  if (yamlStep.blockingConditions) {
    step.blockingConditions = yamlStep.blockingConditions;
  }

  if (yamlStep.intervention) {
    step.intervention = yamlStep.intervention;
  }

  return step;
}

export function loadSitesFromDirectory(dirPath: string): Map<string, SiteDefinition> {
  const sites = new Map<string, SiteDefinition>();

  if (!existsSync(dirPath)) {
    return sites;
  }

  const entries = readdirSync(dirPath);
  for (const entry of entries) {
    if (entry.endsWith('.yaml') || entry.endsWith('.yml')) {
      const filePath = join(dirPath, entry);
      try {
        const site = parseYamlSiteFile(filePath);
        sites.set(site.name, site);
      } catch (e) {
        console.warn(`Failed to parse site file ${filePath}: ${e}`);
      }
    }
  }

  return sites;
}

export function getDefaultSitesDirs(): string[] {
  const dirs: string[] = [];

  const localDir = resolve(process.cwd(), 'sites');
  if (existsSync(localDir)) dirs.push(localDir);

  const homeDir = resolve(
    process.env.HOME || process.env.USERPROFILE || '~',
    '.agent-browser',
    'sites'
  );
  if (existsSync(homeDir)) dirs.push(homeDir);

  return dirs;
}

export function loadAllSites(): Map<string, SiteDefinition> {
  const allSites = new Map<string, SiteDefinition>();

  for (const dir of getDefaultSitesDirs()) {
    const sites = loadSitesFromDirectory(dir);
    for (const [name, site] of sites) {
      allSites.set(name, site);
    }
  }

  return allSites;
}

export function findFlow(
  sites: Map<string, SiteDefinition>,
  siteFlowRef: string
): { site: SiteDefinition; flowName: string; flow: FlowDefinition } | null {
  const dotIndex = siteFlowRef.indexOf('.');

  if (dotIndex > 0) {
    const siteName = siteFlowRef.substring(0, dotIndex);
    const flowName = siteFlowRef.substring(dotIndex + 1);
    const site = sites.get(siteName);
    if (site && site.flows[flowName]) {
      return { site, flowName, flow: site.flows[flowName] };
    }
  } else {
    for (const [, site] of sites) {
      if (site.flows[siteFlowRef]) {
        return { site, flowName: siteFlowRef, flow: site.flows[siteFlowRef] };
      }
    }
  }

  return null;
}

export function validateYamlFile(filePath: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = yaml.load(content) as YamlSiteFile;

    if (!parsed.site) {
      errors.push('Missing "site" root key');
      return { valid: false, errors };
    }

    if (!parsed.site.name) {
      errors.push('Missing "site.name"');
    }

    if (!parsed.flows || Object.keys(parsed.flows).length === 0) {
      errors.push('No flows defined');
    } else {
      for (const [flowName, flow] of Object.entries(parsed.flows)) {
        if (!flow.steps || flow.steps.length === 0) {
          errors.push(`Flow "${flowName}" has no steps`);
        }
        for (const step of flow.steps || []) {
          if (!step.id) {
            errors.push(`Flow "${flowName}" has a step without an id`);
          }
          if (!step.action) {
            errors.push(`Flow "${flowName}" step "${step.id || '?'}" has no action`);
          }
        }
      }
    }
  } catch (e) {
    errors.push(`YAML parse error: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { valid: errors.length === 0, errors };
}
