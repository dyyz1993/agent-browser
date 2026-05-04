import { describe, it, expect } from 'vitest';
import { formatIdleSessionTips, type IdleSessionInfo } from '../cli/connection.js';

describe('formatIdleSessionTips', () => {
  it('returns empty array for empty input', () => {
    expect(formatIdleSessionTips([])).toEqual([]);
  });

  it('formats single idle session with tabs correctly', () => {
    const sessions: IdleSessionInfo[] = [
      {
        session: 'my-session',
        idleMinutes: 45,
        tabs: [
          { index: 0, url: 'https://example.com', title: 'Example', active: true },
          { index: 1, url: 'https://google.com', title: 'Google', active: false },
        ],
      },
    ];
    const result = formatIdleSessionTips(sessions);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain(
      "[Idle Session] 'my-session' has been idle for 45m, 2 tab(s) open:"
    );
    expect(result[0]).toContain('  - Tab 0: https://example.com');
    expect(result[0]).toContain('  - Tab 1: https://google.com');
    expect(result[0]).toContain('  Consider closing it: agent-browser close --session my-session');
  });

  it('formats idle session with no tabs', () => {
    const sessions: IdleSessionInfo[] = [
      {
        session: 'empty-session',
        idleMinutes: 10,
        tabs: [],
      },
    ];
    const result = formatIdleSessionTips(sessions);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain(
      "[Idle Session] 'empty-session' has been idle for 10m, 0 tab(s) open:"
    );
    expect(result[0]).toContain(
      '  Consider closing it: agent-browser close --session empty-session'
    );
  });

  it('truncates long URLs (> 80 chars)', () => {
    const longUrl =
      'https://example.com/very/long/path/that/exceeds/eighty/characters/and/should/be/truncated/now';
    const sessions: IdleSessionInfo[] = [
      {
        session: 'long-url-session',
        idleMinutes: 5,
        tabs: [{ index: 0, url: longUrl, title: 'Long', active: true }],
      },
    ];
    const result = formatIdleSessionTips(sessions);
    const tabLine = result[0].split('\n').find((l) => l.includes('Tab 0'))!;
    expect(tabLine).toContain('...');
    expect(tabLine.length - '  - Tab 0: '.length).toBeLessThanOrEqual(80);
  });

  it('formats multiple idle sessions', () => {
    const sessions: IdleSessionInfo[] = [
      {
        session: 'session-a',
        idleMinutes: 30,
        tabs: [{ index: 0, url: 'https://a.com', title: 'A', active: true }],
      },
      {
        session: 'session-b',
        idleMinutes: 60,
        tabs: [{ index: 0, url: 'https://b.com', title: 'B', active: true }],
      },
    ];
    const result = formatIdleSessionTips(sessions);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain("'session-a'");
    expect(result[1]).toContain("'session-b'");
  });

  it('formats idle time in hours and minutes (>= 60 min shows as "Xh Xm")', () => {
    const sessions: IdleSessionInfo[] = [
      {
        session: 'long-idle',
        idleMinutes: 125,
        tabs: [],
      },
    ];
    const result = formatIdleSessionTips(sessions);
    expect(result[0]).toContain('idle for 2h 5m');
  });

  it('formats idle time as just minutes (< 60 min)', () => {
    const sessions: IdleSessionInfo[] = [
      {
        session: 'short-idle',
        idleMinutes: 42,
        tabs: [],
      },
    ];
    const result = formatIdleSessionTips(sessions);
    expect(result[0]).toContain('idle for 42m');
    expect(result[0]).not.toContain('h ');
  });

  it('each session tip is a single string with \\n (not multiple array entries)', () => {
    const sessions: IdleSessionInfo[] = [
      {
        session: 'multi-line',
        idleMinutes: 90,
        tabs: [
          { index: 0, url: 'https://a.com', title: 'A', active: true },
          { index: 1, url: 'https://b.com', title: 'B', active: false },
        ],
      },
    ];
    const result = formatIdleSessionTips(sessions);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('\n');
    const lines = result[0].split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('closing command includes correct session name', () => {
    const sessions: IdleSessionInfo[] = [
      {
        session: 'my-special-session',
        idleMinutes: 15,
        tabs: [],
      },
    ];
    const result = formatIdleSessionTips(sessions);
    expect(result[0]).toContain('agent-browser close --session my-special-session');
  });
});
