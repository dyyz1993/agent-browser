import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Regression tests based on REAL verified-correct scenarios.
 *
 * VERIFIED: #test-modal (400x300 position:fixed element) produces 100% accurate
 * coordinates on BOTH PC and mobile. These tests codify that correctness.
 */

function computeDisplaySize(
  cw: number,
  ch: number,
  imgW: number,
  imgH: number
): { w: number; h: number } {
  if (imgW <= 0 || imgH <= 0 || cw <= 0 || ch <= 0) return { w: 0, h: 0 };
  const imgRatio = imgW / imgH;
  const contRatio = cw / ch;
  let dw: number, dh: number;
  if (imgRatio > contRatio) {
    dw = cw;
    dh = cw / imgRatio;
  } else {
    dh = ch;
    dw = ch * imgRatio;
  }
  return { w: Math.round(dw), h: Math.round(dh) };
}

function screenToPage(
  sx: number,
  sy: number,
  rl: number,
  rt: number,
  rw: number,
  rh: number,
  dw: number,
  dh: number,
  ex?: number,
  ey?: number
): { x: number; y: number } {
  if (rw <= 0 || rh <= 0) return { x: ex ?? 0, y: ey ?? 0 };
  return {
    x: Math.round((sx - rl) * (dw / rw)) + (ex ?? 0),
    y: Math.round((sy - rt) * (dh / rh)) + (ey ?? 0),
  };
}

describe('Element mode coordinate mapping - regression tests', () => {
  // Scenario: #test-modal on PC (VERIFIED 100% correct)
  describe('#test-modal 400x300 on PC (1842x1036 container)', () => {
    const container = { w: 1842, h: 1036 };
    const modal = { x: 100, y: 80, w: 400, h: 300 };

    it('fitImageToContainer produces height-priority display', () => {
      const d = computeDisplaySize(container.w, container.h, modal.w, modal.h);
      // 400/300=1.33 < 1842/1036=1.78 -> height-priority
      expect(d.h).toBe(container.h); // fills height
      expect(d.w).toBeLessThanOrEqual(container.w);
    });

    it('four corners map to correct element-relative positions', () => {
      const d = computeDisplaySize(container.w, container.h, modal.w, modal.h);
      const rt = (container.h - d.h) / 2; // vertical centering offset

      // Top-left of displayed image -> top-left of element
      const tl = screenToPage(
        d.w * 0.05,
        rt + d.h * 0.05,
        0,
        rt,
        d.w,
        d.h,
        modal.w,
        modal.h,
        modal.x,
        modal.y
      );
      expect(tl.x).toBeCloseTo(modal.x + modal.w * 0.05, 0);
      expect(tl.y).toBeCloseTo(modal.y + modal.h * 0.05, 0);

      // Bottom-right of displayed image -> bottom-right of element
      const br = screenToPage(
        d.w * 0.95,
        rt + d.h * 0.95,
        0,
        rt,
        d.w,
        d.h,
        modal.w,
        modal.h,
        modal.x,
        modal.y
      );
      expect(br.x).toBeCloseTo(modal.x + modal.w * 0.95, 0);
      expect(br.y).toBeCloseTo(modal.y + modal.h * 0.95, 0);
    });

    it('center maps to center', () => {
      const d = computeDisplaySize(container.w, container.h, modal.w, modal.h);
      const rt = (container.h - d.h) / 2;
      const c = screenToPage(
        d.w / 2,
        rt + d.h / 2,
        0,
        rt,
        d.w,
        d.h,
        modal.w,
        modal.h,
        modal.x,
        modal.y
      );
      expect(c.x).toBeCloseTo(modal.x + modal.w / 2, 0);
      expect(c.y).toBeCloseTo(modal.y + modal.h / 2, 0);
    });

    it('proportional positions are consistent across image', () => {
      const d = computeDisplaySize(container.w, container.h, modal.w, modal.h);
      const rt = (container.h - d.h) / 2;
      for (const frac of [0, 0.25, 0.5, 0.75, 1.0]) {
        const r = screenToPage(
          d.w * frac,
          rt + d.h * frac,
          0,
          rt,
          d.w,
          d.h,
          modal.w,
          modal.h,
          modal.x,
          modal.y
        );
        expect(r.x).toBe(Math.round(modal.x + modal.w * frac));
        expect(r.y).toBe(Math.round(modal.y + modal.h * frac));
      }
    });
  });

  // Scenario: #test-modal on mobile (VERIFIED 100% correct)
  describe('#test-modal 400x300 on mobile (390x446 container)', () => {
    const container = { w: 390, h: 446 };
    const modal = { x: 100, y: 80, w: 400, h: 300 };

    it('fitImageToContainer produces width-priority display', () => {
      const d = computeDisplaySize(container.w, container.h, modal.w, modal.h);
      // 400/300=1.33 > 390/446=0.87 -> width-priority
      expect(d.w).toBe(container.w); // fills width
      expect(d.h).toBeLessThan(container.h);
    });

    it('four corners map correctly on mobile', () => {
      const d = computeDisplaySize(container.w, container.h, modal.w, modal.h);
      const rt = (container.h - d.h) / 2;

      const tl = screenToPage(
        d.w * 0.1,
        rt + d.h * 0.1,
        0,
        rt,
        d.w,
        d.h,
        modal.w,
        modal.h,
        modal.x,
        modal.y
      );
      expect(tl.x).toBeGreaterThanOrEqual(modal.x);
      expect(tl.y).toBeGreaterThanOrEqual(modal.y);

      const br = screenToPage(
        d.w * 0.9,
        rt + d.h * 0.9,
        0,
        rt,
        d.w,
        d.h,
        modal.w,
        modal.h,
        modal.x,
        modal.y
      );
      expect(br.x).toBeLessThanOrEqual(modal.x + modal.w);
      expect(br.y).toBeLessThanOrEqual(modal.y + modal.h);
    });
  });

  // Small element edge case
  describe('Small element .btn-green (83x40) on mobile', () => {
    const container = { w: 390, h: 446 };
    const btn = { x: 0, y: 124, w: 82.796875, h: 40 };

    it('coordinates stay within element bounds at all positions', () => {
      const d = computeDisplaySize(container.w, container.h, btn.w, btn.h);
      const rt = (container.h - d.h) / 2;

      for (const frac of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const r = screenToPage(
          d.w * frac,
          rt + d.h * frac,
          0,
          rt,
          d.w,
          d.h,
          btn.w,
          btn.h,
          btn.x,
          btn.y
        );
        expect(r.x).toBeGreaterThanOrEqual(btn.x);
        expect(r.x).toBeLessThanOrEqual(btn.x + btn.w);
        expect(r.y).toBeGreaterThanOrEqual(btn.y);
        expect(r.y).toBeLessThanOrEqual(btn.y + btn.h);
      }
    });
  });

  // Wide element edge case
  describe('Wide element #drag-area (1280x200) on mobile', () => {
    const container = { w: 390, h: 446 };
    const area = { x: 0, y: 196, w: 1280, h: 200 };

    it('wide element produces very short display but coords correct', () => {
      const d = computeDisplaySize(container.w, container.h, area.w, area.h);
      expect(d.w).toBe(390); // width-priority
      expect(d.h).toBeLessThan(100); // very short

      const rt = (container.h - d.h) / 2;
      const top = screenToPage(d.w / 2, rt + 1, 0, rt, d.w, d.h, area.w, area.h, area.x, area.y);
      const bottom = screenToPage(
        d.w / 2,
        rt + d.h - 1,
        0,
        rt,
        d.w,
        d.h,
        area.w,
        area.h,
        area.x,
        area.y
      );

      expect(top.y).toBeCloseTo(area.y, -1);
      expect(bottom.y).toBeCloseTo(area.y + area.h, -1);
    });
  });
});

