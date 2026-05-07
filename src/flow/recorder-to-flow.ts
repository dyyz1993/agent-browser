import { readFileSync } from 'fs';
import { resolve } from 'path';
import yaml from 'js-yaml';
import type { SiteDefinition, FlowDefinition, FlowStep } from './types.js';

export interface RecorderAnnotation {
  type:
    | 'wait_element'
    | 'wait_timeout'
    | 'data_container'
    | 'data_item'
    | 'pagination'
    | 'login_check'
    | 'checkpoint'
    | 'custom';
  label: string;
  selector?: string;
  waitTimeout?: number;
  itemSelector?: string;
  fields?: string[];
  nextSelector?: string;
  customNote?: string;
}

export interface ElementIdentity {
  tagName: string;
  textContent: string;
  attributes: Record<string, string>;
  classes: string[];
  boundingRect: { x: number; y: number; width: number; height: number };
  parentSignature: string;
}

export interface RecorderStep {
  id: string;
  time?: string;
  timestamp?: number;
  action: string;
  selector?: string;
  xpath?: string;
  value?: string;
  url?: string;
  annotation?: RecorderAnnotation;

  fallbackSelectors?: string[];
  elementIdentity?: ElementIdentity;
  signalType?: 'url_change' | 'dom_stable';
  data?: Record<string, unknown>;
}

export interface RecorderYaml {
  session: {
    id: string;
    startTime: string;
    endTime: string;
    steps: number;
  };
  pages?: Array<{ url: string; title: string; firstVisitTime: string }>;
  steps: RecorderStep[];
}

export interface RecorderToFlowOptions {
  flowId?: string;
  description?: string;
  baseUrl?: string;
  siteName?: string;
  maxPaginateIterations?: number;
}

export interface RecorderToFlowResult {
  site: SiteDefinition;
  warnings: string[];
}

