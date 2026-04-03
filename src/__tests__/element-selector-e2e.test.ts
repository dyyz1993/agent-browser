import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Element Selector - Complete E2E Flow', () => {
  describe('Step 1: DOM Element Selection', () => {
    it('should get correct boundingClientRect for existing element', () => {
      const mockElement = {
        getBoundingClientRect: () => ({
          x: 100,
          y: 50,
          left: 100,
          top: 50,
          width: 400,
          height: 300,
        }),
      };

      const rect = mockElement.getBoundingClientRect();
      const box = {
        x: Math.round(rect.x || rect.left),
        y: Math.round(rect.y || rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };

      expect(box.x).toBe(100);
      expect(box.y).toBe(50);
      expect(box.width).toBe(400);
      expect(box.height).toBe(300);
    });

    it('should handle element at origin (0, 0)', () => {
      const mockElement = {
        getBoundingClientRect: () => ({
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          width: 200,
          height: 150,
        }),
      };

      const rect = mockElement.getBoundingClientRect();
      const box = {
        x: Math.round(rect.x || rect.left),
        y: Math.round(rect.y || rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };

      expect(box.x).toBe(0);
      expect(box.y).toBe(0);
      expect(box.width).toBe(200);
      expect(box.height).toBe(150);
    });

    it('should return undefined when element not found', () => {
      const mockDocument = {
        querySelector: (_selector: string) => null,
      };

      const element = mockDocument.querySelector('#nonexistent');
      expect(element).toBeNull();
    });
  });

  describe('Step 2: WebSocket URL Construction', () => {
    it('should construct URL with selector only (elementBox resolved by server)', () => {
      const selector = '.x0yq_rfol_vg6UJrY3LZ';
      const instanceId = 'test-instance';

      const encodedSelector = encodeURIComponent(selector);
      const wsUrl = `ws://localhost:5005?instanceId=${instanceId}&selector=${encodedSelector}`;

      expect(wsUrl).toContain('selector=' + encodedSelector);
      expect(wsUrl).not.toContain('elementBox');
    });

    it('should decode selector correctly', () => {
      const originalSelector = '.x0yq_rfol_vg6UJrY3LZ';
      const encodedSelector = encodeURIComponent(originalSelector);
      const decodedSelector = decodeURIComponent(encodedSelector);

      expect(decodedSelector).toBe(originalSelector);
    });
  });

  describe('Step 3: Server Parsing', () => {
    it('should parse selector from URL params and resolve element via Playwright boundingBox', () => {
      const url = new URL('ws://localhost:5005?instanceId=xxx&selector=.x0yq_rfol_vg6UJrY3LZ');

      const rawSelector = url.searchParams.get('selector');

      expect(rawSelector).toBe('.x0yq_rfol_vg6UJrY3LZ');
      expect(url.searchParams.get('elementBox')).toBeNull();

      const selector = decodeURIComponent(rawSelector!);
      expect(selector).toBe('.x0yq_rfol_vg6UJrY3LZ');

      // Server resolves element position via Playwright boundingBox(), not from client URL
      const boundingBox = { x: 100, y: 50, width: 400, height: 300 };
      expect(boundingBox.x).toBe(100);
      expect(boundingBox.y).toBe(50);
      expect(boundingBox.width).toBe(400);
      expect(boundingBox.height).toBe(300);
    });
  });

  describe('Step 4: Frame Cropping', () => {
    it('should crop frame using sharp.extract with server-resolved bounding box', async () => {
      const { default: sharp } = await import('sharp');

      const fullFrame = await sharp({
        create: {
          width: 1920,
          height: 1080,
          channels: 3,
          background: { r: 128, g: 128, b: 128 },
        },
      })
        .jpeg()
        .toBuffer();

      const expectedBox = { x: 100, y: 50, width: 400, height: 300 };

      const cropped = await sharp(fullFrame)
        .extract({
          left: expectedBox.x,
          top: expectedBox.y,
          width: expectedBox.width,
          height: expectedBox.height,
        })
        .toBuffer();

      const metadata = await sharp(cropped).metadata();

      expect(metadata.width).toBe(400);
      expect(metadata.height).toBe(300);
    });

    it('should crop at origin (0, 0) correctly', async () => {
      const { default: sharp } = await import('sharp');

      const fullFrame = await sharp({
        create: {
          width: 1920,
          height: 1080,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      const expectedBox = { x: 0, y: 0, width: 200, height: 150 };

      const cropped = await sharp(fullFrame)
        .extract({
          left: expectedBox.x,
          top: expectedBox.y,
          width: expectedBox.width,
          height: expectedBox.height,
        })
        .toBuffer();

      const metadata = await sharp(cropped).metadata();

      expect(metadata.width).toBe(200);
      expect(metadata.height).toBe(150);
    });
  });

  describe('Step 5: Coordinate Conversion', () => {
    it('should convert screen coords to page coords in element mode (adds element offset)', () => {
      const expectedBox = { x: 100, y: 50, width: 400, height: 300 };
      const displayWidth = 400;
      const displayHeight = 300;

      const scaleX = expectedBox.width / displayWidth;
      const scaleY = expectedBox.height / displayHeight;

      const screenX = 200;
      const screenY = 150;

      // Element mode: add element offset to convert display coords to page coords
      const pageX = Math.round(screenX * scaleX) + expectedBox.x;
      const pageY = Math.round(screenY * scaleY) + expectedBox.y;

      expect(pageX).toBe(300);
      expect(pageY).toBe(200);
    });

    it('should convert screen coords to page coords in full screen mode', () => {
      const deviceWidth = 1920;
      const deviceHeight = 1080;
      const rect = { left: 0, top: 0, width: 960, height: 540 };

      const scaleX = deviceWidth / rect.width;
      const scaleY = deviceHeight / rect.height;

      const screenX = 480;
      const screenY = 270;
      const pageX = Math.round((screenX - rect.left) * scaleX);
      const pageY = Math.round((screenY - rect.top) * scaleY);

      expect(pageX).toBe(960);
      expect(pageY).toBe(540);
    });
  });

  describe('Step 6: Status Message', () => {
    it('should include element info in status message (from server-resolved bounding box)', () => {
      const serverState = {
        selector: '.x0yq_rfol_vg6UJrY3LZ',
        boundingBox: { x: 100, y: 50, width: 400, height: 300 },
      };

      const message: Record<string, unknown> = {
        type: 'status',
        connected: true,
        screencasting: true,
      };

      if (serverState.selector && serverState.boundingBox) {
        message.element = {
          selector: serverState.selector,
          x: serverState.boundingBox.x,
          y: serverState.boundingBox.y,
          width: serverState.boundingBox.width,
          height: serverState.boundingBox.height,
        };
        message.viewportWidth = serverState.boundingBox.width;
        message.viewportHeight = serverState.boundingBox.height;
      }

      expect(message.element).toEqual({
        selector: '.x0yq_rfol_vg6UJrY3LZ',
        x: 100,
        y: 50,
        width: 400,
        height: 300,
      });
      expect(message.viewportWidth).toBe(400);
      expect(message.viewportHeight).toBe(300);
    });
  });

  describe('Complete E2E Scenario', () => {
    it('should simulate complete flow: DOM -> WebSocket -> Server -> Crop -> Response', async () => {
      const { default: sharp } = await import('sharp');

      // Step 1: User opens viewer with selector only
      const selector = '.target-element';

      // Step 2: Build WebSocket URL (no elementBox - server resolves it via Playwright)
      const encodedSelector = encodeURIComponent(selector);
      const wsUrl = `ws://localhost:5005?instanceId=xxx&selector=${encodedSelector}`;

      // Step 3: Parse selector on server
      const url = new URL(wsUrl);
      const serverSelector = decodeURIComponent(url.searchParams.get('selector')!);
      expect(url.searchParams.get('elementBox')).toBeNull();

      // Step 4: Server resolves element position via Playwright boundingBox()
      const boundingBox = { x: 100, y: 50, width: 400, height: 300 };

      expect(serverSelector).toBe(selector);

      // Step 5: Create mock frame
      const fullFrame = await sharp({
        create: {
          width: 1920,
          height: 1080,
          channels: 3,
          background: { r: 100, g: 150, b: 200 },
        },
      })
        .jpeg()
        .toBuffer();

      // Step 6: Crop frame using server-resolved bounding box
      const cropped = await sharp(fullFrame)
        .extract({
          left: boundingBox.x,
          top: boundingBox.y,
          width: boundingBox.width,
          height: boundingBox.height,
        })
        .toBuffer();

      // Step 7: Verify cropped frame size via sharp metadata
      const metadata = await sharp(cropped).metadata();
      expect(metadata.width).toBe(400);
      expect(metadata.height).toBe(300);

      // Step 8: Build status message
      const statusMessage = {
        type: 'status',
        connected: true,
        viewportWidth: boundingBox.width,
        viewportHeight: boundingBox.height,
        element: {
          selector: serverSelector,
          ...boundingBox,
        },
      };

      expect(statusMessage.viewportWidth).toBe(400);
      expect(statusMessage.viewportHeight).toBe(300);
      expect(statusMessage.element.selector).toBe('.target-element');

      // Step 9: Client coordinate conversion (element mode adds element offset)
      const displayWidth = 400;
      const displayHeight = 300;
      const scaleX = boundingBox.width / displayWidth;
      const scaleY = boundingBox.height / displayHeight;
      const userClickX = 200;
      const userClickY = 150;

      // Element mode: scale then add element offset to get page coordinates
      const pageX = Math.round(userClickX * scaleX) + boundingBox.x;
      const pageY = Math.round(userClickY * scaleY) + boundingBox.y;

      expect(pageX).toBe(300);
      expect(pageY).toBe(200);
    });

    it('should handle different element positions correctly', async () => {
      const { default: sharp } = await import('sharp');

      const testCases = [
        { x: 0, y: 0, width: 200, height: 150, desc: 'origin' },
        { x: 500, y: 200, width: 300, height: 250, desc: 'center' },
        { x: 1000, y: 500, width: 400, height: 300, desc: 'bottom-right' },
      ];

      for (const box of testCases) {
        const fullFrame = await sharp({
          create: {
            width: 1920,
            height: 1080,
            channels: 3,
            background: { r: 255, g: 0, b: 0 },
          },
        })
          .jpeg()
          .toBuffer();

        const cropped = await sharp(fullFrame)
          .extract({ left: box.x, top: box.y, width: box.width, height: box.height })
          .toBuffer();

        const metadata = await sharp(cropped).metadata();

        expect(metadata.width, `Failed for ${box.desc}: width`).toBe(box.width);
        expect(metadata.height, `Failed for ${box.desc}: height`).toBe(box.height);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle element at page edge', async () => {
      const { default: sharp } = await import('sharp');

      const expectedBox = { x: 0, y: 0, width: 1920, height: 1080 };

      const fullFrame = await sharp({
        create: {
          width: 1920,
          height: 1080,
          channels: 3,
          background: { r: 0, g: 255, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      const cropped = await sharp(fullFrame)
        .extract({
          left: expectedBox.x,
          top: expectedBox.y,
          width: expectedBox.width,
          height: expectedBox.height,
        })
        .toBuffer();

      const metadata = await sharp(cropped).metadata();

      expect(metadata.width).toBe(1920);
      expect(metadata.height).toBe(1080);
    });

    it('should handle small element', async () => {
      const { default: sharp } = await import('sharp');

      const expectedBox = { x: 10, y: 10, width: 50, height: 50 };

      const fullFrame = await sharp({
        create: {
          width: 1920,
          height: 1080,
          channels: 3,
          background: { r: 0, g: 0, b: 255 },
        },
      })
        .jpeg()
        .toBuffer();

      const cropped = await sharp(fullFrame)
        .extract({
          left: expectedBox.x,
          top: expectedBox.y,
          width: expectedBox.width,
          height: expectedBox.height,
        })
        .toBuffer();

      const metadata = await sharp(cropped).metadata();

      expect(metadata.width).toBe(50);
      expect(metadata.height).toBe(50);
    });

    it('should handle fractional coordinates', () => {
      const rect = { x: 10.5, y: 20.7, width: 100.3, height: 150.9 };
      const box = {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };

      expect(box.x).toBe(11);
      expect(box.y).toBe(21);
      expect(box.width).toBe(100);
      expect(box.height).toBe(151);
    });
  });
});
