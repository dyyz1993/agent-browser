import { describe, it, expect } from 'vitest';
import { parseCliArgs } from './utils/parseCli';

describe('close command', () => {
  it('should parse close', () => {
    const cmd = parseCliArgs(['close']);
    expect(cmd.action).toBe('close');
  });

  it('should parse quit as close', () => {
    const cmd = parseCliArgs(['quit']);
    expect(cmd.action).toBe('close');
  });

  it('should parse exit as close', () => {
    const cmd = parseCliArgs(['exit']);
    expect(cmd.action).toBe('close');
  });
});
