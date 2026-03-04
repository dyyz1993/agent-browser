import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';
import type { RecorderStartData } from '../../types.js';
import { isSuccessResponse } from '../../types.js';
import * as fs from 'fs';

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
    const annotationTypeMatch = block.match(/type:\s*(\w+)/);
    const annotationLabelMatch = block.match(/label:\s*"([^"]*)"/);
    if (annotationTypeMatch && annotationLabelMatch) {
      step.annotation = {
        type: annotationTypeMatch[1],
        label: annotationLabelMatch[1],
      };
    }

    steps.push(step);
  }

  return steps;
}

describe('Recorder Annotation E2E Test', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({ action: 'launch', id: 'test-annotation-e2e', headless: true });
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

  it('should add annotation via panel UI buttons', async () => {
    const page = browser.getPage();

    // Step 1: Start recorder
    const startResult = await executeCommand(parseCliArgs(['recorder', 'start']), browser);
    expect(isSuccessResponse(startResult)).toBe(true);
    expect(isRecorderStartData(startResult.data)).toBe(true);

    // Wait for recorder panel to be injected
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 2: Perform an action to create a step
    const clickResult = await executeCommand(parseCliArgs(['click', '#text-input']), browser);
    expect(clickResult.success).toBe(true);

    // Wait for step to be recorded
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Step 3: Click on the step in the panel to select it
    await page.evaluate(() => {
      const stepEl = document.querySelector('.xyzStp');
      if (stepEl) {
        (stepEl as HTMLElement).click();
      }
    });

    // Wait for selection to take effect
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Step 4: Click on the "Note" tool button in the panel
    const annotationResult = await page.evaluate(() => {
      // Find the "custom" tool button
      const noteBtn = document.querySelector('.tool-btn[data-tool="custom"]') as HTMLButtonElement;
      if (!noteBtn) {
        return { success: false, error: 'Note button not found in panel' };
      }

      // Mock the prompt function since we can't interact with native prompts in headless mode
      const originalPrompt = window.prompt;
      let promptCalled = false;
      window.prompt = (message: string) => {
        promptCalled = true;
        return 'Test annotation from panel UI';
      };

      // Click the button
      noteBtn.click();

      // Restore original prompt
      window.prompt = originalPrompt;

      return { success: true, promptCalled };
    });

    console.log('[Test] Annotation result:', annotationResult);
    expect(annotationResult.success).toBe(true);

    // Wait for annotation to be processed
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Step 5: Verify annotation was added to the step in the frontend queue
    const queueResult = await page.evaluate(() => {
      const steps = (window as any).xyzQueue || [];
      const stepWithAnnotation = steps.find((s: any) => s.annotation);
      return {
        stepsCount: steps.length,
        hasAnnotation: !!stepWithAnnotation,
        annotation: stepWithAnnotation?.annotation,
      };
    });

    console.log('[Test] Queue result:', queueResult);
    expect(queueResult.hasAnnotation).toBe(true);
    expect(queueResult.annotation?.type).toBe('custom');
    expect(queueResult.annotation?.label).toBe('Test annotation from panel UI');

    // Step 6: Stop recorder
    const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
    expect(isSuccessResponse(stopResult)).toBe(true);

    const data = stopResult.data as any;
    expect(data.path).toBeDefined();
    console.log('[Test] YAML saved to:', data.path);

    // Step 7: Read YAML from file and verify
    const yaml = fs.readFileSync(data.path, 'utf-8');
    console.log('[Test] YAML content:');
    console.log(yaml);

    const steps = parseYamlSteps(yaml);
    console.log('[Test] Parsed steps count:', steps.length);

    // Find the step with annotation
    const stepWithAnnotation = steps.find((s) => s.annotation);
    console.log('[Test] Steps with annotations:', steps.filter((s) => s.annotation).length);
    console.log('[Test] Step with annotation:', stepWithAnnotation);

    // Verify annotation is preserved
    expect(stepWithAnnotation).toBeDefined();
    expect(stepWithAnnotation?.annotation?.type).toBe('custom');
    expect(stepWithAnnotation?.annotation?.label).toBe('Test annotation from panel UI');

    // Clean up temp file
    try {
      fs.unlinkSync(data.path);
    } catch {}
  });

  it('should preserve annotation in YAML when added via xyzUpdate event', async () => {
    const page = browser.getPage();

    // Step 1: Start recorder
    const startResult = await executeCommand(parseCliArgs(['recorder', 'start']), browser);
    expect(isSuccessResponse(startResult)).toBe(true);
    expect(isRecorderStartData(startResult.data)).toBe(true);

    // Wait for recorder panel to be injected
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 2: Perform an action to create a step
    const clickResult = await executeCommand(parseCliArgs(['click', '#text-input']), browser);
    expect(clickResult.success).toBe(true);

    // Wait for step to be recorded
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Step 3: Verify step was recorded
    const statusResult = await executeCommand(parseCliArgs(['recorder', 'status']), browser);
    if (
      isSuccessResponse(statusResult) &&
      statusResult.data &&
      typeof statusResult.data === 'object'
    ) {
      const stepsCount = (statusResult.data as any).steps || 0;
      console.log('[Test] Steps count:', stepsCount);
    }

    // Step 4: Send xyzUpdate event to add annotation
    const updateResult = await page.evaluate(async () => {
      const steps = (window as any).xyzQueue || [];
      if (steps.length === 0) {
        return { success: false, error: 'No steps in queue' };
      }

      const lastStep = steps[steps.length - 1];
      const annotation = { type: 'custom', label: 'Test Annotation from E2E Test' };

      // Update the step in the frontend queue
      lastStep.annotation = annotation;

      // Send xyzUpdate event to backend
      const bindingName = (window as any).xyzBindingName || 'xyzTrack';
      const trackFn = (window as any)[bindingName];
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

    console.log('[Test] Update result:', updateResult);
    expect(updateResult.success).toBe(true);

    // Wait for the update to be processed
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Step 5: Stop recorder - now saves to temp file by default
    const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);

    expect(isSuccessResponse(stopResult)).toBe(true);

    const data = stopResult.data as any;
    expect(data.path).toBeDefined();
    console.log('[Test] YAML saved to:', data.path);

    // Step 6: Read YAML from file and verify
    const yaml = fs.readFileSync(data.path, 'utf-8');
    console.log('[Test] YAML content:');
    console.log(yaml);

    const steps = parseYamlSteps(yaml);
    console.log('[Test] Parsed steps count:', steps.length);

    // Find the step with annotation
    const stepWithAnnotation = steps.find((s) => s.annotation);
    console.log('[Test] Steps with annotations:', steps.filter((s) => s.annotation).length);
    console.log('[Test] Step with annotation:', stepWithAnnotation);

    // Verify annotation is preserved
    expect(stepWithAnnotation).toBeDefined();
    expect(stepWithAnnotation?.annotation?.type).toBe('custom');
    expect(stepWithAnnotation?.annotation?.label).toBe('Test Annotation from E2E Test');

    // Verify click action does NOT have URL (only navigation actions should have URL)
    const clickStep = steps.find((s) => s.action === 'click');
    expect(clickStep?.url).toBeUndefined();
    console.log('[Test] Click step URL (should be undefined):', clickStep?.url);

    // Verify time format is HH:MM:SS (not ISO)
    if (steps.length > 0 && steps[0].time) {
      const timePattern = /^\d{2}:\d{2}:\d{2}$/;
      expect(timePattern.test(steps[0].time)).toBe(true);
      console.log('[Test] Time format verified:', steps[0].time);
    }

    // Clean up temp file
    try {
      fs.unlinkSync(data.path);
    } catch {}
  });
});
