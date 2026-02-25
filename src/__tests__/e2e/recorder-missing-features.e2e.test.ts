import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';
import { isSuccessResponse } from '../../types.js';

interface ParsedStep {
  id: string;
  action: string;
  selector?: string;
  value?: string;
  index?: number;
  key?: string;
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

    const valueMatch = block.match(/value:\s*"([^"]*)"/);
    if (valueMatch) step.value = valueMatch[1];

    const indexMatch = block.match(/index:\s*(\d+)/);
    if (indexMatch) step.index = parseInt(indexMatch[1], 10);

    const keyMatch = block.match(/key:\s*"([^"]*)"/);
    if (keyMatch) step.key = keyMatch[1];

    steps.push(step);
  }

  return steps;
}

function isRecorderStopData(data: unknown): data is { yaml: string; steps: number } {
  return typeof data === 'object' && data !== null && 'yaml' in data && 'steps' in data;
}

async function verifyRecorderPanelVisible(
  browser: BrowserManager
): Promise<{ visible: boolean; stepCount: number; error?: string }> {
  const page = browser.getPage();

  try {
    const panel = await page.$('.recorder-panel');
    if (!panel) {
      return { visible: false, stepCount: 0, error: 'Panel element not found' };
    }

    const isVisible = await panel.isVisible();
    if (!isVisible) {
      return { visible: false, stepCount: 0, error: 'Panel is not visible' };
    }

    const status = await page.$('#recorder-status');
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

describe('Recorder Missing Features Tests', () => {
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

  describe('Tab Operations Recording', () => {
    it('should record tab_new action when opening new tab and show panel', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      // Verify panel is visible before tab operation
      await new Promise((resolve) => setTimeout(resolve, 200));
      const panelBefore = await verifyRecorderPanelVisible(browser);
      expect(panelBefore.visible).toBe(true);

      const tabResult = await executeCommand(parseCliArgs(['tab', 'new']), browser);
      expect(tabResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify panel is visible after tab operation
      const panelAfter = await verifyRecorderPanelVisible(browser);
      expect(panelAfter.visible).toBe(true);

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const tabNewStep = steps.find((s) => s.action === 'tab_new');
        expect(tabNewStep).toBeDefined();
      }
    });

    it('should record tab_switch action when switching tabs and show panel', async () => {
      await executeCommand(parseCliArgs(['tab', 'new']), browser);
      await new Promise((resolve) => setTimeout(resolve, 200));

      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      // Verify panel is visible before tab switch
      await new Promise((resolve) => setTimeout(resolve, 200));
      const panelBefore = await verifyRecorderPanelVisible(browser);
      expect(panelBefore.visible).toBe(true);

      const switchResult = await executeCommand(parseCliArgs(['tab', '0']), browser);
      expect(switchResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify panel is visible after tab switch
      const panelAfter = await verifyRecorderPanelVisible(browser);
      expect(panelAfter.visible).toBe(true);

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const tabSwitchStep = steps.find((s) => s.action === 'tab_switch');
        expect(tabSwitchStep).toBeDefined();
        expect(tabSwitchStep?.index).toBe(0);
      }
    });

    it('should record tab_close action when closing tab and show panel', async () => {
      await executeCommand(parseCliArgs(['tab', 'new']), browser);
      await new Promise((resolve) => setTimeout(resolve, 200));

      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      // Verify panel is visible before tab close
      await new Promise((resolve) => setTimeout(resolve, 200));
      const panelBefore = await verifyRecorderPanelVisible(browser);
      expect(panelBefore.visible).toBe(true);

      const closeResult = await executeCommand(parseCliArgs(['tab', 'close', '1']), browser);
      expect(closeResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify panel is visible after tab close
      const panelAfter = await verifyRecorderPanelVisible(browser);
      expect(panelAfter.visible).toBe(true);

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const tabCloseStep = steps.find((s) => s.action === 'tab_close');
        expect(tabCloseStep).toBeDefined();
        expect(tabCloseStep?.index).toBe(1);
      }
    });

    it('should record complete tab workflow and show panel', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      // Verify panel is visible at start
      await new Promise((resolve) => setTimeout(resolve, 200));
      const panelStart = await verifyRecorderPanelVisible(browser);
      expect(panelStart.visible).toBe(true);

      await executeCommand(parseCliArgs(['tab', 'new']), browser);
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify panel after tab new
      const panelAfterNew = await verifyRecorderPanelVisible(browser);
      expect(panelAfterNew.visible).toBe(true);

      await executeCommand(parseCliArgs(['tab', '0']), browser);
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify panel after tab switch
      const panelAfterSwitch = await verifyRecorderPanelVisible(browser);
      expect(panelAfterSwitch.visible).toBe(true);

      await executeCommand(parseCliArgs(['tab', 'close', '1']), browser);
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify panel after tab close
      const panelAfterClose = await verifyRecorderPanelVisible(browser);
      expect(panelAfterClose.visible).toBe(true);

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);

        const tabNewStep = steps.find((s) => s.action === 'tab_new');
        expect(tabNewStep).toBeDefined();

        const tabSwitchStep = steps.find((s) => s.action === 'tab_switch');
        expect(tabSwitchStep).toBeDefined();

        const tabCloseStep = steps.find((s) => s.action === 'tab_close');
        expect(tabCloseStep).toBeDefined();
      }
    });
  });

  describe('Browser Navigation Recording', () => {
    it('should record back action when navigating back and show panel', async () => {
      await executeCommand(parseCliArgs(['open', 'https://example.com']), browser);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await executeCommand(parseCliArgs(['open', 'https://example.org']), browser);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      // Verify panel is visible before back
      await new Promise((resolve) => setTimeout(resolve, 200));
      const panelBefore = await verifyRecorderPanelVisible(browser);
      expect(panelBefore.visible).toBe(true);

      const backResult = await executeCommand(parseCliArgs(['back']), browser);
      expect(backResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify panel is visible after back
      const panelAfter = await verifyRecorderPanelVisible(browser);
      expect(panelAfter.visible).toBe(true);

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const backStep = steps.find((s) => s.action === 'back');
        expect(backStep).toBeDefined();
      }
    });

    it('should record forward action when navigating forward and show panel', async () => {
      await executeCommand(parseCliArgs(['open', 'https://example.com']), browser);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await executeCommand(parseCliArgs(['open', 'https://example.org']), browser);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await executeCommand(parseCliArgs(['back']), browser);
      await new Promise((resolve) => setTimeout(resolve, 500));

      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      // Verify panel is visible before forward
      await new Promise((resolve) => setTimeout(resolve, 200));
      const panelBefore = await verifyRecorderPanelVisible(browser);
      expect(panelBefore.visible).toBe(true);

      const forwardResult = await executeCommand(parseCliArgs(['forward']), browser);
      expect(forwardResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify panel is visible after forward
      const panelAfter = await verifyRecorderPanelVisible(browser);
      expect(panelAfter.visible).toBe(true);

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const forwardStep = steps.find((s) => s.action === 'forward');
        expect(forwardStep).toBeDefined();
      }
    });

    it('should record reload action when reloading page and show panel', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      // Verify panel is visible before reload
      await new Promise((resolve) => setTimeout(resolve, 200));
      const panelBefore = await verifyRecorderPanelVisible(browser);
      expect(panelBefore.visible).toBe(true);

      const reloadResult = await executeCommand(parseCliArgs(['reload']), browser);
      expect(reloadResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify panel is visible after reload
      const panelAfter = await verifyRecorderPanelVisible(browser);
      expect(panelAfter.visible).toBe(true);

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const reloadStep = steps.find((s) => s.action === 'reload');
        expect(reloadStep).toBeDefined();
      }
    });

    it('should record complete navigation workflow', async () => {
      await executeCommand(parseCliArgs(['open', 'https://example.com']), browser);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await executeCommand(parseCliArgs(['open', 'https://example.org']), browser);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(parseCliArgs(['back']), browser);
      await new Promise((resolve) => setTimeout(resolve, 500));

      await executeCommand(parseCliArgs(['forward']), browser);
      await new Promise((resolve) => setTimeout(resolve, 500));

      await executeCommand(parseCliArgs(['reload']), browser);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);

        const backStep = steps.find((s) => s.action === 'back');
        expect(backStep).toBeDefined();

        const forwardStep = steps.find((s) => s.action === 'forward');
        expect(forwardStep).toBeDefined();

        const reloadStep = steps.find((s) => s.action === 'reload');
        expect(reloadStep).toBeDefined();
      }
    });
  });

  describe('Keyboard Events Recording', () => {
    it('should record Enter key press', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(parseCliArgs(['click', '#type-input']), browser);
      await executeCommand(parseCliArgs(['press', 'Enter']), browser);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const keyboardStep = steps.find((s) => s.action === 'keyboard' && s.key === 'Enter');
        expect(keyboardStep).toBeDefined();
      }
    });

    it('should record Tab key press', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(parseCliArgs(['click', '#type-input']), browser);
      await executeCommand(parseCliArgs(['press', 'Tab']), browser);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const keyboardStep = steps.find((s) => s.action === 'keyboard' && s.key === 'Tab');
        expect(keyboardStep).toBeDefined();
      }
    });

    it('should record Escape key press', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(parseCliArgs(['click', '#type-input']), browser);
      await executeCommand(parseCliArgs(['press', 'Escape']), browser);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const keyboardStep = steps.find((s) => s.action === 'keyboard' && s.key === 'Escape');
        expect(keyboardStep).toBeDefined();
      }
    });

    it('should record arrow key presses', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(parseCliArgs(['click', '#type-input']), browser);
      await executeCommand(parseCliArgs(['press', 'ArrowDown']), browser);
      await executeCommand(parseCliArgs(['press', 'ArrowUp']), browser);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const arrowSteps = steps.filter(
          (s) => s.action === 'keyboard' && s.key?.startsWith('Arrow')
        );
        expect(arrowSteps.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('should record modifier key combinations', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(parseCliArgs(['click', '#type-input']), browser);
      await executeCommand(parseCliArgs(['press', 'Control+a']), browser);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const keyboardSteps = steps.filter((s) => s.action === 'keyboard');
        expect(keyboardSteps.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Combined Missing Features', () => {
    it('should record mixed tab and navigation operations', async () => {
      await executeCommand(parseCliArgs(['open', 'https://example.com']), browser);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(parseCliArgs(['tab', 'new']), browser);
      await new Promise((resolve) => setTimeout(resolve, 300));

      await executeCommand(parseCliArgs(['open', 'https://example.org']), browser);
      await new Promise((resolve) => setTimeout(resolve, 500));

      await executeCommand(parseCliArgs(['back']), browser);
      await new Promise((resolve) => setTimeout(resolve, 300));

      await executeCommand(parseCliArgs(['tab', '0']), browser);
      await new Promise((resolve) => setTimeout(resolve, 300));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);

        const tabNewStep = steps.find((s) => s.action === 'tab_new');
        expect(tabNewStep).toBeDefined();

        const backStep = steps.find((s) => s.action === 'back');
        expect(backStep).toBeDefined();

        const tabSwitchStep = steps.find((s) => s.action === 'tab_switch');
        expect(tabSwitchStep).toBeDefined();
      }
    });

    it('should record form interaction with keyboard submit', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(parseCliArgs(['click', '#type-input']), browser);
      await executeCommand(parseCliArgs(['fill', '#type-input', 'search term']), browser);
      await executeCommand(parseCliArgs(['press', 'Enter']), browser);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);

        const fillStep = steps.find((s) => s.action === 'fill');
        expect(fillStep).toBeDefined();
        expect(fillStep?.value).toBe('search term');

        const keyboardStep = steps.find((s) => s.action === 'keyboard' && s.key === 'Enter');
        expect(keyboardStep).toBeDefined();
      }
    });
  });
});
