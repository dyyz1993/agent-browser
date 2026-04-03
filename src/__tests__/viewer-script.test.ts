import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createInitialState,
  buildWebSocketUrl,
  safeSend,
  screenToPage,
  updateModifiers,
  shouldSendText,
  buildViewerScript,
} from '../viewer-script.js';

describe('viewer-script', () => {
  describe('createInitialState', () => {
    it('should create initial state with default values', () => {
      const state = createInitialState();

      expect(state.ws).toBeNull();
      expect(state.metadata.deviceWidth).toBe(1280);
      expect(state.metadata.deviceHeight).toBe(720);
      expect(state.metadata.format).toBe('jpeg');
      expect(state.pendingBinary).toBe(false);
      expect(state.modifiers).toBe(0);
      expect(state.clickCount).toBe(0);
      expect(state.isComposing).toBe(false);
    });
  });

  describe('buildWebSocketUrl', () => {
    it('should build URL with instanceId', () => {
      const config = {
        wsProtocol: 'ws:',
        hostname: 'localhost',
        port: 5005,
        instanceId: 'test-123',
        session: 'default',
      };

      const url = buildWebSocketUrl(config);

      expect(url).toBe('ws://localhost:5005?instanceId=test-123');
    });

    it('should build URL with session when no instanceId', () => {
      const config = {
        wsProtocol: 'wss:',
        hostname: 'example.com',
        port: 8080,
        instanceId: null,
        session: 'my-session',
      };

      const url = buildWebSocketUrl(config);

      expect(url).toBe('wss://example.com:8080?session=my-session');
    });
  });

  describe('safeSend', () => {
    it('should send data when WebSocket is open', () => {
      const mockWs = {
        readyState: 1,
        send: vi.fn(),
      } as unknown as WebSocket;

      safeSend(mockWs, '{"type":"test"}');

      expect(mockWs.send).toHaveBeenCalledWith('{"type":"test"}');
    });

    it('should not send data when WebSocket is null', () => {
      const sendSpy = vi.fn();

      safeSend(null, '{"type":"test"}');

      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('should not send data when WebSocket is not open', () => {
      const mockWs = {
        readyState: 0,
        send: vi.fn(),
      } as unknown as WebSocket;

      safeSend(mockWs, '{"type":"test"}');

      expect(mockWs.send).not.toHaveBeenCalled();
    });
  });

  describe('screenToPage', () => {
    it('should convert screen coordinates to page coordinates', () => {
      const result = screenToPage(100, 50, 500, 250, 1000, 500);

      expect(result.x).toBe(200);
      expect(result.y).toBe(100);
    });

    it('should handle different scale factors', () => {
      const result = screenToPage(50, 25, 100, 100, 200, 400);

      expect(result.x).toBe(100);
      expect(result.y).toBe(100);
    });
  });

  describe('updateModifiers', () => {
    it('should return 0 when no modifiers are pressed', () => {
      const event = {
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
      } as KeyboardEvent;

      expect(updateModifiers(event)).toBe(0);
    });

    it('should set alt bit (1) when altKey is pressed', () => {
      const event = {
        altKey: true,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
      } as KeyboardEvent;

      expect(updateModifiers(event)).toBe(1);
    });

    it('should set ctrl bit (2) when ctrlKey is pressed', () => {
      const event = {
        altKey: false,
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
      } as KeyboardEvent;

      expect(updateModifiers(event)).toBe(2);
    });

    it('should set meta bit (4) when metaKey is pressed', () => {
      const event = {
        altKey: false,
        ctrlKey: false,
        metaKey: true,
        shiftKey: false,
      } as KeyboardEvent;

      expect(updateModifiers(event)).toBe(4);
    });

    it('should set shift bit (8) when shiftKey is pressed', () => {
      const event = {
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: true,
      } as KeyboardEvent;

      expect(updateModifiers(event)).toBe(8);
    });

    it('should combine multiple modifiers', () => {
      const event = {
        altKey: true,
        ctrlKey: true,
        metaKey: false,
        shiftKey: true,
      } as KeyboardEvent;

      expect(updateModifiers(event)).toBe(11);
    });
  });

  describe('shouldSendText', () => {
    it('should return true for single character without modifiers', () => {
      expect(shouldSendText('a', false, false, false)).toBe(true);
      expect(shouldSendText('A', false, false, false)).toBe(true);
      expect(shouldSendText('1', false, false, false)).toBe(true);
      expect(shouldSendText(' ', false, false, false)).toBe(true);
    });

    it('should return false for multi-character keys', () => {
      expect(shouldSendText('Enter', false, false, false)).toBe(false);
      expect(shouldSendText('Backspace', false, false, false)).toBe(false);
      expect(shouldSendText('ArrowLeft', false, false, false)).toBe(false);
    });

    it('should return false when ctrlKey is pressed', () => {
      expect(shouldSendText('a', true, false, false)).toBe(false);
    });

    it('should return false when metaKey is pressed', () => {
      expect(shouldSendText('a', false, true, false)).toBe(false);
    });

    it('should return false when altKey is pressed', () => {
      expect(shouldSendText('a', false, false, true)).toBe(false);
    });

    it('should return true when only shiftKey is pressed', () => {
      expect(shouldSendText('A', false, false, false)).toBe(true);
    });
  });
});

describe('element selector mode', () => {
  describe('screenToPage with element mode', () => {
    it('should convert coordinates relative to element top-left (element mode)', () => {
      const result = screenToPage(100, 50, 200, 100, 400, 200);

      expect(result.x).toBe(200);
      expect(result.y).toBe(100);
    });

    it('should handle element coordinates correctly', () => {
      const result = screenToPage(0, 0, 100, 50, 200, 100);

      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
    });

    it('should scale coordinates within element bounds', () => {
      const result = screenToPage(50, 25, 100, 50, 200, 100);

      expect(result.x).toBe(100);
      expect(result.y).toBe(50);
    });
  });

  describe('element mode coordinate conversion', () => {
    it('should calculate correct page coordinates for element mode', () => {
      const screenX = 75;
      const screenY = 37.5;
      const elementWidth = 150;
      const elementHeight = 75;
      const displayWidth = 300;
      const displayHeight = 150;

      const scaleX = elementWidth / displayWidth;
      const scaleY = elementHeight / displayHeight;
      const pageX = Math.round(screenX * scaleX);
      const pageY = Math.round(screenY * scaleY);

      expect(pageX).toBe(38);
      expect(pageY).toBe(19);
    });

    it('should handle coordinate at element edge', () => {
      const screenX = 200;
      const screenY = 100;
      const elementWidth = 400;
      const elementHeight = 200;
      const displayWidth = 400;
      const displayHeight = 200;

      const scaleX = elementWidth / displayWidth;
      const scaleY = elementHeight / displayHeight;
      const pageX = Math.round(screenX * scaleX);
      const pageY = Math.round(screenY * scaleY);

      expect(pageX).toBe(200);
      expect(pageY).toBe(100);
    });
  });

  describe('URL selector encoding/decoding', () => {
    it('should correctly encode selector with hash', () => {
      const selector = '#my-element';
      const encoded = encodeURIComponent(selector);
      const decoded = decodeURIComponent(encoded);

      expect(encoded).toBe('%23my-element');
      expect(decoded).toBe(selector);
    });

    it('should correctly encode selector with dots', () => {
      const selector = '.class-name';
      const encoded = encodeURIComponent(selector);
      const decoded = decodeURIComponent(encoded);

      expect(encoded).toBe('.class-name');
      expect(decoded).toBe(selector);
    });

    it('should correctly encode complex selectors', () => {
      const selector = 'div#id.class[data-attr="value"]';
      const encoded = encodeURIComponent(selector);
      const decoded = decodeURIComponent(encoded);

      expect(decoded).toBe(selector);
    });

    it('should handle special characters in selectors', () => {
      const selectors = [
        '#element-id',
        '.class-name',
        'div > span',
        '[data-testid="test"]',
        ':nth-child(2)',
      ];

      for (const selector of selectors) {
        const decoded = decodeURIComponent(encodeURIComponent(selector));
        expect(decoded).toBe(selector);
      }
    });
  });
});

describe('buildViewerScript', () => {
  describe('element mode support', () => {
    it('should include selector parsing in generated script', () => {
      const script = buildViewerScript();

      expect(script).toContain("urlParams.get('selector')");
      expect(script).toContain('decodeURIComponent');
    });

    it('should include element mode coordinate conversion', () => {
      const script = buildViewerScript();

      expect(script).toContain('metadata.element');
      expect(script).toContain('element.width');
      expect(script).toContain('element.height');
    });

    it('should have screenToPage function with element mode logic', () => {
      const script = buildViewerScript();

      expect(script).toContain('function screenToPage(screenX, screenY)');
      expect(script).toContain('if (metadata.element)');
      expect(script).toContain('element.width / rect.width');
      expect(script).toContain('element.height / rect.height');
      expect(script).toContain('+ metadata.element.x');
      expect(script).toContain('+ metadata.element.y');
    });

    it('should fallback to full screen mode when no element', () => {
      const script = buildViewerScript();

      const elementModeIndex = script.indexOf('if (metadata.element)');
      const fullScreenLogicIndex = script.indexOf('metadata.deviceWidth / rect.width');

      expect(elementModeIndex).toBeGreaterThan(0);
      expect(fullScreenLogicIndex).toBeGreaterThan(elementModeIndex);
    });

    it('should include status message handler for element info', () => {
      const script = buildViewerScript();

      expect(script).toContain('msg.element');
      expect(script).toContain('metadata.element = msg.element');
      expect(script).toContain('metadata.element = undefined');
    });
  });

  describe('websocket URL construction with selector', () => {
    it('should include selector in websocket URL when present', () => {
      const script = buildViewerScript();

      expect(script).toContain('selector ?');
      expect(script).toContain('encodeURIComponent(selector)');
    });

    it('should construct correct websocket URL with selector parameter', () => {
      const script = buildViewerScript();

      expect(script).toContain('wsProtocol');
      expect(script).toContain('location.hostname');
      expect(script).toContain('location.port');
      expect(script).toContain('wsUrl = wsProtocol');
      expect(script).toContain('selector ?');
      expect(script).toContain('encodeURIComponent(selector)');
    });

    it('should append selector as query parameter to websocket URL', () => {
      const script = buildViewerScript();

      const expectedPattern = /wsUrl.*selector.*encodeURIComponent\(selector\)/;
      expect(script).toMatch(expectedPattern);
    });
  });

  describe('element metadata structure', () => {
    it('should handle element info from status message', () => {
      const script = buildViewerScript();

      expect(script).toContain('msg.element');
      expect(script).toContain('metadata.element = msg.element');
    });

    it('should store element dimensions when received from server', () => {
      const script = buildViewerScript();

      expect(script).toContain('if (msg.element)');
      expect(script).toContain('metadata.element = msg.element');
      expect(script).toContain('} else {');
      expect(script).toContain('metadata.element = undefined');
    });
  });

  describe('end-to-end selector flow', () => {
    it('should simulate complete selector flow: parse URL -> build WS URL -> connect', () => {
      const script = buildViewerScript();

      expect(script).toContain("const rawSelector = urlParams.get('selector')");
      expect(script).toContain(
        'const selector = rawSelector ? decodeURIComponent(rawSelector) : undefined'
      );
      expect(script).toContain('const wsUrl = wsProtocol');
      expect(script).toContain('selector ?');
      expect(script).toContain('encodeURIComponent(selector)');
    });

    it('should handle selector with special characters correctly', () => {
      const script = buildViewerScript();

      expect(script).toContain('decodeURIComponent');
      expect(script).toContain('encodeURIComponent');
    });

    it('should not include selector in URL when not present', () => {
      const script = buildViewerScript();

      const hasConditionalSelector = script.includes('selector ?');
      expect(hasConditionalSelector).toBe(true);
    });
  });
});

describe('keyboard input logic', () => {
  let mockWs: { readyState: number; send: ReturnType<typeof vi.fn> };
  let sentMessages: string[];

  beforeEach(() => {
    sentMessages = [];
    mockWs = {
      readyState: 1,
      send: vi.fn((data: string) => {
        sentMessages.push(data);
      }),
    } as unknown as { readyState: number; send: ReturnType<typeof vi.fn> };
  });

  describe('keydown event simulation', () => {
    it('should send keyboard_down and keyboard_insert_text for regular character', () => {
      const state = createInitialState();
      state.isComposing = false;

      const key = 'a';
      const ctrlKey = false;
      const metaKey = false;
      const altKey = false;

      safeSend(
        mockWs as unknown as WebSocket,
        JSON.stringify({
          type: 'keyboard_down',
          key: key,
        })
      );

      if (shouldSendText(key, ctrlKey, metaKey, altKey)) {
        safeSend(
          mockWs as unknown as WebSocket,
          JSON.stringify({
            type: 'keyboard_insert_text',
            text: key,
          })
        );
      }

      expect(sentMessages).toHaveLength(2);
      expect(JSON.parse(sentMessages[0])).toEqual({ type: 'keyboard_down', key: 'a' });
      expect(JSON.parse(sentMessages[1])).toEqual({ type: 'keyboard_insert_text', text: 'a' });
    });

    it('should only send keyboard_down for special keys', () => {
      const key = 'Enter';
      const ctrlKey = false;
      const metaKey = false;
      const altKey = false;

      safeSend(
        mockWs as unknown as WebSocket,
        JSON.stringify({
          type: 'keyboard_down',
          key: key,
        })
      );

      if (shouldSendText(key, ctrlKey, metaKey, altKey)) {
        safeSend(
          mockWs as unknown as WebSocket,
          JSON.stringify({
            type: 'keyboard_insert_text',
            text: key,
          })
        );
      }

      expect(sentMessages).toHaveLength(1);
      expect(JSON.parse(sentMessages[0])).toEqual({ type: 'keyboard_down', key: 'Enter' });
    });

    it('should not send keyboard_insert_text when ctrl is pressed', () => {
      const key = 'a';
      const ctrlKey = true;
      const metaKey = false;
      const altKey = false;

      safeSend(
        mockWs as unknown as WebSocket,
        JSON.stringify({
          type: 'keyboard_down',
          key: key,
        })
      );

      if (shouldSendText(key, ctrlKey, metaKey, altKey)) {
        safeSend(
          mockWs as unknown as WebSocket,
          JSON.stringify({
            type: 'keyboard_insert_text',
            text: key,
          })
        );
      }

      expect(sentMessages).toHaveLength(1);
      expect(JSON.parse(sentMessages[0])).toEqual({ type: 'keyboard_down', key: 'a' });
    });

    it('should not send keyboard_insert_text when meta is pressed', () => {
      const key = 'v';
      const ctrlKey = false;
      const metaKey = true;
      const altKey = false;

      safeSend(
        mockWs as unknown as WebSocket,
        JSON.stringify({
          type: 'keyboard_down',
          key: key,
        })
      );

      if (shouldSendText(key, ctrlKey, metaKey, altKey)) {
        safeSend(
          mockWs as unknown as WebSocket,
          JSON.stringify({
            type: 'keyboard_insert_text',
            text: key,
          })
        );
      }

      expect(sentMessages).toHaveLength(1);
      expect(JSON.parse(sentMessages[0])).toEqual({ type: 'keyboard_down', key: 'v' });
    });

    it('should handle uppercase letters', () => {
      const key = 'A';
      const ctrlKey = false;
      const metaKey = false;
      const altKey = false;

      safeSend(
        mockWs as unknown as WebSocket,
        JSON.stringify({
          type: 'keyboard_down',
          key: key,
        })
      );

      if (shouldSendText(key, ctrlKey, metaKey, altKey)) {
        safeSend(
          mockWs as unknown as WebSocket,
          JSON.stringify({
            type: 'keyboard_insert_text',
            text: key,
          })
        );
      }

      expect(sentMessages).toHaveLength(2);
      expect(JSON.parse(sentMessages[1])).toEqual({ type: 'keyboard_insert_text', text: 'A' });
    });

    it('should handle numbers', () => {
      const key = '5';
      const ctrlKey = false;
      const metaKey = false;
      const altKey = false;

      safeSend(
        mockWs as unknown as WebSocket,
        JSON.stringify({
          type: 'keyboard_down',
          key: key,
        })
      );

      if (shouldSendText(key, ctrlKey, metaKey, altKey)) {
        safeSend(
          mockWs as unknown as WebSocket,
          JSON.stringify({
            type: 'keyboard_insert_text',
            text: key,
          })
        );
      }

      expect(sentMessages).toHaveLength(2);
      expect(JSON.parse(sentMessages[1])).toEqual({ type: 'keyboard_insert_text', text: '5' });
    });

    it('should handle special characters', () => {
      const key = '@';
      const ctrlKey = false;
      const metaKey = false;
      const altKey = false;

      safeSend(
        mockWs as unknown as WebSocket,
        JSON.stringify({
          type: 'keyboard_down',
          key: key,
        })
      );

      if (shouldSendText(key, ctrlKey, metaKey, altKey)) {
        safeSend(
          mockWs as unknown as WebSocket,
          JSON.stringify({
            type: 'keyboard_insert_text',
            text: key,
          })
        );
      }

      expect(sentMessages).toHaveLength(2);
      expect(JSON.parse(sentMessages[1])).toEqual({ type: 'keyboard_insert_text', text: '@' });
    });
  });

  describe('element mode degradation', () => {
    it('should handle degraded status message', () => {
      const script = buildViewerScript();

      expect(script).toContain('showDegradedMessage()');
      expect(script).toContain('degraded-toast');
      expect(script).toContain('Element not found, showing full page');
    });

    it('should call showDegradedMessage when element is degraded', () => {
      const script = buildViewerScript();

      expect(script).toContain('if (selector && msg.degraded)');
      expect(script).toContain('showDegradedMessage()');
    });
  });

  describe('element mode coordinate conversion with offset', () => {
    it('should calculate correct page coordinates including element offset', () => {
      const screenX = 50;
      const screenY = 25;
      const elementX = 100;
      const elementY = 200;
      const elementWidth = 150;
      const elementHeight = 75;
      const displayWidth = 300;
      const displayHeight = 150;

      const scaleX = elementWidth / displayWidth;
      const scaleY = elementHeight / displayHeight;
      const pageX = Math.round(screenX * scaleX) + elementX;
      const pageY = Math.round(screenY * scaleY) + elementY;

      expect(pageX).toBe(125);
      expect(pageY).toBe(213);
    });

    it('should handle click at element center with offset', () => {
      const screenX = 75;
      const screenY = 37.5;
      const elementX = 100;
      const elementY = 200;
      const elementWidth = 150;
      const elementHeight = 75;
      const displayWidth = 300;
      const displayHeight = 150;

      const scaleX = elementWidth / displayWidth;
      const scaleY = elementHeight / displayHeight;
      const pageX = Math.round(screenX * scaleX) + elementX;
      const pageY = Math.round(screenY * scaleY) + elementY;

      expect(pageX).toBe(138);
      expect(pageY).toBe(219);
    });
  });
});
