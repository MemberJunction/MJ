import { describe, it, expect, afterEach } from 'vitest';
import { PhoneSectionsState } from './phone-sections-state';

type Listener = () => void;
const listeners = new Set<Listener>();
const setMatchMedia = (matches: boolean | undefined): void => {
    const fn = matches === undefined ? undefined : () => ({ matches, addEventListener: (_t: string, l: Listener) => listeners.add(l), removeEventListener: (_t: string, l: Listener) => listeners.delete(l) });
    Object.defineProperty(window, 'matchMedia', { value: fn, configurable: true, writable: true });
};

describe('PhoneSectionsState', () => {
    afterEach(() => { setMatchMedia(undefined); listeners.clear(); });

    it('starts from the current breakpoint and follows it until stopped, telling the form each time', () => {
        setMatchMedia(true);
        let changed = 0;
        const s = new PhoneSectionsState(() => changed++);
        expect(s.IsPhone).toBe(true);
        setMatchMedia(false);
        s.Sync();
        expect(s.IsPhone).toBe(false);
        expect(changed).toBe(1);
        s.Stop();
        expect(listeners.size).toBe(0);
    });

    it('remembers the picked section and tells the form', () => {
        setMatchMedia(false);
        let changed = 0;
        const s = new PhoneSectionsState(() => changed++);
        expect(s.Section).toBeNull();
        s.Pick('history');
        expect(s.Section).toBe('history');
        expect(changed).toBe(1);
    });

    it('is not a phone where matchMedia does not exist', () => {
        setMatchMedia(undefined);
        expect(new PhoneSectionsState(() => undefined).IsPhone).toBe(false);
    });
});
