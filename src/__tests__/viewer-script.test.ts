import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createInitialState,
  buildWebSocketUrl,
  safeSend,
  screenToPage,
  updateModifiers,
  shouldSendText
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
        session: 'default'
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
        session: 'my-session'
      };
      
      const url = buildWebSocketUrl(config);
      
      expect(url).toBe('wss://example.com:8080?session=my-session');
    });
  });

  describe('safeSend', () => {
    it('should send data when WebSocket is open', () => {
      const mockWs = {
        readyState: 1,
        send: vi.fn()
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
        send: vi.fn()
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
        shiftKey: false
      } as KeyboardEvent;
      
      expect(updateModifiers(event)).toBe(0);
    });

    it('should set alt bit (1) when altKey is pressed', () => {
      const event = {
        altKey: true,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false
      } as KeyboardEvent;
      
      expect(updateModifiers(event)).toBe(1);
    });

    it('should set ctrl bit (2) when ctrlKey is pressed', () => {
      const event = {
        altKey: false,
        ctrlKey: true,
        metaKey: false,
        shiftKey: false
      } as KeyboardEvent;
      
      expect(updateModifiers(event)).toBe(2);
    });

    it('should set meta bit (4) when metaKey is pressed', () => {
      const event = {
        altKey: false,
        ctrlKey: false,
        metaKey: true,
        shiftKey: false
      } as KeyboardEvent;
      
      expect(updateModifiers(event)).toBe(4);
    });

    it('should set shift bit (8) when shiftKey is pressed', () => {
      const event = {
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: true
      } as KeyboardEvent;
      
      expect(updateModifiers(event)).toBe(8);
    });

    it('should combine multiple modifiers', () => {
      const event = {
        altKey: true,
        ctrlKey: true,
        metaKey: false,
        shiftKey: true
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

describe('keyboard input logic', () => {
  let mockWs: { readyState: number; send: ReturnType<typeof vi.fn> };
  let sentMessages: string[];

  beforeEach(() => {
    sentMessages = [];
    mockWs = {
      readyState: 1,
      send: vi.fn((data: string) => {
        sentMessages.push(data);
      })
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
      
      safeSend(mockWs as unknown as WebSocket, JSON.stringify({
        type: 'keyboard_down',
        key: key
      }));
      
      if (shouldSendText(key, ctrlKey, metaKey, altKey)) {
        safeSend(mockWs as unknown as WebSocket, JSON.stringify({
          type: 'keyboard_insert_text',
          text: key
        }));
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
      
      safeSend(mockWs as unknown as WebSocket, JSON.stringify({
        type: 'keyboard_down',
        key: key
      }));
      
      if (shouldSendText(key, ctrlKey, metaKey, altKey)) {
        safeSend(mockWs as unknown as WebSocket, JSON.stringify({
          type: 'keyboard_insert_text',
          text: key
        }));
      }
      
      expect(sentMessages).toHaveLength(1);
      expect(JSON.parse(sentMessages[0])).toEqual({ type: 'keyboard_down', key: 'Enter' });
    });

    it('should not send keyboard_insert_text when ctrl is pressed', () => {
      const key = 'a';
      const ctrlKey = true;
      const metaKey = false;
      const altKey = false;
      
      safeSend(mockWs as unknown as WebSocket, JSON.stringify({
        type: 'keyboard_down',
        key: key
      }));
      
      if (shouldSendText(key, ctrlKey, metaKey, altKey)) {
        safeSend(mockWs as unknown as WebSocket, JSON.stringify({
          type: 'keyboard_insert_text',
          text: key
        }));
      }
      
      expect(sentMessages).toHaveLength(1);
      expect(JSON.parse(sentMessages[0])).toEqual({ type: 'keyboard_down', key: 'a' });
    });

    it('should not send keyboard_insert_text when meta is pressed', () => {
      const key = 'v';
      const ctrlKey = false;
      const metaKey = true;
      const altKey = false;
      
      safeSend(mockWs as unknown as WebSocket, JSON.stringify({
        type: 'keyboard_down',
        key: key
      }));
      
      if (shouldSendText(key, ctrlKey, metaKey, altKey)) {
        safeSend(mockWs as unknown as WebSocket, JSON.stringify({
          type: 'keyboard_insert_text',
          text: key
        }));
      }
      
      expect(sentMessages).toHaveLength(1);
      expect(JSON.parse(sentMessages[0])).toEqual({ type: 'keyboard_down', key: 'v' });
    });

    it('should handle uppercase letters', () => {
      const key = 'A';
      const ctrlKey = false;
      const metaKey = false;
      const altKey = false;
      
      safeSend(mockWs as unknown as WebSocket, JSON.stringify({
        type: 'keyboard_down',
        key: key
      }));
      
      if (shouldSendText(key, ctrlKey, metaKey, altKey)) {
        safeSend(mockWs as unknown as WebSocket, JSON.stringify({
          type: 'keyboard_insert_text',
          text: key
        }));
      }
      
      expect(sentMessages).toHaveLength(2);
      expect(JSON.parse(sentMessages[1])).toEqual({ type: 'keyboard_insert_text', text: 'A' });
    });

    it('should handle numbers', () => {
      const key = '5';
      const ctrlKey = false;
      const metaKey = false;
      const altKey = false;
      
      safeSend(mockWs as unknown as WebSocket, JSON.stringify({
        type: 'keyboard_down',
        key: key
      }));
      
      if (shouldSendText(key, ctrlKey, metaKey, altKey)) {
        safeSend(mockWs as unknown as WebSocket, JSON.stringify({
          type: 'keyboard_insert_text',
          text: key
        }));
      }
      
      expect(sentMessages).toHaveLength(2);
      expect(JSON.parse(sentMessages[1])).toEqual({ type: 'keyboard_insert_text', text: '5' });
    });

    it('should handle special characters', () => {
      const key = '@';
      const ctrlKey = false;
      const metaKey = false;
      const altKey = false;
      
      safeSend(mockWs as unknown as WebSocket, JSON.stringify({
        type: 'keyboard_down',
        key: key
      }));
      
      if (shouldSendText(key, ctrlKey, metaKey, altKey)) {
        safeSend(mockWs as unknown as WebSocket, JSON.stringify({
          type: 'keyboard_insert_text',
          text: key
        }));
      }
      
      expect(sentMessages).toHaveLength(2);
      expect(JSON.parse(sentMessages[1])).toEqual({ type: 'keyboard_insert_text', text: '@' });
    });
  });
});
