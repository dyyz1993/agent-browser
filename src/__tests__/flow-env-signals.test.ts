import { describe, it, expect } from 'vitest';
import type { FlowStep } from '../flow/types.js';
import { recorderToFlow } from '../flow/recorder-to-flow.js';
import type { RecorderYaml, RecorderStep } from '../flow/recorder-to-flow.js';

describe('Environment Signal Conversion', () => {
  describe('url_change signal', () => {
    it('should convert url_change environment_signal to a wait step with waitCondition', () => {
      const recorderYaml: RecorderYaml = {
        session: { id: 's1', startTime: '', endTime: '', steps: 1 },
        steps: [
          {
            id: 'env-1',
            action: 'environment_signal',
            signalType: 'url_change',
            data: { url: 'https://example.com/dashboard', timeout: 5000 },
          },
        ],
      };
      const result = recorderToFlow(recorderYaml, { siteName: 'test' });
      const flow = result.site.flows[Object.keys(result.site.flows)[0]];
      const step = flow.steps[0];

      expect(step.action).toBe('wait');
      expect(step.waitCondition).toBe('url_change');
      expect(step.waitUrlPattern).toBe('https://example.com/dashboard');
      expect(step.timeout).toBe(5000);
    });

    it('should use step.url as fallback when data.url is absent', () => {
      const recorderYaml: RecorderYaml = {
        session: { id: 's2', startTime: '', endTime: '', steps: 1 },
        steps: [
          {
            id: 'env-2',
            action: 'environment_signal',
            signalType: 'url_change',
            url: 'https://example.com/profile',
          },
        ],
      };
      const result = recorderToFlow(recorderYaml, { siteName: 'test' });
      const step = result.site.flows[Object.keys(result.site.flows)[0]].steps[0];

      expect(step.waitUrlPattern).toBe('https://example.com/profile');
    });
  });

  describe('dom_stable signal', () => {
    it('should convert dom_stable environment_signal to a wait step', () => {
      const recorderYaml: RecorderYaml = {
        session: { id: 's3', startTime: '', endTime: '', steps: 1 },
        steps: [
          {
            id: 'env-3',
            action: 'environment_signal',
            signalType: 'dom_stable',
            data: { timeout: 800 },
          },
        ],
      };
      const result = recorderToFlow(recorderYaml, { siteName: 'test' });
      const step = result.site.flows[Object.keys(result.site.flows)[0]].steps[0];

      expect(step.action).toBe('wait');
      expect(step.waitCondition).toBe('dom_stable');
      expect(step.waitDomStableTimeout).toBe(800);
    });

    it('should default waitDomStableTimeout to 500 when data.timeout is absent', () => {
      const recorderYaml: RecorderYaml = {
        session: { id: 's4', startTime: '', endTime: '', steps: 1 },
        steps: [
          {
            id: 'env-4',
            action: 'environment_signal',
            signalType: 'dom_stable',
          },
        ],
      };
      const result = recorderToFlow(recorderYaml, { siteName: 'test' });
      const step = result.site.flows[Object.keys(result.site.flows)[0]].steps[0];

      expect(step.waitDomStableTimeout).toBe(500);
    });
  });

  describe('unknown signalType', () => {
    it('should be silently skipped (no step generated)', () => {
      const recorderYaml: RecorderYaml = {
        session: { id: 's5', startTime: '', endTime: '', steps: 1 },
        steps: [
          {
            id: 'env-5',
            action: 'environment_signal',
            signalType: 'network_idle' as any,
          },
        ],
      };
      const result = recorderToFlow(recorderYaml, { siteName: 'test' });
      const flow = result.site.flows[Object.keys(result.site.flows)[0]];

      expect(flow.steps).toHaveLength(0);
    });
  });

  describe('environment_signal mixed with regular steps', () => {
    it('should interleave converted signals correctly among regular steps', () => {
      const recorderYaml: RecorderYaml = {
        session: { id: 's6', startTime: '', endTime: '', steps: 4 },
        steps: [
          { id: 'nav-1', action: 'navigate', url: 'https://example.com/login' },
          {
            id: 'env-6a',
            action: 'environment_signal',
            signalType: 'dom_stable',
            data: { timeout: 300 },
          },
          { id: 'fill-1', action: 'fill', selector: '#user', value: 'admin' },
          {
            id: 'env-6b',
            action: 'environment_signal',
            signalType: 'url_change',
            data: { url: 'https://example.com/home' },
          },
        ],
      };
      const result = recorderToFlow(recorderYaml, { siteName: 'test' });
      const steps = result.site.flows[Object.keys(result.site.flows)[0]].steps;

      expect(steps).toHaveLength(4);
      expect(steps[0].action).toBe('navigate');
      expect(steps[1].action).toBe('wait');
      expect(steps[1].waitCondition).toBe('dom_stable');
      expect(steps[2].action).toBe('fill');
      expect(steps[3].action).toBe('wait');
      expect(steps[3].waitCondition).toBe('url_change');
    });
  });

  describe('signalType field on FlowStep', () => {
    it('should not exist on FlowStep (backward compat: waitCondition used instead)', () => {
      const step: FlowStep = {
        id: 'step-1',
        action: 'click',
        selector: '#btn',
      };
      expect((step as any).signalType).toBeUndefined();
    });
  });

  describe('waitCondition and related fields', () => {
    it('should accept url_change as waitCondition', () => {
      const step: FlowStep = {
        id: 'w1',
        action: 'wait',
        waitCondition: 'url_change',
        waitUrlPattern: '/dashboard',
        timeout: 10000,
      };
      expect(step.waitCondition).toBe('url_change');
      expect(step.waitUrlPattern).toBe('/dashboard');
    });

    it('should accept dom_stable as waitCondition', () => {
      const step: FlowStep = {
        id: 'w2',
        action: 'wait',
        waitCondition: 'dom_stable',
        waitDomStableTimeout: 2000,
      };
      expect(step.waitCondition).toBe('dom_stable');
      expect(step.waitDomStableTimeout).toBe(2000);
    });

    it('should leave waitCondition undefined for regular wait steps', () => {
      const step: FlowStep = {
        id: 'w3',
        action: 'wait',
        timeout: 5000,
      };
      expect(step.waitCondition).toBeUndefined();
    });
  });
});
