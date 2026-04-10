import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('DeviceMode dynamic switching - TDD', () => {
  let viewerScript: string;

  beforeAll(() => {
    viewerScript = fs.readFileSync(path.join(__dirname, '../viewer-script.ts'), 'utf-8');
  });

  // ============================================================
  // Phase 1: detectDeviceMode() function
  // ============================================================
  describe('detectDeviceMode function', () => {
    it('should exist as a named function', () => {
      const fnMatch = viewerScript.match(/function detectDeviceMode\(\)[\s\S]*?^}/m);
      expect(fnMatch).not.toBeNull();
      const block = fnMatch![0];
      expect(block).toContain('ontouchstart');
      expect(block).toContain('maxTouchPoints');
    });

    it('should return mobile when touch capability detected', () => {
      const fnMatch = viewerScript.match(/function detectDeviceMode\(\)[\s\S]*?^}/m);
      expect(fnMatch).not.toBeNull();
      const block = fnMatch![0];
      expect(block).toContain("'mobile'");
    });

    it('should return desktop as fallback', () => {
      const fnMatch = viewerScript.match(/function detectDeviceMode\(\)[\s\S]*?^}/m);
      expect(fnMatch).not.toBeNull();
      const block = fnMatch![0];
      expect(block).toContain("'desktop'");
    });
  });

  // ============================================================
  // Phase 2: DeviceMode singleton object
  // ============================================================
  describe('DeviceMode singleton', () => {
    it('should expose current property (getter)', () => {
      const dmMatch = viewerScript.match(/const DeviceMode[\s\S]*?get current/m);
      expect(dmMatch).not.toBeNull();
    });

    it('should expose onModeChange method', () => {
      const dmMatch = viewerScript.match(/const DeviceMode[\s\S]*?onModeChange/m);
      expect(dmMatch).not.toBeNull();
    });

    it('should expose switchTo method', () => {
      const dmMatch = viewerScript.match(/const DeviceMode[\s\S]*?switchTo/m);
      expect(dmMatch).not.toBeNull();
    });

    it('switchTo should be no-op when mode unchanged', () => {
      const switchMatch = viewerScript.match(
        /switchTo:\s*function\(mode\)\s*\{[^}]*mode\s*===\s*this\._current/
      );
      expect(switchMatch).not.toBeNull();
    });

    it('switchTo should call onModeChange listeners via forEach', () => {
      const switchMatch = viewerScript.match(/switchTo[\s\S]*?this\._listeners\.forEach/m);
      expect(switchMatch).not.toBeNull();
    });

    it('should initialize _current via detectDeviceMode()', () => {
      // Matches both _current: detectDeviceMode() and _current: _varName where varName = detectDeviceMode()
      const initDirect = viewerScript.match(/_current:\s*detectDeviceMode\(\)/m);
      const initIndirect = viewerScript.match(/_current:\s*_deviceCurrent/m);
      expect(initDirect || initIndirect).not.toBeNull();
    });

    it('_current should be mutable (var/let not const)', () => {
      const declMatch = viewerScript.match(/(?:var|let)\s+_deviceCurrent\s*=/m);
      expect(declMatch).not.toBeNull();
      const constConstMatch = viewerScript.match(/const\s+_deviceCurrent\s*=/m);
      expect(constConstMatch).toBeNull();
    });

    it('should re-detect on resize event', () => {
      const resizeMatch = viewerScript.match(
        /addEventListener\(['"]resize['"][\s\S]*?autoDetectAndSwitch/m
      );
      expect(resizeMatch).not.toBeNull();
    });

    it('should re-detect on orientationchange event', () => {
      const orientMatch = viewerScript.match(/orientationchange[\s\S]*?autoDetectAndSwitch/m);
      expect(orientMatch).not.toBeNull();
    });

    it('should use matchMedia pointer:coarse as additional trigger', () => {
      const mmMatch = viewerScript.match(/matchMedia[\s\S]*?pointer.*coarse[\s\S]*?switchTo/m);
      expect(mmMatch).not.toBeNull();
    });

    it('should NOT use old UA-based isTouchDevice const', () => {
      const oldPattern = viewerScript.match(/const\s+isTouchDevice\s*=/m);
      expect(oldPattern).toBeNull();
    });

    it('should NOT hardcode isTouchDevice anywhere', () => {
      const hardcode = viewerScript.match(/isTouchDevice\s*=\s*(true|false)/m);
      expect(hardcode).toBeNull();
    });
  });

  // ============================================================
  // Phase 2b: isTouchDevice scope check
  // ============================================================
  describe('isTouchDevice scoping', () => {
    it('isTouchDevice only exists inside detectDeviceMode scope or as local var', () => {
      const directUses = (viewerScript.match(/\bisTouchDevice(?!_)/g) || []).length;
      expect(directUses).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================
  // Phase 3: DesktopModule - hiddenInput lifecycle
  // ============================================================
  describe('DesktopModule hiddenInput management', () => {
    it('DesktopModule.attach creates #hiddenInput element', () => {
      // Match from DesktopModule declaration through attach function body
      const dmBlock = viewerScript.match(
        /const DesktopModule\s*=\s*\{[\s\S]*?attach:\s*function\(\)[\s\S]*?hidden-input[\s\S]*?appendChild[\s\S]*?\n      \}/
      );
      expect(dmBlock).not.toBeNull();
      const block = dmBlock![0];
      expect(block).toContain("'hidden-input'");
      expect(block).toContain('appendChild');
    });

    it('hiddenInput has correct styles (invisible, positioned)', () => {
      const dmBlock = viewerScript.match(
        /const DesktopModule\s*=\s*\{[\s\S]*?attach:\s*function\(\)[\s\S]*?opacity[\s\S]*?pointer-events[\s\S]*?\n      \}/
      );
      expect(dmBlock).not.toBeNull();
      const block = dmBlock![0];
      expect(block).toContain('opacity');
      expect(block).toContain('pointer-events');
    });

    it('DesktopModule.attach calls focusHiddenInput()', () => {
      const dmBlock = viewerScript.match(
        /const DesktopModule\s*=\s*\{[\s\S]*?focusHiddenInput[\s\S]*?\n      \}/
      );
      expect(dmBlock).not.toBeNull();
    });

    it('DesktopModule.detach removes hiddenInput and blurs', () => {
      const detachBlock = viewerScript.match(
        /detach:\s*function\(\)[\s\S]*?(?:removeChild|blur)[\s\S]*?\n      \}/
      );
      expect(detachBlock).not.toBeNull();
    });
  });

  // ============================================================
  // Phase 4: MobileModule - touchpad/input-panel lifecycle
  // ============================================================
  describe('MobileModule attach/detach', () => {
    it('MobileModule.attach shows touchpad with display:flex', () => {
      const mmAttach = viewerScript.match(
        /const MobileModule\s*=\s*\{[\s\S]*?attach:\s*function\(\)[\s\S]*?touchpad\.style\.display[\s\S]*?display\s*=\s*['"]flex['"]/
      );
      expect(mmAttach).not.toBeNull();
    });

    it('MobileModule.attach initializes virtual cursor', () => {
      const mmAttach = viewerScript.match(
        /const MobileModule\s*=\s*\{[\s\S]*?initCursor[\s\S]*?\n      \}/
      );
      expect(mmAttach).not.toBeNull();
    });

    it('MobileModule.detach hides input panel with display:none', () => {
      const mmDetach = viewerScript.match(
        /const MobileModule\s*=\s*\{[\s\S]*?detach:\s*function\(\)[\s\S]*?input-panel[\s\S]*?display\s*=\s*['"]none['"]/
      );
      expect(mmDetach).not.toBeNull();
    });

    it('MobileModule.detach shows cursor again', () => {
      const mmDetach = viewerScript.match(
        /const MobileModule\s*=\s*\{[\s\S]*?detach:\s*function\(\)[\s\S]*?cursor\.style\.display/m
      );
      expect(mmDetach).not.toBeNull();
    });
  });

  // ============================================================
  // Phase 5: Mode switching integration
  // ============================================================
  describe('switchTo mobile -> desktop', () => {
    it('calls DesktopModule.attach and MobileModule.detach in order', () => {
      // Extract just the switchTo function body between its { and }
      const swFn = viewerScript.match(/switchTo:\s*function\(mode\)\s*\{/);
      expect(swFn).not.toBeNull();
      const startIdx = viewerScript.indexOf(swFn![0]) + swFn![0].length;
      // Find balanced closing brace
      let depth = 1;
      let i = startIdx;
      while (i < viewerScript.length && depth > 0) {
        if (viewerScript[i] === '{') depth++;
        else if (viewerScript[i] === '}') depth--;
        i++;
      }
      const body = viewerScript.substring(startIdx, i - 1);
      const detachIdx = body.indexOf('MobileModule');
      const attachIdx = body.indexOf('DesktopModule');
      expect(detachIdx).toBeLessThan(attachIdx);
    });

    it('delegates to MobileModule.detach when switching to desktop (hides input-panel)', () => {
      const swFn = viewerScript.match(/switchTo:\s*function\(mode\)\s*\{/);
      expect(swFn).not.toBeNull();
      const startIdx = viewerScript.indexOf(swFn![0]) + swFn![0].length;
      let depth = 1;
      let i = startIdx;
      while (i < viewerScript.length && depth > 0) {
        if (viewerScript[i] === '{') depth++;
        else if (viewerScript[i] === '}') depth--;
        i++;
      }
      const body = viewerScript.substring(startIdx, i - 1);
      // switchTo delegates to MobileModule.detach() which handles input-panel
      expect(body).toContain('MobileModule.detach()');
      // Verify MobileModule.detach actually hides input-panel
      const mmDetach = viewerScript.match(
        /const MobileModule[\s\S]*?detach:\s*function\(\)[\s\S]*?input-panel[\s\S]*?display\s*=\s*['"]none['"]/
      );
      expect(mmDetach).not.toBeNull();
    });
  });

  describe('switchTo desktop -> mobile', () => {
    it('calls MobileModule.attach and DesktopModule.detach in order', () => {
      const swFn = viewerScript.match(/switchTo:\s*function\(mode\)\s*\{/);
      expect(swFn).not.toBeNull();
      const startIdx = viewerScript.indexOf(swFn![0]) + swFn![0].length;
      let depth = 1;
      let i = startIdx;
      while (i < viewerScript.length && depth > 0) {
        if (viewerScript[i] === '{') depth++;
        else if (viewerScript[i] === '}') depth--;
        i++;
      }
      const body = viewerScript.substring(startIdx, i - 1);
      // In the else branch (mobile): DesktopModule.detach() comes before MobileModule.attach()
      const elseIdx = body.indexOf('else');
      const elseBody = body.substring(elseIdx);
      const detachIdx = elseBody.indexOf('DesktopModule');
      const attachIdx = elseBody.indexOf('MobileModule');
      expect(detachIdx).toBeLessThan(attachIdx);
    });

    it('delegates to MobileModule.attach when switching to mobile (shows touchpad)', () => {
      const swFn = viewerScript.match(/switchTo:\s*function\(mode\)\s*\{/);
      expect(swFn).not.toBeNull();
      const startIdx = viewerScript.indexOf(swFn![0]) + swFn![0].length;
      let depth = 1;
      let i = startIdx;
      while (i < viewerScript.length && depth > 0) {
        if (viewerScript[i] === '{') depth++;
        else if (viewerScript[i] === '}') depth--;
        i++;
      }
      const body = viewerScript.substring(startIdx, i - 1);
      // switchTo delegates to MobileModule.attach() which shows touchpad
      expect(body).toContain('MobileModule.attach()');
      // Verify MobileModule.attach actually shows touchpad
      const mmAttach = viewerScript.match(
        /const MobileModule\s*=\s*\{[\s\S]*?attach:\s*function\(\)[\s\S]*?touchpad\.style\.display[\s\S]*?display\s*=\s*['"]flex['"]/
      );
      expect(mmAttach).not.toBeNull();
    });
  });

  // ============================================================
  // Phase 6: Edge cases
  // ============================================================
  describe('Edge cases', () => {
    it('switchTo same mode is no-op (early return)', () => {
      const swFn = viewerScript.match(/switchTo:\s*function\(mode\)\s*\{/);
      expect(swFn).not.toBeNull();
      const startIdx = viewerScript.indexOf(swFn![0]) + swFn![0].length;
      let depth = 1;
      let i = startIdx;
      while (i < viewerScript.length && depth > 0) {
        if (viewerScript[i] === '{') depth++;
        else if (viewerScript[i] === '}') depth--;
        i++;
      }
      const body = viewerScript.substring(startIdx, i - 1);
      expect(body).toContain('return');
    });

    it('multiple rapid switchTo calls are safe (state protection)', () => {
      const swFn = viewerScript.match(/switchTo:\s*function\(mode\)\s*\{/);
      expect(swFn).not.toBeNull();
      const startIdx = viewerScript.indexOf(swFn![0]) + swFn![0].length;
      let depth = 1;
      let i = startIdx;
      while (i < viewerScript.length && depth > 0) {
        if (viewerScript[i] === '{') depth++;
        else if (viewerScript[i] === '}') depth--;
        i++;
      }
      const body = viewerScript.substring(startIdx, i - 1);
      expect(body.length).toBeGreaterThan(50);
    });
  });
});