export function recorderToFlow(
  recorderYaml: RecorderYaml,
  options?: RecorderToFlowOptions
): RecorderToFlowResult {
  const warnings: string[] = [];
  const steps: FlowStep[] = [];

  let hasPagination = false;
  let paginationNextSelector = '';

  let dataContainerFound = false;
  let dataContainerSelector = '';
  const dataItemFields: Record<string, string> = {};

  for (let i = 0; i < recorderYaml.steps.length; i++) {
    const step = recorderYaml.steps[i];

    if (step.annotation) {
      switch (step.annotation.type) {
        case 'pagination':
          hasPagination = true;
          paginationNextSelector =
            step.annotation.nextSelector || step.annotation.selector || step.selector || '';
          warnings.push(
            `Pagination annotation at step "${step.id}" with selector "${paginationNextSelector}"`
          );
          break;

        case 'data_container':
          dataContainerFound = true;
          dataContainerSelector =
            step.annotation.itemSelector || step.annotation.selector || step.selector || '';
          warnings.push(`Data container annotation with selector "${dataContainerSelector}"`);
          continue;

        case 'data_item':
          if (step.annotation.fields) {
            for (const field of step.annotation.fields) {
              dataItemFields[field] = field;
            }
          }
          warnings.push(
            `Data item annotation with fields: ${Object.keys(dataItemFields).join(', ')}`
          );
          continue;

        case 'wait_element':
          steps.push({
            id: step.id,
            action: 'wait',
            selector: step.annotation.selector || step.selector,
            timeout: step.annotation.waitTimeout || 5000,
          });
          continue;

        case 'wait_timeout':
          steps.push({
            id: step.id,
            action: 'wait',
            timeout: step.annotation.waitTimeout || 5000,
          });
          continue;

        case 'login_check': {
          const loginStep: FlowStep = {
            id: step.id || `login-check-${i}`,
            action: 'autoRecover',
            blockingConditions: [
              { selector: step.selector || step.annotation.selector || '' },
              { urlPattern: '/login' },
            ],
            intervention: {
              message:
                step.annotation.customNote || 'Login required, please complete login via Viewer',
              openViewer: true,
              mode: 'wait',
            },
            resolveTimeout: 120000,
            checkInterval: 2000,
          };
          steps.push(loginStep);
          warnings.push(`login check annotation at step "${step.id}"`);
          continue;
        }

        case 'checkpoint':
          steps.push({
            id: step.id,
            action: 'snapshot',
            selector: step.selector,
          });
          continue;

        case 'custom':
          warnings.push(
            `Custom annotation at step "${step.id}": ${
              step.annotation.customNote || step.annotation.label
            }`
          );
          {
            const flowStep = convertStep(step);
            if (flowStep) steps.push(flowStep);
          }
          continue;
      }
    }

    if (step.action === 'annotate') {
      continue;
    }

    if (step.action === 'environment_signal') {
      if (step.signalType === 'url_change') {
        steps.push({
          id: step.id,
          action: 'wait',
          waitCondition: 'url_change',
          waitUrlPattern: (step.data?.url as string) || step.url,
          timeout: step.data?.timeout as number | undefined,
        });
      } else if (step.signalType === 'dom_stable') {
        steps.push({
          id: step.id,
          action: 'wait',
          waitCondition: 'dom_stable',
          waitDomStableTimeout: (step.data?.timeout as number) || 500,
          timeout: step.data?.timeout as number | undefined,
        });
      }
      continue;
    }

    const flowStep = convertStep(step);
    if (flowStep) {
      steps.push(flowStep);
    }
  }

  if (hasPagination && paginationNextSelector) {
    const paginateIndex = steps.findIndex(
      (s) =>
        s.action === 'click' &&
        (s.selector === paginationNextSelector || paginationNextSelector.endsWith(s.selector || ''))
    );

    if (paginateIndex >= 0) {
      const beforePaginate = steps.slice(0, paginateIndex);
      const afterPaginate = steps.slice(paginateIndex + 1);

      let extractStep: FlowStep | undefined;
      if (dataContainerFound && dataContainerSelector) {
        extractStep = {
          id: 'auto-extract',
          action: 'extract',
          container: dataContainerSelector,
          fields:
            Object.keys(dataItemFields).length > 0
              ? dataItemFields
              : { title: 'a, h1, h2, h3', url: 'a[href]' },
          outputVar: 'results',
        };
      }

      const paginateStep: FlowStep = {
        id: 'auto-paginate',
        action: 'clickPaginate',
        nextSelector: paginationNextSelector,
        termination: {
          maxIterations: options?.maxPaginateIterations || 10,
          elementDisappears: paginationNextSelector,
        },
        ...(extractStep ? { extractBeforeClick: extractStep } : {}),
      };

      steps.length = 0;
      steps.push(...beforePaginate, paginateStep, ...afterPaginate);
    } else {
      warnings.push(
        `Pagination annotation found but no matching click step for selector "${paginationNextSelector}". Adding clickPaginate at end.`
      );
      const paginateStep: FlowStep = {
        id: 'auto-paginate',
        action: 'clickPaginate',
        nextSelector: paginationNextSelector,
        termination: {
          maxIterations: options?.maxPaginateIterations || 10,
        },
      };
      steps.push(paginateStep);
    }
  } else if (dataContainerFound && dataContainerSelector) {
    steps.push({
      id: 'auto-extract',
      action: 'extract',
      container: dataContainerSelector,
      fields:
        Object.keys(dataItemFields).length > 0
          ? dataItemFields
          : { title: 'a, h1, h2, h3', url: 'a[href]' },
      outputVar: 'results',
    });
  }

  const flowId = options?.flowId || `flow-${Date.now()}`;
  const flow: FlowDefinition = {
    id: flowId,
    description:
      options?.description ||
      `Converted from recorder session ${recorderYaml.session?.id || 'unknown'}`,
    steps,
    output: ['results'],
  };

  const baseUrl =
    options?.baseUrl ||
    (recorderYaml.pages?.[0]?.url
      ? (() => {
          try {
            return new URL(recorderYaml.pages[0].url).origin;
          } catch {
            return '';
          }
        })()
      : '');

  const site: SiteDefinition = {
    name: options?.siteName || 'recorded-site',
    description: 'Auto-generated from recorder',
    baseUrl,
    flows: { [flowId]: flow },
  };

  return { site, warnings };
}

function attachRecorderMeta(flowStep: FlowStep, step: RecorderStep): FlowStep {
  if (step.fallbackSelectors && step.fallbackSelectors.length > 0) {
    flowStep.fallbackSelectors = step.fallbackSelectors;
  }
  if (step.elementIdentity) {
    flowStep.elementIdentity = step.elementIdentity;
  }
  return flowStep;
}

