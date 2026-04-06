import { describe, it, expect } from 'vitest';
import { screenToPage, ScreenToPageRect, ElementBox } from '../viewer-script.js';

function r(w: number, h: number, l = 0, t = 0): ScreenToPageRect {
  return { width: w, height: h, left: l, top: t };
}

function el(x: number, y: number, w: number, h: number): ElementBox {
  return { x, y, width: w, height: h };
}

describe('screenToPage - pure linear coordinate mapping', () => {
  describe('full-screen mode - linear mapping (no letterbox needed)', () => {
    // Scenario: PC viewer, container 1842x1036, device 1280x720
    // fitImageToContainer chose height-priority (img ratio < container ratio)
    const rect = r(1842, 1036, 39, 52);
    const dw = 1280,
      dh = 720;

    it('top-left of image area maps to (0,0)', () => {
      expect(screenToPage(39, 52, rect, dw, dh)).toEqual({ x: 0, y: 0 });
    });

    it('bottom-right of image area maps to (deviceW, deviceH)', () => {
      expect(screenToPage(1881, 1088, rect, dw, dh)).toEqual({ x: 1280, y: 720 });
    });

    it('center of image maps to half device dimensions', () => {
      const result = screenToPage(960, 570, rect, dw, dh);
      expect(result.x).toBeCloseTo(640, -1);
      expect(result.y).toBeCloseTo(360, -1);
    });

    it('25% across image gives 25% of device coords', () => {
      const result = screenToPage(500, 310, rect, dw, dh);
      expect(result.x / dw).toBeCloseTo(0.25, 1);
      expect(result.y / dh).toBeCloseTo(0.25, 1);
    });

    it('50% across image gives 50% of device coords', () => {
      const result = screenToPage(940, 568, rect, dw, dh);
      expect(result.x / dw).toBeCloseTo(0.5, 1);
      expect(result.y / dh).toBeCloseTo(0.5, 1);
    });

    it('75% across image gives 75% of device coords', () => {
      const result = screenToPage(1420, 827, rect, dw, dh);
      expect(result.x / dw).toBeCloseTo(0.75, 1);
      expect(result.y / dh).toBeCloseTo(0.75, 1);
    });
  });

  describe('full-screen mode - mobile width-priority (16:9 on phone)', () => {
    // Phone: container 390x219, device 1280x720
    // fitImageToContainer chose width-priority (img ratio > container ratio)
    const rect = r(390, 219, 0, 44);
    const dw = 1280,
      dh = 720;

    it('top-left maps to (0,0)', () => {
      expect(screenToPage(0, 44, rect, dw, dh)).toEqual({ x: 0, y: 0 });
    });

    it('bottom-right maps to (deviceW, deviceH)', () => {
      expect(screenToPage(390, 263, rect, dw, dh)).toEqual({ x: 1280, y: 720 });
    });

    it('center maps to half device dimensions', () => {
      const result = screenToPage(195, 153, rect, dw, dh);
      expect(result.x).toBe(640);
      expect(result.y).toBeCloseTo(360, -1);
    });
  });

  describe('full-screen mode - portrait device (9:16) on PC', () => {
    // PC: container 583x1036, device 720x1280
    const rect = r(583, 1036, 668, 0);
    const dw = 720,
      dh = 1280;

    it('top-left maps to (0,0)', () => {
      expect(screenToPage(668, 0, rect, dw, dh)).toEqual({ x: 0, y: 0 });
    });

    it('bottom-right maps to (deviceW, deviceH)', () => {
      expect(screenToPage(1251, 1036, rect, dw, dh)).toEqual({ x: 720, y: 1280 });
    });
  });

  describe('element mode - wide element (linear + offset)', () => {
    // PC: element 400x300 at (50,100), displayed as 1381x1036
    // In element mode, deviceW/H = element dimensions (server crops to element)
    const rect = r(1381, 1036, 269, 0);
    const elem = el(50, 100, 400, 300);

    it('image top-left + element offset = element position', () => {
      const result = screenToPage(269, 0, rect, 400, 300, elem);
      expect(result.x).toBeCloseTo(50, 0);
      expect(result.y).toBeCloseTo(100, 0);
    });

    it('image bottom-right + offset = element bottom-right', () => {
      const result = screenToPage(1650, 1036, rect, 400, 300, elem);
      expect(result.x).toBeCloseTo(450, 0);
      expect(result.y).toBeCloseTo(400, 0);
    });

    it('image center + offset = element center', () => {
      const result = screenToPage(959, 518, rect, 400, 300, elem);
      expect(result.x).toBeCloseTo(250, 0);
      expect(result.y).toBeCloseTo(250, 0);
    });
  });

  describe('element mode - tall element (linear + offset) on phone', () => {
    // Phone: element 200x500 at (10,20), displayed as 178x446
    // In element mode, deviceW/H = element dimensions
    const rect = r(178, 446, 106, 44);
    const elem = el(10, 20, 200, 500);

    it('image top-left + offset = element position', () => {
      const result = screenToPage(106, 44, rect, 200, 500, elem);
      expect(result.x).toBeCloseTo(10, 0);
      expect(result.y).toBeCloseTo(20, 0);
    });

    it('image bottom-right + offset = element bottom-right', () => {
      const result = screenToPage(284, 490, rect, 200, 500, elem);
      expect(result.x).toBeCloseTo(210, 0);
      expect(result.y).toBeCloseTo(520, 0);
    });
  });

  describe('element mode - square element', () => {
    // Square element has ratio 1:1, same as container in this test
    // In element mode, deviceW/H = element dimensions
    const rect = r(800, 800, 100, 100);
    const elem = el(200, 300, 100, 100);

    it('element corners with offset', () => {
      const tl = screenToPage(100, 100, rect, 100, 100, elem);
      expect(tl.x).toBeCloseTo(200, 0);
      expect(tl.y).toBeCloseTo(300, 0);

      const br = screenToPage(900, 900, rect, 100, 100, elem);
      expect(br.x).toBeCloseTo(300, 0);
      expect(br.y).toBeCloseTo(400, 0);
    });
  });

  describe('edge cases', () => {
    it('zero-size rect returns zeros without crash', () => {
      expect(screenToPage(0, 0, r(0, 0), 800, 600)).toEqual({ x: 0, y: 0 });
    });

    it('element same size as device behaves like full-screen', () => {
      const rect = r(800, 600, 0, 0);
      const elem = el(0, 0, 1280, 720);
      expect(screenToPage(400, 300, rect, 1280, 720, elem)).toEqual(
        screenToPage(400, 300, rect, 1280, 720)
      );
    });
  });

  describe('proportional mapping invariant', () => {
    it('25%/50%/75% always gives correct proportion (any aspect ratio)', () => {
      const cases = [
        { rect: r(1842, 1036), dw: 1280, dh: 720 },
        { rect: r(390, 219), dw: 1280, dh: 720 },
        { rect: r(583, 1036), dw: 720, dh: 1280 },
        { rect: r(178, 446), dw: 1280, dh: 720 },
      ];
      for (const c of cases) {
        for (const frac of [0.25, 0.5, 0.75]) {
          const p = screenToPage(
            c.rect.left + c.rect.width * frac,
            c.rect.top + c.rect.height * frac,
            c.rect,
            c.dw,
            c.dh
          );
          expect(p.x / c.dw).toBeCloseTo(frac, 1);
          expect(p.y / c.dh).toBeCloseTo(frac, 1);
        }
      }
    });
  });

  describe('offset rect (non-zero left/top)', () => {
    it('handles offset rect correctly', () => {
      const rect = r(400, 300, 50, 80);
      expect(screenToPage(250, 230, rect, 800, 600)).toEqual({ x: 400, y: 300 });
      expect(screenToPage(450, 380, rect, 800, 600)).toEqual({ x: 800, y: 600 });
    });
  });
});
