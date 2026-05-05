import { describe, it, expect } from 'vitest';
import { CypressExporter } from '../flow/exporters/cypress.js';
import { SeleniumExporter } from '../flow/exporters/selenium.js';
import type { FlowStep } from '../flow/types.js';

function makeStep(overrides: Partial<FlowStep> = {}): FlowStep {
  return { id: 'step-1', action: 'click', selector: '#btn', ...overrides };
}

describe('CypressExporter', () => {
  const exporter = new CypressExporter();

  it('should have correct format name', () => {
    expect(exporter.format).toBe('cypress');
  });

  it('should export with describe/it pattern', () => {
    const result = exporter.export([makeStep()]);
    expect(result).toContain("describe('Recorded Flow'");
    expect(result).toContain("it('replays recorded flow'");
  });

  it('should export navigate as cy.visit', () => {
    const steps = [makeStep({ action: 'navigate', url: 'https://example.com' })];
    const result = exporter.export(steps);
    expect(result).toContain("cy.visit('https://example.com')");
  });

  it('should export click as cy.get().click()', () => {
    const steps = [makeStep({ action: 'click', selector: '#submit-btn' })];
    const result = exporter.export(steps);
    expect(result).toContain("cy.get('#submit-btn').click()");
  });

  it('should export fill as cy.get().clear().type()', () => {
    const steps = [
      makeStep({ action: 'fill', selector: 'input[name="email"]', value: 'test@test.com' }),
    ];
    const result = exporter.export(steps);
    expect(result).toContain("cy.get('input[name=\"email\"]').clear().type('test@test.com')");
  });

  it('should export press', () => {
    const steps = [makeStep({ action: 'press', value: 'Enter' })];
    const result = exporter.export(steps);
    expect(result).toContain("cy.get('body').type('Enter')");
  });

  it('should export wait with timeout', () => {
    const steps = [makeStep({ action: 'wait', timeout: 2000 })];
    const result = exporter.export(steps);
    expect(result).toContain('cy.wait(2000)');
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
    expect(result).toContain('// Fallback');
    expect(result).toContain('button.primary');
  });

  it('should use baseUrl in beforeEach', () => {
    const result = exporter.export([makeStep()], { baseUrl: 'https://example.com' });
    expect(result).toContain("cy.visit('https://example.com')");
  });

  it('should skip snapshot', () => {
    const steps = [makeStep({ action: 'snapshot' })];
    const result = exporter.export(steps);
    expect(result).not.toContain('snapshot');
  });

  it('should handle empty steps', () => {
    const result = exporter.export([]);
    expect(result).toContain("describe('Recorded Flow'");
    expect(result).toContain('replays recorded flow');
  });
});

describe('SeleniumExporter', () => {
  const exporter = new SeleniumExporter();

  it('should have correct format name', () => {
    expect(exporter.format).toBe('selenium');
  });

  it('should export navigate as driver.get', () => {
    const steps = [makeStep({ action: 'navigate', url: 'https://example.com' })];
    const result = exporter.export(steps);
    expect(result).toContain("driver.get('https://example.com')");
  });

  it('should export click with explicit wait', () => {
    const steps = [makeStep({ action: 'click', selector: '#submit-btn' })];
    const result = exporter.export(steps);
    expect(result).toContain('element_to_be_clickable');
    expect(result).toContain('element.click()');
  });

  it('should export fill with clear and send_keys', () => {
    const steps = [makeStep({ action: 'fill', selector: '#email', value: 'test@test.com' })];
    const result = exporter.export(steps);
    expect(result).toContain('element.clear()');
    expect(result).toContain("element.send_keys('test@test.com')");
  });

  it('should export press with Keys mapping', () => {
    const steps = [makeStep({ action: 'press', value: 'Enter' })];
    const result = exporter.export(steps);
    expect(result).toContain('Keys.ENTER');
  });

  it('should export wait as time.sleep', () => {
    const steps = [makeStep({ action: 'wait', timeout: 2000 })];
    const result = exporter.export(steps);
    expect(result).toContain('time.sleep(2)');
  });

  it('should include headless option by default', () => {
    const result = exporter.export([makeStep()]);
    expect(result).toContain('--headless');
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
  });

  it('should have driver.quit in finally block', () => {
    const result = exporter.export([makeStep()]);
    expect(result).toContain('driver.quit()');
    expect(result).toContain('finally:');
  });
});
