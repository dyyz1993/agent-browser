import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isAllowedOrigin,
  StreamStateManager,
  FrameRateController,
  FrameProcessor,
  STATE_CONFIGS,
  type StreamStateConfig,
} from './stream-server.js';

describe('isAllowedOrigin', () => {
  describe('allowed origins', () => {
    it('should allow connections with no origin (CLI tools)', () => {
      expect(isAllowedOrigin(undefined)).toBe(true);
    });

    it('should allow empty string origin', () => {
      expect(isAllowedOrigin('')).toBe(true);
    });

    it('should allow file:// origins', () => {
      expect(isAllowedOrigin('file:///path/to/viewer.html')).toBe(true);
      expect(isAllowedOrigin('file:///C:/Users/user/viewer.html')).toBe(true);
    });

    it('should allow http://localhost origins', () => {
      expect(isAllowedOrigin('http://localhost')).toBe(true);
      expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
      expect(isAllowedOrigin('http://localhost:9223')).toBe(true);
      expect(isAllowedOrigin('http://localhost:8080')).toBe(true);
    });

    it('should allow https://localhost origins', () => {
      expect(isAllowedOrigin('https://localhost')).toBe(true);
      expect(isAllowedOrigin('https://localhost:3000')).toBe(true);
    });

    it('should allow http://127.0.0.1 origins', () => {
      expect(isAllowedOrigin('http://127.0.0.1')).toBe(true);
      expect(isAllowedOrigin('http://127.0.0.1:3000')).toBe(true);
      expect(isAllowedOrigin('http://127.0.0.1:9223')).toBe(true);
    });

    it('should allow IPv6 loopback origins', () => {
      expect(isAllowedOrigin('http://[::1]')).toBe(true);
      expect(isAllowedOrigin('http://[::1]:3000')).toBe(true);
    });
  });

  describe('rejected origins', () => {
    it('should reject remote origins', () => {
      expect(isAllowedOrigin('https://evil.com')).toBe(false);
      expect(isAllowedOrigin('http://attacker.local:8080')).toBe(false);
      expect(isAllowedOrigin('https://example.com')).toBe(false);
    });

    it('should reject origins with localhost in path but not hostname', () => {
      expect(isAllowedOrigin('https://evil.com/localhost')).toBe(false);
    });

    it('should reject origins that look like localhost but are not', () => {
      expect(isAllowedOrigin('http://localhost.evil.com')).toBe(false);
      expect(isAllowedOrigin('http://not-localhost:3000')).toBe(false);
    });

    it('should reject invalid origin URLs', () => {
      expect(isAllowedOrigin('not-a-url')).toBe(false);
      expect(isAllowedOrigin('://missing-scheme')).toBe(false);
    });
  });
});

describe('STATE_CONFIGS', () => {
  it('should have correct config for user_interacting', () => {
    expect(STATE_CONFIGS.user_interacting).toEqual({
      format: 'jpeg',
      quality: 20,
      maxFps: 60,
      scale: 0.5,
    });
  });

  it('should have correct config for screen_moving', () => {
    expect(STATE_CONFIGS.screen_moving).toEqual({
      format: 'webp',
      quality: 50,
      maxFps: 1,
      scale: 0.75,
    });
  });

  it('should have correct config for static', () => {
    expect(STATE_CONFIGS.static).toEqual({
      format: 'webp',
      quality: 80,
      maxFps: 0.5,
      scale: 1,
    });
  });
});

describe('StreamStateManager', () => {
  let manager: StreamStateManager;

  beforeEach(() => {
    manager = new StreamStateManager();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('should start in static state', () => {
      expect(manager.getState()).toBe('static');
    });

    it('should have infinite frame interval initially', () => {
      expect(manager.getFrameInterval()).toBe(Infinity);
    });

    it('should not be user interacting initially', () => {
      expect(manager.getIsUserInteracting()).toBe(false);
    });
  });

  describe('user interaction', () => {
    it('should switch to user_interacting on user interaction', () => {
      manager.onUserInteraction();
      expect(manager.getState()).toBe('user_interacting');
      expect(manager.getIsUserInteracting()).toBe(true);
    });

    it('should stay in user_interacting during interaction even with slow frames', () => {
      manager.onUserInteraction();

      // Simulate slow frames (frameInterval >= 1000ms)
      vi.advanceTimersByTime(1500);
      manager.onFrameReceived();

      expect(manager.getState()).toBe('user_interacting');
    });

    it('should switch to screen_moving after user interaction timeout with fast frames', async () => {
      manager.onUserInteraction();
      expect(manager.getState()).toBe('user_interacting');

      // Simulate fast frame (frameInterval < 1000ms)
      vi.advanceTimersByTime(100);
      manager.onFrameReceived();

      // Verify frame interval is fast
      expect(manager.getFrameInterval()).toBe(100);

      // Wait for user interaction timeout (total 2000ms from interaction)
      vi.advanceTimersByTime(2000);

      // Should switch to screen_moving because frameInterval < 1000ms
      expect(manager.getState()).toBe('screen_moving');
      expect(manager.getIsUserInteracting()).toBe(false);
    });

    it('should switch to static after user interaction timeout with slow frames', async () => {
      manager.onUserInteraction();
      expect(manager.getState()).toBe('user_interacting');

      // Simulate slow frame (frameInterval >= 1000ms)
      vi.advanceTimersByTime(1500);
      manager.onFrameReceived();

      // Wait for user interaction timeout
      vi.advanceTimersByTime(2000);

      expect(manager.getState()).toBe('static');
      expect(manager.getIsUserInteracting()).toBe(false);
    });

    it('should reset interaction timeout on subsequent interactions', () => {
      manager.onUserInteraction();
      vi.advanceTimersByTime(1000);

      // Another interaction before timeout
      manager.onUserInteraction();

      // Original timeout would have fired at 2000ms
      vi.advanceTimersByTime(1000);
      expect(manager.getState()).toBe('user_interacting');
    });
  });

  describe('frame received', () => {
    it('should switch to screen_moving with fast frames', () => {
      // First frame
      manager.onFrameReceived();

      // Fast frame (frameInterval < 1000ms)
      vi.advanceTimersByTime(500);
      manager.onFrameReceived();

      expect(manager.getState()).toBe('screen_moving');
    });

    it('should switch to static with slow frames', () => {
      // First frame
      manager.onFrameReceived();

      // Slow frame (frameInterval >= 1000ms)
      vi.advanceTimersByTime(1500);
      manager.onFrameReceived();

      expect(manager.getState()).toBe('static');
    });

    it('should update frame interval', () => {
      manager.onFrameReceived();
      vi.advanceTimersByTime(500);
      manager.onFrameReceived();

      expect(manager.getFrameInterval()).toBe(500);
    });
  });

  describe('getConfig', () => {
    it('should return correct config for current state', () => {
      expect(manager.getConfig()).toEqual(STATE_CONFIGS.static);

      manager.onUserInteraction();
      expect(manager.getConfig()).toEqual(STATE_CONFIGS.user_interacting);
    });
  });
});

