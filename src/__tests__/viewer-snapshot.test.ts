import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getViewerHtml } from '../viewer-html.js';
import { buildViewerScript } from '../viewer-script.js';

const SNAPSHOTS_DIR = path.join(__dirname, '__snapshots__');

describe('Viewer golden snapshot (refactoring safety net)', () => {
  let goldenHtml: string;
  let goldenScript: string;
  let actualHtml: string;
  let actualScript: string;

  beforeAll(() => {
    goldenHtml = fs.readFileSync(
      path.join(SNAPSHOTS_DIR, 'viewer-html.golden.html'),
      'utf-8'
    );
    goldenScript = fs.readFileSync(
      path.join(SNAPSHOTS_DIR, 'viewer-script.golden.js'),
      'utf-8'
    );
    actualHtml = getViewerHtml();
    actualScript = buildViewerScript();
  });

  it('getViewerHtml() output matches golden snapshot exactly', () => {
    expect(actualHtml).toBe(goldenHtml);
  });

  it('buildViewerScript() output matches golden snapshot exactly', () => {
    expect(actualScript).toBe(goldenScript);
  });

  it('HTML contains all critical CSS selectors', () => {
    const required = [
      '#input-panel',
      'body.input-mode #input-panel',
      'body.input-mode #touchpad',
      '#touchpad',
      '.touchpad-toolbar',
      '.tpk-btn',
      '.view-tabs',
      '.view-tab',
      '.toolbar',
    ];
    for (const sel of required) {
      expect(actualHtml).toContain(sel);
    }
  });

  it('HTML contains all critical JS functions', () => {
    const required = [
      'function enterInputMode',
      'function exitInputMode',
      'function connect()',
      'function selectView',
      'function renderViewTabs',
      "case 'input_focused'",
      "case 'input_blur'",
      "case 'views_update'",
    ];
    for (const fn of required) {
      expect(actualHtml).toContain(fn);
    }
  });

  it('HTML contains all critical DOM elements', () => {
    const required = [
      'id="input-panel"',
      'id="input-field"',
      'id="input-send"',
      'id="touchpad"',
      'id="touchpadToolbar"',
      'id="screen"',
      'id="cursor"',
      'id="modeBtn"',
      'id="viewTabs"',
      'id="urlDisplay"',
    ];
    for (const el of required) {
      expect(actualHtml).toContain(el);
    }
  });

  it('CSS braces are balanced', () => {
    const styleMatch = actualHtml.match(/<style>([\s\S]*?)<\/style>/);
    expect(styleMatch).not.toBeNull();
    const css = styleMatch![1];
    const opens = (css.match(/\{/g) || []).length;
    const closes = (css.match(/\}/g) || []).length;
    expect(opens).toBe(closes);
  });

  it('enterInputMode defines ip before use', () => {
    const fnMatch = actualScript.match(
      /function enterInputMode[\s\S]*?function exitInputMode/
    );
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).toContain("var ip = document.getElementById('input-panel')");
  });
});
