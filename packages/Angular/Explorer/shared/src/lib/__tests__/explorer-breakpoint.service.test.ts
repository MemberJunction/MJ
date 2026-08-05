/**
 * Tests for ExplorerBreakpointService — the shell mobile breakpoint signal.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Angular dependencies — node environment, no TestBed
const injectMock = vi.fn();
vi.mock('@angular/core', () => ({
  Injectable: () => (target: Function) => target,
  NgZone: class {},
  OnDestroy: class {},
  inject: (...args: unknown[]) => injectMock(...args),
}));

import { ExplorerBreakpointService, EXPLORER_MOBILE_BREAKPOINT_PX } from '../explorer-breakpoint.service';

interface FakeMediaQueryList {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

describe('ExplorerBreakpointService', () => {
  let mql: FakeMediaQueryList;
  let matchMediaSpy: ReturnType<typeof vi.fn>;
  const fakeZone = { run: (fn: () => void) => fn() };

  beforeEach(() => {
    injectMock.mockReturnValue(fakeZone);
    mql = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    matchMediaSpy = vi.fn().mockReturnValue(mql);
    vi.stubGlobal('window', { matchMedia: matchMediaSpy });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('queries matchMedia with the canonical 768px shell breakpoint', () => {
    new ExplorerBreakpointService();
    expect(matchMediaSpy).toHaveBeenCalledWith(`(max-width: ${EXPLORER_MOBILE_BREAKPOINT_PX}px)`);
    expect(EXPLORER_MOBILE_BREAKPOINT_PX).toBe(768);
  });

  it('reflects the initial match state', () => {
    mql.matches = true;
    const svc = new ExplorerBreakpointService();
    expect(svc.IsMobile).toBe(true);
  });

  it('emits current value on subscribe, then breakpoint crossings via the change listener', () => {
    const svc = new ExplorerBreakpointService();
    const seen: boolean[] = [];
    svc.IsMobile$.subscribe(v => seen.push(v));
    expect(seen).toEqual([false]);

    // Simulate the media query crossing to mobile
    const handler = mql.addEventListener.mock.calls[0][1] as (e: { matches: boolean }) => void;
    handler({ matches: true });
    expect(seen).toEqual([false, true]);
    expect(svc.IsMobile).toBe(true);

    handler({ matches: false });
    expect(seen).toEqual([false, true, false]);
  });

  it('runs the change handler through the zone (zone.run)', () => {
    const runSpy = vi.fn((fn: () => void) => fn());
    injectMock.mockReturnValue({ run: runSpy });
    const svc = new ExplorerBreakpointService();
    const handler = mql.addEventListener.mock.calls[0][1] as (e: { matches: boolean }) => void;
    handler({ matches: true });
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(svc.IsMobile).toBe(true);
  });

  it('removes the matchMedia listener on destroy', () => {
    const svc = new ExplorerBreakpointService();
    const handler = mql.addEventListener.mock.calls[0][1];
    svc.ngOnDestroy();
    expect(mql.removeEventListener).toHaveBeenCalledWith('change', handler);
  });

  it('degrades gracefully when window/matchMedia is unavailable', () => {
    vi.stubGlobal('window', undefined);
    const svc = new ExplorerBreakpointService();
    expect(svc.IsMobile).toBe(false);
    svc.ngOnDestroy(); // no throw without a query
  });
});
