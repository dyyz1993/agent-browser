import { describe, it, expect } from 'vitest';
import { toAIFriendlyError } from '../actions';

describe('toAIFriendlyError', () => {
  describe('strict mode violation', () => {
    it('should suggest nth and snapshot for multiple matches', () => {
      const err = new Error('strict mode violation: resolved to 5 elements');
      const result = toAIFriendlyError(err, '.btn');
      expect(result.message).toContain('matched 5 elements');
      expect(result.message).toContain('snapshot');
      expect(result.message).toContain('nth');
    });

    it('should handle missing count in strict mode message', () => {
      const err = new Error('strict mode violation: some elements');
      const result = toAIFriendlyError(err, '.item');
      expect(result.message).toContain('matched multiple elements');
    });
  });

  describe('pointer interception', () => {
    it('should suggest dismissing modals', () => {
      const err = new Error('Element intercepts pointer events');
      const result = toAIFriendlyError(err, '#submit');
      expect(result.message).toContain('blocked by another element');
      expect(result.message).toContain('snapshot -i');
    });
  });

  describe('element not visible', () => {
    it('should suggest scrollintoview and is visible', () => {
      const err = new Error('Element is not visible');
      const result = toAIFriendlyError(err, '#hidden');
      expect(result.message).toContain('not visible');
      expect(result.message).toContain('scrollintoview');
      expect(result.message).toContain('is visible');
    });

    it('should not match timeout with not visible', () => {
      const err = new Error('Timeout waiting for element to be visible');
      const result = toAIFriendlyError(err, '#slow');
      expect(result.message).not.toContain('scrollintoview');
    });
  });

  describe('timeout errors', () => {
    it('should suggest wait and snapshot for timeout', () => {
      const err = new Error('Timeout 5000ms exceeded');
      const result = toAIFriendlyError(err, '#btn');
      expect(result.message).toContain('timed out');
      expect(result.message).toContain('snapshot');
      expect(result.message).toContain('wait --load');
    });
  });

  describe('element not found', () => {
    it('should suggest snapshot -i and ref refresh', () => {
      const err = new Error('waiting for selector to be visible');
      const result = toAIFriendlyError(err, '@e99');
      expect(result.message).toContain('not found');
      expect(result.message).toContain('snapshot -i');
      expect(result.message).toContain('@ref');
    });
  });

  describe('execution context destroyed', () => {
    it('should suggest re-open for context destroyed', () => {
      const err = new Error('Execution context was destroyed');
      const result = toAIFriendlyError(err, '#form');
      expect(result.message).toContain('Browser context was lost');
      expect(result.message).toContain('open');
    });

    it('should suggest re-open for target closed', () => {
      const err = new Error('Target closed');
      const result = toAIFriendlyError(err, '#link');
      expect(result.message).toContain('Browser context was lost');
    });
  });

  describe('invalid selector', () => {
    it('should suggest snapshot -i for invalid selector', () => {
      const err = new Error('is not a valid selector');
      const result = toAIFriendlyError(err, '!!!bad');
      expect(result.message).toContain('Invalid selector');
      expect(result.message).toContain('snapshot -i');
      expect(result.message).toContain('@ref');
    });

    it('should match querySelector error', () => {
      const err = new Error('querySelector failed: syntax error');
      const result = toAIFriendlyError(err, '[invalid');
      expect(result.message).toContain('Invalid selector');
    });
  });

  describe('unknown errors', () => {
    it('should pass through Error instances', () => {
      const err = new Error('Something unexpected');
      const result = toAIFriendlyError(err, '#el');
      expect(result.message).toBe('Something unexpected');
    });

    it('should wrap non-Error values', () => {
      const result = toAIFriendlyError('string error', '#el');
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('string error');
    });
  });
});
