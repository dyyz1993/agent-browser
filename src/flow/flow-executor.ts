import { BrowserManager } from '../browser.js';
import { executeCommand } from '../actions.js';
import { parseCliArgs } from '../__tests__/utils/parseCli.js';
import { isSuccessResponse } from '../types.js';
import { readFileSync } from 'fs';
import path from 'path';
import { getPreset } from './presets/index.js';
import { formatOutput, writeOutput } from './output.js';
import type { OutputFormat, OutputConfig } from './output.js';
import type {
  SiteDefinition,
  FlowDefinition,
  FlowStep,
  FlowContext,
  FlowResult,
  BlockingCondition,
  HealingLogEntry,
  StateCheckpoint,
  CheckpointResult,
  HealingConfig,
  RetryConfig,
} from './types.js';
import { PluginManager } from './plugin-system.js';
import type { HookType } from './plugin-system.js';
import type { Page, Frame } from 'playwright-core';

function sanitizeSelector(selector: string): string {
  return selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function validateFilePath(filePath: string): string {
  const resolvedPath = path.resolve(filePath);
  const cwd = process.cwd();
  if (!resolvedPath.startsWith(cwd)) {
    throw new Error(`Security: file path must be within project directory. Got: ${resolvedPath}`);
  }
  return resolvedPath;
}

export class FlowExecutor {
  private browser: BrowserManager;
  private context: FlowContext;
  private pluginManager: PluginManager | null;
  private healingLog: HealingLogEntry[] = [];
  private checkpointResults: CheckpointResult[] = [];
  private flowHealing: HealingConfig = {};
  private flowRetry: RetryConfig = {};

  constructor(browser: BrowserManager, pluginManager?: PluginManager) {
    this.browser = browser;
    this.context = { variables: {}, params: {}, results: {}, pageCount: 0, currentPage: 0 };
    this.pluginManager = pluginManager || null;

    if (this.pluginManager) {
      this.pluginManager.setBrowser(this.browser);
    }
  }

  async execute(
    site: SiteDefinition,
    flowName: string,
    params: Record<string, unknown>
  ): Promise<FlowResult> {
    const startTime = Date.now();
    const flow = site.flows[flowName];
    if (!flow) throw new Error(`Flow "${flowName}" not found in site "${site.name}"`);

    this.healingLog = [];
    this.checkpointResults = [];
    this.flowHealing = flow.healing || {};
    this.flowRetry = flow.retry || {};

    this.context = {
      variables: { baseUrl: site.baseUrl || '' },
      params: this.resolveParams(flow, params),
      results: {},
      pageCount: 0,
      currentPage: 1,
    };

    if (this.pluginManager) {
      this.pluginManager.setContext(this.context);
      this.pluginManager.setExecuteStep((step) => this.executeStep(step, []));
    }

    const errors: Array<{ step: string; error: string }> = [];

    if (this.pluginManager) {
      await this.pluginManager.triggerHook('onFlowStart');
    }

    try {
      await this.executeSteps(flow.steps, errors);
    } catch (err: unknown) {
      errors.push({ step: 'flow', error: err instanceof Error ? err.message : String(err) });
    }

    const data: Record<string, unknown> = {};
    if (flow.output) {
      for (const varName of flow.output) {
        data[varName] = this.context.results[varName];
      }
    }

    if (this.pluginManager) {
      await this.pluginManager.triggerHook('onFlowEnd');
      await this.pluginManager.processData(data);
    }

    return {
      success: errors.length === 0,
      site: site.name,
      flow: flowName,
      data,
      errors,
      duration: Date.now() - startTime,
      healingLog: this.healingLog.length > 0 ? [...this.healingLog] : undefined,
      checkpointResults:
        this.checkpointResults.length > 0 ? [...this.checkpointResults] : undefined,
    };
  }

  private resolveParams(
    flow: FlowDefinition,
    provided: Record<string, unknown>
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    if (flow.params) {
      for (const param of flow.params) {
        if (provided[param.name] !== undefined) {
          resolved[param.name] = provided[param.name];
        } else if (param.default !== undefined) {
          resolved[param.name] = param.default;
        } else if (param.required) {
          throw new Error(`Required parameter "${param.name}" not provided`);
        }
      }
    }
    return resolved;
  }

  private substituteVars(str: string): string {
    return str.replace(/\$\{(\w+)\}/g, (_, key: string) => {
      const value = this.context.params[key] ?? this.context.variables[key] ?? '';
      return String(value);
    });
  }

  private async executeSteps(
    steps: FlowStep[],
    errors: Array<{ step: string; error: string }>
  ): Promise<void> {
    for (const step of steps) {
      try {
        if (this.pluginManager) {
          await this.pluginManager.triggerHook('onStepStart', step);
        }
        await this.executeStepWithRetry(step, errors);

        if (step.environment?.waitDomStable) {
          const frame = step.inFrame ? this.browser.getFrame(step.inFrame) : this.browser.getPage();
          await this.waitForDOMStable(frame, step.environment.domStableTimeout);
        }

        if (step.checkpoint) {
          const frame = step.inFrame ? this.browser.getFrame(step.inFrame) : this.browser.getPage();
          const result = await this.verifyCheckpoint(step.checkpoint, frame);
          this.checkpointResults.push({ stepId: step.id, ...result });
          if (!result.passed) {
            console.warn(
              `[Checkpoint] Step "${step.id}" checkpoint failures: ${result.failures.join('; ')}`
            );
          }
        }

        if (this.pluginManager) {
          const result = step.outputVar ? this.context.results[step.outputVar] : undefined;
          await this.pluginManager.triggerHook('onStepEnd', step, result);
        }
      } catch (err: unknown) {
        if (this.pluginManager) {
          await this.pluginManager.triggerHook('onStepError', step);
        }
        errors.push({ step: step.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  private async executeStepWithRetry(
    step: FlowStep,
    errors: Array<{ step: string; error: string }>
  ): Promise<void> {
    const retryConfig = this.flowRetry;
    const maxAttempts = step.retry?.maxAttempts ?? retryConfig.maxAttempts ?? 3;
    const delayMs = step.retry?.delayMs ?? retryConfig.delayMs ?? 1000;
    const strategy = step.retry?.strategy ?? retryConfig.strategy ?? 'fixed';
    const backoffMultiplier = retryConfig.backoffMultiplier ?? 2;

    if (!step.retry && !this.flowRetry.maxAttempts) {
      await this.executeStep(step, errors);
      return;
    }

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.executeStep(step, errors);
        return;
      } catch (err: unknown) {
        lastError = err;
        if (attempt < maxAttempts) {
          const delay =
            strategy === 'exponential'
              ? delayMs * Math.pow(backoffMultiplier, attempt - 1)
              : delayMs;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw lastError;
  }

  private async executeStep(
    step: FlowStep,
    errors: Array<{ step: string; error: string }>
  ): Promise<void> {
    switch (step.action) {
      case 'navigate':
        await this.executeNavigate(step);
        break;
      case 'click':
        await this.executeClick(step);
        break;
      case 'fill':
        await this.executeFill(step);
        break;
      case 'wait':
        await this.executeWait(step);
        break;
      case 'extract':
        await this.executeExtract(step);
        break;
      case 'paginate':
        await this.executePaginate(step, errors);
        break;
      case 'forEach':
        await this.executeForEach(step, errors);
        break;
      case 'condition':
        await this.executeCondition(step, errors);
        break;
      case 'eval':
        await this.executeEval(step);
        break;
      case 'snapshot':
        await this.executeSnapshot(step);
        break;
      case 'scroll':
        await this.executeScroll(step);
        break;
      case 'press':
        await this.executePress(step);
        break;
      case 'screenshot':
        await this.executeScreenshot(step);
        break;
      case 'scrollUntil':
        await this.executeScrollUntil(step, errors);
        break;
      case 'clickPaginate':
        await this.executeClickPaginate(step, errors);
        break;
      case 'forEachItem':
        await this.executeForEachItem(step, errors);
        break;
      case 'repeatWhile':
        await this.executeRepeatWhile(step, errors);
        break;
      case 'collectAll':
        await this.executeCollectAll(step, errors);
        break;
      case 'detectBlocking': {
        const conditions = step.blockingConditions || [];
        const isBlocked = await this.detectBlocking(conditions);
        this.context.variables['isBlocked'] = isBlocked;
        this.context.results['blockingDetected'] = isBlocked;
        break;
      }
      case 'humanHelp':
        await this.executeHumanHelp(step);
        break;
      case 'waitForHuman':
        await this.executeWaitForHuman(step, errors);
        break;
      case 'autoRecover':
        await this.executeAutoRecover(step, errors);
        break;
      case 'captureScript':
        await this.executeCaptureScript(step);
        break;
      case 'readCapture': {
        const captureOutputVar = step.outputVar || 'capturedApiData';
        const captured = await this.readCapturedData();
        this.context.results[captureOutputVar] = captured;
        break;
      }
      case 'captureAPI':
        await this.executeCaptureAPI(step);
        break;
      case 'readAPI':
        await this.executeReadAPI(step);
        break;
      case 'interceptRoute':
        await this.executeInterceptRoute(step);
        break;
      case 'removeRoute':
        await this.executeRemoveRoute(step);
        break;
      case 'smartExtract':
        await this.executeSmartExtract(step, errors);
        break;
      case 'formatOutput': {
        const format = step.outputFormat || 'json';
        const data = step.outputVar ? this.context.results[step.outputVar] : this.context.results;
        const content = formatOutput(data, {
          format: format as OutputFormat,
          filePath: step.file,
          pretty: step.pretty !== false,
          dedupField: step.dedupField,
        });
        this.context.variables['formattedOutput'] = content;
        if (step.file) {
          const written = writeOutput(data, {
            format: format as OutputFormat,
            filePath: step.file,
            pretty: step.pretty !== false,
            dedupField: step.dedupField,
          });
          this.context.variables['outputFile'] = written;
        }
        break;
      }
      case 'deduplicate': {
        const sourceVar = step.sourceVar || step.outputVar || 'results';
        const field = step.dedupField || 'url';
        const data = this.context.results[sourceVar];
        if (Array.isArray(data)) {
          const seen = new Set<unknown>();
          this.context.results[sourceVar] = data.filter((item) => {
            const key = (item as Record<string, unknown>)[field];
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
        break;
      }
      default:
        if (this.pluginManager && this.pluginManager.hasAction(step.action)) {
          await this.pluginManager.executeAction(step.action, step);
        } else {
          console.warn(`Unknown step action: ${step.action}`);
        }
    }
  }

  private async executeNavigate(step: FlowStep): Promise<void> {
    const url = this.substituteVars(step.url || '');
    await executeCommand(parseCliArgs(['open', url]), this.browser);
    if (step.waitAfter) {
      await executeCommand(parseCliArgs(['wait', '--load', step.waitAfter]), this.browser);
    } else {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  private async executeClick(step: FlowStep): Promise<void> {
    const selector = await this.resolveSelector(step);
    const args = ['click', selector];
    if (step.inFrame) args.push('--in-frame', step.inFrame);
    await executeCommand(parseCliArgs(args), this.browser);
    if (step.waitAfter) {
      await executeCommand(parseCliArgs(['wait', '--load', step.waitAfter]), this.browser);
    }
  }

  private async executeFill(step: FlowStep): Promise<void> {
    const selector = await this.resolveSelector(step);
    const value = this.substituteVars(step.value || '');
    const args = ['fill', selector, value];
    if (step.inFrame) args.push('--in-frame', step.inFrame);
    await executeCommand(parseCliArgs(args), this.browser);
  }

  private async executeWait(step: FlowStep): Promise<void> {
    const args: string[] = [];
    if (step.inFrame) args.push('--in-frame', step.inFrame);

    if (step.waitAfter) {
      args.push('--load', step.waitAfter);
      await executeCommand(parseCliArgs(['wait', ...args]), this.browser);
    } else if (step.selector) {
      await executeCommand(parseCliArgs(['wait', step.selector, ...args]), this.browser);
    } else if (step.timeout) {
      await executeCommand(parseCliArgs(['wait', String(step.timeout), ...args]), this.browser);
    }
  }

  private async executeExtract(step: FlowStep): Promise<void> {
    const container = step.container ? this.substituteVars(step.container) : 'body';
    const fields = step.fields || {};

    const fieldEntries = Object.entries(fields).map(([name, def]) => {
      if (typeof def === 'string') {
        return `${name}: el.querySelector('${sanitizeSelector(def)}')?.textContent?.trim() || ''`;
      }
      if (def.attribute) {
        return `${name}: el.querySelector('${sanitizeSelector(def.selector)}')?.getAttribute('${sanitizeSelector(def.attribute)}') || ''`;
      }
      return `${name}: el.querySelector('${sanitizeSelector(def.selector)}')?.textContent?.trim() || ''`;
    });

    const script = [
      '((() => {',
      `  const containers = document.querySelectorAll('${sanitizeSelector(container)}');`,
      '  const results = [];',
      '  containers.forEach(el => {',
      `    results.push({ ${fieldEntries.join(', ')} });`,
      '  });',
      '  return JSON.stringify(results);',
      '})())',
    ].join('\n');

    const result = await executeCommand(parseCliArgs(['eval', script]), this.browser);
    if (isSuccessResponse(result)) {
      const evalResult = result.data as { result?: unknown };
      if (evalResult.result) {
        const parsed = JSON.parse(String(evalResult.result)) as unknown[];
        const outputVar = step.outputVar || 'extracted';
        if (this.context.results[outputVar] && Array.isArray(this.context.results[outputVar])) {
          this.context.results[outputVar] = [
            ...(this.context.results[outputVar] as unknown[]),
            ...parsed,
          ];
        } else {
          this.context.results[outputVar] = parsed;
        }
      }
    }
  }

  private async executePaginate(
    step: FlowStep,
    errors: Array<{ step: string; error: string }>
  ): Promise<void> {
    const maxPages =
      typeof step.maxPages === 'string'
        ? Number(this.substituteVars(step.maxPages))
        : step.maxPages || 1;

    const onEachPage = step.onEachPage || [];

    for (let page = 1; page <= maxPages; page++) {
      this.context.currentPage = page;
      this.context.pageCount = page;

      if (onEachPage.length > 0) {
        await this.executeSteps(onEachPage, errors);
      }

      if (page < maxPages && step.nextSelector) {
        try {
          await executeCommand(parseCliArgs(['click', step.nextSelector]), this.browser);
          await new Promise((r) => setTimeout(r, 3000));
        } catch (err: unknown) {
          console.warn(
            `Pagination stopped at page ${page}: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
          break;
        }
      }
    }
  }

  private async executeForEach(
    step: FlowStep,
    errors: Array<{ step: string; error: string }>
  ): Promise<void> {
    const sourceData = (this.context.results[step.sourceVar || ''] || []) as Array<
      Record<string, unknown>
    >;
    const subSteps = step.subSteps || [];

    for (let i = 0; i < sourceData.length; i++) {
      this.context.variables['item'] = sourceData[i];
      this.context.variables['itemIndex'] = i;

      try {
        await this.executeSteps(subSteps, errors);
      } catch (err: unknown) {
        errors.push({
          step: `${step.id}[${i}]`,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private async executeCondition(
    step: FlowStep,
    errors: Array<{ step: string; error: string }>
  ): Promise<void> {
    const condition = this.substituteVars(step.condition || '');
    let result = false;

    if (condition.includes('==')) {
      const [left, right] = condition.split('==').map((s) => s.trim());
      const leftVal = String(this.context.params[left] ?? this.context.variables[left] ?? left);
      const rightVal = String(this.context.params[right] ?? this.context.variables[right] ?? right);
      result = leftVal === rightVal;
    } else {
      const val = this.context.params[condition] ?? this.context.variables[condition];
      result = Boolean(val);
    }

    if (result && step.thenSteps) {
      await this.executeSteps(step.thenSteps, errors);
    } else if (!result && step.elseSteps) {
      await this.executeSteps(step.elseSteps, errors);
    }
  }

  private async executeEval(step: FlowStep): Promise<void> {
    const script = this.substituteVars(step.value || '');
    const args = ['eval', script];
    if (step.inFrame) args.push('--in-frame', step.inFrame);
    const result = await executeCommand(parseCliArgs(args), this.browser);
    if (step.outputVar && isSuccessResponse(result)) {
      const evalResult = result.data as { result?: unknown };
      let parsed = evalResult.result;
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch (_e) {
          // Intentionally ignored: non-JSON eval result kept as string
        }
      }
      this.context.results[step.outputVar] = parsed;
    }
  }

  private async executeSnapshot(step: FlowStep): Promise<void> {
    const args = ['snapshot'];
    if (step.selector) args.push('--selector', step.selector);
    if (step.inFrame) args.push('--in-frame', step.inFrame);
    await executeCommand(parseCliArgs(args), this.browser);
  }

  private async executeScroll(step: FlowStep): Promise<void> {
    const direction = step.value || 'down';
    const amount = step.selector || '300';
    const args = ['scroll', direction, amount];
    if (step.inFrame) args.push('--in-frame', step.inFrame);
    await executeCommand(parseCliArgs(args), this.browser);
  }

  private async executePress(step: FlowStep): Promise<void> {
    const key = step.value || 'Enter';
    const args = ['press', key];
    if (step.inFrame) args.push('--in-frame', step.inFrame);
    await executeCommand(parseCliArgs(args), this.browser);
  }

  private async executeScreenshot(step: FlowStep): Promise<void> {
    const args = ['screenshot'];
    if (step.selector) args.push(step.selector);
    if (step.inFrame) args.push('--in-frame', step.inFrame);
    await executeCommand(parseCliArgs(args), this.browser);
  }

  private async executeScrollUntil(
    step: FlowStep,
    errors: Array<{ step: string; error: string }>
  ): Promise<void> {
    const maxIterations = step.termination?.maxIterations || 50;
    const noNewThreshold = step.termination?.noNewItemsCount || 3;
    const scrollAmount = step.scrollAmount || 500;
    const direction = step.scrollDirection || 'down';

    let prevCount = 0;
    let noNewCount = 0;

    for (let i = 0; i < maxIterations; i++) {
      const countSelector =
        step.extractOnEachScroll?.container || step.extractOnEachScroll?.selector || step.selector;
      if (countSelector) {
        const countResult = await executeCommand(
          parseCliArgs(['get', 'count', countSelector]),
          this.browser
        );
        if (isSuccessResponse(countResult)) {
          const currentCount = Number((countResult.data as { count: number }).count || 0);
          if (currentCount === prevCount && prevCount > 0) {
            noNewCount++;
            if (noNewCount >= noNewThreshold) break;
          } else {
            noNewCount = 0;
            prevCount = currentCount;
          }
        }
      }

      if (step.extractOnEachScroll) {
        await this.executeStep(step.extractOnEachScroll, errors);
      }

      if (step.termination?.jsExpression) {
        const checkResult = await executeCommand(
          parseCliArgs(['eval', step.termination.jsExpression]),
          this.browser
        );
        if (isSuccessResponse(checkResult)) {
          const shouldStop = (checkResult.data as { result: unknown }).result;
          if (shouldStop) break;
        }
      }

      await executeCommand(parseCliArgs(['scroll', direction, String(scrollAmount)]), this.browser);

      await new Promise((r) => setTimeout(r, 500));
    }
  }

  private async executeClickPaginate(
    step: FlowStep,
    errors: Array<{ step: string; error: string }>
  ): Promise<void> {
    const maxPages =
      typeof step.termination?.maxIterations === 'string'
        ? Number(this.substituteVars(step.termination.maxIterations))
        : step.termination?.maxIterations || 10;
    const nextSelector = step.nextSelector || '';
    const waitForNav = step.waitForNavigation || 'load';

    for (let page = 1; page <= maxPages; page++) {
      this.context.currentPage = page;
      this.context.pageCount = page;
      this.context.variables['currentPage'] = page;

      if (step.extractBeforeClick) {
        await this.executeStep(step.extractBeforeClick, errors);
      }

      if (page < maxPages) {
        const visibleResult = await executeCommand(
          parseCliArgs(['is', 'visible', nextSelector]),
          this.browser
        );
        if (isSuccessResponse(visibleResult)) {
          const visible = (visibleResult.data as { visible: boolean }).visible;
          if (!visible) {
            break;
          }
        }

        const enabledResult = await executeCommand(
          parseCliArgs(['is', 'enabled', nextSelector]),
          this.browser
        );
        if (isSuccessResponse(enabledResult)) {
          const enabled = (enabledResult.data as { enabled: boolean }).enabled;
          if (!enabled) {
            break;
          }
        }

        await executeCommand(parseCliArgs(['click', nextSelector]), this.browser);
        await executeCommand(parseCliArgs(['wait', '--load', waitForNav]), this.browser);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  private async executeForEachItem(
    step: FlowStep,
    errors: Array<{ step: string; error: string }>
  ): Promise<void> {
    const itemSelector = step.itemSelector || '';
    const itemSteps = step.itemSteps || [];

    const evalResult = await executeCommand(
      parseCliArgs([
        'eval',
        `JSON.stringify(Array.from(document.querySelectorAll('${sanitizeSelector(itemSelector)}')).map((el, i) => ({index: i, text: el.textContent?.trim()?.substring(0, 200) || '', html: el.innerHTML?.substring(0, 500) || ''})))`,
      ]),
      this.browser
    );

    if (isSuccessResponse(evalResult)) {
      const items = JSON.parse(
        String((evalResult.data as { result: unknown }).result || '[]')
      ) as Array<Record<string, unknown>>;
      this.context.variables['totalItems'] = items.length;

      for (let i = 0; i < items.length; i++) {
        this.context.variables['currentItem'] = items[i];
        this.context.variables['currentItemIndex'] = i;

        try {
          await this.executeSteps(itemSteps, errors);
        } catch (err: unknown) {
          errors.push({
            step: `${step.id}[${i}]`,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  private async executeRepeatWhile(
    step: FlowStep,
    errors: Array<{ step: string; error: string }>
  ): Promise<void> {
    const maxIterations = step.termination?.maxIterations || 100;
    const conditionJs = step.conditionJs || 'false';
    const loopSteps = step.loopSteps || [];

    for (let i = 0; i < maxIterations; i++) {
      const condResult = await executeCommand(parseCliArgs(['eval', conditionJs]), this.browser);

      if (isSuccessResponse(condResult)) {
        const shouldContinue = (condResult.data as { result: unknown }).result;
        if (!shouldContinue) break;
      } else {
        break;
      }

      await this.executeSteps(loopSteps, errors);
    }
  }

  private async executeCollectAll(
    step: FlowStep,
    errors: Array<{ step: string; error: string }>
  ): Promise<void> {
    const sourceVar = step.sourceVar || 'collected';
    const dedupField = step.dedupField;
    const maxIterations = step.termination?.maxIterations || 50;
    const collectSteps = step.collectSteps || [];

    let allData: unknown[] = [];
    let prevLength = 0;
    let noNewCount = 0;

    for (let i = 0; i < maxIterations; i++) {
      await this.executeSteps(collectSteps, errors);

      const newData = this.context.results[sourceVar];
      if (Array.isArray(newData)) {
        if (dedupField) {
          const seen = new Set(
            (allData as Array<Record<string, unknown>>).map((d) => d[dedupField])
          );
          const unique = (newData as Array<Record<string, unknown>>).filter(
            (d) => !seen.has(d[dedupField])
          );
          allData = [...allData, ...unique];
        } else {
          allData = [...allData, ...newData];
        }
      }

      if (allData.length === prevLength && prevLength > 0) {
        noNewCount++;
        if (noNewCount >= (step.termination?.noNewItemsCount || 3)) break;
      } else {
        noNewCount = 0;
        prevLength = allData.length;
      }
    }

    this.context.results[sourceVar] = allData;
  }

  private async detectBlocking(conditions: BlockingCondition[]): Promise<boolean> {
    for (const condition of conditions) {
      if (condition.selector) {
        const result = await executeCommand(
          parseCliArgs(['is', 'visible', condition.selector]),
          this.browser
        );
        if (isSuccessResponse(result) && (result.data as { visible: boolean }).visible) {
          return true;
        }
      }

      if (condition.jsExpression) {
        const result = await executeCommand(
          parseCliArgs(['eval', condition.jsExpression]),
          this.browser
        );
        if (isSuccessResponse(result) && (result.data as { result: unknown }).result) {
          return true;
        }
      }

      if (condition.urlPattern) {
        const result = await executeCommand(parseCliArgs(['get', 'url']), this.browser);
        if (isSuccessResponse(result)) {
          const url = String((result.data as { url: string }).url || '');
          if (url.includes(condition.urlPattern)) {
            return true;
          }
        }
      }

      if (condition.textContains) {
        const escaped = sanitizeSelector(condition.textContains);
        const result = await executeCommand(
          parseCliArgs(['eval', `document.body.textContent.includes('${escaped}')`]),
          this.browser
        );
        if (isSuccessResponse(result) && (result.data as { result: unknown }).result) {
          return true;
        }
      }
    }
    return false;
  }

  private async executeHumanHelp(step: FlowStep): Promise<void> {
    const intervention = step.intervention;
    if (!intervention) return;

    if (intervention.screenshot) {
      await executeCommand(parseCliArgs(['screenshot']), this.browser);
    }

    if (intervention.openViewer) {
      const viewerResult = await executeCommand(
        { id: `viewer-${Date.now()}`, action: 'viewer' } as const,
        this.browser
      );
      if (isSuccessResponse(viewerResult)) {
        const viewerUrl = (viewerResult.data as { url: string }).url;
        console.log(`[Human Help] Viewer opened: ${viewerUrl}`);
      }
    }

    const mode = intervention.mode || 'askAndWait';
    if (mode === 'ask' || mode === 'askAndWait') {
      try {
        const askResult = await executeCommand(
          { id: `ask-${Date.now()}`, action: 'ask', question: intervention.message } as const,
          this.browser
        );
        if (isSuccessResponse(askResult)) {
          const answer = (askResult.data as { answer: string }).answer;
          console.log(`[Human Help] Human responded: ${answer}`);
          this.context.variables['humanAnswer'] = answer;
        }
      } catch (e) {
        console.log(`[Human Help] Ask failed: ${e}`);
      }
    }
  }

  private async executeWaitForHuman(
    step: FlowStep,
    errors: Array<{ step: string; error: string }>
  ): Promise<void> {
    const conditions = step.blockingConditions || [];
    const checkInterval = step.checkInterval || 2000;
    const resolveTimeout = step.resolveTimeout || 120000;

    const startTime = Date.now();

    while (Date.now() - startTime < resolveTimeout) {
      const stillBlocked = await this.detectBlocking(conditions);
      if (!stillBlocked) {
        console.log('[WaitForHuman] Blocking condition resolved!');
        if (step.onResolved) {
          await this.executeSteps(step.onResolved, errors);
        }
        return;
      }

      await new Promise((r) => setTimeout(r, checkInterval));
    }

    console.log('[WaitForHuman] Timed out waiting for human to resolve.');
    if (step.onTimeout) {
      await this.executeSteps(step.onTimeout, errors);
    } else {
      errors.push({
        step: step.id,
        error: `Human intervention timed out after ${resolveTimeout}ms`,
      });
    }
  }

  private async executeAutoRecover(
    step: FlowStep,
    errors: Array<{ step: string; error: string }>
  ): Promise<void> {
    const conditions = step.blockingConditions || [];

    const isBlocked = await this.detectBlocking(conditions);
    if (!isBlocked) {
      console.log('[AutoRecover] No blocking condition detected, continuing.');
      return;
    }

    console.log('[AutoRecover] Blocking condition detected! Requesting human help...');

    await this.executeHumanHelp(step);

    await this.executeWaitForHuman(step, errors);
  }

  private async executeCaptureScript(step: FlowStep): Promise<void> {
    let script: string;

    if (step.preset) {
      const presetScript = getPreset(step.preset);
      if (presetScript) {
        script = presetScript;
        if (step.captureFilter) {
          script = script.replace(/__FILTER__/g, step.captureFilter);
        } else {
          script = script.replace(/__FILTER__/g, '');
        }
      } else {
        console.warn(`[captureScript] Unknown preset: ${step.preset}`);
        return;
      }
    } else if (step.file) {
      const resolvedPath = validateFilePath(step.file);
      script = readFileSync(resolvedPath, 'utf-8');
    } else if (step.value) {
      script = step.value;
    } else {
      const outputVar = step.outputVar || 'capturedApiData';
      script = this.generateCaptureScript(outputVar, step.captureFilter);
    }

    const result = await executeCommand(parseCliArgs(['addinitscript', script]), this.browser);

    if (isSuccessResponse(result) && (result.data as Record<string, unknown>)?.tips) {
      console.log('[captureScript] Tips:', (result.data as Record<string, unknown>).tips);
    }
  }

  private generateCaptureScript(outputVar: string, filter?: string): string {
    const filterStr = filter ? sanitizeSelector(filter) : '';
    return `
(function() {
  if (window.__flowCaptureActive) return;
  window.__flowCaptureActive = true;
  var _captured = [];
  var _filter = '${filterStr}';
  var origFetch = window.fetch;
  window.fetch = function() {
    var args = Array.prototype.slice.call(arguments);
    var url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
    return origFetch.apply(this, args).then(function(resp) {
      var ct = (resp.headers.get('content-type') || '').toLowerCase();
      if (!_filter || url.indexOf(_filter) !== -1) {
        if (ct.indexOf('json') !== -1) {
          resp.clone().text().then(function(body) {
            try { _captured.push({ type:'fetch', url:url, status:resp.status, body:JSON.parse(body), ts:Date.now() }); } catch(e) { _captured.push({ type:'fetch', url:url, status:resp.status, body:body, ts:Date.now() }); }
          });
        } else if (ct.indexOf('text/event-stream') !== -1) {
          var reader = resp.clone().body.getReader();
          var decoder = new TextDecoder();
          (function pump() {
            reader.read().then(function(result) {
              if (result.done) return;
              var text = decoder.decode(result.value, {stream:true});
              _captured.push({ type:'sse', url:url, data:text, ts:Date.now() });
              pump();
            });
          })();
        }
      }
      return resp;
    });
  };
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__captureUrl = url;
    this.__captureMethod = method;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    var self = this;
    this.addEventListener('load', function() {
      var url = self.__captureUrl || '';
      if (!_filter || url.indexOf(_filter) !== -1) {
        var body = self.responseText;
        try { body = JSON.parse(body); } catch(e) {}
        _captured.push({ type:'xhr', url:url, method:self.__captureMethod, status:self.status, body:body, ts:Date.now() });
      }
    });
    return origSend.apply(this, arguments);
  };
  var OrigES = window.EventSource;
  if (OrigES) {
    window.EventSource = function(url, config) {
      var es = new OrigES(url, config);
      if (!_filter || url.indexOf(_filter) !== -1) {
        es.addEventListener('message', function(e) {
          _captured.push({ type:'sse-event', url:url, data:e.data, ts:Date.now() });
        });
      }
      return es;
    };
    window.EventSource.prototype = OrigES.prototype;
    window.EventSource.prototype.constructor = window.EventSource;
    if (OrigES.CONNECTING !== undefined) window.EventSource.CONNECTING = OrigES.CONNECTING;
    if (OrigES.OPEN !== undefined) window.EventSource.OPEN = OrigES.OPEN;
    if (OrigES.CLOSED !== undefined) window.EventSource.CLOSED = OrigES.CLOSED;
  }
  window.__getFlowCapture = function() {
    return JSON.parse(JSON.stringify(_captured));
  };
  window.__clearFlowCapture = function() {
    _captured = [];
  };
  window.__flowCaptureCount = function() {
    return _captured.length;
  };
})();
`;
  }

  private async readCapturedData(): Promise<unknown[]> {
    const result = await executeCommand(
      parseCliArgs([
        'eval',
        'JSON.stringify(window.__getFlowCapture ? window.__getFlowCapture() : [])',
      ]),
      this.browser
    );
    if (isSuccessResponse(result)) {
      const raw = (result.data as { result?: unknown }).result;
      try {
        const captured = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(captured) ? captured : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  private async executeCaptureAPI(step: FlowStep): Promise<void> {
    const apiUrl = step.apiUrl || '';
    const outputVar = step.outputVar || 'apiData';

    await executeCommand(parseCliArgs(['network', 'requests', '--clear']), this.browser);
    await executeCommand(parseCliArgs(['network', 'requests', '--capture-response']), this.browser);

    this.context.variables['_captureApiUrl'] = apiUrl;
    this.context.variables['_captureApiVar'] = outputVar;
  }

  private async executeReadAPI(step: FlowStep): Promise<void> {
    const apiUrl = step.apiUrl || String(this.context.variables['_captureApiUrl'] || '');
    const outputVar =
      step.outputVar || String(this.context.variables['_captureApiVar'] || 'apiData');

    const args = ['network', 'requests'];
    if (apiUrl) args.push('--filter', apiUrl);
    args.push('--type', 'json');

    const result = await executeCommand(parseCliArgs(args), this.browser);
    if (isSuccessResponse(result)) {
      const data = result.data as { requests?: Array<Record<string, unknown>> };
      const requests = data.requests || [];
      const apiData = requests
        .filter((r) => r.responseBody)
        .map((r) => ({
          url: r.url,
          method: r.method,
          status: r.status,
          body: r.responseBody,
        }));
      this.context.results[outputVar] = apiData;
    }
  }

  private async executeInterceptRoute(step: FlowStep): Promise<void> {
    const url = step.url || '**';

    if (step.abortRequests) {
      await this.browser.addRoute(url, { abort: true });
    } else if (step.mockResponse) {
      const mockBody = this.substituteVars(step.mockResponse);
      const mockStatus = step.mockStatus || 200;
      await this.browser.addRoute(url, {
        response: {
          body: mockBody,
          contentType: 'application/json',
          status: mockStatus,
        },
      });
    }
  }

  private async executeRemoveRoute(step: FlowStep): Promise<void> {
    if (step.url) {
      await this.browser.removeRoute(step.url);
    } else {
      await this.browser.removeRoute('');
    }
  }

  private async executeSmartExtract(
    step: FlowStep,
    errors: Array<{ step: string; error: string }>
  ): Promise<void> {
    const config = step.smartExtractConfig || {};
    const outputVar = step.outputVar || 'extracted';
    const minResults = config.minResults || 1;
    const container = config.container || 'body';
    const fields = step.fields || {};

    let layer1Data: unknown[] = [];
    try {
      const apiUrl = config.apiUrl || config.apiFilter || '';
      if (apiUrl) {
        const args = ['network', 'requests', '--type', 'json'];
        if (apiUrl) args.push('--filter', apiUrl);
        const result = await executeCommand(parseCliArgs(args), this.browser);
        if (isSuccessResponse(result)) {
          const requests =
            (result.data as { requests?: Array<Record<string, unknown>> }).requests || [];
          layer1Data = requests
            .filter((r) => r.responseBody)
            .map((r) => {
              const body = r.responseBody;
              if (typeof body === 'string') {
                try {
                  return JSON.parse(body);
                } catch {
                  return { raw: body };
                }
              }
              return body;
            });
        }
      }
    } catch {
      /* Layer 1 failed, try next */
    }

    if (layer1Data.length >= minResults) {
      console.log(`[smartExtract] Layer 1 (API) succeeded: ${layer1Data.length} items`);
      this.context.results[outputVar] = layer1Data;
      return;
    }

    let layer2Data: unknown[] = [];
    try {
      const captured = await this.readCapturedData();
      if (config.scriptFilter) {
        layer2Data = captured.filter(
          (item) =>
            typeof item === 'object' &&
            item !== null &&
            'url' in item &&
            String((item as Record<string, unknown>).url).includes(config.scriptFilter!)
        );
      } else {
        layer2Data = captured;
      }
      layer2Data = layer2Data
        .filter(
          (item) =>
            typeof item === 'object' && item !== null && 'body' in (item as Record<string, unknown>)
        )
        .map((item) => {
          const body = (item as Record<string, unknown>).body;
          return typeof body === 'string' ? JSON.parse(body) : body;
        })
        .filter(Boolean);
    } catch {
      /* Layer 2 failed, try next */
    }

    if (layer2Data.length >= minResults) {
      console.log(`[smartExtract] Layer 2 (Script) succeeded: ${layer2Data.length} items`);
      this.context.results[outputVar] = layer2Data;
      return;
    }

    console.log(`[smartExtract] Falling back to Layer 3 (DOM)`);
    await this.executeExtract({
      id: step.id,
      action: 'extract',
      container,
      fields,
      outputVar,
    });

    const domData = this.context.results[outputVar];
    if (Array.isArray(domData) && domData.length >= minResults) {
      console.log(`[smartExtract] Layer 3 (DOM) succeeded: ${domData.length} items`);
    } else {
      console.log(`[smartExtract] All layers produced insufficient results`);
      errors.push({
        step: step.id,
        error: `Smart extract failed: API=${layer1Data.length}, Script=${layer2Data.length}, DOM=${
          Array.isArray(domData) ? domData.length : 0
        } items`,
      });
    }
  }

  private async resolveSelector(step: FlowStep): Promise<string> {
    const primarySelector = step.selector || '';

    if (!step.fallbackSelectors?.length && !step.elementIdentity) {
      return primarySelector;
    }

    const healingConfig = this.flowHealing;
    if (healingConfig.enabled === false) {
      return primarySelector;
    }

    const strategies = healingConfig.strategies ?? [
      'fallback',
      'identity_text',
      'identity_attr',
      'identity_parent',
    ];
    const maxAttempts = healingConfig.maxAttempts ?? 3;
    const attemptDelayMs = healingConfig.attemptDelayMs ?? 300;

    const frame: Page | Frame = step.inFrame
      ? this.browser.getFrame(step.inFrame)
      : this.browser.getPage();

    try {
      const primary = frame.locator(primarySelector);
      if ((await primary.count()) > 0) {
        return primarySelector;
      }
    } catch (_e) {
      // Intentionally ignored: primary selector check failed, proceeding to healing
    }

    let attemptCount = 0;

    for (const strategy of strategies) {
      if (attemptCount >= maxAttempts) break;

      if (strategy === 'fallback' && step.fallbackSelectors && step.fallbackSelectors.length > 0) {
        for (const fallback of step.fallbackSelectors) {
          attemptCount++;
          if (attemptCount > maxAttempts) break;
          await new Promise((r) => setTimeout(r, attemptDelayMs));
          try {
            const loc = frame.locator(fallback);
            if ((await loc.count()) > 0) {
              this.healingLog.push({
                stepId: step.id || '',
                originalSelector: primarySelector,
                healedSelector: fallback,
                strategy: 'fallback',
              });
              return fallback;
            }
          } catch (_e) {
            // Intentionally ignored: fallback selector check failed, trying next
          }
        }
      } else if (
        strategy === 'identity_text' ||
        strategy === 'identity_attr' ||
        strategy === 'identity_parent'
      ) {
        const identityResult = await this.healByIdentity(step, frame, strategy);
        if (identityResult) {
          attemptCount++;
          return identityResult;
        }
      }
    }

    throw new Error(`Element not found: "${primarySelector}" (all healing strategies exhausted)`);
  }

  private async healByIdentity(
    step: FlowStep,
    frame: Page | Frame,
    onlyStrategy?: string
  ): Promise<string | null> {
    const identity = step.elementIdentity;
    if (!identity) return null;

    if (
      (!onlyStrategy || onlyStrategy === 'identity_text') &&
      identity.textContent &&
      identity.textContent.length > 0
    ) {
      const text = identity.textContent.slice(0, 30);
      try {
        const selector = `${identity.tagName}:text-is("${text}")`;
        const loc = frame.locator(selector);
        if ((await loc.count()) === 1) {
          this.healingLog.push({
            stepId: step.id || '',
            originalSelector: step.selector || '',
            healedSelector: selector,
            strategy: 'identity_text',
          });
          return selector;
        }
      } catch (_e) {
        // Intentionally ignored: identity_text healing strategy failed
      }
    }

    if ((!onlyStrategy || onlyStrategy === 'identity_attr') && identity.attributes) {
      for (const [attr, value] of Object.entries(identity.attributes)) {
        if (!value) continue;
        try {
          const selector = `${identity.tagName}[${attr}="${value}"]`;
          const loc = frame.locator(selector);
          if ((await loc.count()) === 1) {
            this.healingLog.push({
              stepId: step.id || '',
              originalSelector: step.selector || '',
              healedSelector: selector,
              strategy: 'identity_attr',
            });
            return selector;
          }
        } catch (_e) {
          // Intentionally ignored: identity_attr healing strategy failed for this attribute
        }
      }
    }

    if ((!onlyStrategy || onlyStrategy === 'identity_parent') && identity.parentSignature) {
      try {
        const parent = frame.locator(identity.parentSignature);
        if ((await parent.count()) > 0) {
          const child = parent.locator(identity.tagName).first();
          if ((await child.count()) > 0) {
            const selector = `${identity.parentSignature} > ${identity.tagName}`;
            this.healingLog.push({
              stepId: step.id || '',
              originalSelector: step.selector || '',
              healedSelector: selector,
              strategy: 'identity_parent',
            });
            return selector;
          }
        }
      } catch (_e) {
        // Intentionally ignored: identity_parent healing strategy failed
      }
    }

    return null;
  }

  private async verifyCheckpoint(
    checkpoint: StateCheckpoint,
    frame: Page | Frame
  ): Promise<{ passed: boolean; failures: string[] }> {
    const failures: string[] = [];

    if (checkpoint.urlPattern) {
      const url = frame.url();
      const pattern = checkpoint.urlPattern;
      if (!url.startsWith(pattern) && !url.includes(pattern)) {
        failures.push(`URL mismatch: expected pattern "${pattern}", got "${url}"`);
      }
    }

    if (checkpoint.elementChecks) {
      for (const check of checkpoint.elementChecks) {
        try {
          const loc = frame.locator(check.selector);
          const count = await loc.count();
          if (check.exists && count === 0) {
            failures.push(`Element missing: "${check.selector}" should exist`);
          } else if (!check.exists && count > 0) {
            failures.push(`Element unexpected: "${check.selector}" should not exist`);
          }
          if (check.visible && count > 0) {
            const isVisible = await loc.first().isVisible();
            if (!isVisible) {
              failures.push(`Element not visible: "${check.selector}"`);
            }
          }
          if (check.textContent && count > 0) {
            const actual = (await loc.first().textContent()) || '';
            if (!actual.includes(check.textContent)) {
              failures.push(
                `Element text mismatch: "${check.selector}" expected to contain "${
                  check.textContent
                }", got "${actual.substring(0, 100)}"`
              );
            }
          }
        } catch (e) {
          failures.push(`Element check error: "${check.selector}" - ${(e as Error).message}`);
        }
      }
    }

    return { passed: failures.length === 0, failures };
  }

  private async waitForDOMStable(frame: Page | Frame, timeout: number = 3000): Promise<void> {
    await frame
      .waitForFunction(
        () =>
          new Promise<boolean>((resolve) => {
            let timer: ReturnType<typeof setTimeout>;
            const observer = new MutationObserver(() => {
              clearTimeout(timer);
              timer = setTimeout(() => {
                observer.disconnect();
                resolve(true);
              }, 200);
            });
            observer.observe(document.body, { childList: true, subtree: true });
            timer = setTimeout(() => {
              observer.disconnect();
              resolve(true);
            }, 200);
          }),
        { timeout }
      )
      .catch((_e) => {
        // Intentionally ignored: DOM stable wait timed out, continuing
      });
  }

  getHealingLog(): HealingLogEntry[] {
    return this.healingLog;
  }

  getBrowser(): BrowserManager {
    return this.browser;
  }

  getContext(): FlowContext {
    return this.context;
  }
}
