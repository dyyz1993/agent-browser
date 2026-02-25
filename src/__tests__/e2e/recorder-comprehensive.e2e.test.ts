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
  points?: Array<{ x: number; y: number; t: number }>;
  x?: number;
  y?: number;
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

    const pointsMatch = block.match(/points:\s*(\[.*?\])/s);
    if (pointsMatch) {
      try {
        step.points = JSON.parse(pointsMatch[1]);
      } catch {}
    }

    const xMatch = block.match(/x:\s*(-?\d+)/);
    if (xMatch) step.x = parseInt(xMatch[1], 10);

    const yMatch = block.match(/y:\s*(-?\d+)/);
    if (yMatch) step.y = parseInt(yMatch[1], 10);

    steps.push(step);
  }

  return steps;
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
    it('should record single click', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      const clickResult = await executeCommand(parseCliArgs(['click', '#click-btn']), browser);
      expect(clickResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 200));

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

    it('should record double click', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      const dblclickResult = await executeCommand(
        parseCliArgs(['dblclick', '#dblclick-btn']),
        browser
      );
      expect(dblclickResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 200));

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

    it('should record hover event', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      const hoverResult = await executeCommand(parseCliArgs(['hover', '#hover-btn']), browser);
      expect(hoverResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        expect(steps.length).toBeGreaterThan(0);
      }
    });

    it('should record right click (context menu)', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(
        parseCliArgs(['click', '#rightclick-btn', '--button', 'right']),
        browser
      );

      await new Promise((resolve) => setTimeout(resolve, 200));

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

      await new Promise((resolve) => setTimeout(resolve, 200));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const fillStep = steps.find((s) => s.action === 'fill' && s.value?.includes('Hello World'));
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

      await new Promise((resolve) => setTimeout(resolve, 200));

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

      await new Promise((resolve) => setTimeout(resolve, 200));

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

      await new Promise((resolve) => setTimeout(resolve, 200));

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

      await new Promise((resolve) => setTimeout(resolve, 200));

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

      await new Promise((resolve) => setTimeout(resolve, 200));

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

      const clickResult = await executeCommand(parseCliArgs(['click', '#radio-option1']), browser);
      expect(clickResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const clickStep = steps.find((s) => s.action === 'click' && s.selector?.includes('radio'));
        expect(clickStep).toBeDefined();
      }
    });

    it('should record submit button click', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      const clickResult = await executeCommand(parseCliArgs(['click', '#submit-btn']), browser);
      expect(clickResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 200));

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

  describe('4. Scroll Events', () => {
    it('should record scroll event', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      const scrollResult = await executeCommand(
        parseCliArgs(['scroll', '#scroll-container', '0', '300']),
        browser
      );
      expect(scrollResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 300));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const scrollStep = steps.find((s) => s.action === 'scroll');
        expect(scrollStep).toBeDefined();
        expect(scrollStep?.y).toBeGreaterThan(0);
      }
    });

    it('should record click after scroll', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(parseCliArgs(['scroll', '#scroll-container', '0', '400']), browser);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const clickResult = await executeCommand(
        parseCliArgs(['click', '#scrolled-button']),
        browser
      );
      expect(clickResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        expect(steps.filter((s) => s.action === 'scroll').length).toBeGreaterThan(0);
        expect(steps.filter((s) => s.action === 'click').length).toBeGreaterThan(0);
      }
    });
  });

  describe('5. Navigation Events', () => {
    it('should record anchor link click', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      const clickResult = await executeCommand(parseCliArgs(['click', '#anchor-link']), browser);
      expect(clickResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 200));

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

      await new Promise((resolve) => setTimeout(resolve, 200));

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
  });

  describe('6. Modal Dialog', () => {
    it('should record modal open and close', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(parseCliArgs(['click', '#open-modal-btn']), browser);
      await new Promise((resolve) => setTimeout(resolve, 100));

      await executeCommand(parseCliArgs(['click', '#modal-confirm']), browser);
      await new Promise((resolve) => setTimeout(resolve, 100));

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
        parseCliArgs(['click', '#same-origin-iframe >> #iframe-btn-1']),
        browser
      );
      expect(clickResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 200));

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
        parseCliArgs(['fill', '#same-origin-iframe >> #iframe-input-1', 'iframe text']),
        browser
      );
      expect(fillResult.success).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        expect(steps.length).toBeGreaterThan(0);
      }
    });
  });

  describe('8. Trajectory Recording', () => {
    it('should record mouse trajectory', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(parseCliArgs(['mousemove', '100', '200']), browser);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await executeCommand(parseCliArgs(['mousemove', '200', '300']), browser);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await executeCommand(parseCliArgs(['mousemove', '300', '400']), browser);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const trajectorySteps = steps.filter((s) => s.action === 'trajectory');
        expect(trajectorySteps.length).toBeGreaterThan(0);

        const firstTrajectory = trajectorySteps[0];
        if (firstTrajectory.points) {
          expect(firstTrajectory.points.length).toBeGreaterThan(0);
          expect(firstTrajectory.points[0]).toHaveProperty('x');
          expect(firstTrajectory.points[0]).toHaveProperty('y');
          expect(firstTrajectory.points[0]).toHaveProperty('t');
        }
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

      await new Promise((resolve) => setTimeout(resolve, 300));

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

    it('should record navigation and interaction sequence', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(parseCliArgs(['click', '#click-btn']), browser);
      await executeCommand(parseCliArgs(['hover', '#hover-btn']), browser);
      await executeCommand(parseCliArgs(['fill', '#type-input', 'test']), browser);
      await executeCommand(parseCliArgs(['scroll', '#scroll-container', '0', '200']), browser);

      await new Promise((resolve) => setTimeout(resolve, 300));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        expect(steps.length).toBeGreaterThanOrEqual(3);

        const actionTypes = new Set(steps.map((s) => s.action));
        expect(actionTypes.size).toBeGreaterThan(1);
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
      await new Promise((resolve) => setTimeout(resolve, 200));

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
      await new Promise((resolve) => setTimeout(resolve, 200));

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

    it('should include pages section when pages are visited', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(parseCliArgs(['click', '#click-btn']), browser);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const yaml = stopResult.data.yaml;
        expect(yaml).toContain('pages:');
        expect(yaml).toContain('url:');
      }
    });

    it('should include selector and xpath in click steps', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(parseCliArgs(['click', '#click-btn']), browser);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const clickStep = steps.find((s) => s.action === 'click');

        expect(clickStep).toBeDefined();
        expect(clickStep?.selector).toBeDefined();
        expect(clickStep?.xpath).toBeDefined();
      }
    });

    it('should include value in fill steps', async () => {
      await executeCommand(parseCliArgs(['recorder', 'start']), browser);

      await executeCommand(parseCliArgs(['fill', '#type-input', 'test value']), browser);
      await new Promise((resolve) => setTimeout(resolve, 200));

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
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      await new Promise((resolve) => setTimeout(resolve, 200));

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

      await new Promise((resolve) => setTimeout(resolve, 200));

      const stopResult = await executeCommand(parseCliArgs(['recorder', 'stop']), browser);
      expect(stopResult.success).toBe(true);

      if (isSuccessResponse(stopResult) && isRecorderStopData(stopResult.data)) {
        const steps = parseYamlSteps(stopResult.data.yaml);
        const fillStep = steps.find((s) => s.action === 'fill');
        expect(fillStep).toBeDefined();
      }
    });
  });
});
