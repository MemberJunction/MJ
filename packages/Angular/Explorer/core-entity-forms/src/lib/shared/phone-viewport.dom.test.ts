import { describe, it, expect, afterEach } from 'vitest';
import { IsPhoneViewport, WatchPhoneViewport, PHONE_VIEWPORT_QUERY } from './phone-viewport';

type FakeMedia = { matches: boolean; addEventListener?: (t: string, l: () => void) => void; removeEventListener?: (t: string, l: () => void) => void };
type MatchMediaLike = ((query: string) => FakeMedia) | undefined;
const setMatchMedia = (fn: MatchMediaLike): void => {
    Object.defineProperty(window, 'matchMedia', { value: fn, configurable: true, writable: true });
};

describe('IsPhoneViewport', () => {
    afterEach(() => setMatchMedia(undefined));

    it('is true when the phone media query matches', () => {
        setMatchMedia((q) => ({ matches: q === PHONE_VIEWPORT_QUERY }));
        expect(IsPhoneViewport()).toBe(true);
    });

    it('is false when it does not match', () => {
        setMatchMedia(() => ({ matches: false }));
        expect(IsPhoneViewport()).toBe(false);
    });

    it('is false where matchMedia does not exist', () => {
        setMatchMedia(undefined);
        expect(IsPhoneViewport()).toBe(false);
    });
});

describe('WatchPhoneViewport', () => {
    afterEach(() => setMatchMedia(undefined));

    it('calls back when the phone media query changes, until stopped', () => {
        const listeners = new Set<() => void>();
        setMatchMedia(() => ({ matches: false, addEventListener: (_t, l) => listeners.add(l), removeEventListener: (_t, l) => listeners.delete(l) }));
        let calls = 0;
        const stop = WatchPhoneViewport(() => calls++);
        listeners.forEach((l) => l());
        expect(calls).toBe(1);
        stop();
        expect(listeners.size).toBe(0);
    });

    it('returns a no-op stop where matchMedia does not exist', () => {
        setMatchMedia(undefined);
        expect(() => WatchPhoneViewport(() => undefined)()).not.toThrow();
    });
});
