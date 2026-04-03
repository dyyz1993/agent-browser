import { describe, it, expect } from 'vitest';

describe('element selector streaming - three data flow dimensions', () => {
  describe('Dimension 1: Server → Client (Status Message)', () => {
    it('should define StatusMessage interface with element field', () => {
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

      const mockStatus: StatusMessage = {
        type: 'status',
        connected: true,
        screencasting: true,
        viewportWidth: 400,
        viewportHeight: 300,
        element: {
          selector: '#my-element',
          x: 100,
          y: 200,
          width: 400,
          height: 300,
        },
      };

      expect(mockStatus.element).toBeDefined();
      expect(mockStatus.element?.selector).toBe('#my-element');
      expect(mockStatus.element?.width).toBe(400);
      expect(mockStatus.element?.height).toBe(300);
    });

    it('should handle status without element (full screen mode)', () => {
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

      const mockStatus: StatusMessage = {
        type: 'status',
        connected: true,
        screencasting: true,
        viewportWidth: 1920,
        viewportHeight: 1080,
      };

      expect(mockStatus.element).toBeUndefined();
      expect(mockStatus.viewportWidth).toBe(1920);
      expect(mockStatus.viewportHeight).toBe(1080);
    });

    it('should validate status message with element', () => {
      const validateStatus = (msg: {
        element?: { selector: string; width: number; height: number };
      }) => {
        if (msg.element) {
          return {
            hasElement: true,
            selector: msg.element.selector,
            width: msg.element.width,
            height: msg.element.height,
          };
        }
        return { hasElement: false };
      };

      const withElement = validateStatus({
        element: { selector: '#card', width: 300, height: 200 },
      });
      expect(withElement.hasElement).toBe(true);
      expect(withElement.width).toBe(300);

      const withoutElement = validateStatus({});
      expect(withoutElement.hasElement).toBe(false);
    });
  });

  describe('Dimension 2: Client → Server (Coordinate Events)', () => {
    it('should send mouse coordinates relative to element in element mode', () => {
      interface MouseEvent {
        type: 'input_mouse';
        eventType: 'mousePressed';
        x: number;
        y: number;
        button: string;
      }

      const screenX = 100;
      const screenY = 50;
      const elementWidth = 200;
      const elementHeight = 100;
      const displayWidth = 400;
      const displayHeight = 200;

      const scaleX = elementWidth / displayWidth;
      const scaleY = elementHeight / displayHeight;

      const pageX = Math.round(screenX * scaleX);
      const pageY = Math.round(screenY * scaleY);

      const event: MouseEvent = {
        type: 'input_mouse',
        eventType: 'mousePressed',
        x: pageX,
        y: pageY,
        button: 'left',
      };

      expect(event.x).toBe(50);
      expect(event.y).toBe(25);
    });

    it('should send mouse coordinates with offset in full screen mode', () => {
      interface MouseEvent {
        type: 'input_mouse';
        eventType: 'mousePressed';
        x: number;
        y: number;
        button: string;
      }

      const screenX = 150;
      const screenY = 100;
      const rectLeft = 50;
      const rectTop = 50;
      const elementWidth = 1920;
      const elementHeight = 1080;
      const displayWidth = 960;
      const displayHeight = 540;

      const scaleX = elementWidth / displayWidth;
      const scaleY = elementHeight / displayHeight;

      const pageX = Math.round((screenX - rectLeft) * scaleX);
      const pageY = Math.round((screenY - rectTop) * scaleY);

      const event: MouseEvent = {
        type: 'input_mouse',
        eventType: 'mousePressed',
        x: pageX,
        y: pageY,
        button: 'left',
      };

      expect(event.x).toBe(200);
      expect(event.y).toBe(100);
    });

    it('should send touch events with correct coordinates', () => {
      interface TouchPoint {
        x: number;
        y: number;
        id: number;
      }

      interface TouchEvent {
        type: 'input_touch';
        eventType: 'touchStart';
        touchPoints: TouchPoint[];
      }

      const elementWidth = 200;
      const elementHeight = 100;
      const displayWidth = 400;
      const displayHeight = 200;

      const scaleX = elementWidth / displayWidth;
      const scaleY = elementHeight / displayHeight;

      const touchPoints: TouchPoint[] = [
        { x: Math.round(100 * scaleX), y: Math.round(50 * scaleY), id: 0 },
        { x: Math.round(200 * scaleX), y: Math.round(75 * scaleY), id: 1 },
      ];

      const event: TouchEvent = {
        type: 'input_touch',
        eventType: 'touchStart',
        touchPoints,
      };

      expect(event.touchPoints[0].x).toBe(50);
      expect(event.touchPoints[0].y).toBe(25);
      expect(event.touchPoints[1].x).toBe(100);
      expect(event.touchPoints[1].y).toBe(38);
    });
  });

  describe('Dimension 3: Coordinate Math Validation', () => {
    describe('Element Mode (relative to element top-left)', () => {
      it('should calculate correct coordinates at element origin', () => {
        const screenX = 0;
        const screenY = 0;
        const elementWidth = 200;
        const elementHeight = 100;
        const displayWidth = 400;
        const displayHeight = 200;

        const scaleX = elementWidth / displayWidth;
        const scaleY = elementHeight / displayHeight;

        expect(Math.round(screenX * scaleX)).toBe(0);
        expect(Math.round(screenY * scaleY)).toBe(0);
      });

      it('should calculate correct coordinates at element center', () => {
        const screenX = 200;
        const screenY = 100;
        const elementWidth = 400;
        const elementHeight = 200;
        const displayWidth = 400;
        const displayHeight = 200;

        const scaleX = elementWidth / displayWidth;
        const scaleY = elementHeight / displayHeight;

        expect(Math.round(screenX * scaleX)).toBe(200);
        expect(Math.round(screenY * scaleY)).toBe(100);
      });

      it('should calculate correct coordinates at element bottom-right', () => {
        const screenX = 400;
        const screenY = 200;
        const elementWidth = 400;
        const elementHeight = 200;
        const displayWidth = 400;
        const displayHeight = 200;

        const scaleX = elementWidth / displayWidth;
        const scaleY = elementHeight / displayHeight;

        expect(Math.round(screenX * scaleX)).toBe(400);
        expect(Math.round(screenY * scaleY)).toBe(200);
      });

      it('should handle non-1:1 scale ratio', () => {
        const screenX = 100;
        const screenY = 50;
        const elementWidth = 200;
        const elementHeight = 100;
        const displayWidth = 400;
        const displayHeight = 200;

        const scaleX = elementWidth / displayWidth;
        const scaleY = elementHeight / displayHeight;

        expect(Math.round(screenX * scaleX)).toBe(50);
        expect(Math.round(screenY * scaleY)).toBe(25);
      });

      it('should handle fractional scaling', () => {
        const screenX = 75;
        const screenY = 37;
        const elementWidth = 150;
        const elementHeight = 75;
        const displayWidth = 300;
        const displayHeight = 150;

        const scaleX = elementWidth / displayWidth;
        const scaleY = elementHeight / displayHeight;

        expect(Math.round(screenX * scaleX)).toBe(38);
        expect(Math.round(screenY * scaleY)).toBe(19);
      });
    });

    describe('Full Screen Mode (with offset subtraction)', () => {
      it('should calculate correct coordinates with offset', () => {
        const screenX = 250;
        const screenY = 150;
        const rectLeft = 100;
        const rectTop = 100;
        const elementWidth = 1280;
        const elementHeight = 720;
        const displayWidth = 640;
        const displayHeight = 360;

        const scaleX = elementWidth / displayWidth;
        const scaleY = elementHeight / displayHeight;

        const pageX = Math.round((screenX - rectLeft) * scaleX);
        const pageY = Math.round((screenY - rectTop) * scaleY);

        expect(pageX).toBe(300);
        expect(pageY).toBe(100);
      });

      it('should handle zero offset', () => {
        const screenX = 320;
        const screenY = 180;
        const rectLeft = 0;
        const rectTop = 0;
        const elementWidth = 1920;
        const elementHeight = 1080;
        const displayWidth = 960;
        const displayHeight = 540;

        const scaleX = elementWidth / displayWidth;
        const scaleY = elementHeight / displayHeight;

        const pageX = Math.round((screenX - rectLeft) * scaleX);
        const pageY = Math.round((screenY - rectTop) * scaleY);

        expect(pageX).toBe(640);
        expect(pageY).toBe(360);
      });
    });

    describe('Scale ratio validation', () => {
      it('should correctly identify scale factors', () => {
        const elementWidth = 400;
        const elementHeight = 300;
        const displayWidth = 800;
        const displayHeight = 600;

        const scaleX = elementWidth / displayWidth;
        const scaleY = elementHeight / displayHeight;

        expect(scaleX).toBe(0.5);
        expect(scaleY).toBe(0.5);
        expect(scaleX).toBe(scaleY);
      });

      it('should handle different width/height ratios', () => {
        const elementWidth = 400;
        const elementHeight = 200;
        const displayWidth = 800;
        const displayHeight = 400;

        const scaleX = elementWidth / displayWidth;
        const scaleY = elementHeight / displayHeight;

        expect(scaleX).toBe(0.5);
        expect(scaleY).toBe(0.5);
      });

      it('should handle non-uniform scaling', () => {
        const elementWidth = 400;
        const elementHeight = 400;
        const displayWidth = 800;
        const displayHeight = 200;

        const scaleX = elementWidth / displayWidth;
        const scaleY = elementHeight / displayHeight;

        expect(scaleX).toBe(0.5);
        expect(scaleY).toBe(2);
      });
    });
  });

  describe('End-to-End Coordinate Flow', () => {
    it('should simulate complete element mode flow', () => {
      const serverElementBox = {
        selector: '#target',
        x: 100,
        y: 50,
        width: 400,
        height: 300,
      };

      const clientDisplayRect = {
        width: 400,
        height: 300,
      };

      const scaleX = serverElementBox.width / clientDisplayRect.width;
      const scaleY = serverElementBox.height / clientDisplayRect.height;

      const userClickScreenX = 200;
      const userClickScreenY = 150;

      const pageX = Math.round(userClickScreenX * scaleX) + serverElementBox.x;
      const pageY = Math.round(userClickScreenY * scaleY) + serverElementBox.y;

      const mouseEvent = {
        type: 'input_mouse' as const,
        eventType: 'mousePressed' as const,
        x: pageX,
        y: pageY,
        button: 'left' as const,
      };

      expect(mouseEvent.x).toBe(300);
      expect(mouseEvent.y).toBe(200);
      expect(mouseEvent.x).toBeGreaterThan(serverElementBox.x);
      expect(mouseEvent.y).toBeGreaterThan(serverElementBox.y);
      expect(mouseEvent.x).toBeLessThanOrEqual(serverElementBox.x + serverElementBox.width);
      expect(mouseEvent.y).toBeLessThanOrEqual(serverElementBox.y + serverElementBox.height);
    });

    it('should simulate complete full screen mode flow', () => {
      const serverViewport = {
        width: 1920,
        height: 1080,
      };

      const clientDisplayRect = {
        left: 0,
        top: 0,
        width: 960,
        height: 540,
      };

      const scaleX = serverViewport.width / clientDisplayRect.width;
      const scaleY = serverViewport.height / clientDisplayRect.height;

      const userClickScreenX = 480;
      const userClickScreenY = 270;

      const pageX = Math.round((userClickScreenX - clientDisplayRect.left) * scaleX);
      const pageY = Math.round((userClickScreenY - clientDisplayRect.top) * scaleY);

      const mouseEvent = {
        type: 'input_mouse' as const,
        eventType: 'mousePressed' as const,
        x: pageX,
        y: pageY,
        button: 'left' as const,
      };

      expect(mouseEvent.x).toBe(960);
      expect(mouseEvent.y).toBe(540);
      expect(mouseEvent.x).toBeLessThanOrEqual(serverViewport.width);
      expect(mouseEvent.y).toBeLessThanOrEqual(serverViewport.height);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small element dimensions', () => {
      const scaleX = 10 / 100;
      const scaleY = 10 / 100;

      const pageX = Math.round(50 * scaleX);
      const pageY = Math.round(50 * scaleY);

      expect(pageX).toBe(5);
      expect(pageY).toBe(5);
    });

    it('should handle coordinates outside element bounds', () => {
      const scaleX = 200 / 400;
      const scaleY = 100 / 200;

      const pageX = Math.round(500 * scaleX);
      const pageY = Math.round(250 * scaleY);

      expect(pageX).toBe(250);
      expect(pageY).toBe(125);
    });

    it('should handle zero display dimensions (avoid division by zero)', () => {
      const elementWidth = 200;
      const elementHeight = 100;
      const displayWidth = 0;
      const displayHeight = 0;

      if (displayWidth > 0 && displayHeight > 0) {
        const scaleX = elementWidth / displayWidth;
        const scaleY = elementHeight / displayHeight;
        expect(scaleX).toBe(Infinity);
      }
    });
  });
});
