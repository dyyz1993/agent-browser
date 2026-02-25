import fs from 'node:fs';
import path from 'node:path';
import type { Page, CDPSession } from 'playwright-core';
import type { RecordedStep, RecorderConfig } from './types.js';
import { SessionStore } from './store.js';
import { DEFAULT_CONFIG } from './types.js';

let injectScriptCache: string | null = null;

function getInjectScriptContent(): string {
  if (injectScriptCache) {
    return injectScriptCache;
  }
  
  const scriptPath = path.join(__dirname, 'inject.js');
  injectScriptCache = fs.readFileSync(scriptPath, 'utf-8');
  return injectScriptCache;
}

export class Recorder {
  private page: Page;
  private cdp: CDPSession | null = null;
  private store: SessionStore;
  private config: Required<Omit<RecorderConfig, 'sessionId' | 'name' | 'persistPath'>>;
  private isRecording = false;

  constructor(page: Page, store: SessionStore, config?: RecorderConfig) {
    this.page = page;
    this.store = store;
    this.config = {
      trajectoryInterval: config?.trajectoryInterval ?? DEFAULT_CONFIG.trajectoryInterval,
      maxTrajectoryPoints: config?.maxTrajectoryPoints ?? DEFAULT_CONFIG.maxTrajectoryPoints
    };
  }

  async start(): Promise<void> {
    if (this.isRecording) return;
    
    this.cdp = await this.page.context().newCDPSession(this.page);
    
    await this.cdp.send('Runtime.addBinding', {
      name: '__recorderSync'
    });
    
    this.cdp.on('Runtime.bindingCalled', (params) => {
      if (params.name === '__recorderSync') {
        this.handleSync(params.payload);
      }
    });
    
    const scriptContent = getInjectScriptContent()
      .replace('TRAJECTORY_INTERVAL = 50', `TRAJECTORY_INTERVAL = ${this.config.trajectoryInterval}`)
      .replace('MAX_TRAJECTORY_POINTS = 10', `MAX_TRAJECTORY_POINTS = ${this.config.maxTrajectoryPoints}`);
    
    await this.page.addInitScript(scriptContent);
    
    this.isRecording = true;
    console.log('[Recorder] Started with CDP binding');
  }

  async stop(): Promise<void> {
    if (!this.isRecording) return;
    
    this.store.endSession();
    
    if (this.cdp) {
      await this.cdp.send('Runtime.removeBinding', {
        name: '__recorderSync'
      }).catch(() => {});
      await this.cdp.detach().catch(() => {});
      this.cdp = null;
    }
    
    this.isRecording = false;
    console.log('[Recorder] Stopped');
  }

  private handleSync(payload: string): void {
    try {
      const step: RecordedStep = JSON.parse(payload);
      this.store.addStep(step);
      console.log(`[Recorder] Step recorded: ${step.action} on ${step.selector}`);
    } catch (e) {
      console.error('[Recorder] Failed to parse step:', e);
    }
  }

  async restoreState(): Promise<void> {
    const steps = this.store.getSteps();
    await this.page.evaluate((steps) => {
      (window as any).__recorderSteps = steps;
      window.dispatchEvent(new CustomEvent('recorder:restored', {
        detail: { steps: steps }
      }));
    }, steps);
  }

  isRunning(): boolean {
    return this.isRecording;
  }

  getStore(): SessionStore {
    return this.store;
  }
}
