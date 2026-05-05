import type { FlowStep, ExtractField } from '../types.js';
import type { ScriptExporter, ExportOptions } from './types.js';

export class PythonExporter implements ScriptExporter {
  format = 'python';
  extension = 'py';

  export(steps: FlowStep[], options?: ExportOptions): string {
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
      const stepNum = i + 1;
      const comment = `    # Step ${stepNum}: ${step.id} (${step.action})`;

      lines.push(comment);

      switch (step.action) {
        case 'navigate':
          this.emitNavigate(lines, step, options);
          break;
        case 'click':
          this.emitClick(lines, step);
          break;
        case 'fill':
          this.emitFill(lines, step);
          break;
        case 'press':
          this.emitPress(lines, step);
          break;
        case 'scroll':
          this.emitScroll(lines, step);
          break;
        case 'wait':
          this.emitWait(lines, step);
          break;
        case 'extract':
          this.emitExtract(lines, step);
          break;
        case 'eval':
          this.emitEval(lines, step);
          break;
        case 'screenshot':
          this.emitScreenshot(lines, step);
          break;
        case 'snapshot':
          lines.push('    # snapshot step - informational only');
          break;
        default:
          lines.push(`    # TODO: unsupported action "${step.action}"`);
      }

      lines.push('');
    }

    lines.push('    browser.close()');

    return lines.join('\n');
  }

  private emitNavigate(lines: string[], step: FlowStep, options?: ExportOptions): void {
    const url = step.url || '';
    const resolvedUrl = this.resolveUrl(url, options?.baseUrl);
    lines.push(`    page.goto('${resolvedUrl}')`);
    lines.push(`    page.wait_for_load_state('domcontentloaded')`);
    if (step.waitAfter) {
      lines.push(`    page.wait_for_load_state('${step.waitAfter}')`);
    }
  }

  private emitClick(lines: string[], step: FlowStep): void {
    const selector = step.selector || '';
    this.emitFallbackComment(lines, step);
    lines.push(`    page.locator('${selector}').click()`);
    if (step.waitForNavigation) {
      lines.push(`    page.wait_for_load_state('${step.waitForNavigation}')`);
    } else if (step.waitAfter) {
      lines.push(`    page.wait_for_load_state('${step.waitAfter}')`);
    }
  }

  private emitFill(lines: string[], step: FlowStep): void {
    const selector = step.selector || '';
    const value = step.value || '';
    this.emitFallbackComment(lines, step);
    lines.push(`    page.locator('${selector}').fill('${value}')`);
  }

  private emitPress(lines: string[], step: FlowStep): void {
    const key = step.value || 'Enter';
    lines.push(`    page.keyboard.press('${key}')`);
  }

  private emitScroll(lines: string[], step: FlowStep): void {
    const direction = step.scrollDirection || step.value || 'down';
    const amount = step.scrollAmount || 300;
    const sign = direction === 'up' ? '-' : '';
    lines.push(`    page.evaluate('window.scrollBy(0, ${sign}${amount})')`);
  }

  private emitWait(lines: string[], step: FlowStep): void {
    if (step.selector) {
      lines.push(
        `    page.locator('${step.selector}').wait_for(state='visible'${
          step.timeout ? `, timeout=${step.timeout}` : ''
        })`
      );
    } else if (step.timeout) {
      lines.push(`    page.wait_for_timeout(${step.timeout})`);
    } else if (step.waitCondition === 'url_change') {
      const pattern = step.waitUrlPattern || '';
      lines.push(`    page.wait_for_url('**${pattern}**')`);
    } else if (step.waitCondition === 'dom_stable') {
      const ms = step.waitDomStableTimeout || 500;
      lines.push(`    page.wait_for_timeout(${ms})`);
    }
  }

  private emitExtract(lines: string[], step: FlowStep): void {
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

    lines.push(`    ${varName} = []`);
    lines.push(`    for el in page.query_selector_all('${container}'):`);
    lines.push(`        ${varName}.append({ ${entries.join(', ')} })`);
  }

  private emitEval(lines: string[], step: FlowStep): void {
    const script = step.value || '';
    const varName = step.outputVar;
    if (varName) {
      lines.push(`    ${varName} = page.evaluate('${this.escapePy(script)}')`);
    } else {
      lines.push(`    page.evaluate('${this.escapePy(script)}')`);
    }
  }

  private emitScreenshot(lines: string[], step: FlowStep): void {
    if (step.selector) {
      lines.push(`    page.locator('${step.selector}').screenshot()`);
    } else {
      lines.push(`    page.screenshot(full_page=True)`);
    }
  }

  private emitFallbackComment(lines: string[], step: FlowStep): void {
    if (step.fallbackSelectors && step.fallbackSelectors.length > 0) {
      lines.push(`    # Fallback selectors: ${step.fallbackSelectors.join(', ')}`);
    }
  }

  private escapePy(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  }

  private resolveUrl(url: string, baseUrl?: string): string {
    if (!url || url === 'back') return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (baseUrl) return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
    return url;
  }
}
