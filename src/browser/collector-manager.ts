import type { Page } from 'playwright-core';
import type { CollectionEntry, CollectionSession } from '../types/interruption.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const COLLECT_DIR = path.join(os.homedir(), '.agent-browser', 'collections');

export class CollectorManager {
  private active = false;
  private sessionId = '';
  private startedAt = '';
  private collections: CollectionEntry[] = [];
  private counter = 0;
  private getPage: () => Page;
  private initScriptDisposable: { dispose: () => Promise<void> } | null = null;
  private isCallbackExposed = false;

  constructor(getPage: () => Page) {
    this.getPage = getPage;
  }

  isActive(): boolean {
    return this.active;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getCollectionCount(): number {
    return this.collections.length;
  }

  async start(): Promise<{ started: boolean; sessionId: string }> {
    if (this.active) {
      return { started: false, sessionId: this.sessionId };
    }

    this.sessionId = `sess_${Date.now()}`;
    this.startedAt = new Date().toISOString();
    this.collections = [];
    this.counter = 0;
    this.active = true;

    const page = this.getPage();

    if (!this.isCallbackExposed) {
      try {
        await page.exposeFunction(
          '__agentBrowserCollectCallback',
          (entry: Omit<CollectionEntry, 'id'>) => {
            this.addEntry(entry);
          }
        );
        this.isCallbackExposed = true;
      } catch {
        this.isCallbackExposed = true;
      }
    }

    const context = page.context();
    this.initScriptDisposable = await context.addInitScript(getOverlayScript());

    return { started: true, sessionId: this.sessionId };
  }

  async stop(): Promise<{ stopped: boolean; path: string; count: number }> {
    if (!this.active) {
      return { stopped: false, path: '', count: 0 };
    }

    try {
      const page = this.getPage();
      await page.evaluate(() => {
        if ((window as any).__agentBrowserCollectorCleanup) {
          (window as any).__agentBrowserCollectorCleanup();
        }
      });
    } catch {
      /* page may be closed */
    }

    if (this.initScriptDisposable) {
      try {
        await this.initScriptDisposable.dispose();
      } catch {
        /* ignore */
      }
      this.initScriptDisposable = null;
    }

    this.active = false;

    const session: CollectionSession = {
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      stoppedAt: new Date().toISOString(),
      totalPages: 1,
      collections: this.collections,
    };

    if (!fs.existsSync(COLLECT_DIR)) {
      fs.mkdirSync(COLLECT_DIR, { recursive: true });
    }

    const filename = `session_${this.startedAt.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')}.json`;
    const filePath = path.join(COLLECT_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2));

    const result = { stopped: true, path: filePath, count: this.collections.length };
    this.collections = [];
    this.counter = 0;

    return result;
  }

  addEntry(entry: Omit<CollectionEntry, 'id'>): CollectionEntry {
    const fullEntry: CollectionEntry = {
      ...entry,
      id: `col_${String(++this.counter).padStart(3, '0')}`,
    };
    this.collections.push(fullEntry);
    return fullEntry;
  }
}

