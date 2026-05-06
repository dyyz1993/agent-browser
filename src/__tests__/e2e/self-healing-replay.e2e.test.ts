import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions/index.js';
import { parseCliArgs } from '../utils/parseCli';
import { isSuccessResponse } from '../../types.js';
import { FlowExecutor } from '../../flow/index.js';
import type { SiteDefinition, FlowStep } from '../../flow/types.js';

const executablePath = process.env.AGENT_BROWSER_EXECUTABLE_PATH;

const TEST_HTML = `data:text/html,<!DOCTYPE html><html><body>
<div id="app">
  <button id="submit-btn" class="primary" data-testid="submit">Submit</button>
  <input id="email-input" name="email" type="text" placeholder="Enter email" />
  <a id="about-link" href="/about" class="nav-link" data-testid="about">About Us</a>
  <div id="status" class="status-box">Ready</div>
</div>
</body></html>`;

function extractSnapId(snapshot: string): string | null {
  const match = snapshot.match(/Snapshot #(snap_\d+)/);
  return match ? match[1] : null;
}

describe('Self-Healing Replay E2E', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    if (!executablePath) return;
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-self-healing',
      headless: true,
      executablePath,
    });
  });

  afterAll(async () => {
    if (!executablePath) return;
    await browser.close();
  });

  describe('Snapshot + selector validation', () => {
    beforeEach(async () => {
      if (!executablePath) return;
      const openResult = await executeCommand(parseCliArgs(['open', TEST_HTML]), browser);
      expect(openResult.success).toBe(true);
    });

    it('should generate stable selectors via snapshot --selector-for', async () => {
      if (!executablePath) return;
      const snapResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      expect(snapResult.success).toBe(true);
      if (!isSuccessResponse(snapResult)) return;
      const snapshot = (snapResult.data as { snapshot: string }).snapshot;
      const snapId = extractSnapId(snapshot);
      expect(snapId).not.toBeNull();

      const selResult = await executeCommand(
        parseCliArgs(['snapshot', '--selector-for', `${snapId}:@e1`]),
        browser
      );
      expect(selResult.success).toBe(true);
      if (isSuccessResponse(selResult)) {
        const data = selResult.data as { cssSelector: string };
        expect(data.cssSelector).toBeDefined();
        expect(data.cssSelector.length).toBeGreaterThan(0);
      }
    });

    it('should validate selectors and detect when elements are removed', async () => {
      if (!executablePath) return;
      const snapResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      if (!isSuccessResponse(snapResult)) return;
      const snapshot = (snapResult.data as { snapshot: string }).snapshot;
      const snapId = extractSnapId(snapshot);
      expect(snapId).not.toBeNull();

      const validateBefore = await executeCommand(
        parseCliArgs(['snapshot', '--validate', snapId!]),
        browser
      );
      expect(validateBefore.success).toBe(true);
      if (isSuccessResponse(validateBefore)) {
        const data = validateBefore.data as { results: Array<{ status: string }> };
        const allValid = data.results.every((r) => r.status === 'valid');
        expect(allValid).toBe(true);
      }

      const page = browser.getPage();
      await page.evaluate(() => {
        const btn = document.getElementById('submit-btn');
        if (btn) btn.remove();
      });

      const validateAfter = await executeCommand(
        parseCliArgs(['snapshot', '--validate', snapId!]),
        browser
      );
      expect(validateAfter.success).toBe(true);
      if (isSuccessResponse(validateAfter)) {
        const data = validateAfter.data as { results: Array<{ status: string }> };
        const notFound = data.results.filter((r) => r.status === 'not_found');
        expect(notFound.length).toBeGreaterThan(0);
      }
    });

    it('should suggest new snapshot after validation detects failures', async () => {
      if (!executablePath) return;
      const snapResult = await executeCommand(parseCliArgs(['snapshot', '-i']), browser);
      if (!isSuccessResponse(snapResult)) return;
      const snapshot = (snapResult.data as { snapshot: string }).snapshot;
      const snapId = extractSnapId(snapshot);
      expect(snapId).not.toBeNull();

      await executeCommand(parseCliArgs(['open', 'about:blank']), browser);

      const validateResult = await executeCommand(
        parseCliArgs(['snapshot', '--validate', snapId!]),
        browser
      );
      expect(validateResult.success).toBe(true);
      if (isSuccessResponse(validateResult)) {
        const data = validateResult.data as {
          results: Array<{ status: string }>;
          newSnapshotId?: string;
        };
        const notFound = data.results.filter(
          (r) => r.status === 'not_found' || r.status === 'invalid_selector'
        );
        expect(notFound.length).toBeGreaterThan(0);
        expect(data.newSnapshotId).toBeDefined();
      }
    });
  });

  describe('Fallback selector resolution via FlowExecutor', () => {
    beforeEach(async () => {
      if (!executablePath) return;
      const openResult = await executeCommand(parseCliArgs(['open', TEST_HTML]), browser);
      expect(openResult.success).toBe(true);
    });

    it('should heal click using fallbackSelectors when primary is removed', async () => {
      if (!executablePath) return;
      const page = browser.getPage();
      await page.evaluate(() => {
        const btn = document.getElementById('submit-btn');
        if (btn) btn.removeAttribute('id');
      });

      const site: SiteDefinition = {
        name: 'test-site',
        flows: {
          'heal-fallback': {
            id: 'heal-fallback',
            steps: [
              {
                id: 'step1',
                action: 'click',
                selector: '#submit-btn',
                fallbackSelectors: ['button.primary', 'button[data-testid="submit"]'],
              },
            ],
          },
        },
      };

      const executor = new FlowExecutor(browser);
      const result = await executor.execute(site, 'heal-fallback', {});
      expect(result.success).toBe(true);
      expect(result.healingLog).toBeDefined();
      expect(result.healingLog!.length).toBeGreaterThan(0);
      expect(result.healingLog![0].strategy).toBe('fallback');
      expect(result.healingLog![0].originalSelector).toBe('#submit-btn');
    });

    it('should heal by element text content via elementIdentity', async () => {
      if (!executablePath) return;
      const page = browser.getPage();
      await page.evaluate(() => {
        const btn = document.getElementById('submit-btn');
        if (btn) {
          btn.removeAttribute('id');
          btn.removeAttribute('class');
          btn.removeAttribute('data-testid');
        }
      });

      const site: SiteDefinition = {
        name: 'test-site',
        flows: {
          'heal-text': {
            id: 'heal-text',
            steps: [
              {
                id: 'step1',
                action: 'click',
                selector: '#submit-btn',
                elementIdentity: {
                  tagName: 'button',
                  textContent: 'Submit',
                  attributes: {},
                  classes: [],
                  boundingRect: { x: 0, y: 0, width: 0, height: 0 },
                  parentSignature: '',
                },
              },
            ],
          },
        },
      };

      const executor = new FlowExecutor(browser);
      const result = await executor.execute(site, 'heal-text', {});
      expect(result.success).toBe(true);
      expect(result.healingLog).toBeDefined();
      expect(result.healingLog!.length).toBeGreaterThan(0);
      expect(result.healingLog![0].strategy).toBe('identity_text');
    });

    it('should heal by element attribute via elementIdentity', async () => {
      if (!executablePath) return;
      const page = browser.getPage();
      await page.evaluate(() => {
        const input = document.getElementById('email-input');
        if (input) {
          input.removeAttribute('id');
          input.removeAttribute('name');
        }
      });

      const site: SiteDefinition = {
        name: 'test-site',
        flows: {
          'heal-attr': {
            id: 'heal-attr',
            steps: [
              {
                id: 'step1',
                action: 'fill',
                selector: '#email-input',
                value: 'test@example.com',
                elementIdentity: {
                  tagName: 'input',
                  textContent: '',
                  attributes: { placeholder: 'Enter email' },
                  classes: [],
                  boundingRect: { x: 0, y: 0, width: 0, height: 0 },
                  parentSignature: '',
                },
              },
            ],
          },
        },
      };

      const executor = new FlowExecutor(browser);
      const result = await executor.execute(site, 'heal-attr', {});
      expect(result.success).toBe(true);
      expect(result.healingLog).toBeDefined();
      expect(result.healingLog!.length).toBeGreaterThan(0);
      expect(result.healingLog![0].strategy).toBe('identity_attr');
    });

    it('should fail when all healing strategies are exhausted', async () => {
      if (!executablePath) return;
      await executeCommand(parseCliArgs(['open', 'about:blank']), browser);

      const site: SiteDefinition = {
        name: 'test-site',
        flows: {
          'heal-exhaust': {
            id: 'heal-exhaust',
            steps: [
              {
                id: 'step1',
                action: 'click',
                selector: '#submit-btn',
                fallbackSelectors: ['button.submit', '[data-testid="submit"]'],
                elementIdentity: {
                  tagName: 'button',
                  textContent: 'Submit',
                  attributes: { 'data-testid': 'submit' },
                  classes: ['primary'],
                  boundingRect: { x: 0, y: 0, width: 0, height: 0 },
                  parentSignature: '#app',
                },
              },
            ],
          },
        },
      };

      const executor = new FlowExecutor(browser);
      const result = await executor.execute(site, 'heal-exhaust', {});
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].error).toContain('Element not found');
    });

    it('should heal using parent signature when direct match fails', async () => {
      if (!executablePath) return;
      const page = browser.getPage();
      await page.evaluate(() => {
        const link = document.getElementById('about-link');
        if (link) {
          link.removeAttribute('id');
          link.removeAttribute('class');
          link.removeAttribute('data-testid');
        }
      });

      const site: SiteDefinition = {
        name: 'test-site',
        flows: {
          'heal-parent': {
            id: 'heal-parent',
            steps: [
              {
                id: 'step1',
                action: 'click',
                selector: '#about-link',
                elementIdentity: {
                  tagName: 'a',
                  textContent: '',
                  attributes: {},
                  classes: [],
                  boundingRect: { x: 0, y: 0, width: 0, height: 0 },
                  parentSignature: '#app',
                },
              },
            ],
          },
        },
      };

      const executor = new FlowExecutor(browser);
      const result = await executor.execute(site, 'heal-parent', {});
      expect(result.success).toBe(true);
      expect(result.healingLog).toBeDefined();
      expect(result.healingLog!.length).toBeGreaterThan(0);
      expect(result.healingLog![0].strategy).toBe('identity_parent');
    });
  });

  describe('Checkpoint verification', () => {
    beforeEach(async () => {
      if (!executablePath) return;
      const openResult = await executeCommand(parseCliArgs(['open', TEST_HTML]), browser);
      expect(openResult.success).toBe(true);
    });

    it('should pass checkpoint when elements exist', async () => {
      if (!executablePath) return;
      const site: SiteDefinition = {
        name: 'test-site',
        flows: {
          'checkpoint-pass': {
            id: 'checkpoint-pass',
            steps: [
              {
                id: 'step1',
                action: 'click',
                selector: '#submit-btn',
                checkpoint: {
                  elementChecks: [{ selector: '#status', exists: true, visible: true }],
                },
              },
            ],
          },
        },
      };

      const executor = new FlowExecutor(browser);
      const result = await executor.execute(site, 'checkpoint-pass', {});
      expect(result.success).toBe(true);
      expect(result.checkpointResults).toBeDefined();
      expect(result.checkpointResults!.length).toBeGreaterThan(0);
      expect(result.checkpointResults![0].passed).toBe(true);
    });

    it('should record checkpoint failure when element is missing', async () => {
      if (!executablePath) return;
      const site: SiteDefinition = {
        name: 'test-site',
        flows: {
          'checkpoint-fail': {
            id: 'checkpoint-fail',
            steps: [
              {
                id: 'step1',
                action: 'click',
                selector: '#submit-btn',
                checkpoint: {
                  elementChecks: [{ selector: '#nonexistent-element', exists: true }],
                },
              },
            ],
          },
        },
      };

      const executor = new FlowExecutor(browser);
      const result = await executor.execute(site, 'checkpoint-fail', {});
      expect(result.checkpointResults).toBeDefined();
      expect(result.checkpointResults!.length).toBeGreaterThan(0);
      expect(result.checkpointResults![0].passed).toBe(false);
      expect(result.checkpointResults![0].failures.length).toBeGreaterThan(0);
    });
  });

  describe('DOM stability detection', () => {
    it('should wait for DOM to stabilize after mutations', async () => {
      if (!executablePath) return;
      await executeCommand(
        parseCliArgs([
          'open',
          `data:text/html,<html><body><div id="container"></div></body></html>`,
        ]),
        browser
      );

      const page = browser.getPage();
      page.evaluate(() => {
        let count = 0;
        const interval = setInterval(() => {
          const el = document.getElementById('container');
          if (el) el.innerHTML = `<span>Item ${count++}</span>`;
          if (count >= 3) clearInterval(interval);
        }, 150);
      });

      await new Promise((r) => setTimeout(r, 1000));

      const site: SiteDefinition = {
        name: 'test-site',
        flows: {
          'dom-stable': {
            id: 'dom-stable',
            steps: [
              {
                id: 'step1',
                action: 'click',
                selector: '#container span',
                environment: {
                  waitDomStable: true,
                  domStableTimeout: 2000,
                },
              },
            ],
          },
        },
      };

      const executor = new FlowExecutor(browser);
      const result = await executor.execute(site, 'dom-stable', {});
      expect(result.success).toBe(true);
    });
  });
});
