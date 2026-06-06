import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('View Switcher — viewer script', () => {
  let viewerScript: string;
  let viewerHtml: string;

  beforeAll(() => {
    viewerScript = fs.readFileSync(path.join(__dirname, '../viewer-script.ts'), 'utf-8');
    viewerHtml = fs.readFileSync(path.join(__dirname, '../viewer-html.ts'), 'utf-8');
  });

  describe('State variables', () => {
    it('has viewSwitching flag', () => {
      expect(viewerScript).toContain('viewSwitching');
    });

    it('has originalViewport for saving pre-switch viewport', () => {
      expect(viewerScript).toContain('originalViewport');
    });

    it('has viewportLocked flag', () => {
      expect(viewerScript).toContain('viewportLocked');
    });

    it('has detectedViews array', () => {
      expect(viewerScript).toContain('detectedViews');
    });

    it('has activeViewId', () => {
      expect(viewerScript).toContain("activeViewId");
    });

    it('has fullPageSnapshot for thumbnails', () => {
      expect(viewerScript).toContain('fullPageSnapshot');
    });
  });

  describe('updateViewTabs', () => {
    it('function exists', () => {
      expect(viewerScript).toContain('function updateViewTabs');
    });

    it('auto-fallback when active view disappears', () => {
      const match = viewerScript.match(/function updateViewTabs[\s\S]*?^    \}/m);
      expect(match).toBeTruthy();
      expect(match![0]).toContain("activeViewId !== 'main'");
      expect(match![0]).toContain('selectView');
    });
  });

  describe('renderViewTabs', () => {
    it('function exists', () => {
      expect(viewerScript).toContain('function renderViewTabs');
    });

    it('hides tabs when no views', () => {
      const match = viewerScript.match(/function renderViewTabs[\s\S]*?^    \}/m);
      expect(match).toBeTruthy();
      expect(match![0]).toContain("classList.remove('visible')");
    });

    it('first tab is always main page', () => {
      const match = viewerScript.match(/function renderViewTabs[\s\S]*?^    \}/m);
      expect(match).toBeTruthy();
      expect(match![0]).toContain('data-vid="main"');
    });

    it('generates thumbnails after render', () => {
      const match = viewerScript.match(/function renderViewTabs[\s\S]*?^    \}/m);
      expect(match).toBeTruthy();
      expect(match![0]).toContain('generateThumbnails');
    });
  });

  describe('selectView', () => {
    it('function exists', () => {
      expect(viewerScript).toContain('function selectView');
    });

    it('sets viewSwitching = true first', () => {
      const match = viewerScript.match(/function selectView[\s\S]*?^    \}/m);
      expect(match).toBeTruthy();
      expect(match![0]).toContain('viewSwitching = true');
    });

    it('sends select_view with rect:null for main', () => {
      const match = viewerScript.match(/function selectView[\s\S]*?^    \}/m);
      expect(match).toBeTruthy();
      expect(match![0]).toContain("type: 'select_view'");
      expect(match![0]).toContain('rect: null');
    });

    it('sends select_view with rect for sub-view', () => {
      const match = viewerScript.match(/function selectView[\s\S]*?^    \}/m);
      expect(match).toBeTruthy();
      expect(match![0]).toContain('type: \'select_view\'');
      expect(match![0]).toContain('v.rect');
    });

    it('saves originalViewport before switching', () => {
      const match = viewerScript.match(/function selectView[\s\S]*?^    \}/m);
      expect(match).toBeTruthy();
      expect(match![0]).toContain('originalViewport');
    });

    it('keeps viewportLocked = true on switch back', () => {
      const match = viewerScript.match(/function selectView[\s\S]*?^    \}/m);
      expect(match).toBeTruthy();
      expect(match![0]).toContain('viewportLocked = true');
    });
  });

  describe('generateThumbnails', () => {
    it('function exists', () => {
      expect(viewerScript).toContain('function generateThumbnails');
    });

    it('uses screen image as source', () => {
      const match = viewerScript.match(/function generateThumbnails[\s\S]*?^    \}/m);
      expect(match).toBeTruthy();
      expect(match![0]).toContain('naturalWidth');
    });

    it('generates 36x22 thumbnails', () => {
      const match = viewerScript.match(/function generateThumbnails[\s\S]*?^    \}/m);
      expect(match).toBeTruthy();
      expect(match![0]).toContain('36');
      expect(match![0]).toContain('22');
    });
  });

  describe('Race condition protection', () => {
    it('frame handler respects viewportLocked', () => {
      expect(viewerScript).toContain('!viewportLocked');
    });

    it('frame handler respects viewSwitching', () => {
      expect(viewerScript).toContain('!viewSwitching');
    });

    it('status handler has viewSwitching branch', () => {
      expect(viewerScript).toMatch(/if\s*\(\s*viewSwitching\s*\)/);
      expect(viewerScript).toContain('viewSwitching = false');
    });

    it('ws.onclose resets view state', () => {
      expect(viewerScript).toContain('viewportLocked = false');
      expect(viewerScript).toContain("activeViewId = 'main'");
    });
  });

  describe('Desktop input panel hidden', () => {
    it('enterInputMode returns early for desktop', () => {
      const match = viewerScript.match(/function enterInputMode[\s\S]*?^    \}/m);
      expect(match).toBeTruthy();
      expect(match![0]).toContain("DeviceMode.current === 'desktop'");
      expect(match![0]).toMatch(/return;/);
    });
  });
});

