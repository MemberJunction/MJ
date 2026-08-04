import { describe, it, expect, vi, afterEach } from 'vitest';
import { RemoteBrowserGoalRegistry } from '../agentSessions/remoteBrowserGoalRegistry.js';

/**
 * The registry is a process singleton; each test uses a UNIQUE session id so tracked state never
 * bleeds across tests (no reset hook needed for the functional cases).
 */
let seq = 0;
const newSession = () => `sess-${++seq}`;

describe('RemoteBrowserGoalRegistry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a freshly-begun run as Running with no outcome', () => {
    const reg = RemoteBrowserGoalRegistry.Instance;
    const s = newSession();
    reg.Begin(s, 'g1');
    const rec = reg.Get(s, 'g1');
    expect(rec?.Status).toBe('Running');
    expect(rec?.Outcome).toBeUndefined();
    expect(rec?.GoalRunID).toBe('g1');
  });

  it('is case-insensitive on the session id', () => {
    const reg = RemoteBrowserGoalRegistry.Instance;
    reg.Begin('AbC-Session', 'g1');
    expect(reg.Get('abc-session', 'g1')?.Status).toBe('Running');
  });

  it('returns the terminal outcome after Complete', () => {
    const reg = RemoteBrowserGoalRegistry.Instance;
    const s = newSession();
    reg.Begin(s, 'g1');
    reg.Complete(s, 'g1', { Success: true, Status: 'Completed', StepCount: 4, CurrentUrl: 'https://x', Detail: 'done' });
    const rec = reg.Get(s, 'g1');
    expect(rec?.Status).toBe('Complete');
    expect(rec?.Outcome).toMatchObject({ Success: true, Status: 'Completed', StepCount: 4 });
  });

  it('ignores a Complete for a superseded/mismatched goalRunID', () => {
    const reg = RemoteBrowserGoalRegistry.Instance;
    const s = newSession();
    reg.Begin(s, 'g2'); // a newer goal replaced g1
    reg.Complete(s, 'g1', { Success: true, Status: 'Completed' }); // stale completion — dropped
    const rec = reg.Get(s, 'g2');
    expect(rec?.Status).toBe('Running');
  });

  it('Get with a mismatched goalRunID returns undefined (poll for expired/superseded id reads nothing)', () => {
    const reg = RemoteBrowserGoalRegistry.Instance;
    const s = newSession();
    reg.Begin(s, 'g1');
    expect(reg.Get(s, 'g-other')).toBeUndefined();
    expect(reg.Get(s, 'g1')).toBeDefined();
  });

  it('Begin replaces any prior run for the same session', () => {
    const reg = RemoteBrowserGoalRegistry.Instance;
    const s = newSession();
    reg.Begin(s, 'g1');
    reg.Complete(s, 'g1', { Success: true, Status: 'Completed' });
    reg.Begin(s, 'g2'); // new goal supersedes the completed one
    expect(reg.Get(s, 'g1')).toBeUndefined();
    expect(reg.Get(s, 'g2')?.Status).toBe('Running');
  });

  it('sweeps a completed record after its retention TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const reg = RemoteBrowserGoalRegistry.Instance;
    const s = newSession();
    reg.Begin(s, 'g1');
    reg.Complete(s, 'g1', { Success: true, Status: 'Completed' });
    expect(reg.Get(s, 'g1')?.Status).toBe('Complete');
    // Past the completed-retention TTL (5 min) — the next Get sweeps it.
    vi.advanceTimersByTime(6 * 60 * 1000);
    expect(reg.Get(s, 'g1')).toBeUndefined();
  });
});
