import type { FlowStep, ExtractField } from '../types.js';
import type { ScriptExporter, ExportOptions } from './types.js';

export class PlaywrightExporter implements ScriptExporter {
  format = 'playwright';
  extension = 'ts';

  export(steps: FlowStep[], options?: ExportOptions): string {
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
      const stepNum = i + 1;
      const comment = `// Step ${stepNum}: ${step.id} (${step.action})`;

      lines.push(`  ${comment}`);

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
          lines.push(`  // snapshot step - informational only`);
          break;
        default:
          lines.push(`  // TODO: unsupported action "${step.action}"`);
      }

      lines.push('');
    }

    lines.push('  await browser.close();');
    lines.push('})();');

    return lines.join('\n');
  }

  private emitNavigate(lines: string[], step: FlowStep, options?: ExportOptions): void {
    const url = step.url || '';
    const resolvedUrl = this.resolveUrl(url, options?.baseUrl);
    lines.push(`  await page.goto('${resolvedUrl}');`);
    lines.push(`  await page.waitForLoadState('domcontentloaded');`);
    if (step.waitAfter) {
      lines.push(`  await page.waitForLoadState('${step.waitAfter}');`);
    }
  }

  private emitClick(lines: string[], step: FlowStep): void {
    const selector = step.selector || '';
    this.emitFallbackComment(lines, step);
    lines.push(`  await page.locator('${selector}').click();`);
    if (step.waitForNavigation) {
      lines.push(`  await page.waitForLoadState('${step.waitForNavigation}');`);
    } else if (step.waitAfter) {
      lines.push(`  await page.waitForLoadState('${step.waitAfter}');`);
    }
  }

  private emitFill(lines: string[], step: FlowStep): void {
    const selector = step.selector || '';
    const value = this.templateValue(step.value || '');
    this.emitFallbackComment(lines, step);
    lines.push(`  await page.locator('${selector}').fill(${value});`);
  }

  private emitPress(lines: string[], step: FlowStep): void {
    const key = step.value || 'Enter';
    lines.push(`  await page.keyboard.press('${key}');`);
  }

  private emitScroll(lines: string[], step: FlowStep): void {
    const direction = step.scrollDirection || step.value || 'down';
    const amount = step.scrollAmount || 300;
    const sign = direction === 'up' ? '-' : '';
    lines.push(`  await page.evaluate(() => window.scrollBy(0, ${sign}${amount}));`);
  }

  private emitWait(lines: string[], step: FlowStep): void {
    if (step.selector) {
      lines.push(
        `  await page.locator('${step.selector}').waitFor({ state: 'visible'${
          step.timeout ? `, timeout: ${step.timeout}` : ''
        } });`
      );
    } else if (step.timeout) {
      lines.push(`  await page.waitForTimeout(${step.timeout});`);
    } else if (step.waitCondition === 'url_change') {
      const pattern = step.waitUrlPattern || '';
      lines.push(`  await page.waitForURL('**${pattern}**');`);
    } else if (step.waitCondition === 'dom_stable') {
      const ms = step.waitDomStableTimeout || 500;
      lines.push(`  await page.waitForTimeout(${ms});`);
    }
  }

  private emitExtract(lines: string[], step: FlowStep): void {
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

    lines.push(`  const ${varName} = await page.$$eval('${container}', (els) =>`);
    lines.push(`    els.map((el) => ({ ${entries.join(', ')} }))`);
    lines.push(`  );`);
  }

  private emitEval(lines: string[], step: FlowStep): void {
    const script = step.value || '';
    const varName = step.outputVar;
    if (varName) {
      lines.push(`  const ${varName} = await page.evaluate(() => {`);
      lines.push(`    return ${script};`);
      lines.push(`  });`);
    } else {
      lines.push(`  await page.evaluate(() => {`);
      lines.push(`    ${script};`);
      lines.push(`  });`);
    }
  }

  private emitScreenshot(lines: string[], step: FlowStep): void {
    if (step.selector) {
      lines.push(`  await page.locator('${step.selector}').screenshot();`);
    } else {
      lines.push(`  await page.screenshot({ fullPage: true });`);
    }
  }

  private emitFallbackComment(lines: string[], step: FlowStep): void {
    if (step.fallbackSelectors && step.fallbackSelectors.length > 0) {
      lines.push(`  // Fallback selectors: ${step.fallbackSelectors.join(', ')}`);
    }
  }

  private templateValue(value: string): string {
    const hasTemplate = /\$\{(\w+)\}/.test(value);
    if (hasTemplate) {
      return `'${value}'`;
    }
    return `'${value}'`;
  }

  private resolveUrl(url: string, baseUrl?: string): string {
    if (!url || url === 'back') return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (baseUrl) return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
    return url;
  }
}