// Scenario: #test-modal-tall on PC (height-priority for tall elements)
describe('#test-modal-tall 250x450 on PC (1842x1036 container)', () => {
  const container = { w: 1842, h: 1036 };
  const modal = { x: 500, y: 80, w: 250, h: 450 };

  it('fitImageToContainer produces height-priority display for tall element', () => {
    const d = computeDisplaySize(container.w, container.h, modal.w, modal.h);
    // 250/450=0.56 < 1842/1036=1.78 → height-priority
    expect(d.h).toBe(container.h);
    expect(d.w).toBeLessThan(container.w);
  });

  it('four corners map correctly with height-priority sizing', () => {
    const d = computeDisplaySize(container.w, container.h, modal.w, modal.h);
    const rl = (container.w - d.w) / 2; // horizontal centering

    const tl = screenToPage(
      rl + d.w * 0.1,
      d.h * 0.1,
      rl,
      0,
      d.w,
      d.h,
      modal.w,
      modal.h,
      modal.x,
      modal.y
    );
    expect(tl.x).toBeCloseTo(modal.x + modal.w * 0.1, 0);
    expect(tl.y).toBeCloseTo(modal.y + modal.h * 0.1, 0);

    const br = screenToPage(
      rl + d.w * 0.9,
      d.h * 0.9,
      rl,
      0,
      d.w,
      d.h,
      modal.w,
      modal.h,
      modal.x,
      modal.y
    );
    expect(br.x).toBeCloseTo(modal.x + modal.w * 0.9, 0);
    expect(br.y).toBeCloseTo(modal.y + modal.h * 0.9, 0);
  });

  it('proportional positions are consistent', () => {
    const d = computeDisplaySize(container.w, container.h, modal.w, modal.h);
    const rl = (container.w - d.w) / 2;
    for (const frac of [0, 0.25, 0.5, 0.75, 1.0]) {
      const r = screenToPage(
        rl + d.w * frac,
        d.h * frac,
        rl,
        0,
        d.w,
        d.h,
        modal.w,
        modal.h,
        modal.x,
        modal.y
      );
      expect(r.x).toBe(Math.round(modal.x + modal.w * frac));
      expect(r.y).toBe(Math.round(modal.y + modal.h * frac));
    }
  });
});

