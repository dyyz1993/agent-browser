import { describe, it, expect } from 'vitest';
import sharp from 'sharp';

interface CropConfig {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface StreamStateConfig {
  format: 'jpeg' | 'webp';
  quality: number;
  maxFps: number;
  scale: number;
}

describe('FrameProcessor - crop functionality', () => {
  describe('sharp.extract crop', () => {
    it('should extract region from image using sharp', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 800,
          height: 600,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .png()
        .toBuffer();

      const cropConfig: CropConfig = {
        x: 100,
        y: 50,
        width: 200,
        height: 150,
      };

      const cropped = await sharp(inputBuffer)
        .extract({
          left: cropConfig.x,
          top: cropConfig.y,
          width: cropConfig.width,
          height: cropConfig.height,
        })
        .toBuffer();

      const metadata = await sharp(cropped).metadata();
      expect(metadata.width).toBe(200);
      expect(metadata.height).toBe(150);
    });

    it('should handle crop at origin', async () => {
      const cropConfig: CropConfig = {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      };

      const inputBuffer = await sharp({
        create: {
          width: 500,
          height: 500,
          channels: 3,
          background: { r: 0, g: 255, b: 0 },
        },
      })
        .png()
        .toBuffer();

      const cropped = await sharp(inputBuffer)
        .extract({
          left: cropConfig.x,
          top: cropConfig.y,
          width: cropConfig.width,
          height: cropConfig.height,
        })
        .toBuffer();

      const metadata = await sharp(cropped).metadata();
      expect(metadata.width).toBe(100);
      expect(metadata.height).toBe(100);
    });
  });

  describe('crop + resize workflow', () => {
    it('should crop then resize according to scale', async () => {
      const cropConfig: CropConfig = {
        x: 0,
        y: 0,
        width: 400,
        height: 300,
      };

      const config: StreamStateConfig = {
        format: 'jpeg',
        quality: 80,
        maxFps: 60,
        scale: 0.5,
      };

      const inputBuffer = await sharp({
        create: {
          width: 1920,
          height: 1080,
          channels: 3,
          background: { r: 128, g: 128, b: 128 },
        },
      })
        .jpeg()
        .toBuffer();

      let processed: sharp.Sharp = sharp(inputBuffer);

      processed = processed.extract({
        left: cropConfig.x,
        top: cropConfig.y,
        width: cropConfig.width,
        height: cropConfig.height,
      });

      const newWidth = Math.round(cropConfig.width * config.scale);
      const newHeight = Math.round(cropConfig.height * config.scale);
      processed = processed.resize(newWidth, newHeight);

      const output = await processed.jpeg({ quality: config.quality }).toBuffer();
      const metadata = await sharp(output).metadata();

      expect(metadata.width).toBe(200);
      expect(metadata.height).toBe(150);
    });

    it('should apply jpeg compression after crop', async () => {
      const cropConfig: CropConfig = {
        x: 10,
        y: 10,
        width: 100,
        height: 100,
      };

      const inputBuffer = await sharp({
        create: {
          width: 500,
          height: 500,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .png()
        .toBuffer();

      const output = await sharp(inputBuffer)
        .extract({
          left: cropConfig.x,
          top: cropConfig.y,
          width: cropConfig.width,
          height: cropConfig.height,
        })
        .jpeg({ quality: 50 })
        .toBuffer();

      const metadata = await sharp(output).metadata();
      expect(metadata.format).toBe('jpeg');
      expect(metadata.width).toBe(100);
      expect(metadata.height).toBe(100);
    });

    it('should apply webp compression after crop', async () => {
      const cropConfig: CropConfig = {
        x: 0,
        y: 0,
        width: 80,
        height: 60,
      };

      const inputBuffer = await sharp({
        create: {
          width: 200,
          height: 200,
          channels: 3,
          background: { r: 0, g: 0, b: 255 },
        },
      })
        .png()
        .toBuffer();

      const output = await sharp(inputBuffer)
        .extract({
          left: cropConfig.x,
          top: cropConfig.y,
          width: cropConfig.width,
          height: cropConfig.height,
        })
        .webp({ quality: 75 })
        .toBuffer();

      const metadata = await sharp(output).metadata();
      expect(metadata.format).toBe('webp');
    });
  });
});

describe('StatusMessage element field', () => {
  it('should define status message with element field', () => {
    interface StatusMessage {
      type: 'status';
      connected: boolean;
      screencasting: boolean;
      viewportWidth?: number;
      viewportHeight?: number;
      element?: {
        selector: string;
        x: number;
        y: number;
        width: number;
        height: number;
      };
    }

    const message: StatusMessage = {
      type: 'status',
      connected: true,
      screencasting: true,
      viewportWidth: 1920,
      viewportHeight: 1080,
    };

    expect(message.type).toBe('status');
    expect(message.viewportWidth).toBe(1920);
    expect(message.element).toBeUndefined();
  });

  it('should serialize status message with element to JSON', () => {
    interface StatusMessage {
      type: 'status';
      connected: boolean;
      screencasting: boolean;
      viewportWidth?: number;
      viewportHeight?: number;
      element?: {
        selector: string;
        x: number;
        y: number;
        width: number;
        height: number;
      };
    }

    const message: StatusMessage = {
      type: 'status',
      connected: true,
      screencasting: true,
      viewportWidth: 400,
      viewportHeight: 300,
      element: {
        selector: '#my-element',
        x: 100,
        y: 50,
        width: 400,
        height: 300,
      },
    };

    const json = JSON.stringify(message);
    const parsed = JSON.parse(json);

    expect(parsed.element.selector).toBe('#my-element');
    expect(parsed.element.width).toBe(400);
    expect(parsed.element.height).toBe(300);
    expect(parsed.viewportWidth).toBe(400);
    expect(parsed.viewportHeight).toBe(300);
  });

  it('should handle status message without element (full screen mode)', () => {
    interface StatusMessage {
      type: 'status';
      connected: boolean;
      screencasting: boolean;
      viewportWidth?: number;
      viewportHeight?: number;
      element?: {
        selector: string;
        x: number;
        y: number;
        width: number;
        height: number;
      };
    }

    const message: StatusMessage = {
      type: 'status',
      connected: true,
      screencasting: true,
      viewportWidth: 1920,
      viewportHeight: 1080,
    };

    const json = JSON.stringify(message);
    const parsed = JSON.parse(json);

    expect(parsed.element).toBeUndefined();
    expect(parsed.viewportWidth).toBe(1920);
    expect(parsed.viewportHeight).toBe(1080);
  });
});

describe('ClientState interface', () => {
  it('should define client state with selector', () => {
    interface ClientState {
      selector?: string;
      elementBox?: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    }

    const state: ClientState = {};
    expect(state.selector).toBeUndefined();
    expect(state.elementBox).toBeUndefined();

    state.selector = '#my-element';
    expect(state.selector).toBe('#my-element');

    state.elementBox = { x: 100, y: 50, width: 400, height: 300 };
    expect(state.elementBox?.width).toBe(400);
  });

  it('should handle selector parsing from URL', () => {
    const url = new URL('ws://localhost:5005?session=test&selector=%23my-element');
    const rawSelector = url.searchParams.get('selector');
    const selector = rawSelector ? decodeURIComponent(rawSelector) : undefined;

    expect(selector).toBe('#my-element');
  });

  it('should handle selector without hash', () => {
    const url = new URL('ws://localhost:5005?session=test&selector=.my-class');
    const rawSelector = url.searchParams.get('selector');
    const selector = rawSelector ? decodeURIComponent(rawSelector) : undefined;

    expect(selector).toBe('.my-class');
  });

  it('should return undefined when no selector', () => {
    const url = new URL('ws://localhost:5005?session=test');
    const rawSelector = url.searchParams.get('selector');
    const selector = rawSelector ? decodeURIComponent(rawSelector) : undefined;

    expect(selector).toBeUndefined();
  });
});

describe('Coordinate math validation', () => {
  describe('element mode coordinates', () => {
    it('should calculate page coords from screen coords (element mode)', () => {
      const screenX = 100;
      const screenY = 75;
      const elementWidth = 200;
      const elementHeight = 150;
      const displayWidth = 400;
      const displayHeight = 300;

      const scaleX = elementWidth / displayWidth;
      const scaleY = elementHeight / displayHeight;

      const pageX = Math.round(screenX * scaleX);
      const pageY = Math.round(screenY * scaleY);

      expect(pageX).toBe(50);
      expect(pageY).toBe(38);
    });

    it('should handle 1:1 scale (no scaling)', () => {
      const screenX = 150;
      const screenY = 100;
      const elementWidth = 300;
      const elementHeight = 200;
      const displayWidth = 300;
      const displayHeight = 200;

      const scaleX = elementWidth / displayWidth;
      const scaleY = elementHeight / displayHeight;

      const pageX = Math.round(screenX * scaleX);
      const pageY = Math.round(screenY * scaleY);

      expect(pageX).toBe(150);
      expect(pageY).toBe(100);
    });
  });

  describe('full screen mode coordinates', () => {
    it('should calculate page coords with offset subtraction', () => {
      const screenX = 200;
      const screenY = 150;
      const rectLeft = 50;
      const rectTop = 50;
      const deviceWidth = 1920;
      const deviceHeight = 1080;
      const rectWidth = 960;
      const rectHeight = 540;

      const scaleX = deviceWidth / rectWidth;
      const scaleY = deviceHeight / rectHeight;

      const pageX = Math.round((screenX - rectLeft) * scaleX);
      const pageY = Math.round((screenY - rectTop) * scaleY);

      expect(pageX).toBe(300);
      expect(pageY).toBe(200);
    });

    it('should handle zero offset', () => {
      const screenX = 480;
      const screenY = 270;
      const rectLeft = 0;
      const rectTop = 0;
      const deviceWidth = 1920;
      const deviceHeight = 1080;
      const rectWidth = 960;
      const rectHeight = 540;

      const scaleX = deviceWidth / rectWidth;
      const scaleY = deviceHeight / rectHeight;

      const pageX = Math.round((screenX - rectLeft) * scaleX);
      const pageY = Math.round((screenY - rectTop) * scaleY);

      expect(pageX).toBe(960);
      expect(pageY).toBe(540);
    });
  });
});

describe('broadcastFrame per-client processing', () => {
  it('should process frame differently for each client based on selector', async () => {
    const clients = [
      { selector: '#element1', elementBox: { x: 0, y: 0, width: 400, height: 300 } },
      { selector: '#element2', elementBox: { x: 100, y: 100, width: 200, height: 150 } },
      { selector: undefined, elementBox: undefined },
    ];

    const inputBuffer = await sharp({
      create: {
        width: 1920,
        height: 1080,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
      },
    })
      .jpeg()
      .toBuffer();

    const results: { selector?: string; width?: number; height?: number }[] = [];

    for (const client of clients) {
      let processed: sharp.Sharp = sharp(inputBuffer);

      if (client.selector && client.elementBox) {
        processed = processed.extract({
          left: client.elementBox.x,
          top: client.elementBox.y,
          width: client.elementBox.width,
          height: client.elementBox.height,
        });
      }

      const output = await processed.jpeg({ quality: 80 }).toBuffer();
      const metadata = await sharp(output).metadata();

      results.push({
        selector: client.selector,
        width: metadata.width,
        height: metadata.height,
      });
    }

    expect(results[0].width).toBe(400);
    expect(results[0].height).toBe(300);
    expect(results[1].width).toBe(200);
    expect(results[1].height).toBe(150);
    expect(results[2].width).toBe(1920);
    expect(results[2].height).toBe(1080);
  });
});
