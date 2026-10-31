import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientSessionDeadline, MAX_TIMER_MS } from '../session/client-session-deadline';

describe('ClientSessionDeadline alarm', () => {
  let deadline: ClientSessionDeadline;
  let reached: Date[];
  let warnings: number[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    deadline = new ClientSessionDeadline();
    reached = [];
    warnings = [];
    deadline.Reached$.subscribe((e) => reached.push(e.deadline));
    deadline.Warning$.subscribe((e) => warnings.push(e.remainingMs));
  });

  afterEach(() => {
    deadline.Dispose();
    vi.useRealTimers();
  });

  const inMs = (ms: number): Date => new Date(Date.now() + ms);

  it('fires Reached$ at the deadline', () => {
    deadline.Set(inMs(2000));
    vi.advanceTimersByTime(1999);
    expect(reached).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(reached).toHaveLength(1);
  });

  it('a past deadline fires on the next tick', () => {
    deadline.Set(inMs(-1));
    expect(reached).toHaveLength(0);
    vi.advanceTimersByTime(0);
    expect(reached).toHaveLength(1);
  });

  it('fires each warning once, in order', () => {
    deadline.Set(inMs(150_000), { warnBeforeMs: [120_000, 30_000] });
    vi.advanceTimersByTime(29_999);
    expect(warnings).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(warnings).toEqual([120_000]);
    vi.advanceTimersByTime(90_000);
    expect(warnings).toEqual([120_000, 30_000]);
    vi.advanceTimersByTime(30_000);
    expect(warnings).toEqual([120_000, 30_000]);
    expect(reached).toHaveLength(1);
  });

  it('skips a warning whose moment has passed', () => {
    deadline.Set(inMs(30_000), { warnBeforeMs: [120_000] });
    vi.advanceTimersByTime(30_000);
    expect(warnings).toEqual([]);
    expect(reached).toHaveLength(1);
  });

  it('dedupes and ignores non-finite offsets', () => {
    deadline.Set(inMs(60_000), { warnBeforeMs: [30_000, 30_000, NaN, Infinity, -5, 0] });
    vi.advanceTimersByTime(60_000);
    expect(warnings).toEqual([30_000]);
  });

  it('Extend later re-arms and clears fired bookkeeping', () => {
    deadline.Set(inMs(60_000), { warnBeforeMs: [30_000] });
    vi.advanceTimersByTime(30_000);
    expect(warnings).toEqual([30_000]);
    expect(deadline.Extend(inMs(60_000 + 30_000).toISOString())).toBe(true);
    // remaining is now 90 s; the 30 s offset is back in the future (fires in 60 s)
    vi.advanceTimersByTime(60_000);
    expect(warnings).toEqual([30_000, 30_000]);
    vi.advanceTimersByTime(30_000);
    expect(reached).toHaveLength(1);
  });

  it('Extend earlier or equal is ignored', () => {
    const d = inMs(10_000);
    deadline.Set(d);
    expect(deadline.Extend(d.toISOString())).toBe(false);
    expect(deadline.Extend(inMs(5000).toISOString())).toBe(false);
    expect(deadline.Value).toEqual(d);
    vi.advanceTimersByTime(10_000);
    expect(reached).toHaveLength(1);
  });

  it('Clear resets the options, so a reused runtime does not inherit the previous call\'s autoEnd or warnings', () => {
    deadline.Set(inMs(1000), { autoEnd: false, warnBeforeMs: [500] });
    deadline.Clear();
    expect(deadline.Options).toEqual({ autoEnd: true, warnBeforeMs: [] });
  });

  it('Set(null), Clear and Dispose cancel pending timers', () => {
    deadline.Set(inMs(1000), { warnBeforeMs: [500] });
    deadline.Set(null);
    vi.advanceTimersByTime(5000);
    deadline.Set(inMs(1000));
    deadline.Clear();
    vi.advanceTimersByTime(5000);
    deadline.Set(inMs(1000));
    deadline.Dispose();
    vi.advanceTimersByTime(5000);
    expect(reached).toHaveLength(0);
    expect(warnings).toHaveLength(0);
    expect(() => deadline.Set(inMs(10))).not.toThrow();
    expect(deadline.Extend(inMs(99_999).toISOString())).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(reached).toHaveLength(0);
  });

  it('a second Set replaces options', () => {
    deadline.Set(inMs(60_000), { warnBeforeMs: [30_000], autoEnd: false });
    expect(deadline.Options).toEqual({ autoEnd: false, warnBeforeMs: [30_000] });
    deadline.Set(inMs(60_000));
    expect(deadline.Options).toEqual({ autoEnd: true, warnBeforeMs: [] });
    vi.advanceTimersByTime(60_000);
    expect(warnings).toEqual([]);
    expect(reached).toHaveLength(1);
  });

  it('hops a far deadline in MAX_TIMER_MS steps', () => {
    const thirtyDays = 30 * 24 * 3600 * 1000;
    deadline.Set(inMs(thirtyDays));
    vi.advanceTimersByTime(MAX_TIMER_MS);
    expect(reached).toHaveLength(0);
    vi.advanceTimersByTime(thirtyDays - MAX_TIMER_MS - 1);
    expect(reached).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(reached).toHaveLength(1);
  });

  it('remainingMs is anchored on elapsed time, not the wall clock', () => {
    let clock = 1_000_000;
    const d = new ClientSessionDeadline(() => clock);
    const hits: number[] = [];
    d.Reached$.subscribe(() => hits.push(1));
    d.Set(new Date(clock + 2000));
    clock -= 5 * 60 * 1000;
    vi.advanceTimersByTime(1999);
    expect(hits).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(hits).toHaveLength(1);
    d.Dispose();
  });

  it('a wall clock that jumps back after Set does not delay a far deadline across a hop', () => {
    let clock = 1_000_000;
    const d = new ClientSessionDeadline(() => clock);
    const hits: number[] = [];
    d.Reached$.subscribe(() => hits.push(1));
    const farMs = MAX_TIMER_MS + 60_000;
    d.Set(new Date(clock + farMs));
    clock -= 24 * 3600 * 1000; // the laptop clock is set back a day after the alarm was armed
    vi.advanceTimersByTime(farMs - 1);
    expect(hits).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(hits).toHaveLength(1);
    d.Dispose();
  });

  it('the shared default options cannot be mutated through Options', () => {
    const options = new ClientSessionDeadline().Options;
    expect(Object.isFrozen(options)).toBe(true);
    expect(Object.isFrozen(options.warnBeforeMs)).toBe(true);
  });
});