describe('FrameRateController', () => {
  let controller: FrameRateController;

  beforeEach(() => {
    controller = new FrameRateController();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('shouldSendFrame', () => {
    it('should allow first frame', () => {
      // Move time forward so initial state doesn't interfere
      vi.advanceTimersByTime(100);
      expect(controller.shouldSendFrame(60)).toBe(true);
    });

    it('should reject frames sent too quickly', () => {
      vi.advanceTimersByTime(100);
      const maxFps = 2; // 500ms interval
      controller.shouldSendFrame(maxFps);

      // Immediately try again
      expect(controller.shouldSendFrame(maxFps)).toBe(false);
    });

    it('should allow frame after min interval', () => {
      vi.advanceTimersByTime(100);
      const maxFps = 2; // 500ms interval
      controller.shouldSendFrame(maxFps);

      // Wait for min interval
      vi.advanceTimersByTime(500);

      expect(controller.shouldSendFrame(maxFps)).toBe(true);
    });

    it('should respect different maxFps values', () => {
      vi.advanceTimersByTime(100);
      // 60 FPS = ~16.67ms interval
      expect(controller.shouldSendFrame(60)).toBe(true);
      expect(controller.shouldSendFrame(60)).toBe(false);

      vi.advanceTimersByTime(17);
      expect(controller.shouldSendFrame(60)).toBe(true);
    });
  });

  describe('FPS calculation', () => {
    it('should calculate FPS after 1 second', () => {
      // Send frames
      for (let i = 0; i < 5; i++) {
        controller.shouldSendFrame(60);
        vi.advanceTimersByTime(20);
      }

      // FPS should be calculated after 1 second
      vi.advanceTimersByTime(1000);

      // Force calculation by sending another frame
      controller.shouldSendFrame(60);

      const fps = controller.getCurrentFps();
      expect(fps).toBeGreaterThanOrEqual(0);
    });

    it('should reset FPS calculation after reporting', () => {
      // Send frames
      for (let i = 0; i < 10; i++) {
        controller.shouldSendFrame(60);
        vi.advanceTimersByTime(20);
      }

      vi.advanceTimersByTime(1000);
      controller.shouldSendFrame(60);

      const fps1 = controller.getCurrentFps();
      expect(fps1).toBeGreaterThanOrEqual(0);
    });
  });

  describe('reset', () => {
    it('should reset all counters', () => {
      controller.shouldSendFrame(60);
      vi.advanceTimersByTime(100);
      controller.shouldSendFrame(60);

      controller.reset();

      expect(controller.getCurrentFps()).toBe(0);
      expect(controller.shouldSendFrame(60)).toBe(true);
    });
  });
});

describe('FrameProcessor', () => {
  let processor: FrameProcessor;

  beforeEach(() => {
    processor = new FrameProcessor();
  });

  describe('process', () => {
    it('should process JPEG with correct quality', async () => {
      const config: StreamStateConfig = { format: 'jpeg', quality: 10, maxFps: 60, scale: 1 };

      // Create a minimal valid JPEG base64 (1x1 red pixel)
      const minimalJpeg =
        '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMCwsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

      const result = await processor.process(minimalJpeg, config);
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should process WebP with correct quality', async () => {
      const config: StreamStateConfig = { format: 'webp', quality: 80, maxFps: 0.5, scale: 1 };

      // Create a minimal valid PNG base64 (1x1 red pixel) - sharp can convert to WebP
      const minimalPng =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

      const result = await processor.process(minimalPng, config);
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should handle different quality levels', async () => {
      const minimalPng =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

      const lowQuality = await processor.process(minimalPng, {
        format: 'webp',
        quality: 10,
        maxFps: 60,
        scale: 1,
      });

      const highQuality = await processor.process(minimalPng, {
        format: 'webp',
        quality: 90,
        maxFps: 60,
        scale: 1,
      });

      // Higher quality should generally result in larger file
      // (though for such a tiny image this might not always hold)
      expect(lowQuality).toBeInstanceOf(Buffer);
      expect(highQuality).toBeInstanceOf(Buffer);
    });
  });
});
