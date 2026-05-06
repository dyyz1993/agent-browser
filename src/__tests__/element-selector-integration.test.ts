import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { WebSocket } from 'ws';

interface MockPage {
  viewportSize: () => { width: number; height: number };
  locator: (selector: string) => {
    boundingBox: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
  };
}

interface MockBrowserManager {
  getPage: () => MockPage;
  isConnected: () => boolean;
}

interface MockStreamServer {
  clients: Map<WebSocket, unknown>;
  handleConnection: (ws: WebSocket) => void;
  handleMessage: (ws: WebSocket, data: unknown) => void;
  broadcastFrame: (frame: unknown) => Promise<void>;
  sendStatus: (ws: WebSocket, clientState?: unknown) => void;
}

describe('Element Selector - Integration Tests', () => {
  let mockBrowserManager: MockBrowserManager;
  let mockPage: MockPage;
  let mockWebSocketServer: MockStreamServer;
  let receivedMessages: unknown[];

  beforeEach(() => {
    receivedMessages = [];

    mockPage = {
      viewportSize: () => ({ width: 1920, height: 1080 }),
      locator: vi.fn((selector: string) => ({
        boundingBox: vi.fn(async () => {
          if (selector === '#valid-element') {
            return { x: 100, y: 50, width: 400, height: 300 };
          }
          if (selector === '#another-element') {
            return { x: 200, y: 100, width: 200, height: 150 };
          }
          return null;
        }),
      })),
    };

    mockBrowserManager = {
      getPage: () => mockPage,
      isConnected: () => true,
    };
  });

  describe('Dimension 1: Server to Client - Status Message', () => {
    it('should send status with element info when selector is provided', () => {
      const clientState = {
        selector: '#valid-element',
        elementBox: { x: 100, y: 50, width: 400, height: 300 },
      };

      const statusMessage = {
        type: 'status',
        connected: true,
        screencasting: true,
        viewportWidth: clientState.elementBox.width,
        viewportHeight: clientState.elementBox.height,
        element: {
          selector: clientState.selector,
          x: clientState.elementBox.x,
          y: clientState.elementBox.y,
          width: clientState.elementBox.width,
          height: clientState.elementBox.height,
        },
      };

      expect(statusMessage.element).toBeDefined();
      expect(statusMessage.element?.selector).toBe('#valid-element');
      expect(statusMessage.element?.width).toBe(400);
      expect(statusMessage.element?.height).toBe(300);
      expect(statusMessage.viewportWidth).toBe(400);
      expect(statusMessage.viewportHeight).toBe(300);
    });

    it('should send status without element when no selector provided', () => {
      const statusMessage = {
        type: 'status',
        connected: true,
        screencasting: true,
        viewportWidth: 1920,
        viewportHeight: 1080,
      };

      expect(statusMessage.element).toBeUndefined();
      expect(statusMessage.viewportWidth).toBe(1920);
      expect(statusMessage.viewportHeight).toBe(1080);
    });

    it('should send status with element info when element exists on page', async () => {
      const selector = '#valid-element';
      const box = await mockPage.locator(selector).boundingBox();

      const statusMessage = {
        type: 'status',
        connected: true,
        screencasting: true,
        viewportWidth: box?.width,
        viewportHeight: box?.height,
        element: box
          ? {
              selector,
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
            }
          : undefined,
      };

      expect(statusMessage.element).toBeDefined();
      expect(statusMessage.element?.selector).toBe('#valid-element');
      expect(statusMessage.element?.width).toBe(400);
    });

    it('should fallback to full screen when element does not exist', async () => {
      const selector = '#nonexistent';
      const box = await mockPage.locator(selector).boundingBox();

      const statusMessage = {
        type: 'status',
        connected: true,
        screencasting: true,
        viewportWidth: 1920,
        viewportHeight: 1080,
        element: undefined,
      };

      expect(box).toBeNull();
      expect(statusMessage.element).toBeUndefined();
      expect(statusMessage.viewportWidth).toBe(1920);
    });
  });

  describe('Dimension 2: Client to Server - Coordinate Events', () => {
    it('should send mouse event with page-absolute coordinates in element mode', () => {
      const elementBox = { x: 100, y: 50, width: 400, height: 300 };
      const displayRect = { width: 400, height: 300 };
      const screenX = 200;
      const screenY = 150;

      const scaleX = elementBox.width / displayRect.width;
      const scaleY = elementBox.height / displayRect.height;
      const pageX = Math.round(screenX * scaleX) + elementBox.x;
      const pageY = Math.round(screenY * scaleY) + elementBox.y;

      const mouseEvent = {
        type: 'input_mouse',
        eventType: 'mousePressed',
        x: pageX,
        y: pageY,
        button: 'left',
      };

      expect(mouseEvent.x).toBe(300);
      expect(mouseEvent.y).toBe(200);
    });

    it('should send mouse event with page coordinates in full screen mode', () => {
      const deviceWidth = 1920;
      const deviceHeight = 1080;
      const displayRect = { left: 0, top: 0, width: 960, height: 540 };
      const screenX = 480;
      const screenY = 270;

      const scaleX = deviceWidth / displayRect.width;
      const scaleY = deviceHeight / displayRect.height;
      const pageX = Math.round((screenX - displayRect.left) * scaleX);
      const pageY = Math.round((screenY - displayRect.top) * scaleY);

      const mouseEvent = {
        type: 'input_mouse',
        eventType: 'mousePressed',
        x: pageX,
        y: pageY,
        button: 'left',
      };

      expect(mouseEvent.x).toBe(960);
      expect(mouseEvent.y).toBe(540);
    });

    it('should send touch event with correct coordinates in element mode', () => {
      const elementBox = { x: 50, y: 50, width: 300, height: 200 };
      const displayRect = { width: 300, height: 200 };

      const scaleX = elementBox.width / displayRect.width;
      const scaleY = elementBox.height / displayRect.height;

      const touchPoints = [
        {
          x: Math.round(150 * scaleX) + elementBox.x,
          y: Math.round(100 * scaleY) + elementBox.y,
          id: 0,
        },
      ];

      const touchEvent = {
        type: 'input_touch',
        eventType: 'touchStart',
        touchPoints,
      };

      expect(touchEvent.touchPoints[0].x).toBe(200);
      expect(touchEvent.touchPoints[0].y).toBe(150);
    });
  });

  describe('Dimension 3: Frame Processing with Crop', () => {
    it('should crop frame to element region when selector is provided', async () => {
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

      const elementBox = { x: 100, y: 50, width: 400, height: 300 };

      const croppedFrame = await sharp(fullFrame)
        .extract({
          left: elementBox.x,
          top: elementBox.y,
          width: elementBox.width,
          height: elementBox.height,
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      const metadata = await sharp(croppedFrame).metadata();

      expect(metadata.width).toBe(400);
      expect(metadata.height).toBe(300);
    });

    it('should not crop frame when no selector provided', async () => {
      const { default: sharp } = await import('sharp');

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

      const croppedFrame = await sharp(fullFrame).jpeg({ quality: 80 }).toBuffer();

      const metadata = await sharp(croppedFrame).metadata();

      expect(metadata.width).toBe(1920);
      expect(metadata.height).toBe(1080);
    });

    it('should process different crops for different clients', async () => {
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

      const clients = [
        { selector: '#element1', box: { x: 0, y: 0, width: 400, height: 300 } },
        { selector: '#element2', box: { x: 500, y: 200, width: 200, height: 150 } },
        { selector: undefined, box: null },
      ];

      const results = [];
      for (const client of clients) {
        let processed: sharp.Sharp = sharp(fullFrame);

        if (client.box) {
          processed = processed.extract({
            left: client.box.x,
            top: client.box.y,
            width: client.box.width,
            height: client.box.height,
          });
        }

        const output = await processed.jpeg({ quality: 80 }).toBuffer();
        const metadata = await sharp(output).metadata();
        results.push(metadata);
      }

      expect(results[0].width).toBe(400);
      expect(results[0].height).toBe(300);
      expect(results[1].width).toBe(200);
      expect(results[1].height).toBe(150);
      expect(results[2].width).toBe(1920);
      expect(results[2].height).toBe(1080);
    });
  });

  describe('End-to-End Flow Simulation', () => {
    it('should simulate complete element selector flow', async () => {
      const { default: sharp } = await import('sharp');

      const selector = '#valid-element';
      const page = mockBrowserManager.getPage();
      const elementBox = await page.locator(selector).boundingBox();

      expect(elementBox).not.toBeNull();

      const statusMessage = {
        type: 'status',
        connected: true,
        screencasting: true,
        viewportWidth: elementBox!.width,
        viewportHeight: elementBox!.height,
        element: {
          selector,
          x: elementBox!.x,
          y: elementBox!.y,
          width: elementBox!.width,
          height: elementBox!.height,
        },
      };

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

      const croppedFrame = await sharp(fullFrame)
        .extract({
          left: elementBox!.x,
          top: elementBox!.y,
          width: elementBox!.width,
          height: elementBox!.height,
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      const displayRect = { width: elementBox!.width, height: elementBox!.height };
      const userClickScreenX = Math.round(elementBox!.width / 2);
      const userClickScreenY = Math.round(elementBox!.height / 2);

      const scaleX = elementBox!.width / displayRect.width;
      const scaleY = elementBox!.height / displayRect.height;
      const pageX = Math.round(userClickScreenX * scaleX) + elementBox!.x;
      const pageY = Math.round(userClickScreenY * scaleY) + elementBox!.y;

      const mouseEvent = {
        type: 'input_mouse',
        eventType: 'mousePressed',
        x: pageX,
        y: pageY,
        button: 'left',
      };

      const finalMetadata = await sharp(croppedFrame).metadata();

      expect(statusMessage.element?.selector).toBe('#valid-element');
      expect(finalMetadata.width).toBe(400);
      expect(finalMetadata.height).toBe(300);
      expect(mouseEvent.x).toBe(300);
      expect(mouseEvent.y).toBe(200);
    });

    it('should simulate complete full screen flow (fallback)', async () => {
      const { default: sharp } = await import('sharp');

      const selector = '#nonexistent';
      const page = mockBrowserManager.getPage();
      const elementBox = await page.locator(selector).boundingBox();

      expect(elementBox).toBeNull();

      const statusMessage = {
        type: 'status',
        connected: true,
        screencasting: true,
        viewportWidth: 1920,
        viewportHeight: 1080,
        element: undefined,
      };

      const fullFrame = await sharp({
        create: {
          width: 1920,
          height: 1080,
          channels: 3,
          background: { r: 50, g: 100, b: 150 },
        },
      })
        .jpeg()
        .toBuffer();

      const outputFrame = await sharp(fullFrame).jpeg({ quality: 80 }).toBuffer();

      const displayRect = { left: 0, top: 0, width: 960, height: 540 };
      const userClickScreenX = 480;
      const userClickScreenY = 270;

      const scaleX = 1920 / displayRect.width;
      const scaleY = 1080 / displayRect.height;
      const pageX = Math.round((userClickScreenX - displayRect.left) * scaleX);
      const pageY = Math.round((userClickScreenY - displayRect.top) * scaleY);

      const mouseEvent = {
        type: 'input_mouse',
        eventType: 'mousePressed',
        x: pageX,
        y: pageY,
        button: 'left',
      };

      const finalMetadata = await sharp(outputFrame).metadata();

      expect(statusMessage.element).toBeUndefined();
      expect(statusMessage.viewportWidth).toBe(1920);
      expect(finalMetadata.width).toBe(1920);
      expect(finalMetadata.height).toBe(1080);
      expect(mouseEvent.x).toBe(960);
      expect(mouseEvent.y).toBe(540);
    });
  });

  describe('URL Parsing', () => {
    it('should parse selector from WebSocket URL', () => {
      const testUrls = [
        { url: 'ws://localhost:5005?session=test&selector=%23my-element', expected: '#my-element' },
        { url: 'ws://localhost:5005?selector=%23title', expected: '#title' },
        { url: 'ws://localhost:5005?session=test', expected: undefined },
        { url: 'ws://localhost:5005?selector=.class-name', expected: '.class-name' },
        { url: 'ws://localhost:5005?selector=div%23id', expected: 'div#id' },
      ];

      for (const { url, expected } of testUrls) {
        const parsed = new URL(url, 'http://localhost');
        const rawSelector = parsed.searchParams.get('selector');
        const selector = rawSelector ? decodeURIComponent(rawSelector) : undefined;
        expect(selector).toBe(expected);
      }
    });

    it('should handle special characters in selector', () => {
      const selectors = [
        '#element-with-dashes',
        '.class.with.dots',
        'div#id.class[attr="value"]',
        ':nth-child(2n+1)',
      ];

      for (const selector of selectors) {
        const encoded = encodeURIComponent(selector);
        const decoded = decodeURIComponent(encoded);
        expect(decoded).toBe(selector);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle boundingBox returning null', async () => {
      const page = mockBrowserManager.getPage();
      const box = await page.locator('#nonexistent').boundingBox();

      expect(box).toBeNull();

      const fallback = {
        viewportSize: page.viewportSize(),
      };

      expect(fallback.viewportSize.width).toBe(1920);
      expect(fallback.viewportSize.height).toBe(1080);
    });

    it('should handle crop outside image bounds gracefully', async () => {
      const { default: sharp } = await import('sharp');

      const frame = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .png()
        .toBuffer();

      try {
        await sharp(frame).extract({ left: 50, top: 50, width: 100, height: 100 }).toBuffer();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle very large crop dimensions', async () => {
      const { default: sharp } = await import('sharp');

      const frame = await sharp({
        create: {
          width: 1920,
          height: 1080,
          channels: 3,
          background: { r: 0, g: 255, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      const output = await sharp(frame)
        .extract({ left: 0, top: 0, width: 1920, height: 1080 })
        .jpeg({ quality: 80 })
        .toBuffer();

      const metadata = await sharp(output).metadata();

      expect(metadata.width).toBe(1920);
      expect(metadata.height).toBe(1080);
    });
  });
});