function getOverlayScript(): () => void {
  return function () {
    if ((window as any).__agentBrowserCollectorActive) return;
    (window as any).__agentBrowserCollectorActive = true;

    const HOTKEY_CODE = 'KeyP';
    let isHolding = false;
    let highlightedElement: HTMLElement | null = null;
    let typeSelectorPanel: HTMLElement | null = null;
    let currentTypeIndex = 0;

    const TYPES = [
      { type: 'captcha', subType: 'recaptcha_v2', label: 'Captcha: reCAPTCHA v2' },
      { type: 'captcha', subType: 'recaptcha_v3', label: 'Captcha: reCAPTCHA v3' },
      { type: 'captcha', subType: 'hcaptcha', label: 'Captcha: hCaptcha' },
      { type: 'captcha', subType: 'cloudflare_turnstile', label: 'Captcha: Cloudflare' },
      { type: 'captcha', subType: 'slide_verify', label: 'Captcha: Slide' },
      { type: 'captcha', subType: 'sms_verify', label: 'Captcha: SMS' },
      { type: 'captcha', subType: 'image_select', label: 'Captcha: Image' },
      { type: 'captcha', subType: 'text_input', label: 'Captcha: Text' },
      { type: 'login', subType: 'full_page', label: 'Login: Full Page' },
      { type: 'login', subType: 'modal', label: 'Login: Modal' },
      { type: 'login', subType: 'iframe', label: 'Login: Iframe' },
      { type: 'popup', subType: 'cookie_consent', label: 'Popup: Cookie' },
      { type: 'popup', subType: 'newsletter', label: 'Popup: Newsletter' },
      { type: 'popup', subType: 'notification', label: 'Popup: Notification' },
      { type: 'popup', subType: 'discount', label: 'Popup: Discount' },
      { type: 'age_verify', subType: '', label: 'Age Verify' },
      { type: 'paywall', subType: '', label: 'Paywall' },
      { type: 'ad', subType: '', label: 'Ad' },
      { type: 'other', subType: '', label: 'Other' },
    ];

    function findBestElement(x: number, y: number): HTMLElement | null {
      const elements = document.elementsFromPoint(x, y) as HTMLElement[];
      for (const el of elements) {
        if (el === highlightedElement) continue;
        if (el.tagName === 'BODY' || el.tagName === 'HTML') continue;
        if (el.id || el.getAttribute('data-testid') || el.getAttribute('role')) {
          return el;
        }
      }
      for (const el of elements) {
        if (el === highlightedElement) continue;
        if (el.tagName === 'BODY' || el.tagName === 'HTML') continue;
        const parent = el.parentElement;
        if (
          parent &&
          parent !== document.body &&
          (parent.id || parent.getAttribute('data-testid'))
        ) {
          return parent;
        }
        return el;
      }
      return null;
    }

    function highlight(el: HTMLElement) {
      unhighlight();
      highlightedElement = el;
      el.style.outline = '3px solid #ff4444';
      el.style.outlineOffset = '2px';
      el.style.transition = 'outline 0.1s';
    }

    function unhighlight() {
      if (highlightedElement) {
        highlightedElement.style.outline = '';
        highlightedElement.style.outlineOffset = '';
        highlightedElement.style.transition = '';
        highlightedElement = null;
      }
    }

    function showTypeSelector() {
      hideTypeSelector();
      currentTypeIndex = 0;
      const panel = document.createElement('div');
      panel.id = '__ab_type_selector';
      panel.style.cssText =
        'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1a1a2e;color:#fff;padding:16px 20px;border-radius:12px;font:14px/1.6 monospace;z-index:2147483647;box-shadow:0 8px 32px rgba(0,0,0,0.5);min-width:260px;max-height:80vh;overflow-y:auto;';

      const title = document.createElement('div');
      title.textContent = 'Select Type (Tab / Enter / Esc)';
      title.style.cssText = 'margin-bottom:10px;font-weight:bold;font-size:13px;color:#aaa;';
      panel.appendChild(title);

      TYPES.forEach((t, i) => {
        const row = document.createElement('div');
        row.textContent = t.label;
        row.dataset.index = String(i);
        row.style.cssText = 'padding:6px 10px;border-radius:6px;cursor:pointer;';
        if (i === 0) row.style.background = '#ff4444';
        panel.appendChild(row);
      });

      document.body.appendChild(panel);
      typeSelectorPanel = panel;
    }

    function hideTypeSelector() {
      if (typeSelectorPanel) {
        typeSelectorPanel.remove();
        typeSelectorPanel = null;
      }
    }

    function updateTypeSelector() {
      if (!typeSelectorPanel) return;
      const rows = typeSelectorPanel.querySelectorAll('div[data-index]');
      rows.forEach((row) => {
        const idx = parseInt((row as HTMLElement).dataset.index || '0', 10);
        (row as HTMLElement).style.background = idx === currentTypeIndex ? '#ff4444' : '';
      });
    }

    function collectCurrentElement() {
      if (!highlightedElement || !typeSelectorPanel) return;
      const t = TYPES[currentTypeIndex];
      const el = highlightedElement;
      const rect = el.getBoundingClientRect();
      const url = window.location.href;
      let domain = '';
      let path = '';
      try {
        const u = new URL(url);
        domain = u.hostname;
        path = u.pathname;
      } catch {}

      function getSelector(e: HTMLElement): string {
        if (e.id) return '#' + CSS.escape(e.id);
        if (e.getAttribute('data-testid'))
          return (
            e.tagName.toLowerCase() +
            '[data-testid="' +
            CSS.escape(e.getAttribute('data-testid')!) +
            '"]'
          );
        const parent = e.parentElement;
        if (parent && parent.id)
          return '#' + CSS.escape(parent.id) + ' > ' + e.tagName.toLowerCase();
        let s = e.tagName.toLowerCase();
        if (e.className && typeof e.className === 'string') {
          const cls = e.className
            .trim()
            .split(/\s+/)
            .filter((c: string) => c && c.length > 2 && !/^[a-z]{1,2}$/.test(c))[0];
          if (cls) s += '.' + CSS.escape(cls);
        }
        return s;
      }

      const entry = {
        timestamp: new Date().toISOString(),
        type: t.type,
        subType: t.subType,
        page: { url, domain, path, title: document.title },
        element: {
          selector: getSelector(el),
          xpath: '',
          tagName: el.tagName.toLowerCase(),
          html: el.outerHTML.slice(0, 2000),
          boundingBox: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          isIframe: el.tagName === 'IFRAME',
          iframeSrc: el.tagName === 'IFRAME' ? (el as HTMLIFrameElement).src : undefined,
        },
        context: {
          trigger: 'user_action' as const,
          isVisible: rect.width > 0 && rect.height > 0,
          zIndex: parseInt(getComputedStyle(el).zIndex) || 0,
          hasOverlay: false,
        },
      };

      if (typeof (window as any).__agentBrowserCollectCallback === 'function') {
        (window as any).__agentBrowserCollectCallback(entry);
      }
      hideTypeSelector();
      unhighlight();
    }

    document.addEventListener('keydown', (e) => {
      if (e.code === HOTKEY_CODE && e.ctrlKey && e.shiftKey && !e.repeat) {
        e.preventDefault();
        isHolding = true;
      }
      if (typeSelectorPanel) {
        if (e.code === 'Tab') {
          e.preventDefault();
          currentTypeIndex = (currentTypeIndex + 1) % TYPES.length;
          updateTypeSelector();
        }
        if (e.code === 'Enter') {
          e.preventDefault();
          collectCurrentElement();
        }
        if (e.code === 'Escape') {
          e.preventDefault();
          hideTypeSelector();
          unhighlight();
        }
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.code === HOTKEY_CODE) {
        isHolding = false;
        if (highlightedElement) {
          showTypeSelector();
        }
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!isHolding) {
        unhighlight();
        return;
      }
      const el = findBestElement(e.clientX, e.clientY);
      if (el) highlight(el);
    });

    (window as any).__agentBrowserCollectorCleanup = () => {
      unhighlight();
      hideTypeSelector();
      (window as any).__agentBrowserCollectorActive = false;
      delete (window as any).__agentBrowserCollectorCleanup;
    };
  };
}
