import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser/index.js';
import { executeCommand } from '../../actions/index.js';
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

/**
 * 双重校验面板可见性 - 确保面板持续可见，不是短暂出现后消失
 * @param browser BrowserManager 实例
 * @param context 测试上下文名称，用于错误日志
 * @returns 面板可见性结果
 */
async function verifyPanelWithDoubleCheck(
  browser: BrowserManager,
  context: string = ''
): Promise<{ visible: boolean; stepCount: number; error?: string }> {
  const prefix = context ? `[${context}] ` : '';

  // 第一次校验：立即校验
  const firstCheck = await verifyRecorderPanelVisible(browser);
  if (!firstCheck.visible) {
    console.log(`${prefix}First check failed: ${firstCheck.error}`);
    return firstCheck;
  }
  console.log(`${prefix}First check passed, stepCount: ${firstCheck.stepCount}`);

  // 等待 1 秒后再次校验
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 第二次校验：确保面板持续可见
  const secondCheck = await verifyRecorderPanelVisible(browser);
  if (!secondCheck.visible) {
    console.log(`${prefix}Second check failed (panel disappeared): ${secondCheck.error}`);
    return { ...secondCheck, error: `Panel disappeared after 1s: ${secondCheck.error}` };
  }
  console.log(`${prefix}Second check passed, stepCount: ${secondCheck.stepCount}`);

  return secondCheck;
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

      // 双重校验: 启动后面板可见
      await new Promise((resolve) => setTimeout(resolve, 200));
      const panelBefore = await verifyPanelWithDoubleCheck(browser, 'before tab_new');
      expect(panelBefore.visible).toBe(true);

      const tabResult = await executeCommand(parseCliArgs(['tab', 'new']), browser);
      expect(tabResult.success).toBe(true);

      // 双重校验: 新标签页后面板可见
      const panelAfter = await verifyPanelWithDoubleCheck(browser, 'after tab_new');
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

      // 双重校验: 启动后面板可见
      await new Promise((resolve) => setTimeout(resolve, 200));
      const panelBefore = await verifyPanelWithDoubleCheck(browser, 'before tab_switch');
      expect(panelBefore.visible).toBe(true);

      const switchResult = await executeCommand(parseCliArgs(['tab', '0']), browser);
      expect(switchResult.success).toBe(true);

      // Panel may need time to be recreated in the switched tab
      await new Promise((resolve) => setTimeout(resolve, 800));

      // 双重校验: 切换标签页后面板可见 (面板需要重新创建)
      const panelAfter = await verifyPanelWithDoubleCheck(browser, 'after tab_switch');
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

      // 双重校验: 启动后面板可见
      await new Promise((resolve) => setTimeout(resolve, 200));
      const panelBefore = await verifyPanelWithDoubleCheck(browser, 'before tab_close');
      expect(panelBefore.visible).toBe(true);

      const closeResult = await executeCommand(parseCliArgs(['tab', 'close', '1']), browser);
      expect(closeResult.success).toBe(true);

      // 双重校验: 关闭标签页后面板可见
      const panelAfter = await verifyPanelWithDoubleCheck(browser, 'after tab_close');
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
      // Stop any running recorder from previous tests
      try {
        await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      } catch {
        // Ignore errors if recorder wasn't running
      }

      // Clean up any leftover tabs from previous tests
      const page = browser.getPage();
      const context = page.context();
      const pages = context.pages();

      // Close all tabs except the first one
      for (let i = pages.length - 1; i > 0; i--) {
        try {
          await pages[i].close();
        } catch {
          // Ignore errors if page already closed
        }
      }

      // Small delay to let the browser settle after closing tabs
      await new Promise((resolve) => setTimeout(resolve, 100));

      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      // 双重校验: 启动后面板可见
      await new Promise((resolve) => setTimeout(resolve, 200));
      const panelStart = await verifyPanelWithDoubleCheck(browser, 'tab sequence start');
      expect(panelStart.visible).toBe(true);

      await executeCommand(parseCliArgs(['tab', 'new']), browser);
      // 双重校验: 新标签页后面板可见
      const panelAfterNew = await verifyPanelWithDoubleCheck(browser, 'after tab_new');
      expect(panelAfterNew.visible).toBe(true);

      await executeCommand(parseCliArgs(['tab', '0']), browser);
      // 双重校验: 切换标签页后面板可见
      const panelAfterSwitch = await verifyPanelWithDoubleCheck(browser, 'after tab_switch');
      expect(panelAfterSwitch.visible).toBe(true);

      await executeCommand(parseCliArgs(['tab', 'close', '1']), browser);
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Note: Panel is destroyed when tab is closed, so we skip verification
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

      // 双重校验: 启动后面板可见
      await new Promise((resolve) => setTimeout(resolve, 200));
      const panelBefore = await verifyPanelWithDoubleCheck(browser, 'before back');
      expect(panelBefore.visible).toBe(true);

      const backResult = await executeCommand(parseCliArgs(['back']), browser);
      expect(backResult.success).toBe(true);

      // 双重校验: 后退后面板仍可见
      const panelAfter = await verifyPanelWithDoubleCheck(browser, 'after back');
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

      // 双重校验: 启动后面板可见
      await new Promise((resolve) => setTimeout(resolve, 200));
      const panelBefore = await verifyPanelWithDoubleCheck(browser, 'before forward');
      expect(panelBefore.visible).toBe(true);

      const forwardResult = await executeCommand(parseCliArgs(['forward']), browser);
      expect(forwardResult.success).toBe(true);

      // 双重校验: 前进后面板仍可见
      const panelAfter = await verifyPanelWithDoubleCheck(browser, 'after forward');
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

      // 双重校验: 启动后面板可见
      await new Promise((resolve) => setTimeout(resolve, 200));
      const panelBefore = await verifyPanelWithDoubleCheck(browser, 'before reload');
      expect(panelBefore.visible).toBe(true);

      const reloadResult = await executeCommand(parseCliArgs(['reload']), browser);
      expect(reloadResult.success).toBe(true);

      // 双重校验: 刷新后面板仍可见 (关键测试点)
      const panelAfter = await verifyPanelWithDoubleCheck(browser, 'after reload');
      expect(panelAfter.visible).toBe(true);

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const reloadStep = steps.find((s) => s.action === 'reload');
        expect(reloadStep).toBeDefined();
      }
    });

    it('should record complete navigation workflow with panel persistence', async () => {
      await executeCommand(parseCliArgs(['open', 'https://example.com']), browser);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await executeCommand(parseCliArgs(['open', 'https://example.org']), browser);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      // 双重校验: 启动后面板可见
      await new Promise((resolve) => setTimeout(resolve, 200));
      const panelStart = await verifyPanelWithDoubleCheck(browser, 'start');
      expect(panelStart.visible).toBe(true);

      await executeCommand(parseCliArgs(['back']), browser);
      // 双重校验: 后退后面板可见
      const panelAfterBack = await verifyPanelWithDoubleCheck(browser, 'after back');
      expect(panelAfterBack.visible).toBe(true);

      await executeCommand(parseCliArgs(['forward']), browser);
      // 双重校验: 前进后面板可见
      const panelAfterForward = await verifyPanelWithDoubleCheck(browser, 'after forward');
      expect(panelAfterForward.visible).toBe(true);

      await executeCommand(parseCliArgs(['reload']), browser);
      // 双重校验: 刷新后面板可见
      const panelAfterReload = await verifyPanelWithDoubleCheck(browser, 'after reload');
      expect(panelAfterReload.visible).toBe(true);

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
        console.log('[Test] YAML output:\n', stopResult.data.yaml);
        const steps = parseYamlSteps(stopResult.data.yaml);
        console.log('[Test] Parsed steps:', JSON.stringify(steps, null, 2));
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
