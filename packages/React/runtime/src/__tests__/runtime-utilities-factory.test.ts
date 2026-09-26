/**
 * @vitest-environment jsdom
 *
 * `createRuntimeUtilities` is the documented extension point for the `utilities` prop: register a
 * higher-priority subclass and every interactive component gets yours.
 *
 * It did not work in a browser. The factory consulted `ClassFactory` only when
 * `typeof window === 'undefined'`, so on every browser and React Native host the registration was
 * inert — the base class still built working utilities, which is exactly why nobody noticed.
 *
 * These run under jsdom **on purpose**: `window` is defined here, so the old implementation fails
 * the override test and the new one passes. That is the whole point of the file.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { RuntimeUtilities, CreateRuntimeUtilities } from '../utilities/runtime-utilities';

/** A host's substitute implementation, registered above the base. */
@RegisterClass(RuntimeUtilities, 'RuntimeUtilities', 10)
class HostRuntimeUtilities extends RuntimeUtilities {
    public readonly IsHostOverride = true;
}

describe('createRuntimeUtilities', () => {
    beforeEach(() => {
        // The guard this file exists to remove keyed off `window`; assert the environment really
        // does have one, so a config change to `node` cannot make these tests pass vacuously.
        expect(typeof window).not.toBe('undefined');
    });

    it('resolves a registered subclass in a browser environment', () => {
        const utilities = CreateRuntimeUtilities();
        expect(utilities).toBeInstanceOf(HostRuntimeUtilities);
    });

    it('returns something that is still a RuntimeUtilities', () => {
        // The contract callers rely on: whatever comes back exposes `buildUtilities`.
        const utilities = CreateRuntimeUtilities();
        expect(utilities).toBeInstanceOf(RuntimeUtilities);
        expect(typeof utilities.buildUtilities).toBe('function');
    });

    it('falls back to the base class when ClassFactory cannot resolve one', () => {
        // Resolution failing must cost the host its override, never the component — a thrown
        // factory would take down every interactive component on the page.
        const factory = MJGlobal.Instance.ClassFactory as unknown as {
            CreateInstance: (...args: unknown[]) => unknown;
        };
        const original = factory.CreateInstance;
        factory.CreateInstance = () => {
            throw new Error('simulated resolution failure');
        };
        try {
            expect(CreateRuntimeUtilities()).toBeInstanceOf(RuntimeUtilities);
        } finally {
            factory.CreateInstance = original;
        }
    });
});
