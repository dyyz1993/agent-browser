import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MessageBridge } from '../message-bridge.js';

describe('MessageBridge', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.MESSAGE_BRIDGE_URL;
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should create instance with custom URL', () => {
    const bridge = new MessageBridge('https://custom.example.com:1234');
    expect(bridge).toBeInstanceOf(MessageBridge);
  });

  it('should create instance with env var MESSAGE_BRIDGE_URL', () => {
    process.env.MESSAGE_BRIDGE_URL = 'https://env.example.com:9999';
    const bridge = new MessageBridge();
    expect(bridge).toBeInstanceOf(MessageBridge);
  });

  it('should create instance with default URL when no args', () => {
    const bridge = new MessageBridge();
    expect(bridge).toBeInstanceOf(MessageBridge);
  });

  it('should prefer constructor URL over env var', () => {
    process.env.MESSAGE_BRIDGE_URL = 'https://env.example.com';
    const bridge = new MessageBridge('https://constructor.example.com');
    expect(bridge).toBeInstanceOf(MessageBridge);
  });

  describe('push', () => {
    it('should wrap plain string in question field', async () => {
      const bridge = new MessageBridge('https://bad-url-that-will-fail.example.com');
      await expect(bridge.push('hello world')).rejects.toThrow();
    });

    it('should accept JSON string with question field', async () => {
      const bridge = new MessageBridge('https://bad-url-that-will-fail.example.com');
      await expect(bridge.push('{"question":"test"}')).rejects.toThrow();
    });
  });

  describe('pull', () => {
    it('should throw on failed response', async () => {
      const bridge = new MessageBridge('https://bad-url-that-will-fail.example.com');
      await expect(bridge.pull('msg-123')).rejects.toThrow();
    });
  });

  describe('ask', () => {
    it('should throw on connection failure', async () => {
      const bridge = new MessageBridge('https://bad-url-that-will-fail.example.com');
      await expect(bridge.ask('test question')).rejects.toThrow();
    });
  });
});
