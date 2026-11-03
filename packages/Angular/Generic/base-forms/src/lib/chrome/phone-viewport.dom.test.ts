import { describe, it, expect, vi, afterEach } from 'vitest';
import { IsPhoneViewport, WatchPhoneViewport, PHONE_VIEWPORT_MEDIA_QUERY } from './phone-viewport';

describe('phone-viewport', () => {
  afterEach(() => { delete (window as { matchMedia?: unknown }).matchMedia; });

  it('is false where matchMedia does not exist (jsdom, SSR)', () => {
    expect(IsPhoneViewport()).toBe(false);
    expect(typeof WatchPhoneViewport(() => undefined)).toBe('function');
  });

  it('reports the 768px breakpoint and forwards change events until unwatched', () => {
    const listeners: Array<() => void> = [];
    window.matchMedia = ((q: string) => ({
      matches: q === PHONE_VIEWPORT_MEDIA_QUERY, media: q, onchange: null,
      addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
      addEventListener: (_: string, cb: () => void) => { listeners.push(cb); },
      removeEventListener: (_: string, cb: () => void) => { listeners.splice(listeners.indexOf(cb), 1); },
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
    expect(IsPhoneViewport()).toBe(true);
    const onChange = vi.fn();
    const stop = WatchPhoneViewport(onChange);
    expect(listeners.length).toBe(1);
    listeners[0]();
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
    expect(listeners.length).toBe(0);
  });
});