describe('View Switcher — viewer HTML', () => {
  let viewerHtml: string;

  beforeAll(() => {
    viewerHtml = fs.readFileSync(path.join(__dirname, '../viewer-html.ts'), 'utf-8');
  });

  it('has view-tabs container', () => {
    expect(viewerHtml).toContain('id="viewTabs"');
  });

  it('has .view-tabs CSS', () => {
    expect(viewerHtml).toContain('.view-tabs');
  });

  it('has .view-tab CSS', () => {
    expect(viewerHtml).toContain('.view-tab');
  });

  it('has .view-tabs.visible CSS', () => {
    expect(viewerHtml).toContain('.view-tabs.visible');
  });

  it('tabs hidden by default', () => {
    expect(viewerHtml).toMatch(/\.view-tabs\s*\{[^}]*display:\s*none/);
  });

  it('view tabs have horizontal scroll', () => {
    expect(viewerHtml).toMatch(/\.view-tabs\s*\{[^}]*overflow-x:\s*auto/);
  });

  it('view tab max-width 140px', () => {
    expect(viewerHtml).toMatch(/\.view-tab\s*\{[^}]*max-width:\s*140px/);
  });

  it('view tab img 36x22', () => {
    expect(viewerHtml).toContain('width: 36px');
    expect(viewerHtml).toContain('height: 22px');
  });
});

describe('View Switcher — server side', () => {
  let standaloneCode: string;
  let clientStateCode: string;

  beforeAll(() => {
    standaloneCode = fs.readFileSync(
      path.join(__dirname, '../stream-server-standalone.ts'),
      'utf-8'
    );
    clientStateCode = fs.readFileSync(
      path.join(__dirname, '../stream/client-state.ts'),
      'utf-8'
    );
  });

  describe('ClientState', () => {
    it('has viewId field', () => {
      expect(clientStateCode).toContain('viewId');
    });

    it('has viewRect field', () => {
      expect(clientStateCode).toContain('viewRect');
    });
  });

  describe('select_view handler', () => {
    it('handles select_view message type', () => {
      expect(standaloneCode).toContain("msgType === 'select_view'");
    });

    it('sets viewRect on clientState', () => {
      expect(standaloneCode).toContain('clientState.viewRect');
    });

    it('sends status after view switch', () => {
      expect(standaloneCode).toMatch(/select_view[\s\S]*sendStatus/);
    });

    it('resends latest frame after view switch', () => {
      expect(standaloneCode).toMatch(/select_view[\s\S]*sendCroppedFrame/);
    });
  });

  describe('views_update broadcast', () => {
    it('forwards views_update from daemon', () => {
      expect(standaloneCode).toContain("'views_update'");
    });
  });

  describe('Cropping unification', () => {
    it('sendCroppedFrame uses viewRect or elementBox', () => {
      expect(standaloneCode).toContain('clientState.viewRect || (clientState.selector');
    });

    it('broadcastFrame uses viewRect or elementBox', () => {
      expect(standaloneCode).toMatch(/broadcastFrame[\s\S]*viewRect/);
    });
  });

  describe('sendStatus viewport fallback', () => {
    it('includes sessionInfo viewport when no elementBox', () => {
      expect(standaloneCode).toContain('sessionInfo?.viewportWidth');
      expect(standaloneCode).toContain('sessionInfo?.viewportHeight');
    });

    it('tracks viewportWidth in broadcastFrame', () => {
      expect(standaloneCode).toContain('sess.viewportWidth');
      expect(standaloneCode).toContain('sess.viewportHeight');
    });
  });
});

describe('View Switcher — daemon scan', () => {
  let daemonCode: string;

  beforeAll(() => {
    daemonCode = fs.readFileSync(path.join(__dirname, '../daemon.ts'), 'utf-8');
  });

  it('has view scan interval', () => {
    expect(daemonCode).toContain('VIEW_SCAN_INTERVAL');
  });

  it('scans for dialog/modal/popup/overlay/drawer/form', () => {
    expect(daemonCode).toContain('[role="dialog"]');
    expect(daemonCode).toContain('[class*="modal"]');
    expect(daemonCode).toContain('[class*="popup"]');
    expect(daemonCode).toContain('form');
  });

  it('filters by minimum size (50x30)', () => {
    expect(daemonCode).toContain('r.width < 50');
    expect(daemonCode).toContain('r.height < 30');
  });

  it('filters by max coverage (90% viewport)', () => {
    expect(daemonCode).toContain('0.9');
  });

  it('filters invisible elements', () => {
    expect(daemonCode).toContain("display === 'none'");
    expect(daemonCode).toContain("visibility === 'hidden'");
  });

  it('broadcasts views_update event', () => {
    expect(daemonCode).toContain("type: 'views_update'");
    expect(daemonCode).toContain('views: viewInfos');
  });

  it('only broadcasts when views change', () => {
    expect(daemonCode).toContain('lastViewsJson');
    expect(daemonCode).toContain("json !== lastViewsJson");
  });

  it('handles request_element_box IPC', () => {
    expect(daemonCode).toContain("'request_element_box'");
  });
});
