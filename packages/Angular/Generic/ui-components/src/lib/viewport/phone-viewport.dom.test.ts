import { describe, it, expect, afterEach, vi } from 'vitest';
import { IsPhoneViewport, WatchPhoneViewport, PHONE_VIEWPORT_QUERY } from './phone-viewport';

/** A matchMedia stand-in whose `matches` and change listeners the spec drives. */
function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const media = {
    get matches() { return matches; },
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  };
  const spy = vi.fn((_query: string) => media as unknown as MediaQueryList);
  vi.stubGlobal('matchMedia', spy);
  return {
    spy,
    listeners,
    cross(next: boolean) { matches = next; listeners.forEach((l) => l()); },
  };
}

describe('phone viewport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the 768px breakpoint the CSS uses', () => {
    expect(PHONE_VIEWPORT_QUERY).toBe('(max-width: 768px)');
  });

  it('reads the current width through matchMedia', () => {
    const mm = stubMatchMedia(true);
    expect(IsPhoneViewport()).toBe(true);
    expect(mm.spy).toHaveBeenCalledWith(PHONE_VIEWPORT_QUERY);
    mm.cross(false);
    expect(IsPhoneViewport()).toBe(false);
  });

  it('is false where matchMedia does not exist, so desktop defaults hold', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(IsPhoneViewport()).toBe(false);
    expect(typeof WatchPhoneViewport(() => undefined)).toBe('function');
  });

  it('calls back when the viewport crosses the breakpoint, until stopped', () => {
    const mm = stubMatchMedia(false);
    const seen: boolean[] = [];
    const stop = WatchPhoneViewport(() => seen.push(IsPhoneViewport()));
    mm.cross(true);
    mm.cross(false);
    stop();
    mm.cross(true);
    expect(seen).toEqual([true, false]);
    expect(mm.listeners.size).toBe(0);
  });
});
