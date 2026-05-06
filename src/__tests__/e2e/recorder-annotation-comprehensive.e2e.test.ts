import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions/index.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';
import type { RecorderStartData } from '../../types.js';
import { isSuccessResponse } from '../../types.js';
import * as fs from 'fs';

interface RecorderWindow extends Window {
  xyzQueue: Array<{ id: string; annotation?: Record<string, unknown>; [key: string]: unknown }>;
  xyzBindingName: string;
  xyzTrack: (data: string) => void;
  [key: string]: unknown;
}

interface RecorderStopData {
  path: string;
  [key: string]: unknown;
}

function isRecorderStartData(data: unknown): data is RecorderStartData {
  return typeof data === 'object' && data !== null && 'started' in data && 'sessionId' in data;
}

interface ParsedStep {
  id: string;
  action: string;
  selector?: string;
  annotation?: {
    type: string;
    label: string;
    selector?: string;
    nextSelector?: string;
    fields?: string[];
    waitTimeout?: number;
    itemSelector?: string;
  };
  url?: string;
  time?: string;
}

function parseYamlSteps(yaml: string): ParsedStep[] {
  if (!yaml) return [];

  const steps: ParsedStep[] = [];
  const stepBlocks = yaml.split('- id:').slice(1);

  for (const block of stepBlocks) {
    const step: ParsedStep = {
      id: '',
      action: '',
    };

    const idMatch = block.match(/^step-([a-zA-Z0-9-]+)/);
    if (idMatch) step.id = idMatch[0];

    const actionMatch = block.match(/action:\s*(\S+)/);
    if (actionMatch) step.action = actionMatch[1];

    const selectorMatch = block.match(/selector:\s*"([^"]*)"/);
    if (selectorMatch) step.selector = selectorMatch[1];

    const timeMatch = block.match(/time:\s*(\S+)/);
    if (timeMatch) step.time = timeMatch[1];

    const urlMatch = block.match(/url:\s*"([^"]*)"/);
    if (urlMatch) step.url = urlMatch[1];

    // Parse annotation field (new format)
    // 先找到 annotation 块的内容
    const annotationBlockMatch = block.match(/annotation:\s*([\s\S]*?)(?=\n\s{0,4}\S|\n\s*$|$)/);
    if (annotationBlockMatch) {
      const annotationBlock = annotationBlockMatch[1];
      const annotationTypeMatch = annotationBlock.match(/type:\s*(\w+)/);
      const annotationLabelMatch = annotationBlock.match(/label:\s*"([^"]*)"/);

      if (annotationTypeMatch && annotationLabelMatch) {
        step.annotation = {
          type: annotationTypeMatch[1],
          label: annotationLabelMatch[1],
        };

        // Parse additional annotation fields within annotation block
        const annotationSelectorMatch = annotationBlock.match(/selector:\s*["']([^"']*)["']/);
        if (annotationSelectorMatch) {
          step.annotation.selector = annotationSelectorMatch[1];
        }

        const nextSelectorMatch = annotationBlock.match(/nextSelector:\s*["']([^"']*)["']/);
        if (nextSelectorMatch) {
          step.annotation.nextSelector = nextSelectorMatch[1];
        }

        const fieldsMatch = annotationBlock.match(/fields:\s*\[([^\]]*)\]/);
        if (fieldsMatch) {
          step.annotation.fields = fieldsMatch[1]
            .split(',')
            .map((f) => f.trim().replace(/['"]/g, ''))
            .filter((f) => f);
        }

        const waitTimeoutMatch = annotationBlock.match(/waitTimeout:\s*(\d+)/);
        if (waitTimeoutMatch) {
          step.annotation.waitTimeout = parseInt(waitTimeoutMatch[1]);
        }

        const itemSelectorMatch = annotationBlock.match(/itemSelector:\s*["']([^"']*)["']/);
        if (itemSelectorMatch) {
          step.annotation.itemSelector = itemSelectorMatch[1];
        }
      }
    }

    steps.push(step);
  }

  return steps;
}