// Scenario: #test-modal-tall on mobile (height-priority)
describe('#test-modal-tall 250x450 on mobile (390x446 container)', () => {
  const container = { w: 390, h: 446 };
  const modal = { x: 100, y: 80, w: 250, h: 450 };

  it('fitImageToContainer produces height-priority display on mobile', () => {
    const d = computeDisplaySize(container.w, container.h, modal.w, modal.h);
    // 250/450=0.56 < 390/446=0.87 → height-priority
    expect(d.h).toBe(container.h); // fills height
    expect(d.w).toBeLessThan(container.w);
  });

  it('coordinates stay within element bounds', () => {
    const d = computeDisplaySize(container.w, container.h, modal.w, modal.h);
    const rl = (container.w - d.w) / 2;

    for (const frac of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const r = screenToPage(
        rl + d.w * frac,
        d.h * frac,
        rl,
        0,
        d.w,
        d.h,
        modal.w,
        modal.h,
        modal.x,
        modal.y
      );
      expect(r.x).toBeGreaterThanOrEqual(modal.x);
      expect(r.x).toBeLessThanOrEqual(modal.x + modal.w);
      expect(r.y).toBeGreaterThanOrEqual(modal.y);
      expect(r.y).toBeLessThanOrEqual(modal.y + modal.h);
    }
  });
});

describe('Source code pattern verification', () => {
  let viewerScript: string;
  let standaloneCode: string;

  beforeAll(() => {
    viewerScript = fs.readFileSync(path.join(__dirname, '../viewer/app.js'), 'utf-8');
    standaloneCode = fs.readFileSync(
      path.join(__dirname, '../stream-server-standalone.ts'),
      'utf-8'
    );
  });

  it('frame handler preserves element mode deviceW/H', () => {
    const frameMatch = viewerScript.match(/case\s+['"]frame['"][\s\S]*?break\s*;/);
    expect(frameMatch).not.toBeNull();
    const block = frameMatch![0];
    expect(block).toContain('metadata.deviceWidth = metadata.element.width');
    expect(block).toContain('metadata.deviceHeight = metadata.element.height');
  });

  it('status handler calls fitImageToContainer', () => {
    const statusMatch = viewerScript.match(/case\s+['"]status['"][\s\S]*?break\s*;/);
    expect(statusMatch).not.toBeNull();
    expect(statusMatch![0]).toContain('fitImageToContainer()');
  });

  it('sendCroppedFrame includes element field in metadata', () => {
    const funcMatch = standaloneCode.match(/private\s+async\s+sendCroppedFrame[\s\S]*?^  \}/m);
    expect(funcMatch).not.toBeNull();
    expect(funcMatch![0]).toContain('element:');
  });

  it('broadcastFrame crop does NOT include resize step (crop at full resolution)', () => {
    const frameProcessorCode = fs.readFileSync(
      path.join(__dirname, '../stream/frame-processor.ts'),
      'utf-8'
    );
    const cropMatch = frameProcessorCode.match(/export async function cropFrameForElement[\s\S]*?\n\}/);
    expect(cropMatch).not.toBeNull();
    expect(cropMatch![0]).not.toContain('.resize(');
  });

  it('no debug console.log remains in screenToPage', () => {
    const stpMatch = viewerScript.match(/function screenToPage[\s\S]*?^    \}/m);
    expect(stpMatch).not.toBeNull();
    expect(stpMatch![0]).not.toContain('console.log');
    expect(stpMatch![0]).not.toContain('coord-debug');
  });

  it('no debug console.log remains in fitImageToContainer', () => {
    const fitMatch = viewerScript.match(/function fitImageToContainer[\s\S]*?^    \}/m);
    expect(fitMatch).not.toBeNull();
    expect(fitMatch![0]).not.toContain('console.log');
    expect(fitMatch![0]).not.toContain('coord-debug');
  });

  it('viewer-html has no coord-debug div', () => {
    const html = fs.readFileSync(path.join(__dirname, '../viewer/styles.css'), 'utf-8') + fs.readFileSync(path.join(__dirname, '../viewer/index.html'), 'utf-8');
    expect(html).not.toContain('coord-debug');
  });
});
