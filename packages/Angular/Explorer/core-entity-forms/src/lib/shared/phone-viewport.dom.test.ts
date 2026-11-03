import { describe, it, expect, afterEach } from 'vitest';
import { IsPhoneViewport, PHONE_VIEWPORT_QUERY } from './phone-viewport';

type MatchMediaLike = ((query: string) => { matches: boolean }) | undefined;
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