describe('Recorder Annotation Comprehensive E2E Test', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-annotation-comprehensive-e2e',
      headless: true,
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    const openResult = await executeCommand(
      parseCliArgs(['open', getFixturePath('input-test.html')]),
      browser
    );
    expect(openResult.success).toBe(true);
  });

  it('should add wait_element type annotation', async () => {
    const page = browser.getPage();

    // Start recorder
    const startResult = await executeCommand(parseCliArgs(['recorder', 'start']), browser);
    expect(isSuccessResponse(startResult)).toBe(true);
    expect(isRecorderStartData(startResult.data)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Perform an action to create a step
    const clickResult = await executeCommand(parseCliArgs(['click', '#text-input']), browser);
    expect(clickResult.success).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Add wait_element annotation
    const updateResult = await page.evaluate(async () => {
      const steps = (window as RecorderWindow).xyzQueue || [];
      if (steps.length === 0) {
        return { success: false, error: 'No steps in queue' };
      }

      const lastStep = steps[steps.length - 1];
      const annotation = { type: 'wait_element', label: 'Wait for button to appear' };

      lastStep.annotation = annotation;

      const bindingName = (window as RecorderWindow).xyzBindingName || 'xyzTrack';
      const trackFn = (window as RecorderWindow)[bindingName];
      if (typeof trackFn === 'function') {
        try {
          trackFn(
            JSON.stringify({
              action: 'xyzUpdate',
              id: lastStep.id,
              data: { annotation },
            })
          );
          return { success: true, stepId: lastStep.id };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      } else {
        return { success: false, error: 'xyzTrack function not available' };
      }
    });

    expect(updateResult.success).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Stop recorder and verify
    const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
    expect(isSuccessResponse(stopResult)).toBe(true);

    const data = stopResult.data as RecorderStopData;
    const yaml = fs.readFileSync(data.path, 'utf-8');
    const steps = parseYamlSteps(yaml);

    const stepWithAnnotation = steps.find((s) => s.annotation);
    expect(stepWithAnnotation).toBeDefined();
    expect(stepWithAnnotation?.annotation?.type).toBe('wait_element');
    expect(stepWithAnnotation?.annotation?.label).toBe('Wait for button to appear');

    try {
      fs.unlinkSync(data.path);
    } catch {/* empty */}
  });

  it('should add data_container type annotation', async () => {
    const page = browser.getPage();

    const startResult = await executeCommand(parseCliArgs(['recorder', 'start']), browser);
    expect(isSuccessResponse(startResult)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const clickResult = await executeCommand(parseCliArgs(['click', '#text-input']), browser);
    expect(clickResult.success).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Add data_container annotation
    const updateResult = await page.evaluate(async () => {
      const steps = (window as RecorderWindow).xyzQueue || [];
      if (steps.length === 0) {
        return { success: false, error: 'No steps in queue' };
      }

      const lastStep = steps[steps.length - 1];
      const annotation = {
        type: 'data_container',
        label: 'User list container',
        selector: '.user-list',
        itemSelector: '.user-item',
      };

      lastStep.annotation = annotation;

      const bindingName = (window as RecorderWindow).xyzBindingName || 'xyzTrack';
      const trackFn = (window as RecorderWindow)[bindingName];
      if (typeof trackFn === 'function') {
        try {
          trackFn(
            JSON.stringify({
              action: 'xyzUpdate',
              id: lastStep.id,
              data: { annotation },
            })
          );
          return { success: true, stepId: lastStep.id };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      } else {
        return { success: false, error: 'xyzTrack function not available' };
      }
    });

    expect(updateResult.success).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
    expect(isSuccessResponse(stopResult)).toBe(true);

    const data = stopResult.data as RecorderStopData;
    const yaml = fs.readFileSync(data.path, 'utf-8');
    const steps = parseYamlSteps(yaml);

    const stepWithAnnotation = steps.find((s) => s.annotation);
    expect(stepWithAnnotation).toBeDefined();
    expect(stepWithAnnotation?.annotation?.type).toBe('data_container');
    expect(stepWithAnnotation?.annotation?.label).toBe('User list container');
    expect(stepWithAnnotation?.annotation?.selector).toBe('.user-list');
    expect(stepWithAnnotation?.annotation?.itemSelector).toBe('.user-item');

    try {
      fs.unlinkSync(data.path);
    } catch {/* empty */}
  });

  it('should add data_item type annotation', async () => {
    const page = browser.getPage();

    const startResult = await executeCommand(parseCliArgs(['recorder', 'start']), browser);
    expect(isSuccessResponse(startResult)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const clickResult = await executeCommand(parseCliArgs(['click', '#text-input']), browser);
    expect(clickResult.success).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Add data_item annotation
    const updateResult = await page.evaluate(async () => {
      const steps = (window as RecorderWindow).xyzQueue || [];
      if (steps.length === 0) {
        return { success: false, error: 'No steps in queue' };
      }

      const lastStep = steps[steps.length - 1];
      const annotation = {
        type: 'data_item',
        label: 'User item',
        fields: ['name', 'email'],
      };

      lastStep.annotation = annotation;

      const bindingName = (window as RecorderWindow).xyzBindingName || 'xyzTrack';
      const trackFn = (window as RecorderWindow)[bindingName];
      if (typeof trackFn === 'function') {
        try {
          trackFn(
            JSON.stringify({
              action: 'xyzUpdate',
              id: lastStep.id,
              data: { annotation },
            })
          );
          return { success: true, stepId: lastStep.id };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      } else {
        return { success: false, error: 'xyzTrack function not available' };
      }
    });

    expect(updateResult.success).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
    expect(isSuccessResponse(stopResult)).toBe(true);

    const data = stopResult.data as RecorderStopData;
    const yaml = fs.readFileSync(data.path, 'utf-8');
    const steps = parseYamlSteps(yaml);

    const stepWithAnnotation = steps.find((s) => s.annotation);
    expect(stepWithAnnotation).toBeDefined();
    expect(stepWithAnnotation?.annotation?.type).toBe('data_item');
    expect(stepWithAnnotation?.annotation?.label).toBe('User item');
    expect(stepWithAnnotation?.annotation?.fields).toContain('name');
    expect(stepWithAnnotation?.annotation?.fields).toContain('email');

    try {
      fs.unlinkSync(data.path);
    } catch {/* empty */}
  });

  it('should add pagination type annotation', async () => {
    const page = browser.getPage();

    const startResult = await executeCommand(parseCliArgs(['recorder', 'start']), browser);
    expect(isSuccessResponse(startResult)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const clickResult = await executeCommand(parseCliArgs(['click', '#text-input']), browser);
    expect(clickResult.success).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Add pagination annotation
    const updateResult = await page.evaluate(async () => {
      const steps = (window as RecorderWindow).xyzQueue || [];
      if (steps.length === 0) {
        return { success: false, error: 'No steps in queue' };
      }

      const lastStep = steps[steps.length - 1];
      const annotation = {
        type: 'pagination',
        label: 'Pagination component',
        selector: '.pagination',
        nextSelector: '.next',
      };

      lastStep.annotation = annotation;

      const bindingName = (window as RecorderWindow).xyzBindingName || 'xyzTrack';
      const trackFn = (window as RecorderWindow)[bindingName];
      if (typeof trackFn === 'function') {
        try {
          trackFn(
            JSON.stringify({
              action: 'xyzUpdate',
              id: lastStep.id,
              data: { annotation },
            })
          );
          return { success: true, stepId: lastStep.id };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      } else {
        return { success: false, error: 'xyzTrack function not available' };
      }
    });

    expect(updateResult.success).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
    expect(isSuccessResponse(stopResult)).toBe(true);

    const data = stopResult.data as RecorderStopData;
    const yaml = fs.readFileSync(data.path, 'utf-8');
    const steps = parseYamlSteps(yaml);

    const stepWithAnnotation = steps.find((s) => s.annotation);
    expect(stepWithAnnotation).toBeDefined();
    expect(stepWithAnnotation?.annotation?.type).toBe('pagination');
    expect(stepWithAnnotation?.annotation?.label).toBe('Pagination component');
    expect(stepWithAnnotation?.annotation?.selector).toBe('.pagination');
    expect(stepWithAnnotation?.annotation?.nextSelector).toBe('.next');

    try {
      fs.unlinkSync(data.path);
    } catch {/* empty */}
  });

  it('should add login_check type annotation', async () => {
    const page = browser.getPage();

    const startResult = await executeCommand(parseCliArgs(['recorder', 'start']), browser);
    expect(isSuccessResponse(startResult)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const clickResult = await executeCommand(parseCliArgs(['click', '#text-input']), browser);
    expect(clickResult.success).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Add login_check annotation
    const updateResult = await page.evaluate(async () => {
      const steps = (window as RecorderWindow).xyzQueue || [];
      if (steps.length === 0) {
        return { success: false, error: 'No steps in queue' };
      }

      const lastStep = steps[steps.length - 1];
      const annotation = {
        type: 'login_check',
        label: 'Login check',
        selector: '.user-avatar',
      };

      lastStep.annotation = annotation;

      const bindingName = (window as RecorderWindow).xyzBindingName || 'xyzTrack';
      const trackFn = (window as RecorderWindow)[bindingName];
      if (typeof trackFn === 'function') {
        try {
          trackFn(
            JSON.stringify({
              action: 'xyzUpdate',
              id: lastStep.id,
              data: { annotation },
            })
          );
          return { success: true, stepId: lastStep.id };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      } else {
        return { success: false, error: 'xyzTrack function not available' };
      }
    });

    expect(updateResult.success).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
    expect(isSuccessResponse(stopResult)).toBe(true);

    const data = stopResult.data as RecorderStopData;
    const yaml = fs.readFileSync(data.path, 'utf-8');
    const steps = parseYamlSteps(yaml);

    const stepWithAnnotation = steps.find((s) => s.annotation);
    expect(stepWithAnnotation).toBeDefined();
    expect(stepWithAnnotation?.annotation?.type).toBe('login_check');
    expect(stepWithAnnotation?.annotation?.label).toBe('Login check');
    expect(stepWithAnnotation?.annotation?.selector).toBe('.user-avatar');

    try {
      fs.unlinkSync(data.path);
    } catch {/* empty */}
  });

  it('should add checkpoint type annotation', async () => {
    const page = browser.getPage();

    const startResult = await executeCommand(parseCliArgs(['recorder', 'start']), browser);
    expect(isSuccessResponse(startResult)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const clickResult = await executeCommand(parseCliArgs(['click', '#text-input']), browser);
    expect(clickResult.success).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Add checkpoint annotation
    const updateResult = await page.evaluate(async () => {
      const steps = (window as RecorderWindow).xyzQueue || [];
      if (steps.length === 0) {
        return { success: false, error: 'No steps in queue' };
      }

      const lastStep = steps[steps.length - 1];
      const annotation = { type: 'checkpoint', label: 'Checkpoint: Form filled' };

      lastStep.annotation = annotation;

      const bindingName = (window as RecorderWindow).xyzBindingName || 'xyzTrack';
      const trackFn = (window as RecorderWindow)[bindingName];
      if (typeof trackFn === 'function') {
        try {
          trackFn(
            JSON.stringify({
              action: 'xyzUpdate',
              id: lastStep.id,
              data: { annotation },
            })
          );
          return { success: true, stepId: lastStep.id };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      } else {
        return { success: false, error: 'xyzTrack function not available' };
      }
    });

    expect(updateResult.success).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
    expect(isSuccessResponse(stopResult)).toBe(true);

    const data = stopResult.data as RecorderStopData;
    const yaml = fs.readFileSync(data.path, 'utf-8');
    const steps = parseYamlSteps(yaml);

    const stepWithAnnotation = steps.find((s) => s.annotation);
    expect(stepWithAnnotation).toBeDefined();
    expect(stepWithAnnotation?.annotation?.type).toBe('checkpoint');
    expect(stepWithAnnotation?.annotation?.label).toBe('Checkpoint: Form filled');

    try {
      fs.unlinkSync(data.path);
    } catch {/* empty */}
  });

  it('should add custom type annotation', async () => {
    const page = browser.getPage();

    const startResult = await executeCommand(parseCliArgs(['recorder', 'start']), browser);
    expect(isSuccessResponse(startResult)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const clickResult = await executeCommand(parseCliArgs(['click', '#text-input']), browser);
    expect(clickResult.success).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Add custom annotation
    const updateResult = await page.evaluate(async () => {
      const steps = (window as RecorderWindow).xyzQueue || [];
      if (steps.length === 0) {
        return { success: false, error: 'No steps in queue' };
      }

      const lastStep = steps[steps.length - 1];
      const annotation = { type: 'custom', label: 'Custom note content' };

      lastStep.annotation = annotation;

      const bindingName = (window as RecorderWindow).xyzBindingName || 'xyzTrack';
      const trackFn = (window as RecorderWindow)[bindingName];
      if (typeof trackFn === 'function') {
        try {
          trackFn(
            JSON.stringify({
              action: 'xyzUpdate',
              id: lastStep.id,
              data: { annotation },
            })
          );
          return { success: true, stepId: lastStep.id };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      } else {
        return { success: false, error: 'xyzTrack function not available' };
      }
    });

    expect(updateResult.success).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
    expect(isSuccessResponse(stopResult)).toBe(true);

    const data = stopResult.data as RecorderStopData;
    const yaml = fs.readFileSync(data.path, 'utf-8');
    const steps = parseYamlSteps(yaml);

    const stepWithAnnotation = steps.find((s) => s.annotation);
    expect(stepWithAnnotation).toBeDefined();
    expect(stepWithAnnotation?.annotation?.type).toBe('custom');
    expect(stepWithAnnotation?.annotation?.label).toBe('Custom note content');

    try {
      fs.unlinkSync(data.path);
    } catch {/* empty */}
  });

  it('should verify time format is HH:MM:SS', async () => {
    const page = browser.getPage();

    const startResult = await executeCommand(parseCliArgs(['recorder', 'start']), browser);
    expect(isSuccessResponse(startResult)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const clickResult = await executeCommand(parseCliArgs(['click', '#text-input']), browser);
    expect(clickResult.success).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Add annotation
    await page.evaluate(async () => {
      const steps = (window as RecorderWindow).xyzQueue || [];
      if (steps.length === 0) return;

      const lastStep = steps[steps.length - 1];
      const annotation = { type: 'custom', label: 'Time format test' };

      lastStep.annotation = annotation;

      const bindingName = (window as RecorderWindow).xyzBindingName || 'xyzTrack';
      const trackFn = (window as RecorderWindow)[bindingName];
      if (typeof trackFn === 'function') {
        trackFn(
          JSON.stringify({
            action: 'xyzUpdate',
            id: lastStep.id,
            data: { annotation },
          })
        );
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
    expect(isSuccessResponse(stopResult)).toBe(true);

    const data = stopResult.data as RecorderStopData;
    const yaml = fs.readFileSync(data.path, 'utf-8');
    const steps = parseYamlSteps(yaml);

    // Verify time format is HH:MM:SS
    expect(steps.length).toBeGreaterThan(0);
    if (steps[0].time) {
      const timePattern = /^\d{2}:\d{2}:\d{2}$/;
      expect(timePattern.test(steps[0].time)).toBe(true);
      console.log('[Test] Time format verified:', steps[0].time);
    }

    try {
      fs.unlinkSync(data.path);
    } catch {/* empty */}
  });

  it('should maintain annotation independence across multiple steps', async () => {
    const page = browser.getPage();

    const startResult = await executeCommand(parseCliArgs(['recorder', 'start']), browser);
    expect(isSuccessResponse(startResult)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 1: Click and add wait_element annotation
    const clickResult1 = await executeCommand(parseCliArgs(['click', '#text-input']), browser);
    expect(clickResult1.success).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 300));

    await page.evaluate(async () => {
      const steps = (window as RecorderWindow).xyzQueue || [];
      const lastStep = steps[steps.length - 1];
      const annotation = { type: 'wait_element', label: 'Wait step 1' };
      lastStep.annotation = annotation;
      const bindingName = (window as RecorderWindow).xyzBindingName || 'xyzTrack';
      const trackFn = (window as RecorderWindow)[bindingName];
      if (typeof trackFn === 'function') {
        trackFn(
          JSON.stringify({
            action: 'xyzUpdate',
            id: lastStep.id,
            data: { annotation },
          })
        );
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Step 2: Another click and add checkpoint annotation
    const clickResult2 = await executeCommand(parseCliArgs(['click', '#password-input']), browser);
    expect(clickResult2.success).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 300));

    await page.evaluate(async () => {
      const steps = (window as RecorderWindow).xyzQueue || [];
      const lastStep = steps[steps.length - 1];
      const annotation = { type: 'checkpoint', label: 'Checkpoint step 2' };
      lastStep.annotation = annotation;
      const bindingName = (window as RecorderWindow).xyzBindingName || 'xyzTrack';
      const trackFn = (window as RecorderWindow)[bindingName];
      if (typeof trackFn === 'function') {
        trackFn(
          JSON.stringify({
            action: 'xyzUpdate',
            id: lastStep.id,
            data: { annotation },
          })
        );
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Step 3: Fill and add custom annotation
    const fillResult = await executeCommand(parseCliArgs(['fill', '#text-input', 'test']), browser);
    expect(fillResult.success).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 300));

    await page.evaluate(async () => {
      const steps = (window as RecorderWindow).xyzQueue || [];
      const lastStep = steps[steps.length - 1];
      const annotation = { type: 'custom', label: 'Custom step 3' };
      lastStep.annotation = annotation;
      const bindingName = (window as RecorderWindow).xyzBindingName || 'xyzTrack';
      const trackFn = (window as RecorderWindow)[bindingName];
      if (typeof trackFn === 'function') {
        trackFn(
          JSON.stringify({
            action: 'xyzUpdate',
            id: lastStep.id,
            data: { annotation },
          })
        );
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 500));

    const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
    expect(isSuccessResponse(stopResult)).toBe(true);

    const data = stopResult.data as RecorderStopData;
    const yaml = fs.readFileSync(data.path, 'utf-8');
    const steps = parseYamlSteps(yaml);

    // Verify each step has its own annotation
    const stepsWithAnnotations = steps.filter((s) => s.annotation);
    expect(stepsWithAnnotations.length).toBe(3);

    // Verify annotation types are independent
    const waitStep = steps.find((s) => s.annotation?.type === 'wait_element');
    const checkpointStep = steps.find((s) => s.annotation?.type === 'checkpoint');
    const customStep = steps.find((s) => s.annotation?.type === 'custom');

    expect(waitStep?.annotation?.label).toBe('Wait step 1');
    expect(checkpointStep?.annotation?.label).toBe('Checkpoint step 2');
    expect(customStep?.annotation?.label).toBe('Custom step 3');

    try {
      fs.unlinkSync(data.path);
    } catch {/* empty */}
  });

  it('should persist annotation after YAML reload', async () => {
    const page = browser.getPage();

    const startResult = await executeCommand(parseCliArgs(['recorder', 'start']), browser);
    expect(isSuccessResponse(startResult)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const clickResult = await executeCommand(parseCliArgs(['click', '#text-input']), browser);
    expect(clickResult.success).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Add data_container annotation with multiple fields
    const updateResult = await page.evaluate(async () => {
      const steps = (window as RecorderWindow).xyzQueue || [];
      if (steps.length === 0) {
        return { success: false, error: 'No steps in queue' };
      }

      const lastStep = steps[steps.length - 1];
      const annotation = {
        type: 'data_container',
        label: 'Product list container',
        selector: '.product-list',
        itemSelector: '.product-item',
      };

      lastStep.annotation = annotation;

      const bindingName = (window as RecorderWindow).xyzBindingName || 'xyzTrack';
      const trackFn = (window as RecorderWindow)[bindingName];
      if (typeof trackFn === 'function') {
        try {
          trackFn(
            JSON.stringify({
              action: 'xyzUpdate',
              id: lastStep.id,
              data: { annotation },
            })
          );
          return { success: true, stepId: lastStep.id, annotation };
        } catch (e) {
          return { success: false, error: String(e) };
        }
      } else {
        return { success: false, error: 'xyzTrack function not available' };
      }
    });

    expect(updateResult.success).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Stop recorder and get YAML
    const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
    expect(isSuccessResponse(stopResult)).toBe(true);

    const data = stopResult.data as RecorderStopData;
    const yamlPath = data.path;

    // Read YAML file
    const yaml = fs.readFileSync(yamlPath, 'utf-8');
    console.log('[Test] YAML content (first read):');
    console.log(yaml);

    // Parse and verify annotation is preserved
    const steps = parseYamlSteps(yaml);
    const stepWithAnnotation = steps.find((s) => s.annotation);

    expect(stepWithAnnotation).toBeDefined();
    expect(stepWithAnnotation?.annotation?.type).toBe('data_container');
    expect(stepWithAnnotation?.annotation?.label).toBe('Product list container');
    expect(stepWithAnnotation?.annotation?.selector).toBe('.product-list');
    expect(stepWithAnnotation?.annotation?.itemSelector).toBe('.product-item');

    // Re-read the file to verify persistence
    const yamlReloaded = fs.readFileSync(yamlPath, 'utf-8');
    const stepsReloaded = parseYamlSteps(yamlReloaded);

    const stepReloaded = stepsReloaded.find((s) => s.annotation);
    expect(stepReloaded).toBeDefined();
    expect(stepReloaded?.annotation?.type).toBe('data_container');
    expect(stepReloaded?.annotation?.label).toBe('Product list container');

    console.log('[Test] Annotation persisted after reload:', stepReloaded?.annotation);

    try {
      fs.unlinkSync(yamlPath);
    } catch {/* empty */}
  });
});
