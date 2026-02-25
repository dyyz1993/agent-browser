import { describe, it, expect } from 'vitest';

describe('Recorder Unit Tests', () => {
  describe('YAML Generation', () => {
    it('should generate valid YAML format', () => {
      const steps = [
        {
          id: 'step-1',
          timestamp: 1709000001000,
          action: 'fill',
          selector: '#username',
          value: 'testuser',
        },
        { id: 'step-2', timestamp: 1709000002000, action: 'click', selector: '#btn-primary' },
        {
          id: 'step-3',
          timestamp: 1709000003000,
          action: 'trajectory',
          points: [{ x: 100, y: 200, t: 1709000002500 }],
        },
      ];

      const yaml = generateYaml('session-123', 1709000000000, 1709000004000, steps);

      expect(yaml).toContain('session:');
      expect(yaml).toContain('id: session-123');
      expect(yaml).toContain('startTime: 2024-02');
      expect(yaml).toContain('endTime: 2024-02');
      expect(yaml).toContain('steps: 3');
      expect(yaml).toContain('steps:');
      expect(yaml).toContain('action: fill');
      expect(yaml).toContain('action: click');
      expect(yaml).toContain('action: trajectory');
      expect(yaml).toContain('selector: "#username"');
      expect(yaml).toContain('value: "testuser"');
      expect(yaml).toContain('points:');
    });

    it('should handle special characters in YAML', () => {
      const steps = [
        {
          id: 'step-1',
          timestamp: 1709000001000,
          action: 'fill',
          selector: '#input',
          value: 'test "quotes" and \\backslash',
        },
      ];

      const yaml = generateYaml('session-123', 1709000000000, 1709000004000, steps);

      expect(yaml).toContain('value: "test \\"quotes\\" and \\\\backslash"');
    });

    it('should handle empty steps', () => {
      const yaml = generateYaml('session-123', 1709000000000, 1709000004000, []);

      expect(yaml).toContain('steps: 0');
      expect(yaml).toContain('steps:');
    });
  });

  describe('Step Types', () => {
    it('should format click step correctly', () => {
      const step = {
        id: 'step-1',
        timestamp: 1709000001000,
        action: 'click',
        selector: '#btn',
        xpath: '//*[@id="btn"]',
      };
      const yaml = formatStep(step);

      expect(yaml).toContain('action: click');
      expect(yaml).toContain('selector: "#btn"');
      expect(yaml).toContain('xpath: "//*[@id=\\"btn\\"]"');
    });

    it('should format fill step correctly', () => {
      const step = {
        id: 'step-1',
        timestamp: 1709000001000,
        action: 'fill',
        selector: '#input',
        value: 'hello',
      };
      const yaml = formatStep(step);

      expect(yaml).toContain('action: fill');
      expect(yaml).toContain('value: "hello"');
    });

    it('should format scroll step correctly', () => {
      const step = { id: 'step-1', timestamp: 1709000001000, action: 'scroll', x: 0, y: 500 };
      const yaml = formatStep(step);

      expect(yaml).toContain('action: scroll');
      expect(yaml).toContain('x: 0');
      expect(yaml).toContain('y: 500');
    });

    it('should format resize step correctly', () => {
      const step = {
        id: 'step-1',
        timestamp: 1709000001000,
        action: 'resize',
        from: { width: 1920, height: 1080 },
        to: { width: 1280, height: 720 },
      };
      const yaml = formatStep(step);

      expect(yaml).toContain('action: resize');
      expect(yaml).toContain('from: { width: 1920, height: 1080 }');
      expect(yaml).toContain('to: { width: 1280, height: 720 }');
    });

    it('should format trajectory step correctly', () => {
      const step = {
        id: 'step-1',
        timestamp: 1709000001000,
        action: 'trajectory',
        points: [
          { x: 100, y: 200, t: 1709000000500 },
          { x: 150, y: 250, t: 1709000000600 },
        ],
      };
      const yaml = formatStep(step);

      expect(yaml).toContain('action: trajectory');
      expect(yaml).toContain('points:');
      expect(yaml).toContain('"x":100');
      expect(yaml).toContain('"y":200');
    });

    it('should format tab_new step correctly', () => {
      const step = {
        id: 'step-1',
        timestamp: 1709000001000,
        action: 'tab_new',
        url: 'about:blank',
      };
      const yaml = formatStep(step);

      expect(yaml).toContain('action: tab_new');
    });

    it('should format tab_switch step correctly', () => {
      const step = { id: 'step-1', timestamp: 1709000001000, action: 'tab_switch', index: 0 };
      const yaml = formatStep(step);

      expect(yaml).toContain('action: tab_switch');
      expect(yaml).toContain('index: 0');
    });

    it('should format tab_close step correctly', () => {
      const step = { id: 'step-1', timestamp: 1709000001000, action: 'tab_close', index: 1 };
      const yaml = formatStep(step);

      expect(yaml).toContain('action: tab_close');
      expect(yaml).toContain('index: 1');
    });

    it('should format back step correctly', () => {
      const step = { id: 'step-1', timestamp: 1709000001000, action: 'back' };
      const yaml = formatStep(step);

      expect(yaml).toContain('action: back');
    });

    it('should format forward step correctly', () => {
      const step = { id: 'step-1', timestamp: 1709000001000, action: 'forward' };
      const yaml = formatStep(step);

      expect(yaml).toContain('action: forward');
    });

    it('should format reload step correctly', () => {
      const step = { id: 'step-1', timestamp: 1709000001000, action: 'reload' };
      const yaml = formatStep(step);

      expect(yaml).toContain('action: reload');
    });

    it('should format keyboard step correctly', () => {
      const step = {
        id: 'step-1',
        timestamp: 1709000001000,
        action: 'keyboard',
        key: 'Enter',
        selector: '#input',
      };
      const yaml = formatStep(step);

      expect(yaml).toContain('action: keyboard');
      expect(yaml).toContain('key: "Enter"');
      expect(yaml).toContain('selector: "#input"');
    });
  });

  describe('New Action Types', () => {
    it('should generate YAML with tab operations', () => {
      const steps = [
        { id: 'step-1', timestamp: 1709000001000, action: 'tab_new' },
        { id: 'step-2', timestamp: 1709000002000, action: 'tab_switch', index: 0 },
        { id: 'step-3', timestamp: 1709000003000, action: 'tab_close', index: 1 },
      ];

      const yaml = generateYaml('session-123', 1709000000000, 1709000004000, steps);

      expect(yaml).toContain('action: tab_new');
      expect(yaml).toContain('action: tab_switch');
      expect(yaml).toContain('action: tab_close');
      expect(yaml).toContain('index: 0');
      expect(yaml).toContain('index: 1');
    });

    it('should generate YAML with navigation operations', () => {
      const steps = [
        { id: 'step-1', timestamp: 1709000001000, action: 'back' },
        { id: 'step-2', timestamp: 1709000002000, action: 'forward' },
        { id: 'step-3', timestamp: 1709000003000, action: 'reload' },
      ];

      const yaml = generateYaml('session-123', 1709000000000, 1709000004000, steps);

      expect(yaml).toContain('action: back');
      expect(yaml).toContain('action: forward');
      expect(yaml).toContain('action: reload');
    });

    it('should generate YAML with keyboard operations', () => {
      const steps = [
        { id: 'step-1', timestamp: 1709000001000, action: 'keyboard', key: 'Enter' },
        { id: 'step-2', timestamp: 1709000002000, action: 'keyboard', key: 'Tab' },
        { id: 'step-3', timestamp: 1709000003000, action: 'keyboard', key: 'Escape' },
      ];

      const yaml = generateYaml('session-123', 1709000000000, 1709000004000, steps);

      expect(yaml).toContain('action: keyboard');
      expect(yaml).toContain('key: "Enter"');
      expect(yaml).toContain('key: "Tab"');
      expect(yaml).toContain('key: "Escape"');
    });

    it('should generate YAML with mixed action types', () => {
      const steps = [
        { id: 'step-1', timestamp: 1709000001000, action: 'click', selector: '#btn' },
        {
          id: 'step-2',
          timestamp: 1709000002000,
          action: 'fill',
          selector: '#input',
          value: 'test',
        },
        { id: 'step-3', timestamp: 1709000003000, action: 'keyboard', key: 'Enter' },
        { id: 'step-4', timestamp: 1709000004000, action: 'tab_new' },
        { id: 'step-5', timestamp: 1709000005000, action: 'back' },
      ];

      const yaml = generateYaml('session-123', 1709000000000, 1709000006000, steps);

      expect(yaml).toContain('action: click');
      expect(yaml).toContain('action: fill');
      expect(yaml).toContain('action: keyboard');
      expect(yaml).toContain('action: tab_new');
      expect(yaml).toContain('action: back');
    });
  });
});

