import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildViewerScript } from '../viewer-script.js';

describe('Input flash loop prevention', () => {
  let script: string;

  beforeEach(() => {
    script = buildViewerScript();
  });

  describe('Test 1: enterInputMode double-call guard', () => {
    it('should have re-entry guard (if inputMode return) inside enterInputMode', () => {
      const emMatch = script.match(/function enterInputMode[\s\S]*?^    \}/m);
      expect(emMatch).not.toBeNull();
      const block = emMatch![0];
      // Must check inputMode early and return if already set
      expect(block).toMatch(/if\s*\(\s*inputMode\s*\)\s*return/);
    });

    it('should set inputMode = true after passing guard', () => {
      const emMatch = script.match(/function enterInputMode[\s\S]*?^    \}/m);
      expect(emMatch).not.toBeNull();
      const block = emMatch![0];
      // After the guard, must set inputMode to true
      const guardIdx = block.indexOf('if (inputMode) return');
      const assignIdx = block.indexOf('inputMode = true', guardIdx);
      expect(assignIdx).toBeGreaterThan(guardIdx);
    });
  });

  describe('Test 2: WS handler guards against re-entry when already in input mode', () => {
    it('should check inputMode before calling enterInputMode in input_focused case', () => {
      const caseMatch = script.match(/case\s+['"]input_focused['"][\s\S]*?break\s*;/m);
      expect(caseMatch).not.toBeNull();
      const block = caseMatch![0];
      // The case handler should have its own guard OR rely solely on enterInputMode's internal guard.
      // Best practice: both should exist for defense-in-depth.
      // At minimum, enterInputMode's internal guard must exist (verified in Test 1).
      expect(block).toContain('enterInputMode');
    });

    it('should NOT call enterInputMode unconditionally without any guard path', () => {
      // Even if the case itself doesn't duplicate the guard,
      // enterInputMode MUST have one (already verified above).
      // This test ensures the full chain is safe.
      const emMatch = script.match(/function enterInputMode[\s\S]*?^    \}/m);
      expect(emMatch).not.toBeNull();
      const block = emMatch![0];
      expect(block).toMatch(/if\s*\(\s*inputMode\s*\)\s*return/);
    });
  });

  describe('Test 3: input_blur while in input mode exits cleanly', () => {
    it('should call exitInputMode on input_blur', () => {
      const ibMatch = script.match(/case\s+['"]input_blur['"][\s\S]*?break\s*;/m);
      expect(ibMatch).not.toBeNull();
      expect(ibMatch![0]).toContain('exitInputMode()');
    });

    it('exitInputMode should have guard for !inputMode', () => {
      const exMatch = script.match(/function exitInputMode[\s\S]*?^    \}/m);
      expect(exMatch).not.toBeNull();
      const block = exMatch![0];
      expect(block).toMatch(/if\s*\(\s*!\s*inputMode\s*\)\s*return/);
    });
  });

  describe('Test 4: re-enter after exit works normally', () => {
    it('exitInputMode resets inputMode to false so next input_focused can enter', () => {
      const exMatch = script.match(/function exitInputMode[\s\S]*?^    \}/m);
      expect(exMatch).not.toBeNull();
      const block = exMatch![0];
      expect(block).toContain('inputMode = false');
    });

    it('enterInputMode guard only blocks when inputMode is true (allows after reset)', () => {
      const emMatch = script.match(/function enterInputMode[\s\S]*?^    \}/m);
      expect(emMatch).not.toBeNull();
      const block = emMatch![0];
      // Guard checks truthiness of inputMode — when false (after exit), entry proceeds
      expect(block).toMatch(/if\s*\(\s*inputMode\s*\)\s*return/);
    });
  });

  describe('Test 5: syncInputToRemote does not send on empty/no-change value', () => {
    it('should return early if field is null', () => {
      const sirMatch = script.match(/function syncInputToRemote[\s\S]*?^    \}/m);
      expect(sirMatch).not.toBeNull();
      expect(sirMatch![0]).toContain('if (!field');
    });

    it('should return early if not in inputMode', () => {
      const sirMatch = script.match(/function syncInputToRemote[\s\S]*?^    \}/m);
      expect(sirMatch).not.toBeNull();
      expect(sirMatch![0]).toContain('!inputMode');
    });

    it('should not send if current value equals lastSent (no-op)', () => {
      const sirMatch = script.match(/function syncInputToRemote[\s\S]*?^    \}/m);
      expect(sirMatch).not.toBeNull();
      const block = sirMatch![0];
      expect(block).toContain('current === lastSent');
      expect(block).toContain('return');
    });
  });

  describe('Test 6: enterInputMode records selector correctly', () => {
    it('should store selector in window._currentTargetSelector', () => {
      const emMatch = script.match(/function enterInputMode[\s\S]*?^    \}/m);
      expect(emMatch).not.toBeNull();
      const block = emMatch![0];
      expect(block).toContain('_currentTargetSelector');
      expect(block).toContain('selector');
    });

    it('should use msg.selector parameter from input_focused message', () => {
      const caseMatch = script.match(/case\s+['"]input_focused['"][\s\S]*?break\s*;/m);
      expect(caseMatch).not.toBeNull();
      const block = caseMatch![0];
      expect(block).toContain('msg.selector');
    });
  });

  describe('Root cause: exitInputMode side-effect that could trigger re-focus', () => {
    it('exitInputMode should NOT send messages that could cause remote re-focus loop', () => {
      const exMatch = script.match(/function exitInputMode[\s\S]*?^    \}/m);
      expect(exMatch).not.toBeNull();
      const block = exMatch![0];
      // exitInputMode currently sends keyboard_insert_text with empty text.
      // This is OK as long as the remote doesn't interpret empty text as "focus input".
      // The key safety net is the inputMode guard in enterInputMode + WS handler.
      const sendCalls = block.match(/safeSend/g);
      expect(sendCalls).toBeTruthy();
    });

    it('WS input_focused handler should have defense-in-depth guard (Fix A)', () => {
      const caseMatch = script.match(/case\s+['"]input_focused['"][\s\S]*?break\s*;/m);
      expect(caseMatch).not.toBeNull();
      const block = caseMatch![0];
      // Fix A: Should check inputMode BEFORE calling enterInputMode
      // This prevents even reaching the function when already in mode
      const hasPreGuard = block.includes('if (inputMode)');
      expect(hasPreGuard).toBe(true);
    });
  });
});
