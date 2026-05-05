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

describe('CypressExporter - expanded actions', () => {
  const exporter = new CypressExporter();

  it('should export extract with fields', () => {
    const steps = [
      makeStep({
        action: 'extract',
        container: '.item',
        fields: { title: 'h2', price: '.price' },
        outputVar: 'items',
      }),
    ];
    const result = exporter.export(steps);
    expect(result).toContain("cy.get('.item').each");
    expect(result).toContain('items');
  });

  it('should export eval as cy.window().then with eval', () => {
    const steps = [makeStep({ action: 'eval', value: 'console.log("hi")' })];
    const result = exporter.export(steps);
    expect(result).toContain('cy.window().then');
    expect(result).toContain('win.eval');
  });

  it('should export screenshot as cy.screenshot()', () => {
    const steps = [makeStep({ action: 'screenshot', selector: undefined })];
    const result = exporter.export(steps);
    expect(result).toContain('cy.screenshot()');
  });

  it('should export screenshot with selector', () => {
    const steps = [makeStep({ action: 'screenshot', selector: '#chart' })];
    const result = exporter.export(steps);
    expect(result).toContain("cy.get('#chart').screenshot()");
  });

  it('should export scrollUntil', () => {
    const steps = [
      makeStep({
        action: 'scrollUntil',
        scrollDirection: 'down',
        scrollAmount: 500,
        selector: undefined,
      }),
    ];
    const result = exporter.export(steps);
    expect(result).toContain('cy.scrollTo(0, 500)');
  });

  it('should export paginate with nextSelector', () => {
    const steps = [makeStep({ action: 'paginate', nextSelector: '.next-page' })];
    const result = exporter.export(steps);
    expect(result).toContain("cy.get('.next-page').click()");
  });

  it('should export clickPaginate with nextSelector', () => {
    const steps = [makeStep({ action: 'clickPaginate', nextSelector: '.next' })];
    const result = exporter.export(steps);
    expect(result).toContain("cy.get('.next').click()");
  });

  it('should export forEach with itemSelector', () => {
    const steps = [
      makeStep({
        action: 'forEach',
        itemSelector: '.item',
        subSteps: [makeStep({ id: 'sub-1', action: 'click', selector: 'a' })],
      }),
    ];
    const result = exporter.export(steps);
    expect(result).toContain("cy.get('.item').each");
  });

  it('should export condition with thenSteps', () => {
    const steps = [
      makeStep({
        action: 'condition',
        condition: 'document.querySelector(".modal")',
        thenSteps: [makeStep({ id: 'sub-1', action: 'click', selector: '.close' })],
      }),
    ];
    const result = exporter.export(steps);
    expect(result).toContain('cy.window().then');
    expect(result).toContain('if');
  });

  it('should export repeatWhile as comment', () => {
    const steps = [
      makeStep({
        action: 'repeatWhile',
        condition: 'document.querySelector(".loading")',
        loopSteps: [makeStep({ id: 'sub-1', action: 'wait', timeout: 1000 })],
      }),
    ];
    const result = exporter.export(steps);
    expect(result).toContain('repeatWhile');
  });

  it('should export collectAll', () => {
    const steps = [
      makeStep({
        action: 'collectAll',
        collectSteps: [
          makeStep({ id: 'sub-1', action: 'extract', container: '.item', fields: { title: 'h2' } }),
        ],
      }),
    ];
    const result = exporter.export(steps);
    expect(result).toContain('collectAll');
  });

  it('should export smartExtract as comment', () => {
    const steps = [
      makeStep({ action: 'smartExtract', smartExtractConfig: { container: '.products' } }),
    ];
    const result = exporter.export(steps);
    expect(result).toContain('smartExtract');
  });

  it('should export detectBlocking as comment', () => {
    const steps = [makeStep({ action: 'detectBlocking' })];
    const result = exporter.export(steps);
    expect(result).toContain('detectBlocking');
  });

  it('should export humanHelp with message', () => {
    const steps = [
      makeStep({ action: 'humanHelp', intervention: { message: 'Please solve captcha' } }),
    ];
    const result = exporter.export(steps);
    expect(result).toContain('humanHelp');
    expect(result).toContain('Please solve captcha');
  });

  it('should export waitForHuman', () => {
    const steps = [makeStep({ action: 'waitForHuman' })];
    const result = exporter.export(steps);
    expect(result).toContain('waitForHuman');
  });

  it('should export autoRecover as comment', () => {
    const steps = [makeStep({ action: 'autoRecover' })];
    const result = exporter.export(steps);
    expect(result).toContain('autoRecover');
  });

  it('should export captureScript', () => {
    const steps = [makeStep({ action: 'captureScript', file: 'capture.js' })];
    const result = exporter.export(steps);
    expect(result).toContain('captureScript');
    expect(result).toContain('capture.js');
  });

  it('should export readCapture', () => {
    const steps = [makeStep({ action: 'readCapture', file: 'capture.js' })];
    const result = exporter.export(steps);
    expect(result).toContain('readCapture');
  });

  it('should export captureAPI as cy.intercept', () => {
    const steps = [makeStep({ action: 'captureAPI', apiUrl: '/api/data' })];
    const result = exporter.export(steps);
    expect(result).toContain("cy.intercept('/api/data')");
  });

  it('should export readAPI as cy.wait', () => {
    const steps = [makeStep({ action: 'readAPI', outputVar: 'apiData' })];
    const result = exporter.export(steps);
    expect(result).toContain("cy.wait('@capturedApi')");
  });

  it('should export interceptRoute with mock', () => {
    const steps = [
      makeStep({
        action: 'interceptRoute',
        apiUrl: '/api/data',
        mockResponse: '{}',
        mockStatus: 200,
      }),
    ];
    const result = exporter.export(steps);
    expect(result).toContain("cy.intercept('/api/data'");
    expect(result).toContain('statusCode: 200');
  });

  it('should export removeRoute as comment', () => {
    const steps = [makeStep({ action: 'removeRoute' })];
    const result = exporter.export(steps);
    expect(result).toContain('removeRoute');
  });

  it('should export formatOutput as comment', () => {
    const steps = [makeStep({ action: 'formatOutput', outputFormat: 'json' })];
    const result = exporter.export(steps);
    expect(result).toContain('formatOutput');
  });

  it('should export deduplicate as comment', () => {
    const steps = [makeStep({ action: 'deduplicate', dedupField: 'id' })];
    const result = exporter.export(steps);
    expect(result).toContain('deduplicate');
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

describe('SeleniumExporter - expanded actions', () => {
  const exporter = new SeleniumExporter();

  it('should export extract with fields', () => {
    const steps = [
      makeStep({
        action: 'extract',
        container: '.item',
        fields: { title: 'h2' },
        outputVar: 'items',
      }),
    ];
    const result = exporter.export(steps);
    expect(result).toContain("driver.find_elements(By.CSS_SELECTOR, '.item')");
    expect(result).toContain('items = []');
  });

  it('should export eval as execute_script', () => {
    const steps = [makeStep({ action: 'eval', value: 'console.log("hi")' })];
    const result = exporter.export(steps);
    expect(result).toContain('driver.execute_script(\'console.log("hi")\')');
  });

  it('should export eval with outputVar', () => {
    const steps = [makeStep({ action: 'eval', value: '1+1', outputVar: 'result' })];
    const result = exporter.export(steps);
    expect(result).toContain('result = driver.execute_script');
  });

  it('should export screenshot as save_screenshot', () => {
    const steps = [makeStep({ action: 'screenshot', file: 'shot.png', selector: undefined })];
    const result = exporter.export(steps);
    expect(result).toContain("driver.save_screenshot('shot.png')");
  });

  it('should export screenshot with selector', () => {
    const steps = [makeStep({ action: 'screenshot', selector: '#chart', file: 'chart.png' })];
    const result = exporter.export(steps);
    expect(result).toContain("element.screenshot('chart.png')");
  });

  it('should export scrollUntil', () => {
    const steps = [makeStep({ action: 'scrollUntil', scrollDirection: 'down', scrollAmount: 500 })];
    const result = exporter.export(steps);
    expect(result).toContain('window.scrollBy(0, 500)');
  });

  it('should export paginate with nextSelector', () => {
    const steps = [makeStep({ action: 'paginate', nextSelector: '.next-page' })];
    const result = exporter.export(steps);
    expect(result).toContain('element.click()');
    expect(result).toContain('.next-page');
  });

  it('should export clickPaginate with nextSelector', () => {
    const steps = [makeStep({ action: 'clickPaginate', nextSelector: '.next' })];
    const result = exporter.export(steps);
    expect(result).toContain('.next');
  });

  it('should export forEach with itemSelector', () => {
    const steps = [
      makeStep({
        action: 'forEach',
        itemSelector: '.item',
        subSteps: [makeStep({ id: 'sub-1', action: 'click', selector: 'a' })],
      }),
    ];
    const result = exporter.export(steps);
    expect(result).toContain("driver.find_elements(By.CSS_SELECTOR, '.item')");
    expect(result).toContain('for item in items:');
  });

  it('should export condition with thenSteps', () => {
    const steps = [
      makeStep({
        action: 'condition',
        condition: 'document.querySelector(".modal")',
        thenSteps: [makeStep({ id: 'sub-1', action: 'click', selector: '.close' })],
      }),
    ];
    const result = exporter.export(steps);
    expect(result).toContain('if driver.execute_script');
    expect(result).toContain('element.click()');
  });

  it('should export repeatWhile as while loop', () => {
    const steps = [
      makeStep({
        action: 'repeatWhile',
        condition: 'document.querySelector(".loading")',
        loopSteps: [makeStep({ id: 'sub-1', action: 'wait', timeout: 1000 })],
      }),
    ];
    const result = exporter.export(steps);
    expect(result).toContain('while driver.execute_script');
  });

  it('should export collectAll', () => {
    const steps = [
      makeStep({
        action: 'collectAll',
        collectSteps: [
          makeStep({ id: 'sub-1', action: 'extract', container: '.item', fields: { title: 'h2' } }),
        ],
      }),
    ];
    const result = exporter.export(steps);
    expect(result).toContain('collectAll');
  });

  it('should export smartExtract as comment', () => {
    const steps = [
      makeStep({ action: 'smartExtract', smartExtractConfig: { container: '.products' } }),
    ];
    const result = exporter.export(steps);
    expect(result).toContain('smartExtract');
  });

  it('should export detectBlocking as comment', () => {
    const steps = [makeStep({ action: 'detectBlocking' })];
    const result = exporter.export(steps);
    expect(result).toContain('detectBlocking');
  });

  it('should export humanHelp with message', () => {
    const steps = [
      makeStep({ action: 'humanHelp', intervention: { message: 'Please solve captcha' } }),
    ];
    const result = exporter.export(steps);
    expect(result).toContain('humanHelp');
    expect(result).toContain('Please solve captcha');
  });

  it('should export waitForHuman', () => {
    const steps = [makeStep({ action: 'waitForHuman' })];
    const result = exporter.export(steps);
    expect(result).toContain('waitForHuman');
  });

  it('should export interceptRoute as comment', () => {
    const steps = [
      makeStep({
        action: 'interceptRoute',
        apiUrl: '/api/data',
        mockResponse: '{}',
        mockStatus: 200,
      }),
    ];
    const result = exporter.export(steps);
    expect(result).toContain('interceptRoute');
    expect(result).toContain('/api/data');
  });

  it('should export removeRoute as comment', () => {
    const steps = [makeStep({ action: 'removeRoute' })];
    const result = exporter.export(steps);
    expect(result).toContain('removeRoute');
  });

  it('should export formatOutput as comment', () => {
    const steps = [makeStep({ action: 'formatOutput', outputFormat: 'json' })];
    const result = exporter.export(steps);
    expect(result).toContain('formatOutput');
  });

  it('should export deduplicate as comment', () => {
    const steps = [makeStep({ action: 'deduplicate', dedupField: 'id' })];
    const result = exporter.export(steps);
    expect(result).toContain('deduplicate');
    expect(result).toContain('id');
  });

  it('should include ActionChains import', () => {
    const result = exporter.export([makeStep()]);
    expect(result).toContain('from selenium.webdriver.common.action_chains import ActionChains');
  });

  it('should include Select import', () => {
    const result = exporter.export([makeStep()]);
    expect(result).toContain('from selenium.webdriver.support.ui import Select');
  });
});
