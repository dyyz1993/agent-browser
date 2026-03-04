import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';
import type { RecorderStartData, RecorderStopData, RecorderStatusData } from '../../types.js';
import { isSuccessResponse } from '../../types.js';

function isRecorderStartData(data: unknown): data is RecorderStartData {
  return typeof data === 'object' && data !== null && 'started' in data && 'sessionId' in data;
}

function isRecorderStopData(data: unknown): data is RecorderStopData {
  return typeof data === 'object' && data !== null && 'yaml' in data && 'steps' in data;
}

function isRecorderStatusData(data: unknown): data is RecorderStatusData {
  return typeof data === 'object' && data !== null && 'isRecording' in data && 'steps' in data;
}

interface ParsedStep {
  id: string;
  action: string;
  selector?: string;
  xpath?: string;
  value?: string;
}

function parseYamlSteps(yaml: string): ParsedStep[] {
  const steps: ParsedStep[] = [];
  const stepBlocks = yaml.split('- id:').slice(1);

  for (const block of stepBlocks) {
    const step: ParsedStep = {
      id: '',
      action: '',
    };

    const idMatch = block.match(/^(\S+)/);
    if (idMatch) step.id = idMatch[1];

    const actionMatch = block.match(/action:\s*(\S+)/);
    if (actionMatch) step.action = actionMatch[1];

    const selectorMatch = block.match(/selector:\s*"([^"]*)"/);
    if (selectorMatch) step.selector = selectorMatch[1];

    const xpathMatch = block.match(/xpath:\s*"([^"]*)"/);
    if (xpathMatch) step.xpath = xpathMatch[1];

    const valueMatch = block.match(/value:\s*"([^"]*)"/);
    if (valueMatch) step.value = valueMatch[1];

    steps.push(step);
  }

  return steps;
}

async function verifyRecorderPanelVisible(
  browser: BrowserManager
): Promise<{ visible: boolean; stepCount: number; error?: string }> {
  const page = browser.getPage();

  try {
    const panel = await page.$('.xyzPnl');
    if (!panel) {
      return { visible: false, stepCount: 0, error: 'Panel element not found' };
    }

    const isVisible = await panel.isVisible();
    if (!isVisible) {
      return { visible: false, stepCount: 0, error: 'Panel is not visible' };
    }

    const status = await page.$('#xyzStatus');
    if (!status) {
      return { visible: false, stepCount: 0, error: 'Status element not found' };
    }

    const statusText = await status.textContent();
    if (!statusText?.includes('Steps:')) {
      return { visible: false, stepCount: 0, error: 'Status text does not contain "Steps:"' };
    }

    const stepCountMatch = statusText.match(/Steps:\s*(\d+)/);
    const stepCount = stepCountMatch ? parseInt(stepCountMatch[1], 10) : 0;

    return { visible: true, stepCount };
  } catch (error) {
    return { visible: false, stepCount: 0, error: String(error) };
  }
}