function generateYaml(sessionId: string, startTime: number, endTime: number, steps: any[]): string {
  const lines: string[] = [];

  lines.push('session:');
  lines.push(`  id: ${sessionId}`);
  lines.push(`  startTime: ${new Date(startTime).toISOString()}`);
  lines.push(`  endTime: ${new Date(endTime).toISOString()}`);
  lines.push(`  steps: ${steps.length}`);
  lines.push('');
  lines.push('steps:');

  for (const step of steps) {
    lines.push(formatStep(step));
  }

  return lines.join('\n');
}

function formatStep(step: any): string {
  const lines: string[] = [];

  lines.push(`  - id: ${step.id}`);
  lines.push(`    timestamp: ${new Date(step.timestamp).toISOString()}`);
  lines.push(`    action: ${step.action}`);

  if (step.selector) {
    lines.push(`    selector: "${escapeYaml(step.selector)}"`);
  }
  if (step.xpath) {
    lines.push(`    xpath: "${escapeYaml(step.xpath)}"`);
  }
  if (step.value) {
    lines.push(`    value: "${escapeYaml(step.value)}"`);
  }
  if (step.points) {
    lines.push(`    points: ${JSON.stringify(step.points)}`);
  }
  if (step.x !== undefined) {
    lines.push(`    x: ${step.x}`);
  }
  if (step.y !== undefined) {
    lines.push(`    y: ${step.y}`);
  }
  if (step.from) {
    lines.push(`    from: { width: ${step.from.width}, height: ${step.from.height} }`);
  }
  if (step.to) {
    lines.push(`    to: { width: ${step.to.width}, height: ${step.to.height} }`);
  }
  if (step.index !== undefined) {
    lines.push(`    index: ${step.index}`);
  }
  if (step.key) {
    lines.push(`    key: "${step.key}"`);
  }
  if (step.url) {
    lines.push(`    url: "${step.url}"`);
  }

  lines.push('');
  return lines.join('\n');
}

function escapeYaml(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
