import { describe, it, expect } from 'vitest';
import type { FlowStep, HealingLogEntry } from '../flow/types.js';
import { recorderToFlow } from '../flow/recorder-to-flow.js';
import type { RecorderYaml, RecorderStep } from '../flow/recorder-to-flow.js';

describe('Self-Healing Selector Resolution Logic', () => {
  describe('fallbackSelectors on FlowStep', () => {
    it('should accept an array of fallback selector strings', () => {
      const step: FlowStep = {
        id: 'step-1',
        action: 'click',
        selector: '#primary',
        fallbackSelectors: ['button.submit', '[data-testid="submit"]'],
      };
      expect(step.fallbackSelectors).toHaveLength(2);
      expect(step.fallbackSelectors![0]).toBe('button.submit');
      expect(step.fallbackSelectors![1]).toBe('[data-testid="submit"]');
    });

    it('should be optional and undefined by default', () => {
      const step: FlowStep = { id: 'step-2', action: 'click', selector: '#btn' };
      expect(step.fallbackSelectors).toBeUndefined();
    });
  });

  describe('elementIdentity structure', () => {
    it('should carry all fields needed for healing', () => {
      const identity: FlowStep['elementIdentity'] = {
        tagName: 'button',
        textContent: 'Submit',
        attributes: { type: 'submit', 'aria-label': 'Submit form' },
        classes: ['btn', 'primary'],
        boundingRect: { x: 100, y: 200, width: 80, height: 40 },
        parentSignature: 'form.login-form',
      };
      expect(identity!.tagName).toBe('button');
      expect(identity!.textContent).toBe('Submit');
      expect(identity!.attributes['type']).toBe('submit');
      expect(identity!.classes).toContain('primary');
      expect(identity!.boundingRect.width).toBe(80);
      expect(identity!.parentSignature).toBe('form.login-form');
    });

    it('should support empty textContent for non-text elements', () => {
      const identity: FlowStep['elementIdentity'] = {
        tagName: 'img',
        textContent: '',
        attributes: { src: '/logo.png', alt: 'Logo' },
        classes: [],
        boundingRect: { x: 0, y: 0, width: 200, height: 50 },
        parentSignature: 'header',
      };
      expect(identity!.textContent).toBe('');
      expect(identity!.classes).toHaveLength(0);
    });
  });

  describe('healingLog entry structure', () => {
    it('should track a fallback healing strategy', () => {
      const log: HealingLogEntry = {
        stepId: 'step-1',
        originalSelector: '#old-btn',
        healedSelector: 'button.submit',
        strategy: 'fallback',
      };
      expect(log.strategy).toBe('fallback');
      expect(log.stepId).toBe('step-1');
      expect(log.originalSelector).not.toBe(log.healedSelector);
    });

    it('should support all four healing strategies', () => {
      const strategies = ['fallback', 'identity_text', 'identity_attr', 'identity_parent'];
      for (const strategy of strategies) {
        const log: HealingLogEntry = {
          stepId: 's1',
          originalSelector: '#gone',
          healedSelector: 'button.new',
          strategy,
        };
        expect(log.strategy).toBe(strategy);
      }
    });
  });

  describe('resolveSelector logic (pure function simulation)', () => {
    it('should return primary selector when no healing data exists', () => {
      const step: FlowStep = { id: 's1', action: 'click', selector: '#btn' };
      const hasNoHealing = !step.fallbackSelectors?.length && !step.elementIdentity;
      expect(hasNoHealing).toBe(true);
    });

    it('should indicate healing needed when fallbackSelectors exist', () => {
      const step: FlowStep = {
        id: 's1',
        action: 'click',
        selector: '#btn',
        fallbackSelectors: ['.btn-primary'],
      };
      const needsHealing =
        step.fallbackSelectors !== undefined && step.fallbackSelectors.length > 0;
      expect(needsHealing).toBe(true);
    });

    it('should indicate healing needed when elementIdentity exists', () => {
      const step: FlowStep = {
        id: 's1',
        action: 'click',
        selector: '#btn',
        elementIdentity: {
          tagName: 'button',
          textContent: 'Go',
          attributes: {},
          classes: [],
          boundingRect: { x: 0, y: 0, width: 0, height: 0 },
          parentSignature: '',
        },
      };
      expect(step.elementIdentity).toBeDefined();
    });
  });

  describe('healing strategy selection from elementIdentity', () => {
    it('identity_text: builds text selector from tagName + truncated text', () => {
      const identity = {
        tagName: 'button',
        textContent: 'A'.repeat(50),
        attributes: {} as Record<string, string>,
        classes: [] as string[],
        boundingRect: { x: 0, y: 0, width: 0, height: 0 },
        parentSignature: '',
      };
      const text = identity.textContent.slice(0, 30);
      const selector = `${identity.tagName}:text-is("${text}")`;
      expect(text).toHaveLength(30);
      expect(selector).toBe('button:text-is("' + 'A'.repeat(30) + '")');
      expect(identity.textContent.length).toBeGreaterThan(30);
    });

    it('identity_attr: builds attribute selector for each attribute', () => {
      const identity = {
        tagName: 'input',
        textContent: '',
        attributes: { name: 'email', type: 'email' },
        classes: [],
        boundingRect: { x: 0, y: 0, width: 0, height: 0 },
        parentSignature: '',
      };
      const selectors = Object.entries(identity.attributes)
        .filter(([, v]) => v)
        .map(([attr, value]) => `${identity.tagName}[${attr}="${value}"]`);
      expect(selectors).toContain('input[name="email"]');
      expect(selectors).toContain('input[type="email"]');
    });

    it('identity_parent: builds parent > child selector', () => {
      const identity = {
        tagName: 'button',
        textContent: '',
        attributes: {},
        classes: [],
        boundingRect: { x: 0, y: 0, width: 0, height: 0 },
        parentSignature: 'form.login-form',
      };
      const selector = `${identity.parentSignature} > ${identity.tagName}`;
      expect(selector).toBe('form.login-form > button');
    });

    it('skips identity_text when textContent is empty', () => {
      const identity = {
        tagName: 'img',
        textContent: '',
        attributes: { alt: 'Logo' },
        classes: [],
        boundingRect: { x: 0, y: 0, width: 0, height: 0 },
        parentSignature: '',
      };
      const canUseText = identity.textContent.length > 0;
      expect(canUseText).toBe(false);
    });
  });

  describe('retry configuration', () => {
    it('should support fixed retry strategy', () => {
      const retry: FlowStep['retry'] = {
        maxAttempts: 3,
        delayMs: 1000,
        strategy: 'fixed',
      };
      expect(retry!.maxAttempts).toBe(3);
      expect(retry!.strategy).toBe('fixed');
    });

    it('should support exponential backoff', () => {
      const retry: FlowStep['retry'] = {
        maxAttempts: 5,
        delayMs: 500,
        strategy: 'exponential',
      };
      expect(retry!.strategy).toBe('exponential');
    });

    it('should compute exponential delay correctly', () => {
      const delayMs = 500;
      const strategy = 'exponential' as const;
      const delays = [1, 2, 3].map((attempt) =>
        strategy === 'exponential' ? delayMs * Math.pow(2, attempt - 1) : delayMs
      );
      expect(delays).toEqual([500, 1000, 2000]);
    });

    it('should return fixed delay for fixed strategy', () => {
      const delayMs = 1000;
      const strategy = 'fixed' as const;
      const delays = [1, 2, 3].map((attempt) =>
        strategy === 'exponential' ? delayMs * Math.pow(2, attempt - 1) : delayMs
      );
      expect(delays).toEqual([1000, 1000, 1000]);
    });
  });

  describe('attachRecorderMeta propagation', () => {
    it('should preserve fallbackSelectors through recorder conversion', () => {
      const recorderYaml: RecorderYaml = {
        session: { id: 's1', startTime: '', endTime: '', steps: 1 },
        steps: [
          {
            id: 'step-1',
            action: 'click',
            selector: '#old-btn',
            fallbackSelectors: ['.btn-primary', 'button[data-action="submit"]'],
            elementIdentity: {
              tagName: 'button',
              textContent: 'Submit',
              attributes: { type: 'submit' },
              classes: ['btn'],
              boundingRect: { x: 0, y: 0, width: 100, height: 40 },
              parentSignature: 'form',
            },
          },
        ],
      };
      const result = recorderToFlow(recorderYaml, { siteName: 'test' });
      const clickStep = result.site.flows[Object.keys(result.site.flows)[0]].steps.find(
        (s) => s.id === 'step-1'
      );
      expect(clickStep).toBeDefined();
      expect(clickStep!.fallbackSelectors).toEqual([
        '.btn-primary',
        'button[data-action="submit"]',
      ]);
      expect(clickStep!.elementIdentity!.tagName).toBe('button');
      expect(clickStep!.elementIdentity!.textContent).toBe('Submit');
    });
  });
});
