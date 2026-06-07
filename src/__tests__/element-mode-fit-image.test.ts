import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Root cause: When status message updates metadata (e.g., transitioning to element mode),
 * fitImageToContainer() is NOT called. The <img> retains its previous dimensions,
 * causing screenToPage() to use wrong scale factors.
 */

function computeDisplaySize(
  containerW: number,
  containerH: number,
  imgW: number,
  imgH: number
): { width: number; height: number } {
  if (imgW <= 0 || imgH <= 0 || containerW <= 0 || containerH <= 0) {
    return { width: 0, height: 0 };
  }
  const imgRatio = imgW / imgH;
  const contRatio = containerW / containerH;
  let dw: number, dh: number;
  if (imgRatio > contRatio) {
    dw = containerW;
    dh = containerW / imgRatio;
  } else {
    dh = containerH;
    dw = containerH * imgRatio;
  }
  return { width: Math.round(dw), height: Math.round(dh) };
}

function screenToPageY(
  screenY: number,
  rectTop: number,
  rectHeight: number,
  deviceHeight: number,
  elementY: number
): number {
  if (rectHeight <= 0) return elementY;
  const scaleY = deviceHeight / rectHeight;
  return Math.round((screenY - rectTop) * scaleY) + elementY;
}

describe('Element mode - fitImageToContainer must be called on status change', () => {
  describe('BUG: stale display size causes wrong coordinates', () => {
    /**
     * Scenario: PC browser, wide container, transition from fullscreen 16:9 to tall narrow element.
     * Fullscreen is width-constrained, element is height-constrained -> VERY different display heights.
     */
    it('Phone: 16:9 fullscreen -> portrait element produces large Y error without refit', () => {
      const cw = 390,
        ch = 446;

      // Fullscreen 1280x720 on phone -> width-priority (img wider than container ratio)
      const fsDisplay = computeDisplaySize(cw, ch, 1280, 720);
      expect(fsDisplay.width).toBe(390);
      expect(fsDisplay.height).toBeLessThan(ch); // width-constrained, height < container

      // Status switches to portrait element mode: 300x600 (tall narrow)
      // BUG: fitImageToContainer NOT called -> image still fsDisplay size!
      const elemW = 300,
        elemH = 600,
        elemY = 50;

      // User taps at 70% down the visible image
      const tapY = fsDisplay.height * 0.7;

      // WRONG: uses element metadata with stale fullscreen display size
      const wrongY = screenToPageY(tapY, 0, fsDisplay.height, elemH, elemY);

      // CORRECT: after fitImageToContainer with element dims
      const elemDisplay = computeDisplaySize(cw, ch, elemW, elemH);
      expect(elemDisplay.height).not.toBe(fsDisplay.height); // different height!
      const correctY = screenToPageY(tapY, 0, elemDisplay.height, elemH, elemY);

      const error = Math.abs(wrongY - correctY);
      expect(error).toBeGreaterThan(100);
    });

    it('Phone: fullscreen -> wide element produces Y error without refit', () => {
      const cw = 390,
        ch = 446;

      // Fullscreen 1280x720 on phone -> width-priority
      const fsDisplay = computeDisplaySize(cw, ch, 1280, 720);

      // Element mode: wide element 800x150 (like a banner)
      const elemW = 800,
        elemH = 150,
        elemY = 200;

      const tapY = fsDisplay.height * 0.7;

      const wrongY = screenToPageY(tapY, 0, fsDisplay.height, elemH, elemY);

      const elemDisplay = computeDisplaySize(cw, ch, elemW, elemH);
      const correctY = screenToPageY(tapY, 0, elemDisplay.height, elemH, elemY);

      const error = Math.abs(wrongY - correctY);
      expect(error).toBeGreaterThan(30);
    });

    it('Y error is zero after calling fitImageToContainer (the fix)', () => {
      const cw = 1842,
        ch = 1036;
      const elemW = 200,
        elemH = 500,
        elemY = 100;

      // After fix: status handler calls fitImageToContainer
      const elemDisplay = computeDisplaySize(cw, ch, elemW, elemH);

      for (const frac of [0, 0.25, 0.5, 0.75, 1.0]) {
        const screenY = frac * elemDisplay.height;
        const pageY = screenToPageY(screenY, 0, elemDisplay.height, elemH, elemY);
        const expected = Math.round(frac * elemH) + elemY;
        expect(pageY).toBe(expected);
      }
    });
  });
});

describe('Inline viewer script - pattern verification', () => {
  let script: string;

  beforeAll(() => {
    const srcPath = path.join(__dirname, '../viewer/app.js');
    const srcContent = fs.readFileSync(srcPath, 'utf-8');

    // Extract buildViewerScript function body to find inline template
    // We just need to check the template string contains the pattern
    script = srcContent;
  });

  it('status handler block must contain fitImageToContainer call', () => {
    // Check that somewhere between 'case \'status\'' and its 'break',
    // there is a call to fitImageToContainer()
    const statusMatch = script.match(/case\s+['"]status['"][\s\S]*?break\s*;/);
    expect(statusMatch).not.toBeNull();
    const statusBlock = statusMatch![0];
    expect(statusBlock).toContain('fitImageToContainer');
  });

  it('sendCroppedFrame in standalone server must include element in metadata', () => {
    const standalonePath = path.join(__dirname, '../stream-server-standalone.ts');
    const code = fs.readFileSync(standalonePath, 'utf-8');

    // Find sendCroppedFrame method and check its croppedHeader includes element
    const funcMatch = code.match(/private\s+async\s+sendCroppedFrame[\s\S]*?^  \}/m);
    expect(funcMatch).not.toBeNull();
    const funcBody = funcMatch![0];
    expect(funcBody).toContain('element');
  });
});
