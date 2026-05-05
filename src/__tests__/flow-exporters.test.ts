import { describe, it, expect } from 'vitest';
import { PlaywrightExporter } from '../flow/exporters/playwright.js';
import { PythonExporter } from '../flow/exporters/python.js';
import type { FlowStep } from '../flow/types.js';

function makeStep(overrides: Partial<FlowStep> = {}): FlowStep {
  return {
    id: 'step-1',
    action: 'click',
    selector: '#submit-btn',
    ...overrides,
  };
}

describe('PlaywrightExporter', () => {
  const exporter = new PlaywrightExporter();

  it('should have correct format name', () => {
    expect(exporter.format).toBe('playwright');
  });

  it('should export a navigate step', () => {
    const steps = [makeStep({ action: 'navigate', url: 'https://example.com' })];
    const result = exporter.export(steps);
    expect(result).toContain("page.goto('https://example.com')");
    expect(result).toContain('waitForLoadState');
  });

  it('should export a click step', () => {
    const steps = [makeStep({ action: 'click', selector: '#submit-btn' })];
    const result = exporter.export(steps);
    expect(result).toContain("page.locator('#submit-btn').click()");
  });

  it('should export a fill step', () => {
    const steps = [
      makeStep({ action: 'fill', selector: 'input[name="email"]', value: 'test@test.com' }),
    ];
    const result = exporter.export(steps);
    expect(result).toContain("page.locator('input[name=\"email\"]').fill('test@test.com')");
  });

  it('should export a press step', () => {
    const steps = [makeStep({ action: 'press', value: 'Enter' })];
    const result = exporter.export(steps);
    expect(result).toContain("keyboard.press('Enter')");
  });

  it('should include fallback selectors as comments', () => {
    const steps = [
      makeStep({
        action: 'click',
        selector: '#btn',
        fallbackSelectors: ['button.primary', '[data-testid="submit"]'],
      }),
    ];
    const result = exporter.export(steps);
    expect(result).toContain('Fallback');
    expect(result).toContain('button.primary');
    expect(result).toContain('[data-testid="submit"]');
  });

  it('should handle empty steps array', () => {
    const result = exporter.export([]);
    expect(result).toContain('chromium.launch');
    expect(result).toContain('browser.close');
  });

  it('should use headless option', () => {
    const result = exporter.export([makeStep()], { headless: false });
    expect(result).toContain('headless: false');
  });
});

describe('PythonExporter', () => {
  const exporter = new PythonExporter();

  it('should have correct format name', () => {
    expect(exporter.format).toBe('python');
  });

  it('should export a navigate step', () => {
    const steps = [makeStep({ action: 'navigate', url: 'https://example.com' })];
    const result = exporter.export(steps);
    expect(result).toContain("page.goto('https://example.com')");
    expect(result).toContain('wait_for_load_state');
  });

  it('should export a click step', () => {
    const steps = [makeStep({ action: 'click', selector: '#submit-btn' })];
    const result = exporter.export(steps);
    expect(result).toContain("page.locator('#submit-btn').click()");
  });

  it('should export a fill step', () => {
    const steps = [
      makeStep({ action: 'fill', selector: 'input[name="email"]', value: 'test@test.com' }),
    ];
    const result = exporter.export(steps);
    expect(result).toContain("page.locator('input[name=\"email\"]').fill('test@test.com')");
  });

  it('should include fallback selectors as comments', () => {
    const steps = [
      makeStep({
        action: 'click',
        selector: '#btn',
        fallbackSelectors: ['button.primary'],
      }),
    ];
    const result = exporter.export(steps);
    expect(result).toContain('# Fallback');
    expect(result).toContain('button.primary');
  });

  it('should generate valid Python syntax', () => {
    const steps = [
      makeStep({ action: 'navigate', url: 'https://example.com' }),
      makeStep({ action: 'fill', selector: '#input', value: 'hello' }),
      makeStep({ action: 'click', selector: '#btn' }),
    ];
    const result = exporter.export(steps);
    expect(result).toContain('from playwright.sync_api import sync_playwright');
    expect(result).toContain('with sync_playwright()');
    expect(result).toContain('browser.close()');
  });
});
