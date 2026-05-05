import { describe, it, expect } from 'vitest';
import type { HealingConfig, RetryConfig, HealingStrategy } from '../flow/types.js';

describe('HealingConfig', () => {
  it('should accept all healing strategies', () => {
    const config: HealingConfig = {
      enabled: true,
      strategies: ['fallback', 'identity_text', 'identity_attr', 'identity_parent'],
      maxAttempts: 5,
      attemptDelayMs: 500,
    };
    expect(config.strategies).toHaveLength(4);
    expect(config.maxAttempts).toBe(5);
  });

  it('should allow partial config', () => {
    const config: HealingConfig = {
      enabled: false,
    };
    expect(config.enabled).toBe(false);
    expect(config.strategies).toBeUndefined();
  });

  it('should allow disabling healing', () => {
    const config: HealingConfig = { enabled: false };
    expect(config.enabled).toBe(false);
  });

  it('should allow custom strategy order', () => {
    const config: HealingConfig = {
      strategies: ['identity_text', 'fallback'],
    };
    expect(config.strategies![0]).toBe('identity_text');
  });

  it('should accept numeric attempt delay', () => {
    const config: HealingConfig = {
      attemptDelayMs: 250,
    };
    expect(config.attemptDelayMs).toBe(250);
  });
});

describe('RetryConfig', () => {
  it('should accept fixed strategy', () => {
    const config: RetryConfig = {
      maxAttempts: 3,
      delayMs: 1000,
      strategy: 'fixed',
    };
    expect(config.strategy).toBe('fixed');
  });

  it('should accept exponential strategy with multiplier', () => {
    const config: RetryConfig = {
      maxAttempts: 5,
      delayMs: 500,
      strategy: 'exponential',
      backoffMultiplier: 2,
    };
    expect(config.strategy).toBe('exponential');
    expect(config.backoffMultiplier).toBe(2);
  });

  it('should allow partial config', () => {
    const config: RetryConfig = {
      maxAttempts: 10,
    };
    expect(config.maxAttempts).toBe(10);
    expect(config.strategy).toBeUndefined();
  });
});

describe('HealingStrategy type', () => {
  it('should cover all strategy values', () => {
    const strategies: HealingStrategy[] = [
      'fallback',
      'identity_text',
      'identity_attr',
      'identity_parent',
    ];
    expect(strategies).toHaveLength(4);
  });
});