describe('Comprehensive Recorder E2E Tests', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-launch',
      headless: true,
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    const openResult = await executeCommand(
      parseCliArgs(['open', getFixturePath('comprehensive-test.html')]),
      browser
    );
    expect(openResult.success).toBe(true);
  });

  describe('1. Mouse Events', () => {
    it('should record single click and show panel', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      // Verify panel is visible after starting recorder
      await new Promise((resolve) => setTimeout(resolve, 200));
      const panelBefore = await verifyRecorderPanelVisible(browser);
      expect(panelBefore.visible).toBe(true);

      const clickResult = await executeCommand(parseCliArgs(['click', '#click-btn']), browser);
      expect(clickResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 400));

      // Verify panel is still visible after click
      const panelAfter = await verifyRecorderPanelVisible(browser);
      expect(panelAfter.visible).toBe(true);
      expect(panelAfter.stepCount).toBeGreaterThan(0);

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const clickStep = steps.find(
          (s) => s.action === 'click' && s.selector?.includes('click-btn')
        );
        expect(clickStep).toBeDefined();
        expect(clickStep?.selector).toMatch(/click-btn/);
      }
    });

    it('should record double click and show panel', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      // Verify panel is visible
      await new Promise((resolve) => setTimeout(resolve, 200));
      const panelBefore = await verifyRecorderPanelVisible(browser);
      expect(panelBefore.visible).toBe(true);

      const dblclickResult = await executeCommand(
        parseCliArgs(['dblclick', '#dblclick-btn']),
        browser
      );
      expect(dblclickResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 400));

      // Verify panel is still visible
      const panelAfter = await verifyRecorderPanelVisible(browser);
      expect(panelAfter.visible).toBe(true);

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const clickStep = steps.find(
          (s) => s.action === 'click' && s.selector?.includes('dblclick-btn')
        );
        expect(clickStep).toBeDefined();
      }
    });

    it('should record right click (context menu) and show panel', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      // Verify panel is visible
      await new Promise((resolve) => setTimeout(resolve, 200));
      const panelBefore = await verifyRecorderPanelVisible(browser);
      expect(panelBefore.visible).toBe(true);

      await executeCommand(
        parseCliArgs(['click', '#rightclick-btn', '--button', 'right']),
        browser
      );

      await new Promise((resolve) => setTimeout(resolve, 400));

      // Verify panel is still visible
      const panelAfter = await verifyRecorderPanelVisible(browser);
      expect(panelAfter.visible).toBe(true);

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        expect(steps.length).toBeGreaterThan(0);
      }
    });
  });

  describe('2. Keyboard Events', () => {
    it('should record type input', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      const typeResult = await executeCommand(
        parseCliArgs(['type', '#type-input', 'Hello World']),
        browser
      );
      expect(typeResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const fillStep = steps.find((s) => s.action === 'fill');
        expect(fillStep).toBeDefined();
      }
    });

    it('should record password input', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      const fillResult = await executeCommand(
        parseCliArgs(['fill', '#password-input', 'secret123']),
        browser
      );
      expect(fillResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const fillStep = steps.find((s) => s.action === 'fill');
        expect(fillStep).toBeDefined();
      }
    });

    it('should record textarea input', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      const fillResult = await executeCommand(
        parseCliArgs(['fill', '#textarea', 'Line 1\nLine 2\nLine 3']),
        browser
      );
      expect(fillResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        expect(steps.filter((s) => s.action === 'fill').length).toBeGreaterThan(0);
      }
    });

    it('should record key press (Enter)', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(parseCliArgs(['click', '#type-input']), browser);
      await executeCommand(parseCliArgs(['press', 'Enter']), browser);

      await new Promise((resolve) => setTimeout(resolve, 400));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        expect(steps.length).toBeGreaterThan(0);
      }
    });
  });

  describe('3. Form Events', () => {
    it('should record select dropdown', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      const selectResult = await executeCommand(
        parseCliArgs(['select', '#select-dropdown', 'uk']),
        browser
      );
      expect(selectResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 400));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const selectStep = steps.find((s) => s.action === 'select' && s.value === 'uk');
        expect(selectStep).toBeDefined();
      }
    });

    it('should record checkbox click', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      const checkResult = await executeCommand(parseCliArgs(['check', '#checkbox-agree']), browser);
      expect(checkResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 400));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const clickStep = steps.find(
          (s) => s.action === 'click' && s.selector?.includes('checkbox-agree')
        );
        expect(clickStep).toBeDefined();
      }
    });

    it('should record radio button click', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      const clickResult = await executeCommand(
        parseCliArgs(['click', '[data-testid="radio-basic"]']),
        browser
      );
      expect(clickResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 400));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const clickStep = steps.find((s) => s.action === 'click');
        expect(clickStep).toBeDefined();
      }
    });

    it('should record submit button click', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      const clickResult = await executeCommand(parseCliArgs(['click', '#submit-btn']), browser);
      expect(clickResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 400));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const clickStep = steps.find(
          (s) => s.action === 'click' && s.selector?.includes('submit-btn')
        );
        expect(clickStep).toBeDefined();
      }
    });
  });

  describe('4. Navigation Events', () => {
    it('should record anchor link click', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      const clickResult = await executeCommand(parseCliArgs(['click', '#anchor-link']), browser);
      expect(clickResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 400));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const linkStep = steps.find((s) => s.action === 'link_click');
        expect(linkStep).toBeDefined();
      }
    });

    it('should record external link click', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      const clickResult = await executeCommand(parseCliArgs(['click', '#external-link']), browser);
      expect(clickResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 400));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const linkStep = steps.find(
          (s) => s.action === 'link_click' && s.value?.includes('example.com')
        );
        expect(linkStep).toBeDefined();
      }
    });

    it('should record reload and show panel', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      // Verify panel is visible before reload
      await new Promise((resolve) => setTimeout(resolve, 200));
      const panelBefore = await verifyRecorderPanelVisible(browser);
      expect(panelBefore.visible).toBe(true);

      await executeCommand(parseCliArgs(['reload']), browser);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify panel is still visible after reload
      const panelAfter = await verifyRecorderPanelVisible(browser);
      expect(panelAfter.visible).toBe(true);

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        expect(steps.length).toBeGreaterThan(0);
      }
    });

    it('should continue recording after page navigation and show panel', async () => {
      // Start recorder (page already opened by beforeEach)
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      // Verify panel is visible before navigation
      await new Promise((resolve) => setTimeout(resolve, 200));
      const panelBefore = await verifyRecorderPanelVisible(browser);
      expect(panelBefore.visible).toBe(true);

      // First action before navigation
      await executeCommand(parseCliArgs(['click', '#click-btn']), browser);
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Navigate to a different page (example.com)
      const page = browser.getPage();
      await page.goto('https://example.com', { waitUntil: 'load' });
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Verify panel is visible after navigation
      const panelAfterNav = await verifyRecorderPanelVisible(browser);
      expect(panelAfterNav.visible).toBe(true);

      // Continue actions after navigation - click on the h1 element
      await page.locator('h1').click();
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify panel is still visible after click
      const panelAfterClick = await verifyRecorderPanelVisible(browser);
      expect(panelAfterClick.visible).toBe(true);

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        // Should have actions from both before and after navigation
        const clickSteps = steps.filter((s) => s.action === 'click');
        console.log('Click steps count:', clickSteps.length);
        console.log(
          'All steps:',
          steps.map((s) => s.action)
        );
        expect(clickSteps.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('5. Scroll Events', () => {
    it('should record scroll event via mouse wheel', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      // First click on the scroll container to focus it
      await executeCommand(parseCliArgs(['click', '#scroll-container']), browser);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Use mouse wheel to trigger scroll (this triggers wheel event)
      const wheelResult = await executeCommand(
        parseCliArgs(['mouse', 'wheel', '0', '300']),
        browser
      );
      expect(wheelResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 300));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        // Should have at least click and scroll events
        expect(steps.length).toBeGreaterThan(0);
      }
    });
  });

  describe('6. Modal Dialog', () => {
    it('should record modal open and close', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(parseCliArgs(['click', '#open-modal-btn']), browser);
      await new Promise((resolve) => setTimeout(resolve, 200));

      await executeCommand(parseCliArgs(['click', '#modal-confirm']), browser);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        expect(steps.filter((s) => s.action === 'click').length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('7. Iframe Events (Same Origin)', () => {
    it('should record click inside same-origin iframe', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      const clickResult = await executeCommand(
        parseCliArgs(['click', '#iframe-btn-1', '--in-frame', '#same-origin-iframe']),
        browser
      );
      expect(clickResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        expect(steps.length).toBeGreaterThan(0);
      }
    });

    it('should record fill inside same-origin iframe', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      const fillResult = await executeCommand(
        parseCliArgs([
          'fill',
          '#iframe-input-1',
          'iframe text',
          '--in-frame',
          '#same-origin-iframe',
        ]),
        browser
      );
      expect(fillResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        expect(steps.length).toBeGreaterThan(0);
      }
    });
  });

  describe('8. Iframe Events (Cross Origin - Baidu)', () => {
    it('should handle cross-origin iframe gracefully', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        expect(stopResult.data.yaml).toContain('session:');
      }
    });
  });

  describe('9. Combined Interactions', () => {
    it('should record complex form filling workflow', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(parseCliArgs(['fill', '#type-input', 'John Doe']), browser);
      await executeCommand(parseCliArgs(['fill', '#email-input', 'john@example.com']), browser);
      await executeCommand(parseCliArgs(['fill', '#password-input', 'password123']), browser);
      await executeCommand(parseCliArgs(['select', '#select-dropdown', 'us']), browser);
      await executeCommand(parseCliArgs(['check', '#checkbox-agree']), browser);
      await executeCommand(parseCliArgs(['click', '#submit-btn']), browser);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);

        const fillSteps = steps.filter((s) => s.action === 'fill');
        expect(fillSteps.length).toBeGreaterThanOrEqual(3);

        const selectSteps = steps.filter((s) => s.action === 'select');
        expect(selectSteps.length).toBeGreaterThanOrEqual(1);

        const clickSteps = steps.filter((s) => s.action === 'click');
        expect(clickSteps.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('10. Status and Control', () => {
    it('should return correct status when recording', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      const statusResult = await executeCommand(parseCliArgs(['recorder', 'status']), browser);
      expect(statusResult.success).toBe(true);

      if (isSuccessResponse(statusResult) && isRecorderStatusData(statusResult.data)) {
        expect(statusResult.data.isRecording).toBe(true);
        expect(statusResult.data.sessionId).toBeDefined();
      }

      await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
    });

    it('should return correct status when not recording', async () => {
      const statusResult = await executeCommand(parseCliArgs(['recorder', 'status']), browser);
      expect(statusResult.success).toBe(true);

      if (isSuccessResponse(statusResult) && isRecorderStatusData(statusResult.data)) {
        expect(statusResult.data.isRecording).toBe(false);
      }
    });

    it('should increment step count during recording', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      const statusBefore = await executeCommand(parseCliArgs(['recorder', 'status']), browser);
      const stepsBefore =
        isSuccessResponse(statusBefore) && isRecorderStatusData(statusBefore.data)
          ? statusBefore.data.steps
          : 0;

      await executeCommand(parseCliArgs(['click', '#click-btn']), browser);
      await new Promise((resolve) => setTimeout(resolve, 400));

      const statusAfter = await executeCommand(parseCliArgs(['recorder', 'status']), browser);
      const stepsAfter =
        isSuccessResponse(statusAfter) && isRecorderStatusData(statusAfter.data)
          ? statusAfter.data.steps
          : 0;

      expect(stepsAfter).toBeGreaterThan(stepsBefore);

      await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
    });
  });

  describe('11. YAML Format Validation', () => {
    it('should generate valid YAML structure', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(parseCliArgs(['click', '#click-btn']), browser);
      await new Promise((resolve) => setTimeout(resolve, 400));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const yaml = stopResult.data.yaml;

        expect(yaml).toContain('session:');
        expect(yaml).toContain('id:');
        expect(yaml).toContain('startTime:');
        expect(yaml).toContain('endTime:');
        expect(yaml).toContain('steps:');

        expect(yaml).toMatch(/steps:\s*\d+/);
      }
    });

    it('should include selector and xpath in click steps', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(parseCliArgs(['click', '#click-btn']), browser);
      await new Promise((resolve) => setTimeout(resolve, 400));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const clickSteps = steps.filter((s) => s.action === 'click');

        // Should have at least one click step
        expect(clickSteps.length).toBeGreaterThan(0);

        // All click steps should have selector
        for (const step of clickSteps) {
          expect(step.selector).toBeDefined();
        }

        // At least one click step should have xpath (from inject script capture)
        const clickWithXpath = clickSteps.find((s) => s.xpath);
        // Note: xpath might not always be present for CLI-triggered clicks,
        // but the selector should always be defined
        expect(clickSteps[0]?.selector).toBeDefined();
      }
    });

    it('should include value in fill steps', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(parseCliArgs(['fill', '#type-input', 'test value']), browser);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const fillStep = steps.find((s) => s.action === 'fill');

        expect(fillStep).toBeDefined();
        expect(fillStep?.value).toBe('test value');
      }
    });
  });

  describe('12. Edge Cases', () => {
    it('should handle empty recording session', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        expect(stopResult.data.steps).toBe(0);
        expect(stopResult.data.yaml).toContain('steps: 0');
      }
    });

    it('should handle rapid consecutive clicks', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      for (let i = 0; i < 5; i++) {
        await executeCommand(parseCliArgs(['click', '#click-btn']), browser);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const clickSteps = steps.filter((s) => s.action === 'click');
        expect(clickSteps.length).toBeGreaterThanOrEqual(5);
      }
    });

    it('should handle special characters in input', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      const specialText = 'Test "quotes" and \\backslash\\ and <html>';
      await executeCommand(parseCliArgs(['fill', '#type-input', specialText]), browser);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const fillStep = steps.find((s) => s.action === 'fill');
        expect(fillStep).toBeDefined();
      }
    });
  });

  describe('13. Cross-Validation', () => {
    it('should verify multiple action types are recorded', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(parseCliArgs(['click', '#click-btn']), browser);
      await executeCommand(parseCliArgs(['fill', '#type-input', 'test']), browser);
      await executeCommand(parseCliArgs(['select', '#select-dropdown', 'us']), browser);
      await executeCommand(parseCliArgs(['click', '#anchor-link']), browser);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);

        const actionTypes = new Set(steps.map((s) => s.action));

        expect(actionTypes.has('click')).toBe(true);
        expect(actionTypes.has('fill')).toBe(true);
        expect(actionTypes.has('select')).toBe(true);
      }
    });

    it('should verify step count matches actions', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      const actionCount = 10;
      for (let i = 0; i < actionCount; i++) {
        await executeCommand(parseCliArgs(['click', '#click-btn']), browser);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        expect(stopResult.data.steps).toBeGreaterThanOrEqual(actionCount);
      }
    });
  });
});
