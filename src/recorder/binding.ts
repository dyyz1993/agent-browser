import type { Page, CDPSession } from 'playwright-core';
import type { SessionStore } from './store.js';
import type { RecorderConfig, RecordedStep, TrajectoryPoint } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

declare global {
  interface Window {
    __recorderSteps?: RecordedStep[];
    __recorderSync?: (payload: string) => void;
  }
}

export class RecorderBinding {
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
    
    await this.page.addInitScript(this.getInjectScript());
    
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

  private getInjectScript(): string {
    return `
(function() {
  if (window.__recorderInitialized) return;
  window.__recorderInitialized = true;

  const TRAJECTORY_INTERVAL = ${this.config.trajectoryInterval};
  const MAX_TRAJECTORY_POINTS = ${this.config.maxTrajectoryPoints};

  window.__recorderTrajectory = [];
  window.__recorderLastTime = 0;

  document.addEventListener('mousemove', (e) => {
    const now = Date.now();
    if (now - window.__recorderLastTime > TRAJECTORY_INTERVAL) {
      window.__recorderTrajectory.push({
        x: e.clientX,
        y: e.clientY,
        t: now
      });
      if (window.__recorderTrajectory.length > MAX_TRAJECTORY_POINTS) {
        window.__recorderTrajectory.shift();
      }
      window.__recorderLastTime = now;
    }
  }, true);

  window.__getTrajectory = function() {
    const points = window.__recorderTrajectory.slice(-5);
    window.__recorderTrajectory = [];
    return points;
  };

  window.__syncStep = function(step) {
    step.trajectory = window.__getTrajectory();
    step.viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };
    step.url = window.location.href;

    if (typeof window.__recorderSync === 'function') {
      try {
        window.__recorderSync(JSON.stringify(step));
      } catch (e) {
        console.error('[Recorder] Failed to sync step:', e);
      }
    }
  };

  window.__getSelector = function(element) {
    if (element.id) {
      return '#' + CSS.escape(element.id);
    }

    const semanticAttrs = [
      'data-testid', 'data-test', 'data-cy', 'data-qa',
      'aria-label', 'aria-labelledby', 'name', 'role', 'title'
    ];

    for (const attr of semanticAttrs) {
      const value = element.getAttribute(attr);
      if (value) {
        return element.tagName.toLowerCase() + '[' + attr + '="' + CSS.escape(value) + '"]';
      }
    }

    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\\s+/)
        .filter(c => c && !c.startsWith('_') && !c.startsWith('css-'));
      if (classes.length > 0) {
        return element.tagName.toLowerCase() + '.' + classes.slice(0, 2).join('.');
      }
    }

    return element.tagName.toLowerCase();
  };

  window.__getElementInfo = function(element) {
    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id,
      className: element.className,
      text: element.innerText ? element.innerText.slice(0, 50) : ''
    };
  };

  function recordStep(action, data) {
    const step = {
      id: 'step-' + Date.now(),
      timestamp: Date.now(),
      action: action,
      selector: data.selector || '',
      value: data.value,
      elementInfo: data.elementInfo,
      annotation: data.annotation
    };

    window.__syncStep(step);
  }

  document.addEventListener('click', (e) => {
    const path = e.composedPath();
    const element = path[0] || e.target;
    
    if (element === document.body || element === document.documentElement) return;

    recordStep('click', {
      selector: window.__getSelector(element),
      elementInfo: window.__getElementInfo(element)
    });
  }, true);

  document.addEventListener('input', (e) => {
    const element = e.target;
    if (!element || !element.tagName) return;

    recordStep('fill', {
      selector: window.__getSelector(element),
      value: element.value,
      elementInfo: window.__getElementInfo(element)
    });
  }, true);

  document.addEventListener('change', (e) => {
    const element = e.target;
    if (!element || element.tagName !== 'SELECT') return;

    recordStep('select', {
      selector: window.__getSelector(element),
      value: element.value,
      elementInfo: window.__getElementInfo(element)
    });
  }, true);

  window.addEventListener('beforeunload', () => {
    recordStep('navigate', {
      selector: 'window',
      value: window.location.href
    });
  });

  console.log('[Recorder] Inject script initialized');
})();
`;
  }

  async restoreState(): Promise<void> {
    const steps = this.store.getSteps();
    await this.page.evaluate((steps) => {
      window.__recorderSteps = steps;
      window.dispatchEvent(new CustomEvent('recorder:restored', {
        detail: { steps: steps }
      }));
    }, steps);
  }

  isRunning(): boolean {
    return this.isRecording;
  }
}
