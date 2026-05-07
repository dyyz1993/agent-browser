import type { FlowStep, ExtractField } from '../types.js';
import type { ScriptExporter, ExportOptions } from './types.js';

export class PythonExporter implements ScriptExporter {
  format = 'python';
  extension = 'py';
  private options?: ExportOptions;

  export(steps: FlowStep[], options?: ExportOptions): string {
    this.options = options;
    const lines: string[] = [];
    const headless = options?.headless !== false;

    lines.push('from playwright.sync_api import sync_playwright');
    lines.push('');
    lines.push('with sync_playwright() as p:');
    lines.push(`    browser = p.chromium.launch(headless=${headless})`);
    lines.push('    page = browser.new_page()');
    lines.push('');

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      lines.push(`    # Step ${i + 1}: ${step.id} (${step.action})`);
      this.emitStep(lines, step, '    ');
      lines.push('');
    }

    lines.push('    browser.close()');

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
        lines.push(`${indent}# snapshot step - informational only`);
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
    lines.push(`${indent}page.goto('${resolvedUrl}')`);
    lines.push(`${indent}page.wait_for_load_state('domcontentloaded')`);
    if (step.waitAfter) {
      lines.push(`${indent}page.wait_for_load_state('${step.waitAfter}')`);
    }
  }

  private emitClick(lines: string[], step: FlowStep, indent: string): void {
    const selector = step.selector || '';
    this.emitFallbackComment(lines, step, indent);
    lines.push(`${indent}page.locator('${selector}').click()`);
    if (step.waitForNavigation) {
      lines.push(`${indent}page.wait_for_load_state('${step.waitForNavigation}')`);
    } else if (step.waitAfter) {
      lines.push(`${indent}page.wait_for_load_state('${step.waitAfter}')`);
    }
  }

  private emitFill(lines: string[], step: FlowStep, indent: string): void {
    const selector = step.selector || '';
    const value = step.value || '';
    this.emitFallbackComment(lines, step, indent);
    lines.push(`${indent}page.locator('${selector}').fill('${value}')`);
  }

  private emitPress(lines: string[], step: FlowStep, indent: string): void {
    const key = step.value || 'Enter';
    lines.push(`${indent}page.keyboard.press('${key}')`);
  }

  private emitScroll(lines: string[], step: FlowStep, indent: string): void {
    const direction = step.scrollDirection || step.value || 'down';
    const amount = step.scrollAmount || 300;
    const sign = direction === 'up' ? '-' : '';
    lines.push(`${indent}page.evaluate('window.scrollBy(0, ${sign}${amount})')`);
  }

  private emitWait(lines: string[], step: FlowStep, indent: string): void {
    if (step.selector) {
      lines.push(
        `${indent}page.locator('${step.selector}').wait_for(state='visible'${
          step.timeout ? `, timeout=${step.timeout}` : ''
        })`
      );
    } else if (step.timeout) {
      lines.push(`${indent}page.wait_for_timeout(${step.timeout})`);
    } else if (step.waitCondition === 'url_change') {
      const pattern = step.waitUrlPattern || '';
      lines.push(`${indent}page.wait_for_url('**${pattern}**')`);
    } else if (step.waitCondition === 'dom_stable') {
      const ms = step.waitDomStableTimeout || 500;
      lines.push(`${indent}page.wait_for_timeout(${ms})`);
    }
  }

  private emitExtract(lines: string[], step: FlowStep, indent: string): void {
    const container = step.container || 'body';
    const fields = step.fields || {};
    const varName = step.outputVar || 'extracted';

    const entries = Object.entries(fields).map(([name, def]) => {
      if (typeof def === 'string') {
        return `'${name}': el.query_selector('${def}') and el.query_selector('${def}').text_content().strip() or ''`;
      }
      const ef = def as ExtractField;
      if (ef.attribute) {
        return `'${name}': el.query_selector('${ef.selector}') and el.query_selector('${ef.selector}').get_attribute('${ef.attribute}') or ''`;
      }
      return `'${name}': el.query_selector('${ef.selector}') and el.query_selector('${ef.selector}').text_content().strip() or ''`;
    });

    lines.push(`${indent}${varName} = []`);
    lines.push(`${indent}for el in page.query_selector_all('${container}'):`);
    lines.push(`${indent}    ${varName}.append({ ${entries.join(', ')} })`);
  }

  private emitEval(lines: string[], step: FlowStep, indent: string): void {
    const script = step.value || '';
    const varName = step.outputVar;
    if (varName) {
      lines.push(`${indent}${varName} = page.evaluate('${this.escapePy(script)}')`);
    } else {
      lines.push(`${indent}page.evaluate('${this.escapePy(script)}')`);
    }
  }

  private emitScreenshot(lines: string[], step: FlowStep, indent: string): void {
    if (step.selector) {
      lines.push(`${indent}page.locator('${step.selector}').screenshot()`);
    } else {
      lines.push(`${indent}page.screenshot(full_page=True)`);
    }
  }

  private emitPaginate(lines: string[], step: FlowStep, indent: string): void {
    const nextSel = step.nextSelector || '';
    const maxPages = step.maxPages || 1;
    const onEachPage = step.onEachPage || [];
    lines.push(`${indent}for _page in range(${maxPages}):`);
    if (onEachPage.length === 0 && !nextSel) {
      lines.push(`${indent}    pass`);
    }
    for (const sub of onEachPage) {
      this.emitStep(lines, sub, indent + '    ');
    }
    if (nextSel) {
      lines.push(`${indent}    _next = page.locator('${nextSel}')`);
      lines.push(`${indent}    if not _next.is_visible():`);
      lines.push(`${indent}        break`);
      lines.push(`${indent}    _next.click()`);
      lines.push(`${indent}    page.wait_for_load_state('domcontentloaded')`);
    }
  }

  private emitClickPaginate(lines: string[], step: FlowStep, indent: string): void {
    const nextSel = step.nextSelector || '';
    if (nextSel) {
      lines.push(`${indent}_next = page.locator('${nextSel}')`);
      lines.push(`${indent}_next.wait_for(state='visible')`);
      lines.push(`${indent}if _next.is_enabled():`);
      lines.push(`${indent}    _next.click()`);
    }
  }

  private emitForEach(lines: string[], step: FlowStep, indent: string): void {
    const sourceVar = step.sourceVar || '[]';
    const subSteps = step.subSteps || [];
    lines.push(`${indent}for _item in ${sourceVar}:`);
    if (subSteps.length === 0) {
      lines.push(`${indent}    pass`);
    }
    for (const sub of subSteps) {
      this.emitStep(lines, sub, indent + '    ');
    }
  }

  private emitForEachItem(lines: string[], step: FlowStep, indent: string): void {
    const itemSel = step.itemSelector || step.container || '';
    const subSteps = step.itemSteps || step.subSteps || [];
    if (itemSel) {
      lines.push(`${indent}_items = page.query_selector_all('${itemSel}')`);
      lines.push(`${indent}for _item in _items:`);
      if (subSteps.length === 0) {
        lines.push(`${indent}    pass`);
      }
      for (const sub of subSteps) {
        this.emitStep(lines, sub, indent + '    ');
      }
    }
  }

  private emitRepeatWhile(lines: string[], step: FlowStep, indent: string): void {
    const cond = step.conditionJs || step.condition || 'True';
    const loopSteps = step.loopSteps || step.subSteps || [];
    lines.push(`${indent}while page.evaluate('${this.escapePy(cond)}'):`);
    if (loopSteps.length === 0) {
      lines.push(`${indent}    break`);
    }
    for (const sub of loopSteps) {
      this.emitStep(lines, sub, indent + '    ');
    }
  }

  private emitCollectAll(lines: string[], step: FlowStep, indent: string): void {
    const collectSteps = step.collectSteps || step.subSteps || [];
    const maxIter = step.termination?.maxIterations || 10;
    lines.push(`${indent}_collected = []`);
    lines.push(`${indent}_seen = set()`);
    lines.push(`${indent}for _i in range(${maxIter}):`);
    if (collectSteps.length === 0) {
      lines.push(`${indent}    pass`);
    }
    for (const sub of collectSteps) {
      this.emitStep(lines, sub, indent + '    ');
    }
  }

  private emitSmartExtract(lines: string[], step: FlowStep, indent: string): void {
    const config = step.smartExtractConfig;
    const preferLayer = config?.preferLayer || 'dom';
    lines.push(`${indent}# smartExtract - 3-layer extraction (${preferLayer})`);
    if (config?.container) {
      lines.push(`${indent}# container: ${config.container}`);
    }
  }

  private emitCondition(lines: string[], step: FlowStep, indent: string): void {
    const cond = step.conditionJs || step.condition || '';
    const thenSteps = step.thenSteps || [];
    const elseSteps = step.elseSteps || [];
    if (cond) {
      lines.push(`${indent}if page.evaluate('${this.escapePy(cond)}'):`);
      if (thenSteps.length === 0) {
        lines.push(`${indent}    pass`);
      }
      for (const sub of thenSteps) {
        this.emitStep(lines, sub, indent + '    ');
      }
      if (elseSteps.length > 0) {
        lines.push(`${indent}else:`);
        for (const sub of elseSteps) {
          this.emitStep(lines, sub, indent + '    ');
        }
      }
    }
  }

  private emitScrollUntil(lines: string[], step: FlowStep, indent: string): void {
    const direction = step.scrollDirection || 'down';
    const amount = step.scrollAmount || 300;
    const sign = direction === 'up' ? '-' : '';
    const maxIter = step.termination?.maxIterations || 10;
    const endCondition =
      step.termination?.jsExpression || step.termination?.elementDisappears || '';
    lines.push(`${indent}for _i in range(${maxIter}):`);
    lines.push(`${indent}    page.evaluate('window.scrollBy(0, ${sign}${amount})')`);
    if (endCondition) {
      lines.push(`${indent}    if page.evaluate('${this.escapePy(endCondition)}'):`);
      lines.push(`${indent}        break`);
    }
    if (step.extractOnEachScroll) {
      this.emitStep(lines, step.extractOnEachScroll, indent + '    ');
    }
    lines.push(`${indent}    page.wait_for_timeout(500)`);
  }

  private emitDetectBlocking(lines: string[], step: FlowStep, indent: string): void {
    const conditions = step.blockingConditions || [];
    lines.push(`${indent}# detectBlocking - check for blocking overlays/dialogs`);
    for (const bc of conditions) {
      if (bc.selector) {
        lines.push(`${indent}_blocked = page.locator('${bc.selector}').is_visible()`);
      }
      if (bc.jsExpression) {
        lines.push(`${indent}_blocked = page.evaluate('${this.escapePy(bc.jsExpression)}')`);
      }
    }
  }

  private emitHumanIntervention(lines: string[], step: FlowStep, indent: string): void {
    const msg = step.intervention?.message || 'requires human intervention';
    lines.push(`${indent}# ${step.action}: ${msg}`);
  }

  private emitAutoRecover(lines: string[], step: FlowStep, indent: string): void {
    lines.push(`${indent}# autoRecover - auto-detect and request human help`);
  }

  private emitCaptureScript(lines: string[], step: FlowStep, indent: string): void {
    const file = step.file || '';
    lines.push(`${indent}# captureScript: ${file}`);
  }

  private emitReadCapture(lines: string[], step: FlowStep, indent: string): void {
    const file = step.file || '';
    lines.push(`${indent}# readCapture: ${file}`);
  }

  private emitCaptureAPI(lines: string[], step: FlowStep, indent: string): void {
    const apiUrl = step.apiUrl || '';
    const suffix = step.outputVar ? `_${step.outputVar}` : '';
    lines.push(`${indent}_api_responses${suffix} = []`);
    lines.push(`${indent}def _handle_api_response${suffix}(response):`);
    lines.push(`${indent}    if '${apiUrl}' in response.url:`);
    lines.push(`${indent}        _api_responses${suffix}.append(response.json())`);
    lines.push(`${indent}page.on('response', _handle_api_response${suffix})`);
  }

  private emitReadAPI(lines: string[], step: FlowStep, indent: string): void {
    const varName = step.outputVar || 'apiData';
    const suffix = step.outputVar ? `_${step.outputVar}` : '';
    lines.push(`${indent}${varName} = _api_responses${suffix}`);
  }

  private emitInterceptRoute(lines: string[], step: FlowStep, indent: string): void {
    const apiUrl = step.apiUrl || '';
    if (step.abortRequests) {
      lines.push(`${indent}page.route('${apiUrl}', lambda route: route.abort())`);
    } else {
      const mockResponse = step.mockResponse || '';
      const mockStatus = step.mockStatus || 200;
      lines.push(`${indent}def _handle_route(route):`);
      lines.push(`${indent}    route.fulfill(status=${mockStatus}, body='${mockResponse}')`);
      lines.push(`${indent}page.route('${apiUrl}', _handle_route)`);
    }
  }

  private emitRemoveRoute(lines: string[], step: FlowStep, indent: string): void {
    const apiUrl = step.apiUrl || '';
    lines.push(`${indent}page.unroute('${apiUrl}')`);
  }

  private emitFormatOutput(lines: string[], step: FlowStep, indent: string): void {
    const format = step.outputFormat || '';
    lines.push(`${indent}# formatOutput: ${format}`);
  }

  private emitDeduplicate(lines: string[], step: FlowStep, indent: string): void {
    const field = step.dedupField || '';
    lines.push(`${indent}# deduplicate on field: ${field}`);
  }

  private emitFallbackComment(lines: string[], step: FlowStep, indent: string): void {
    if (step.fallbackSelectors && step.fallbackSelectors.length > 0) {
      lines.push(`${indent}# Fallback selectors: ${step.fallbackSelectors.join(', ')}`);
    }
  }

  private escapePy(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  }

  private resolveUrl(url: string): string {
    if (!url || url === 'back') return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const base = this.options?.baseUrl;
    if (base) return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
    return url;
  }
}
