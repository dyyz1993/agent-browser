import type { BrowserContext, Page, Frame } from 'playwright-core';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { RecorderStep, RecorderPage } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class RecorderManager {
  private recorderSessionId: string | null = null;
  private recorderBindingName: string | null = null;
  private recorderStartTime = 0;
  private recorderSteps: RecorderStep[] = [];
  private recorderPages: RecorderPage[] = [];
  private recorderPageHandler: ((newPage: Page) => Promise<void>) | null = null;
  private navigationHistory: string[] = [];
  private navigationHistoryIndex = -1;
  private lastNavigationUrl = '';
  private lastNavigationTime = 0;
  private recorderNavigatedHandler: ((frame: Frame) => Promise<void>) | null = null;
  private recorderFrameAttachedHandler: ((frame: Frame) => Promise<void>) | null = null;

  recorderPaused = false;

  private getPage: () => Page;
  private getPages: () => Page[];
  private getActivePageIndex: () => number;
  private setActivePageIndex: (index: number) => void;
  private getCDPSession: () => Promise<import('playwright-core').CDPSession>;
  private getCdpEndpoint: () => string | null;

  constructor(deps: {
    getPage: () => Page;
    getPages: () => Page[];
    getActivePageIndex: () => number;
    setActivePageIndex: (index: number) => void;
    getCDPSession: () => Promise<import('playwright-core').CDPSession>;
    getCdpEndpoint: () => string | null;
  }) {
    this.getPage = deps.getPage;
    this.getPages = deps.getPages;
    this.getActivePageIndex = deps.getActivePageIndex;
    this.setActivePageIndex = deps.setActivePageIndex;
    this.getCDPSession = deps.getCDPSession;
    this.getCdpEndpoint = deps.getCdpEndpoint;
  }

  isRecordingSession(): boolean {
    return this.recorderSessionId !== null;
  }

  pauseRecording(): void {
    this.recorderPaused = true;
  }

  resumeRecording(): void {
    this.recorderPaused = false;
  }

  recordStep(step: {
    action: string;
    index?: number;
    key?: string;
    code?: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
    selector?: string;
    value?: string;
  }): void {
    if (this.recorderSessionId && !this.recorderPaused) {
      this.recorderSteps.push({
        id: `step-${Date.now()}`,
        timestamp: Date.now(),
        action: step.action,
        index: step.index,
        key: step.key,
        code: step.code,
        ctrlKey: step.ctrlKey,
        metaKey: step.metaKey,
        altKey: step.altKey,
        shiftKey: step.shiftKey,
        selector: step.selector,
        value: step.value,
      });
    }
  }

  addStep(step: RecorderStep): void {
    this.recorderSteps.push(step);
  }

  getSteps(): RecorderStep[] {
    return this.recorderSteps;
  }

  getSessionId(): string | null {
    return this.recorderSessionId;
  }

  async injectRecorderIfNeeded(): Promise<void> {
    if (!this.recorderSessionId) return;

    const page = this.getPage();
    if (!page) return;

    try {
      await page.evaluate(() => {
        (window as unknown as Record<string, unknown>).xyzActive = true;
        (window as unknown as Record<string, unknown>).xyzStopped = false;
        (window as unknown as Record<string, unknown>).xyzInited = false;
      });

      const injectScript = this.getRecorderInjectScript(
        false,
        this.recorderBindingName || 'xyzTrack',
        this.recorderSessionId
      );
      await page.evaluate(injectScript);
    } catch (e) {
      /* empty */
    }
  }

  private getRecorderInjectScript(
    hide: boolean = false,
    bindingName: string = 'xyzTrack',
    sessionId?: string
  ): string {
    const injectScriptPath = path.join(__dirname, '..', 'recorder', 'inject.js');
    const script = readFileSync(injectScriptPath, 'utf-8');
    const config = `window.xyzHide = ${hide}; window.xyzBindingName = '${bindingName}'; window.xyzInjectedSessionId = '${sessionId || ''}';`;
    const fullScript = config + '\n' + script;
    return fullScript;
  }

  async startRecorder(
    url?: string,
    hide: boolean = false
  ): Promise<{ started: boolean; sessionId: string }> {
    console.log('[BrowserManager] startRecorder called, url:', url, 'hide:', hide);
    if (this.recorderSessionId) {
      throw new Error(
        `Recording already in progress (session: ${this.recorderSessionId}). Use 'recorder stop' to stop current recording first.`
      );
    }

    const page = this.getPage();
    if (!page) {
      throw new Error('No page available. Launch browser first.');
    }

    this.recorderSessionId = 'recorder-' + Date.now();
    this.recorderStartTime = Date.now();
    this.recorderSteps = [];
    this.recorderPages = [];
    this.navigationHistory = [];
    this.navigationHistoryIndex = -1;
    this.lastNavigationUrl = '';
    this.lastNavigationTime = 0;

    const context = page.context();

    const bindingName = `xyzTrack_${this.recorderSessionId}`;
    this.recorderBindingName = bindingName;

    const injectScript = this.getRecorderInjectScript(hide, bindingName, this.recorderSessionId);

    if (this.getCdpEndpoint() !== null) {
      await this.getCDPSession();
    }

    try {
      await context.exposeBinding(bindingName, async (source, payload: string) => {
        if (!this.recorderSessionId) {
          return false;
        }

        if (!payload) return true;

        const targetPage = source.page;

        try {
          const step = JSON.parse(payload);
          if (step && step.action) {
            if (step.action === 'xyzPoll') {
              await targetPage
                ?.evaluate((steps) => {
                  (window as unknown as Record<string, unknown>).xyzQueue = steps;
                  window.dispatchEvent(new CustomEvent('xyzEvt', { detail: steps }));
                }, this.recorderSteps)
                .catch(() => {});
            } else if (step.action === 'xyzClear') {
              this.recorderSteps = [];
            } else if (step.action === 'xyzUpdate') {
              if (step.id && step.data) {
                const updateIndex = this.recorderSteps.findIndex((s) => s.id === step.id);
                if (updateIndex >= 0) {
                  this.recorderSteps[updateIndex] = {
                    ...this.recorderSteps[updateIndex],
                    ...step.data,
                  };

                  await targetPage
                    ?.evaluate((steps) => {
                      (window as unknown as Record<string, unknown>).xyzQueue = steps;
                      window.dispatchEvent(new CustomEvent('xyzEvt', { detail: steps }));
                    }, this.recorderSteps)
                    .catch(() => {});
                }
              }
            } else {
              this.recorderSteps.push(step);
              await targetPage
                ?.evaluate((steps) => {
                  (window as unknown as Record<string, unknown>).xyzQueue = steps;
                  window.dispatchEvent(new CustomEvent('xyzEvt', { detail: steps }));
                }, this.recorderSteps)
                .catch(() => {});
            }
          }
        } catch (e) {
          /* empty */
        }
        return true;
      });
    } catch (e) {
      // Binding already exists, ignore
    }

    try {
      await page.evaluate((sessionId) => {
        (window as unknown as Record<string, unknown>).xyzActive = true;
        (window as unknown as Record<string, unknown>).xyzStopped = false;
        (window as unknown as Record<string, unknown>).xyzInited = false;
        (window as unknown as Record<string, unknown>).xyzSessionId = sessionId;
      }, this.recorderSessionId);
    } catch (e) {
      /* empty */
    }

    await context.addInitScript(injectScript);

    const sessionIdTimestamp =
      parseInt(this.recorderSessionId.replace('recorder-', ''), 10) || Date.now();
    await context.addInitScript({
      content: `
        const currentTimestamp = parseInt((window.xyzSessionId || '').replace('recorder-', '')) || 0;
        const newTimestamp = ${sessionIdTimestamp};
        if (newTimestamp > currentTimestamp) {
          window.xyzActive = true;
          window.xyzStopped = false;
          window.xyzInited = false;
          window.xyzSessionId = '${this.recorderSessionId}';
        }
      `,
    });

    try {
      await page.evaluate(`
        const currentTimestamp = parseInt((window.xyzSessionId || '').replace('recorder-', '')) || 0;
        const newTimestamp = ${sessionIdTimestamp};
        if (newTimestamp > currentTimestamp) {
          window.xyzActive = true;
          window.xyzStopped = false;
          window.xyzInited = false;
          window.xyzSessionId = '${this.recorderSessionId}';
          window.xyzQueue = [];
        }
      `);
    } catch (e) {
      /* empty */
    }

    try {
      await page.addScriptTag({ content: injectScript, type: 'text/javascript' });
    } catch (e) {
      try {
        await page.evaluate((scriptContent) => {
          const script = document.createElement('script');
          script.textContent = scriptContent;
          script.type = 'text/javascript';
          (document.head || document.documentElement).appendChild(script);
        }, injectScript);
      } catch (e2) {
        /* empty */
      }
    }

    this.recorderNavigatedHandler = async (frame: Frame) => {
      if (!this.recorderSessionId) return;
      if (frame !== page.mainFrame()) return;

      const currentUrl = frame.url();
      const now = Date.now();

      if (currentUrl === this.lastNavigationUrl) return;

      const timeSinceLastNav = now - this.lastNavigationTime;

      if (timeSinceLastNav < 300 && currentUrl === this.lastNavigationUrl) {
        this.recorderSteps.push({
          id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: now,
          action: 'reload',
        });
        return;
      }

      const existingIndex = this.navigationHistory.indexOf(currentUrl);

      if (existingIndex !== -1 && existingIndex < this.navigationHistoryIndex) {
        this.recorderSteps.push({
          id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: now,
          action: 'back',
          from: this.navigationHistory[this.navigationHistoryIndex],
          to: currentUrl,
        });
        this.navigationHistoryIndex = existingIndex;
      } else if (existingIndex !== -1 && existingIndex > this.navigationHistoryIndex) {
        this.recorderSteps.push({
          id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: now,
          action: 'forward',
          from: this.navigationHistory[this.navigationHistoryIndex],
          to: currentUrl,
        });
        this.navigationHistoryIndex = existingIndex;
      } else {
        if (
          this.navigationHistoryIndex >= 0 &&
          this.navigationHistoryIndex < this.navigationHistory.length - 1
        ) {
          this.navigationHistory = this.navigationHistory.slice(0, this.navigationHistoryIndex + 1);
        }
        this.navigationHistory.push(currentUrl);
        this.navigationHistoryIndex = this.navigationHistory.length - 1;
      }

      this.lastNavigationUrl = currentUrl;
      this.lastNavigationTime = now;
    };
    page.on('framenavigated', this.recorderNavigatedHandler);

    const injectScriptToFrame = async (frame: Frame) => {
      if (!this.recorderSessionId) return;
      if (frame === page.mainFrame()) return;

      try {
        const alreadyInjected = await frame
          .evaluate(() => {
            return !!(window as unknown as Record<string, unknown>).xyzInjectedSessionId;
          })
          .catch(() => false);

        if (alreadyInjected) return;

        const frameInjectScript = this.getRecorderInjectScript(
          false,
          this.recorderBindingName || 'xyzTrack',
          this.recorderSessionId
        );

        await frame.evaluate(frameInjectScript).catch((e) => {
          // Cross-origin iframe, ignore
        });
      } catch (e) {
        // Ignore errors, likely cross-origin iframe
      }
    };

    const injectToAllFrames = async () => {
      const frames = page.frames();
      for (const frame of frames) {
        await injectScriptToFrame(frame);
      }
    };

    await injectToAllFrames();

    this.recorderFrameAttachedHandler = async (frame: Frame) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await injectScriptToFrame(frame);
    };
    page.on('frameattached', this.recorderFrameAttachedHandler);

    const pages = this.getPages();
    const getActivePageIndex = this.getActivePageIndex;

    this.recorderPageHandler = async (newPage: Page) => {
      if (this.recorderSessionId) {
        const previousActiveIndex = getActivePageIndex();

        const pageIndex = pages.indexOf(newPage);
        const newTabIndex = pageIndex >= 0 ? pageIndex : pages.length;
        this.recorderSteps.push({
          id: `step-${this.recorderSteps.length + 1}`,
          timestamp: Date.now(),
          action: 'tab_new',
          url: newPage.url(),
          index: newTabIndex,
        });

        setTimeout(() => {
          if (this.recorderSessionId && getActivePageIndex() !== previousActiveIndex) {
            this.recorderSteps.push({
              id: `step-${this.recorderSteps.length + 1}`,
              timestamp: Date.now(),
              action: 'tab_switch',
              index: getActivePageIndex(),
            });
          }
        }, 100);

        newPage.on('close', () => {
          if (this.recorderSessionId) {
            const closeIndex = pages.indexOf(newPage);
            this.recorderSteps.push({
              id: `step-${this.recorderSteps.length + 1}`,
              timestamp: Date.now(),
              action: 'tab_close',
              index: closeIndex >= 0 ? closeIndex : -1,
            });
          }
        });

        await newPage.waitForLoadState('domcontentloaded').catch(() => {});

        try {
          const newPageInjectScript = this.getRecorderInjectScript(
            false,
            'xyzTrack',
            this.recorderSessionId
          );
          await newPage.evaluate(newPageInjectScript);
        } catch (e) {
          console.log('[recorderPageHandler] Error injecting script:', e);
        }

        await newPage
          .evaluate((steps) => {
            (window as unknown as Record<string, unknown>).__recorderSteps = steps;
            window.dispatchEvent(new CustomEvent('recorder:steps', { detail: steps }));
          }, this.recorderSteps)
          .catch(() => {});

        this.recorderPages.push({
          url: newPage.url(),
          title: await newPage.title().catch(() => ''),
          firstVisitTime: Date.now(),
        });
      }
    };
    context.on('page', this.recorderPageHandler);

    if (url) {
      await page.goto(url, { waitUntil: 'load' });
    }

    this.recorderPages.push({
      url: page.url(),
      title: await page.title(),
      firstVisitTime: Date.now(),
    });

    return { started: true, sessionId: this.recorderSessionId };
  }

  async stopRecorder(): Promise<{ yaml: string; steps: number; wasRecording?: boolean }> {
    if (!this.recorderSessionId) {
      console.log('[stopRecorder] No active recording session');
      return { yaml: '', steps: 0, wasRecording: false };
    }

    const page = this.getPage();

    if (page) {
      try {
        await page.evaluate(() => {
          const win = window as unknown as Record<string, unknown>;
          const hasPanel = !!document.getElementById('xyzPnl');
          const hasCloseFunc = typeof win.xyzClose === 'function';
          const hasFlushFunc = typeof win.xyzFlushPending === 'function';
          console.log(
            '[stopRecorder] hasFlushFunc:',
            hasFlushFunc,
            'hasCloseFunc:',
            hasCloseFunc,
            'hasPanel:',
            hasPanel
          );

          if (hasFlushFunc) {
            console.log('[stopRecorder] Calling xyzFlushPending');
            (win.xyzFlushPending as () => void)();
          } else {
            console.log('[stopRecorder] xyzFlushPending not found');
          }

          win.xyzActive = false;
          win.xyzStopped = true;
          win.xyzInited = false;
          win.xyzInitializedSessionId = undefined;

          if (hasCloseFunc) {
            (win.xyzClose as () => void)();
          }

          return {
            hadPanel: hasPanel,
            hadCloseFunc: hasCloseFunc,
            stillHasPanel: !!document.getElementById('xyzPnl'),
          };
        });
      } catch (e) {
        console.error('[stopRecorder] Error:', e);
      }

      if (this.recorderNavigatedHandler) {
        page.off('framenavigated', this.recorderNavigatedHandler);
        this.recorderNavigatedHandler = null;
      }
      if (this.recorderFrameAttachedHandler) {
        page.off('frameattached', this.recorderFrameAttachedHandler);
        this.recorderFrameAttachedHandler = null;
      }
      if (this.recorderPageHandler) {
        page.context().off('page', this.recorderPageHandler);
        this.recorderPageHandler = null;
      }

      try {
        await page.context().exposeBinding(this.recorderBindingName || 'xyzTrack', () => {});
      } catch (e) {
        // Ignore errors, binding may already be removed
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    const yaml = this.generateRecorderYaml();
    const steps = this.recorderSteps.length;

    this.recorderSessionId = null;
    this.recorderSteps = [];
    this.navigationHistory = [];
    this.navigationHistoryIndex = -1;
    this.lastNavigationUrl = '';
    this.lastNavigationTime = 0;

    return { yaml, steps };
  }

  getRecorderStatus(): { isRecording: boolean; sessionId?: string; steps: number } {
    return {
      isRecording: this.recorderSessionId !== null,
      sessionId: this.recorderSessionId || undefined,
      steps: this.recorderSteps.length,
    };
  }

  private generateRecorderYaml(): string {
    const lines: string[] = [];

    const formatTime = (ts: number | undefined): string => {
      if (!ts) return 'unknown';
      const d = new Date(ts);
      return d.toTimeString().split(' ')[0];
    };

    lines.push('session:');
    lines.push(`  id: ${this.recorderSessionId || 'unknown'}`);
    lines.push(`  startTime: ${formatTime(this.recorderStartTime)}`);
    lines.push(`  endTime: ${formatTime(Date.now())}`);
    lines.push(`  steps: ${this.recorderSteps.length}`);
    lines.push('');

    if (this.recorderPages.length > 0) {
      lines.push('pages:');
      for (const page of this.recorderPages) {
        lines.push(`  - url: ${page.url}`);
        lines.push(`    title: ${page.title || 'N/A'}`);
        lines.push(`    firstVisitTime: ${formatTime(page.firstVisitTime as number)}`);
      }
      lines.push('');
    }

    const urlRequiredActions = [
      'open',
      'goto',
      'back',
      'forward',
      'reload',
      'tab_new',
      'tab_switch',
      'link_click',
    ];

    lines.push('steps:');
    for (const step of this.recorderSteps) {
      lines.push(`  - id: ${step.id}`);
      lines.push(`    time: ${formatTime(step.timestamp as number)}`);
      lines.push(`    action: ${step.action}`);
      if (step.selector) lines.push(`    selector: "${step.selector}"`);
      if (step.xpath) lines.push(`    xpath: "${step.xpath}"`);
      if (step.value) lines.push(`    value: "${step.value}"`);

      if (step.points && Array.isArray(step.points) && step.points.length > 0) {
        lines.push(`    points: ${JSON.stringify(step.points)}`);
        const trajectoryCmd = this.generateStepCliCommand(step);
        if (trajectoryCmd) {
          lines.push(`    # Replay: ${trajectoryCmd}`);
        }
      }

      if (step.x !== undefined) lines.push(`    x: ${step.x}`);
      if (step.y !== undefined) lines.push(`    y: ${step.y}`);
      if (step.from && typeof step.from === 'string') {
        lines.push(`    from: "${step.from}"`);
      } else if (step.from && typeof step.from === 'object') {
        lines.push(`    from: { width: ${step.from.width}, height: ${step.from.height} }`);
      }
      if (step.to && typeof step.to === 'string') {
        lines.push(`    to: "${step.to}"`);
      } else if (step.to && typeof step.to === 'object') {
        lines.push(`    to: { width: ${step.to.width}, height: ${step.to.height} }`);
      }

      if (step.annotation) {
        lines.push(`    annotation:`);
        lines.push(`      type: ${step.annotation.type}`);
        lines.push(`      label: "${step.annotation.label}"`);

        if (step.annotation.selector) {
          lines.push(`      selector: "${step.annotation.selector}"`);
        }
        if (step.annotation.itemSelector) {
          lines.push(`      itemSelector: "${step.annotation.itemSelector}"`);
        }
        if (step.annotation.nextSelector) {
          lines.push(`      nextSelector: "${step.annotation.nextSelector}"`);
        }
        if (step.annotation.fields && step.annotation.fields.length > 0) {
          lines.push(
            `      fields: [${step.annotation.fields.map((f: string) => `"${f}"`).join(', ')}]`
          );
        }
        if (step.annotation.waitTimeout !== undefined) {
          lines.push(`      waitTimeout: ${step.annotation.waitTimeout}`);
        }
        if (step.annotation.customNote) {
          lines.push(`      customNote: "${step.annotation.customNote}"`);
        }

        lines.push(`      # \u26A0\uFE0F IMPORTANT: This step requires special attention`);
        lines.push(`      # User marked this as: "${step.annotation.label}"`);
      }

      if (step.url && step.action && urlRequiredActions.includes(step.action)) {
        lines.push(`    url: "${step.url}"`);
      }

      if (step.index !== undefined) lines.push(`    index: ${step.index}`);
      if (step.key) lines.push(`    key: "${step.key}"`);
      if (step.code) lines.push(`    code: "${step.code}"`);
      if (step.ctrlKey) lines.push(`    ctrlKey: true`);
      if (step.metaKey) lines.push(`    metaKey: true`);
      if (step.altKey) lines.push(`    altKey: true`);
      if (step.shiftKey) lines.push(`    shiftKey: true`);
      lines.push('');
    }

    lines.push(
      '# \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550'
    );
    lines.push('# CLI Commands (Copy & Execute)');
    lines.push(
      '# \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550'
    );
    lines.push('');
    lines.push(
      '# \u542F\u7528\u6A21\u62DF\u4EBA\u7C7B\u9F20\u6807\u79FB\u52A8\uFF08\u63A8\u8350\uFF09'
    );
    lines.push('# Enable human-like mouse movement (recommended)');
    lines.push('export AGENT_BROWSER_HUMAN=bezier');
    lines.push('');

    for (const step of this.recorderSteps) {
      const cmd = this.generateStepCliCommand(step);
      if (cmd) {
        lines.push(`# ${step.id}: ${step.action}`);
        lines.push(cmd);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  private generateStepCliCommand(step: RecorderStep): string | null {
    const escapeShell = (str: string): string => {
      return str.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
    };

    const formatKeyCombo = (s: RecorderStep): string => {
      const parts: string[] = [];
      if (s.ctrlKey) parts.push('Control');
      if (s.metaKey) parts.push('Meta');
      if (s.altKey) parts.push('Alt');
      if (
        s.shiftKey &&
        s.key &&
        !['Shift', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(s.key)
      ) {
        parts.push('Shift');
      }
      if (s.key) parts.push(s.key);
      return parts.join('+');
    };

    switch (step.action) {
      case 'click':
      case 'link_click':
        if (step.selector) {
          return `agent-browser click "${escapeShell(step.selector)}"`;
        }
        if (step.xpath) {
          return `agent-browser click "xpath=${escapeShell(step.xpath)}"`;
        }
        return null;

      case 'check':
        if (step.selector) {
          return `agent-browser check "${escapeShell(step.selector)}"`;
        }
        if (step.xpath) {
          return `agent-browser check "xpath=${escapeShell(step.xpath)}"`;
        }
        return null;

      case 'uncheck':
        if (step.selector) {
          return `agent-browser uncheck "${escapeShell(step.selector)}"`;
        }
        if (step.xpath) {
          return `agent-browser uncheck "xpath=${escapeShell(step.xpath)}"`;
        }
        return null;

      case 'fill':
        if (step.value !== undefined) {
          if (step.selector) {
            return `agent-browser fill "${escapeShell(step.selector)}" "${escapeShell(String(step.value))}"`;
          }
          if (step.xpath) {
            return `agent-browser fill "xpath=${escapeShell(step.xpath)}" "${escapeShell(String(step.value))}"`;
          }
        }
        return null;

      case 'select':
        if (step.value !== undefined) {
          if (step.selector) {
            return `agent-browser select "${escapeShell(step.selector)}" "${escapeShell(String(step.value))}"`;
          }
          if (step.xpath) {
            return `agent-browser select "xpath=${escapeShell(step.xpath)}" "${escapeShell(String(step.value))}"`;
          }
        }
        return null;

      case 'keyboard':
        const key = formatKeyCombo(step);
        if (key) {
          return `agent-browser press "${key}"`;
        }
        return null;

      case 'scroll':
        if (step.x !== undefined && step.y !== undefined) {
          return `agent-browser mouse wheel ${step.y} ${step.x}`;
        }
        return null;

      case 'trajectory':
        if (step.points && Array.isArray(step.points) && step.points.length > 0) {
          const maxPoints = 5;
          let sampled: Array<Record<string, number>>;
          if (step.points.length <= maxPoints) {
            sampled = step.points as Array<Record<string, number>>;
          } else {
            sampled = [];
            const step_size = (step.points.length - 1) / (maxPoints - 1);
            for (let i = 0; i < maxPoints; i++) {
              const idx = Math.round(i * step_size);
              sampled.push(step.points[idx] as Record<string, number>);
            }
          }

          const segments = sampled.map((p: Record<string, number>, i: number) => {
            const x = Math.round(p.x);
            const y = Math.round(p.y);
            const delay = i === 0 ? 0 : Math.round(p.t - sampled[i - 1].t);
            return `${x}:${y}:${delay}`;
          });

          return `AGENT_BROWSER_HUMAN=bezier agent-browser mouse trajectory "${segments.join(';')}"`;
        }
        return null;

      case 'open':
      case 'goto':
        if (step.url) {
          return `agent-browser open "${step.url}"`;
        }
        return null;

      case 'back':
        return 'agent-browser back';

      case 'forward':
        return 'agent-browser forward';

      case 'reload':
        return 'agent-browser reload';

      case 'tab_new':
        if (step.url) {
          return `agent-browser tab new "${step.url}"`;
        }
        return 'agent-browser tab new';

      case 'tab_switch':
        if (step.index !== undefined) {
          return `agent-browser tab ${step.index}`;
        }
        return null;

      case 'resize':
        if (step.to && typeof step.to === 'object') {
          return `agent-browser set viewport ${step.to.width} ${step.to.height}`;
        }
        return null;

      case 'hover':
        if (step.xpath) {
          return `agent-browser hover "xpath=${escapeShell(step.xpath)}"`;
        }
        if (step.selector) {
          return `agent-browser hover "${escapeShell(step.selector)}"`;
        }
        return null;

      default:
        return null;
    }
  }

  cleanup(page: Page | null): void {
    if (page) {
      if (this.recorderNavigatedHandler) {
        page.off('framenavigated', this.recorderNavigatedHandler);
        this.recorderNavigatedHandler = null;
      }
      if (this.recorderFrameAttachedHandler) {
        page.off('frameattached', this.recorderFrameAttachedHandler);
        this.recorderFrameAttachedHandler = null;
      }
      if (this.recorderPageHandler) {
        page.context().off('page', this.recorderPageHandler);
        this.recorderPageHandler = null;
      }
    }

    this.recorderSessionId = null;
    this.recorderSteps = [];
    this.navigationHistory = [];
    this.navigationHistoryIndex = -1;
    this.lastNavigationUrl = '';
    this.lastNavigationTime = 0;
  }
}
