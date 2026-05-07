import type { FlowStep, ExtractField } from '../types.js';
import type { ScriptExporter, ExportOptions } from './types.js';

export class PlaywrightExporter implements ScriptExporter {
  format = 'playwright';
  extension = 'ts';
  private options?: ExportOptions;

  export(steps: FlowStep[], options?: ExportOptions): string {
    this.options = options;
    const lines: string[] = [];
    const headless = options?.headless !== false;

    lines.push(`import { chromium } from 'playwright';`);
    lines.push('');
    lines.push('(async () => {');
    lines.push(`  const browser = await chromium.launch({ headless: ${headless} });`);
    if (options?.timeout) {
      lines.push(`  const defaultTimeout = ${options.timeout};`);
    }
    lines.push('  const page = await browser.newPage();');
    lines.push('');

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      lines.push(`  // Step ${i + 1}: ${step.id} (${step.action})`);
      this.emitStep(lines, step, '  ');
      lines.push('');
    }

    lines.push('  await browser.close();');
    lines.push('})();');

    return lines.join('\n');
  }

  private emitStep(lines: string[], step: FlowStep, indent: string): void {
    switch (step.action) {
      case 'navigate':
        this.emitNavigate(lines, step, indent);
        break;
      case 'click':
        this.emitClick(lines, step, indent);
        break;
      case 'fill':
        this.emitFill(lines, step, indent);
        break;
      case 'press':
        this.emitPress(lines, step, indent);
        break;
      case 'scroll':
        this.emitScroll(lines, step, indent);
        break;
      case 'wait':
        this.emitWait(lines, step, indent);
        break;
      case 'extract':
        this.emitExtract(lines, step, indent);
        break;
      case 'eval':
        this.emitEval(lines, step, indent);
        break;
      case 'screenshot':
        this.emitScreenshot(lines, step, indent);
        break;
      case 'snapshot':
        lines.push(`${indent}// snapshot step - informational only`);
        break;

      case 'paginate':
        this.emitPaginate(lines, step, indent);
        break;
      case 'clickPaginate':
        this.emitClickPaginate(lines, step, indent);
        break;
      case 'forEach':
        this.emitForEach(lines, step, indent);
        break;
      case 'forEachItem':
        this.emitForEachItem(lines, step, indent);
        break;
      case 'repeatWhile':
        this.emitRepeatWhile(lines, step, indent);
        break;

      case 'collectAll':
        this.emitCollectAll(lines, step, indent);
        break;
      case 'smartExtract':
        this.emitSmartExtract(lines, step, indent);
        break;

      case 'condition':
        this.emitCondition(lines, step, indent);
        break;

      case 'scrollUntil':
        this.emitScrollUntil(lines, step, indent);
        break;

      case 'detectBlocking':
        this.emitDetectBlocking(lines, step, indent);
        break;
      case 'humanHelp':
      case 'waitForHuman':
        this.emitHumanIntervention(lines, step, indent);
        break;
      case 'autoRecover':
        this.emitAutoRecover(lines, step, indent);
        break;

      case 'captureScript':
        this.emitCaptureScript(lines, step, indent);
        break;
      case 'readCapture':
        this.emitReadCapture(lines, step, indent);
        break;
      case 'captureAPI':
        this.emitCaptureAPI(lines, step, indent);
        break;
      case 'readAPI':
        this.emitReadAPI(lines, step, indent);
        break;
      case 'interceptRoute':
        this.emitInterceptRoute(lines, step, indent);
        break;
      case 'removeRoute':
        this.emitRemoveRoute(lines, step, indent);
        break;

      case 'formatOutput':
        this.emitFormatOutput(lines, step, indent);
        break;
      case 'deduplicate':
        this.emitDeduplicate(lines, step, indent);
        break;
    }
  }

  private emitNavigate(lines: string[], step: FlowStep, indent: string): void {
    const url = step.url || '';
    const resolvedUrl = this.resolveUrl(url);
    lines.push(`${indent}await page.goto('${resolvedUrl}');`);
    lines.push(`${indent}await page.waitForLoadState('domcontentloaded');`);
    if (step.waitAfter) {
      lines.push(`${indent}await page.waitForLoadState('${step.waitAfter}');`);
    }
  }

  private emitClick(lines: string[], step: FlowStep, indent: string): void {
    const selector = step.selector || '';
    this.emitFallbackComment(lines, step, indent);
    lines.push(`${indent}await page.locator('${selector}').click();`);
    if (step.waitForNavigation) {
      lines.push(`${indent}await page.waitForLoadState('${step.waitForNavigation}');`);
    } else if (step.waitAfter) {
      lines.push(`${indent}await page.waitForLoadState('${step.waitAfter}');`);
    }
  }

  private emitFill(lines: string[], step: FlowStep, indent: string): void {
    const selector = step.selector || '';
    const value = step.value || '';
    this.emitFallbackComment(lines, step, indent);
    lines.push(`${indent}await page.locator('${selector}').fill('${value}');`);
  }

  private emitPress(lines: string[], step: FlowStep, indent: string): void {
    const key = step.value || 'Enter';
    lines.push(`${indent}await page.keyboard.press('${key}');`);
  }

  private emitScroll(lines: string[], step: FlowStep, indent: string): void {
    const direction = step.scrollDirection || step.value || 'down';
    const amount = step.scrollAmount || 300;
    const sign = direction === 'up' ? '-' : '';
    lines.push(`${indent}await page.evaluate(() => window.scrollBy(0, ${sign}${amount}));`);
  }

  private emitWait(lines: string[], step: FlowStep, indent: string): void {
    if (step.selector) {
      lines.push(
        `${indent}await page.locator('${step.selector}').waitFor({ state: 'visible'${
          step.timeout ? `, timeout: ${step.timeout}` : ''
        } });`
      );
    } else if (step.timeout) {
      lines.push(`${indent}await page.waitForTimeout(${step.timeout});`);
    } else if (step.waitCondition === 'url_change') {
      const pattern = step.waitUrlPattern || '';
      lines.push(`${indent}await page.waitForURL('**${pattern}**');`);
    } else if (step.waitCondition === 'dom_stable') {
      const ms = step.waitDomStableTimeout || 500;
      lines.push(`${indent}await page.waitForTimeout(${ms});`);
    }
  }

  private emitExtract(lines: string[], step: FlowStep, indent: string): void {
    const container = step.container || 'body';
    const fields = step.fields || {};
    const varName = step.outputVar || 'extracted';

    const entries = Object.entries(fields).map(([name, def]) => {
      if (typeof def === 'string') {
        return `${name}: el.querySelector('${def}')?.textContent?.trim() || ''`;
      }
      const ef = def as ExtractField;
      if (ef.attribute) {
        return `${name}: el.querySelector('${ef.selector}')?.getAttribute('${ef.attribute}') || ''`;
      }
      return `${name}: el.querySelector('${ef.selector}')?.textContent?.trim() || ''`;
    });

    lines.push(`${indent}const ${varName} = await page.$$eval('${container}', (els) =>`);
    lines.push(`${indent}  els.map((el) => ({ ${entries.join(', ')} }))`);
    lines.push(`${indent});`);
  }

  private emitEval(lines: string[], step: FlowStep, indent: string): void {
    const script = step.value || '';
    const varName = step.outputVar;
    if (varName) {
      lines.push(`${indent}const ${varName} = await page.evaluate(() => {`);
      lines.push(`${indent}  return ${script};`);
      lines.push(`${indent}});`);
    } else {
      lines.push(`${indent}await page.evaluate(() => {`);
      lines.push(`${indent}  ${script};`);
      lines.push(`${indent}});`);
    }
  }

  private emitScreenshot(lines: string[], step: FlowStep, indent: string): void {
    if (step.selector) {
      lines.push(`${indent}await page.locator('${step.selector}').screenshot();`);
    } else {
      lines.push(`${indent}await page.screenshot({ fullPage: true });`);
    }
  }

  private emitPaginate(lines: string[], step: FlowStep, indent: string): void {
    const nextSel = step.nextSelector || '';
    const maxPages = step.maxPages || 1;
    const onEachPage = step.onEachPage || [];
    lines.push(`${indent}for (let _page = 0; _page < ${maxPages}; _page++) {`);
    for (const sub of onEachPage) {
      this.emitStep(lines, sub, indent + '  ');
    }
    if (nextSel) {
      lines.push(`${indent}  const _next = page.locator('${nextSel}');`);
      lines.push(`${indent}  if (!(await _next.isVisible())) break;`);
      lines.push(`${indent}  await _next.click();`);
      lines.push(`${indent}  await page.waitForLoadState('domcontentloaded');`);
    }
    lines.push(`${indent}}`);
  }

  private emitClickPaginate(lines: string[], step: FlowStep, indent: string): void {
    const nextSel = step.nextSelector || '';
    if (nextSel) {
      lines.push(`${indent}const _next = page.locator('${nextSel}');`);
      lines.push(`${indent}await _next.waitFor({ state: 'visible' });`);
      lines.push(`${indent}if (await _next.isEnabled()) {`);
      lines.push(`${indent}  await _next.click();`);
      lines.push(`${indent}}`);
    }
  }

  private emitForEach(lines: string[], step: FlowStep, indent: string): void {
    const sourceVar = step.sourceVar || '[]';
    const subSteps = step.subSteps || [];
    lines.push(`${indent}for (const _item of ${sourceVar}) {`);
    for (const sub of subSteps) {
      this.emitStep(lines, sub, indent + '  ');
    }
    if (subSteps.length === 0) {
      lines.push(`${indent}  // no sub-steps`);
    }
    lines.push(`${indent}}`);
  }

  private emitForEachItem(lines: string[], step: FlowStep, indent: string): void {
    const itemSel = step.itemSelector || step.container || '';
    const subSteps = step.itemSteps || step.subSteps || [];
    if (itemSel) {
      lines.push(`${indent}const _items = await page.$$('${itemSel}');`);
      lines.push(`${indent}for (const _item of _items) {`);
      for (const sub of subSteps) {
        this.emitStep(lines, sub, indent + '  ');
      }
      if (subSteps.length === 0) {
        lines.push(`${indent}  // no sub-steps`);
      }
      lines.push(`${indent}}`);
    }
  }

  private emitRepeatWhile(lines: string[], step: FlowStep, indent: string): void {
    const cond = step.conditionJs || step.condition || 'true';
    const loopSteps = step.loopSteps || step.subSteps || [];
    lines.push(`${indent}while (await page.evaluate('${this.escapeJs(cond)}')) {`);
    for (const sub of loopSteps) {
      this.emitStep(lines, sub, indent + '  ');
    }
    if (loopSteps.length === 0) {
      lines.push(`${indent}  break;`);
    }
    lines.push(`${indent}}`);
  }

  private emitCollectAll(lines: string[], step: FlowStep, indent: string): void {
    const collectSteps = step.collectSteps || step.subSteps || [];
    const maxIter = step.termination?.maxIterations || 10;
    lines.push(`${indent}const _collected: any[] = [];`);
    lines.push(`${indent}const _seen = new Set();`);
    lines.push(`${indent}for (let _i = 0; _i < ${maxIter}; _i++) {`);
    for (const sub of collectSteps) {
      this.emitStep(lines, sub, indent + '  ');
    }
    if (collectSteps.length === 0) {
      lines.push(`${indent}  // no collect steps`);
    }
    lines.push(`${indent}}`);
  }

  private emitSmartExtract(lines: string[], step: FlowStep, indent: string): void {
    const config = step.smartExtractConfig;
    const preferLayer = config?.preferLayer || 'dom';
    lines.push(`${indent}// smartExtract - 3-layer extraction (${preferLayer})`);
    if (config?.container) {
      lines.push(`${indent}// container: ${config.container}`);
    }
  }

  private emitCondition(lines: string[], step: FlowStep, indent: string): void {
    const cond = step.conditionJs || step.condition || '';
    const thenSteps = step.thenSteps || [];
    const elseSteps = step.elseSteps || [];
    if (cond) {
      lines.push(`${indent}if (await page.evaluate('${this.escapeJs(cond)}')) {`);
      for (const sub of thenSteps) {
        this.emitStep(lines, sub, indent + '  ');
      }
      if (elseSteps.length > 0) {
        lines.push(`${indent}} else {`);
        for (const sub of elseSteps) {
          this.emitStep(lines, sub, indent + '  ');
        }
      }
      lines.push(`${indent}}`);
    }
  }

  private emitScrollUntil(lines: string[], step: FlowStep, indent: string): void {
    const direction = step.scrollDirection || 'down';
    const amount = step.scrollAmount || 300;
    const sign = direction === 'up' ? '-' : '';
    const maxIter = step.termination?.maxIterations || 10;
    const endCondition =
      step.termination?.jsExpression || step.termination?.elementDisappears || '';
    lines.push(`${indent}for (let _i = 0; _i < ${maxIter}; _i++) {`);
    lines.push(`${indent}  await page.evaluate(() => window.scrollBy(0, ${sign}${amount}));`);
    if (endCondition) {
      lines.push(`${indent}  if (await page.evaluate('${this.escapeJs(endCondition)}')) break;`);
    }
    if (step.extractOnEachScroll) {
      this.emitStep(lines, step.extractOnEachScroll, indent + '  ');
    }
    lines.push(`${indent}  await page.waitForTimeout(500);`);
    lines.push(`${indent}}`);
  }

  private emitDetectBlocking(lines: string[], step: FlowStep, indent: string): void {
    const conditions = step.blockingConditions || [];
    lines.push(`${indent}// detectBlocking - check for blocking overlays/dialogs`);
    for (const bc of conditions) {
      if (bc.selector) {
        lines.push(
          `${indent}const _blocked_${bc.selector.replace(/[^a-zA-Z0-9]/g, '_')} = await page.locator('${bc.selector}').isVisible();`
        );
      }
      if (bc.jsExpression) {
        lines.push(
          `${indent}const _blocked_expr = await page.evaluate('${this.escapeJs(bc.jsExpression)}');`
        );
      }
    }
  }

  private emitHumanIntervention(lines: string[], step: FlowStep, indent: string): void {
    const msg = step.intervention?.message || 'requires human intervention';
    lines.push(`${indent}// ${step.action}: ${msg}`);
  }

  private emitAutoRecover(lines: string[], step: FlowStep, indent: string): void {
    lines.push(`${indent}// autoRecover - auto-detect and request human help`);
  }

  private emitCaptureScript(lines: string[], step: FlowStep, indent: string): void {
    const file = step.file || '';
    lines.push(`${indent}// captureScript: ${file}`);
  }

  private emitReadCapture(lines: string[], step: FlowStep, indent: string): void {
    const file = step.file || '';
    lines.push(`${indent}// readCapture: ${file}`);
  }

  private emitCaptureAPI(lines: string[], step: FlowStep, indent: string): void {
    const apiUrl = step.apiUrl || '';
    const suffix = step.outputVar ? `_${step.outputVar}` : '';
    lines.push(`${indent}const _apiResponses${suffix}: any[] = [];`);
    lines.push(`${indent}page.on('response', async (resp) => {`);
    lines.push(`${indent}  if (resp.url().includes('${apiUrl}')) {`);
    lines.push(`${indent}    _apiResponses${suffix}.push(await resp.json().catch(() => null));`);
    lines.push(`${indent}  }`);
    lines.push(`${indent}});`);
  }

  private emitReadAPI(lines: string[], step: FlowStep, indent: string): void {
    const varName = step.outputVar || 'apiData';
    const suffix = step.outputVar ? `_${step.outputVar}` : '';
    lines.push(`${indent}const ${varName} = _apiResponses${suffix};`);
  }

  private emitInterceptRoute(lines: string[], step: FlowStep, indent: string): void {
    const apiUrl = step.apiUrl || '';
    if (step.abortRequests) {
      lines.push(`${indent}await page.route('${apiUrl}', (route) => route.abort());`);
    } else {
      const mockResponse = step.mockResponse || '';
      const mockStatus = step.mockStatus || 200;
      lines.push(`${indent}await page.route('${apiUrl}', (route) => {`);
      lines.push(`${indent}  route.fulfill({ status: ${mockStatus}, body: '${mockResponse}' });`);
      lines.push(`${indent}});`);
    }
  }

  private emitRemoveRoute(lines: string[], step: FlowStep, indent: string): void {
    const apiUrl = step.apiUrl || '';
    lines.push(`${indent}await page.unroute('${apiUrl}');`);
  }

  private emitFormatOutput(lines: string[], step: FlowStep, indent: string): void {
    const format = step.outputFormat || '';
    lines.push(`${indent}// formatOutput: ${format}`);
  }

  private emitDeduplicate(lines: string[], step: FlowStep, indent: string): void {
    const field = step.dedupField || '';
    lines.push(`${indent}// deduplicate on field: ${field}`);
  }

  private emitFallbackComment(lines: string[], step: FlowStep, indent: string): void {
    if (step.fallbackSelectors && step.fallbackSelectors.length > 0) {
      lines.push(`${indent}// Fallback selectors: ${step.fallbackSelectors.join(', ')}`);
    }
  }

  private escapeJs(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  private resolveUrl(url: string): string {
    if (!url || url === 'back') return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const base = this.options?.baseUrl;
    if (base) return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
    return url;
  }
}