function convertStep(step: RecorderStep): FlowStep | null {
  switch (step.action) {
    case 'navigate':
    case 'open':
    case 'goto':
      return attachRecorderMeta(
        {
          id: step.id,
          action: 'navigate',
          url: step.url,
        },
        step
      );
    case 'click':
      return attachRecorderMeta(
        {
          id: step.id,
          action: 'click',
          selector: step.selector,
        },
        step
      );
    case 'fill':
    case 'type':
      return attachRecorderMeta(
        {
          id: step.id,
          action: 'fill',
          selector: step.selector,
          value: step.value,
        },
        step
      );
    case 'press':
    case 'keyboard':
      return attachRecorderMeta(
        {
          id: step.id,
          action: 'press',
          value: step.value || step.selector,
        },
        step
      );
    case 'scroll':
      return attachRecorderMeta(
        {
          id: step.id,
          action: 'scroll',
          value: 'down',
          scrollAmount: 500,
        },
        step
      );
    case 'select':
      return attachRecorderMeta(
        {
          id: step.id,
          action: 'fill',
          selector: step.selector,
          value: step.value,
        },
        step
      );
    case 'wait':
      return attachRecorderMeta(
        {
          id: step.id,
          action: 'wait',
          selector: step.selector,
          timeout: 5000,
        },
        step
      );
    case 'snapshot':
      return attachRecorderMeta(
        {
          id: step.id,
          action: 'snapshot',
          selector: step.selector,
        },
        step
      );
    case 'back':
      return attachRecorderMeta(
        {
          id: step.id,
          action: 'navigate',
          url: 'back',
        },
        step
      );
    default:
      return null;
  }
}

export function parseRecorderYaml(content: string): RecorderYaml {
  const parsed = yaml.load(content);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid recorder YAML: empty or non-object');
  }
  return parsed as RecorderYaml;
}

export function recorderToFlowFromYamlString(
  yamlContent: string,
  options?: RecorderToFlowOptions
): RecorderToFlowResult {
  const parsed = parseRecorderYaml(yamlContent);
  return recorderToFlow(parsed, options);
}

export function recorderToFlowFromFile(
  filePath: string,
  options?: RecorderToFlowOptions
): RecorderToFlowResult {
  const content = readFileSync(resolve(filePath), 'utf-8');
  return recorderToFlowFromYamlString(content, options);
}

export function siteToYamlString(site: SiteDefinition): string {
  const obj = {
    site: {
      name: site.name,
      description: site.description,
      baseUrl: site.baseUrl,
    },
    flows: {} as Record<string, Record<string, unknown>>,
  };

  for (const [flowId, flow] of Object.entries(site.flows)) {
    obj.flows[flowId] = {
      description: flow.description,
      params: flow.params,
      steps: flow.steps.map(serializeStep),
      output: flow.output,
    };
  }

  return yaml.dump(obj, { lineWidth: 120, noRefs: true, sortKeys: false });
}

function serializeStep(step: FlowStep): Record<string, unknown> {
  const result: Record<string, unknown> = { id: step.id, action: step.action };

  const simpleKeys: (keyof FlowStep)[] = [
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
    'checkInterval',
    'resolveTimeout',
    'waitForNavigation',
    'sourceVar',
    'dedupField',
    'scrollDirection',
    'scrollAmount',
    'scrollContainer',
    'file',
    'captureFilter',
    'apiUrl',
    'mockResponse',
    'mockStatus',
    'abortRequests',
    'preset',
    'outputFormat',
    'pretty',
    'waitCondition',
    'waitUrlPattern',
    'waitDomStableTimeout',
  ];

  for (const key of simpleKeys) {
    if (step[key] !== undefined) {
      result[key] = step[key];
    }
  }

  if (step.fields) result.fields = step.fields;
  if (step.termination) result.termination = step.termination;
  if (step.blockingConditions) result.blockingConditions = step.blockingConditions;
  if (step.intervention) result.intervention = step.intervention;

  if (step.extractBeforeClick) result.extractBeforeClick = serializeStep(step.extractBeforeClick);
  if (step.extractOnEachScroll)
    result.extractOnEachScroll = serializeStep(step.extractOnEachScroll);

  const subStepKeys: (keyof FlowStep)[] = [
    'itemSteps',
    'loopSteps',
    'collectSteps',
    'thenSteps',
    'elseSteps',
    'subSteps',
    'onResolved',
    'onTimeout',
    'onEachPage',
  ];
  for (const key of subStepKeys) {
    const subSteps = step[key] as FlowStep[] | undefined;
    if (subSteps) {
      result[key] = subSteps.map(serializeStep);
    }
  }

  if (step.smartExtractConfig) result.smartExtractConfig = step.smartExtractConfig;

  if (step.fallbackSelectors && step.fallbackSelectors.length > 0)
    result.fallbackSelectors = step.fallbackSelectors;
  if (step.elementIdentity) result.elementIdentity = step.elementIdentity;

  return result;
}
