import { describe, it, expect } from 'vitest';
import sharp from 'sharp';

interface ElementBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Simulates the standalone server's broadcastFrame() element-mode crop pipeline.
 *
 * Scenario: Chrome screencast scales viewport to fit maxWidth/maxHeight.
 * - Browser viewport: 1920x1080 (logical coordinates for getBoundingClientRect)
 * - Chrome screencast image: 1280x720 actual pixels (scaleX=2/3, scaleY=2/3)
 * - metadata.deviceWidth=1920, deviceHeight=1080
 * - Element at viewport (100, 200, 400, 300) in logical coords
 *
 * The bug: without resize back to logical dims, output JPEG pixel size != declared deviceW/H.
 */
async function simulateCropPipeline(
  framePixels: { width: number; height: number },
  metaDeviceDims: { width: number; height: number },
  box: ElementBox,
  withResizeBackToLogical: boolean
): Promise<{ pixelWidth: number; pixelHeight: number }> {
  const inputBuffer = await sharp({
    create: {
      width: framePixels.width,
      height: framePixels.height,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  })
    .jpeg()
    .toBuffer();

  const scaleX = framePixels.width / metaDeviceDims.width;
  const scaleY = framePixels.height / metaDeviceDims.height;

  let left = Math.round(box.x * scaleX);
  let top = Math.round(box.y * scaleY);
  let w = Math.round(box.width * scaleX);
  let h = Math.round(box.height * scaleY);

  left = Math.max(0, Math.min(left, framePixels.width - 1));
  top = Math.max(0, Math.min(top, framePixels.height - 1));
  w = Math.min(w, framePixels.width - left);
  h = Math.min(h, framePixels.height - top);

  let pipeline = sharp(inputBuffer).extract({ left, top, width: w, height: h });

  if (withResizeBackToLogical) {
    pipeline = pipeline.resize(box.width, box.height);
  }

  const output = await pipeline.jpeg({ quality: 80 }).toBuffer();
  const info = await sharp(output).metadata();
  return { pixelWidth: info.width!, pixelHeight: info.height! };
}

describe('Standalone server - element mode crop dimension consistency', () => {
  describe('element mode crop must produce pixel dimensions matching logical element size', () => {
    it('scaled screencast (1280x720 from 1920x1080) + resize = exact logical dims', async () => {
      const result = await simulateCropPipeline(
        { width: 1280, height: 720 },
        { width: 1920, height: 1080 },
        { x: 100, y: 200, width: 400, height: 300 },
        true
      );

      expect(result.pixelWidth).toBe(400);
      expect(result.pixelHeight).toBe(300);
    });

    it('non-uniform screencast scaling + resize = exact logical dims', async () => {
      const result = await simulateCropPipeline(
        { width: 960, height: 720 },
        { width: 1440, height: 900 },
        { x: 50, y: 80, width: 300, height: 500 },
        true
      );

      expect(result.pixelWidth).toBe(300);
      expect(result.pixelHeight).toBe(500);
    });
  });

  describe('FIX: crop + resize back to logical dimensions', () => {
    it('output pixels should equal element logical dimensions (scaled screencast)', async () => {
      const result = await simulateCropPipeline(
        { width: 1280, height: 720 },
        { width: 1920, height: 1080 },
        { x: 100, y: 200, width: 400, height: 300 },
        true // WITH resize — fixed behavior
      );

      expect(result.pixelWidth).toBe(400);
      expect(result.pixelHeight).toBe(300);
    });

    it('output pixels should match for tall narrow elements', async () => {
      const result = await simulateCropPipeline(
        { width: 1280, height: 720 },
        { width: 1920, height: 1080 },
        { x: 10, y: 20, width: 200, height: 500 },
        true
      );

      expect(result.pixelWidth).toBe(200);
      expect(result.pixelHeight).toBe(500);
    });

    it('output pixels should match for wide short elements', async () => {
      const result = await simulateCropPipeline(
        { width: 1280, height: 720 },
        { width: 1920, height: 1080 },
        { x: 50, y: 100, width: 800, height: 150 },
        true
      );

      expect(result.pixelWidth).toBe(800);
      expect(result.pixelHeight).toBe(150);
    });

    it('output pixels should match for square elements', async () => {
      const result = await simulateCropPipeline(
        { width: 1280, height: 720 },
        { width: 1920, height: 1080 },
        { x: 300, y: 100, width: 256, height: 256 },
        true
      );

      expect(result.pixelWidth).toBe(256);
      expect(result.pixelHeight).toBe(256);
    });

    it('output pixels should match when no scaling needed (1:1 screencast)', async () => {
      const result = await simulateCropPipeline(
        { width: 1280, height: 720 },
        { width: 1280, height: 720 },
        { x: 0, y: 0, width: 640, height: 360 },
        true
      );

      expect(result.pixelWidth).toBe(640);
      expect(result.pixelHeight).toBe(360);
    });

    it('aspect ratio of output must exactly match logical dimensions', async () => {
      const box = { x: 120, y: 340, width: 427, height: 311 };
      const result = await simulateCropPipeline(
        { width: 1280, height: 720 },
        { width: 1920, height: 1080 },
        box,
        true
      );

      const outputRatio = result.pixelWidth / result.pixelHeight;
      const logicalRatio = box.width / box.height;
      expect(outputRatio).toBeCloseTo(logicalRatio, 10);
    });
  });

  describe('sendCroppedFrame replay path consistency', () => {
    it('replay cropped frame should also produce correct dimensions', async () => {
      const result = await simulateCropPipeline(
        { width: 1280, height: 720 },
        { width: 1920, height: 1080 },
        { x: 200, y: 150, width: 350, height: 280 },
        true
      );

      expect(result.pixelWidth).toBe(350);
      expect(result.pixelHeight).toBe(280);
    });
  });
});
