import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Mobile input message format - TDD', () => {
  let viewerScript: string;
  let daemonCode: string;

  beforeAll(() => {
    viewerScript = fs.readFileSync(path.join(__dirname, '../viewer-script.ts'), 'utf-8');
    daemonCode = fs.readFileSync(path.join(__dirname, '../daemon.ts'), 'utf-8');
  });

  describe('input_mouse and input_keyboard handled in daemon pre-validation', () => {
    it('pre-validation handles input_mouse (viewer sends type:input_mouse, daemon converts)', () => {
      expect(daemonCode).toContain("action === 'input_mouse'");
      expect(daemonCode).toContain('quickParse.eventType');
    });

    it('pre-validation handles input_keyboard (viewer sends type:input_keyboard, daemon converts)', () => {
      expect(daemonCode).toContain("action === 'input_keyboard'");
      expect(daemonCode).toContain('quickParse.eventType');
    });
  });

  describe('enterInputMode shows input panel correctly', () => {
    it('enterInputMode sets window._currentTargetSelector', () => {
      const emMatch = viewerScript.match(/function enterInputMode[\s\S]*?^    \}/m);
      expect(emMatch).not.toBeNull();
      const block = emMatch![0];
      expect(block).toContain('window._currentTargetSelector = selector');
    });

    it('enterInputMode shows #input-panel', () => {
      const emMatch = viewerScript.match(/function enterInputMode[\s\S]*?^    \}/m);
      expect(emMatch).not.toBeNull();
      const block = emMatch![0];
      expect(block).toContain("getElementById('input-panel')");
      expect(block).toMatch(/ip\.style\.display\s*=\s*['"]flex['"]/);
    });

    it('enterInputMode hides #cursor', () => {
      const emMatch = viewerScript.match(/function enterInputMode[\s\S]*?^    \}/m);
      expect(emMatch).not.toBeNull();
      const block = emMatch![0];
      expect(block).toContain("cursor.style.display = 'none'");
    });

    it('enterInputMode hides #touchpad', () => {
      const emMatch = viewerScript.match(/function enterInputMode[\s\S]*?^    \}/m);
      expect(emMatch).not.toBeNull();
      const block = emMatch![0];
      expect(block).toMatch(/tp\.style\.display\s*=\s*['"]none['"]/);
    });

    it('enterInputMode pre-fills field with initialValue', () => {
      const emMatch = viewerScript.match(/function enterInputMode[\s\S]*?^    \}/m);
      expect(emMatch).not.toBeNull();
      const block = emMatch![0];
      expect(block).toContain('field.value = initialValue');
    });
  });

  describe('compositionend handler syncs immediately', () => {
    it('compositionend listener exists in enterInputMode', () => {
      const emMatch = viewerScript.match(/function enterInputMode[\s\S]*?^    \}/m);
      expect(emMatch).not.toBeNull();
      const block = emMatch![0];
      expect(block).toContain("addEventListener('compositionend'");
    });

    it('compositionend sets window._fieldComposing = false BEFORE syncing', () => {
      const compMatch = viewerScript.match(
        /addEventListener\(['"]compositionend['"][\s\S]*?syncInputToRemote/
      );
      expect(compMatch).not.toBeNull();
      const block = compMatch![0];
      const lines = block.split('\n');
      const composingFalseIdx = lines.findIndex((l) => l.includes('_fieldComposing = false'));
      const syncIdx = lines.findIndex((l) => l.includes('syncInputToRemote'));
      expect(composingFalseIdx).toBeLessThan(syncIdx);
    });
  });

  describe('RAF poll respects composition guard', () => {
    it('RAF poll defined in enterInputMode', () => {
      const emMatch = viewerScript.match(/function enterInputMode[\s\S]*?^    \}/m);
      expect(emMatch).not.toBeNull();
      const block = emMatch![0];
      expect(block).toContain('requestAnimationFrame');
    });

    it('RAF poll skips sync when window._fieldComposing is true', () => {
      const pollMatch = viewerScript.match(
        /function poll\(\)[\s\S]*?requestAnimationFrame\(poll\)/m
      );
      expect(pollMatch).not.toBeNull();
      const block = pollMatch![0];
      expect(block).toMatch(/if\s*\(\s*!window\._fieldComposing\s*\)/);
    });

    it('RAF poll calls syncInputToRemote when value changes and not composing', () => {
      const pollMatch = viewerScript.match(
        /function poll\(\)[\s\S]*?requestAnimationFrame\(poll\)/m
      );
      expect(pollMatch).not.toBeNull();
      const block = pollMatch![0];
      expect(block).toContain('syncInputToRemote');
      expect(block).toMatch(/if\s*\(\s*!window\._fieldComposing\s*\)/);
    });
  });

  describe('exitInputMode cleans up properly', () => {
    it('exitInputMode resets window._fieldComposing = false', () => {
      const exMatch = viewerScript.match(/function exitInputMode[\s\S]*?^    \}/m);
      expect(exMatch).not.toBeNull();
      const block = exMatch![0];
      expect(block).toContain('window._fieldComposing = false');
    });

    it('exitInputMode cancels animation frame', () => {
      const exMatch = viewerScript.match(/function exitInputMode[\s\S]*?^    \}/m);
      expect(exMatch).not.toBeNull();
      const block = exMatch![0];
      expect(block).toContain('cancelAnimationFrame');
      expect(block).toContain('_inputPollRaf');
    });

    it('exitInputMode clears field value', () => {
      const exMatch = viewerScript.match(/function exitInputMode[\s\S]*?^    \}/m);
      expect(exMatch).not.toBeNull();
      const block = exMatch![0];
      expect(block).toContain("field.value = ''");
    });

    it('exitInputMode hides input-panel', () => {
      const exMatch = viewerScript.match(/function exitInputMode[\s\S]*?^    \}/m);
      expect(exMatch).not.toBeNull();
      const block = exMatch![0];
      expect(block).toMatch(/ip\.style\.display\s*=\s*['"]none['"]/);
    });

    it('exitInputMode shows cursor again', () => {
      const exMatch = viewerScript.match(/function exitInputMode[\s\S]*?^    \}/m);
      expect(exMatch).not.toBeNull();
      const block = exMatch![0];
      expect(block).toContain("cursor.style.display = 'block'");
    });

    it('exitInputMode shows touchpad again on touch device', () => {
      const exMatch = viewerScript.match(/function exitInputMode[\s\S]*?^    \}/m);
      expect(exMatch).not.toBeNull();
      const block = exMatch![0];
      expect(block).toMatch(
        /tp\.style\.display\s*=\s*isTouchDevice\s*\?\s*['"]flex['"]\s*:\s*['"]none['"]/
      );
    });

    it('exitInputMode sends input_blur_element to daemon', () => {
      const exMatch = viewerScript.match(/function exitInputMode[\s\S]*?^    \}/m);
      expect(exMatch).not.toBeNull();
      const block = exMatch![0];
      expect(block).toContain("type: 'input_blur_element'");
      expect(block).toContain('_currentTargetSelector');
    });
  });

  describe('syncInputToRemote sends correct messages', () => {
    it('syncInputToRemote sends type: input_fill', () => {
      const sirMatch = viewerScript.match(/function syncInputToRemote[\s\S]*?^    \}/m);
      expect(sirMatch).not.toBeNull();
      const block = sirMatch![0];
      expect(block).toContain("type: 'input_fill'");
    });

    it('syncInputToRemote includes selector', () => {
      const sirMatch = viewerScript.match(/function syncInputToRemote[\s\S]*?^    \}/m);
      expect(sirMatch).not.toBeNull();
      const block = sirMatch![0];
      expect(block).toContain('window._currentTargetSelector');
    });

    it('syncInputToRemote only sends when value changed', () => {
      const sirMatch = viewerScript.match(/function syncInputToRemote[\s\S]*?^    \}/m);
      expect(sirMatch).not.toBeNull();
      const block = sirMatch![0];
      expect(block).toContain('field.dataset.lastSent');
      expect(block).toMatch(/if\s*\(current\s*===\s*lastSent\)/);
    });
  });

  describe('input_focused handler in viewer', () => {
    it('input_focused case calls enterInputMode', () => {
      const ifMatch = viewerScript.match(/case\s+['"]input_focused['"][\s\S]{0,200}enterInputMode/);
      expect(ifMatch).not.toBeNull();
    });

    it('input_focused constructs selector from id', () => {
      const ifMatch = viewerScript.match(/case\s+['"]input_focused['"][\s\S]{0,200}#/);
      expect(ifMatch).not.toBeNull();
    });

    it('input_focused guards against double-entry (inputMode check)', () => {
      const ifMatch = viewerScript.match(
        /case\s+['"]input_focused['"][\s\S]{0,100}if\s*\(\s*inputMode\s*\)\s*return/
      );
      expect(ifMatch).not.toBeNull();
    });
  });
});
