/**
 * Unit tests for the pluggable {@link RecordProcessorRegistry} — the open seam that lets external
 * packages teach the substrate new work types. Verifies registration, case-insensitive lookup, factory
 * invocation with the build context, last-wins override, and unregister.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    IRecordProcessor,
    RecordProcessorBuildContext,
    RecordProcessorRegistry,
} from '../index';

/** A trivial fake processor recording the context it was built from. */
class FakeProcessor implements IRecordProcessor {
    constructor(public readonly tag: string) {}
    async ProcessRecord() {
        return { Status: 'Succeeded' as const };
    }
}

const ctx = (over: Partial<RecordProcessorBuildContext>): RecordProcessorBuildContext => ({
    WorkType: 'Custom Type',
    ...over,
});

describe('RecordProcessorRegistry', () => {
    const registry = RecordProcessorRegistry.Instance;

    // Clean any registrations these tests add so the singleton doesn't leak across cases.
    beforeEach(() => {
        for (const wt of [...registry.RegisteredWorkTypes]) {
            registry.Unregister(wt);
        }
    });

    it('is a process-wide singleton', () => {
        expect(RecordProcessorRegistry.Instance).toBe(registry);
    });

    it('resolves a registered factory by work type', () => {
        registry.Register('Custom Type', () => new FakeProcessor('a'));
        const proc = registry.Resolve(ctx({ WorkType: 'Custom Type' }));
        expect(proc).toBeInstanceOf(FakeProcessor);
        expect((proc as FakeProcessor).tag).toBe('a');
    });

    it('matches work types case- and whitespace-insensitively', () => {
        registry.Register('ML Model', () => new FakeProcessor('ml'));
        expect(registry.Resolve(ctx({ WorkType: 'ml model' }))).toBeInstanceOf(FakeProcessor);
        expect(registry.Resolve(ctx({ WorkType: '  ML MODEL  ' }))).toBeInstanceOf(FakeProcessor);
        expect(registry.Has('Ml Model')).toBe(true);
    });

    it('passes the build context to the factory', () => {
        let seen: RecordProcessorBuildContext | undefined;
        registry.Register('Custom Type', (c) => {
            seen = c;
            return new FakeProcessor('x');
        });
        registry.Resolve(ctx({ WorkType: 'Custom Type', Configuration: '{"k":1}', RecordProcessID: 'RP-9' }));
        expect(seen?.Configuration).toBe('{"k":1}');
        expect(seen?.RecordProcessID).toBe('RP-9');
    });

    it('returns null for an unregistered work type', () => {
        expect(registry.Resolve(ctx({ WorkType: 'Nope' }))).toBeNull();
        expect(registry.Has('Nope')).toBe(false);
    });

    it('returns null when a registered factory declines (returns null/undefined)', () => {
        registry.Register('Custom Type', () => null);
        expect(registry.Resolve(ctx({ WorkType: 'Custom Type' }))).toBeNull();
    });

    it('last registration wins for the same key', () => {
        registry.Register('Custom Type', () => new FakeProcessor('first'));
        registry.Register('Custom Type', () => new FakeProcessor('second'));
        expect((registry.Resolve(ctx({ WorkType: 'Custom Type' })) as FakeProcessor).tag).toBe('second');
    });

    it('Unregister removes the registration', () => {
        registry.Register('Custom Type', () => new FakeProcessor('a'));
        expect(registry.Unregister('custom type')).toBe(true);
        expect(registry.Has('Custom Type')).toBe(false);
        expect(registry.Unregister('Custom Type')).toBe(false);
    });

    it('rejects an empty work-type key', () => {
        expect(() => registry.Register('', () => new FakeProcessor('a'))).toThrow(/non-empty/);
        expect(() => registry.Register('   ', () => new FakeProcessor('a'))).toThrow(/non-empty/);
    });
});
