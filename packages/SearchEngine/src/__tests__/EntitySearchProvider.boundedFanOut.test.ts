/**
 * @fileoverview The entity fan-out must be BOUNDED, and an entity that never answered must
 * not look like an entity with no matches.
 *
 * Two defects, one code site:
 *
 *  1. `Promise.all` over every scoped entity put one `LIKE '%term%'` scan per searchable
 *     entity on the pool simultaneously — and this is the innermost of three nested
 *     unbounded layers (per scope → per provider → per entity). The per-entity timeout does
 *     NOT bound it: it bounds the WAIT, while the abandoned query keeps running in the
 *     database.
 *  2. A timed-out or failed entity resolved to `[]`, which is the same value as "searched it,
 *     found nothing". Fusion therefore published a confident, complete-looking result set
 *     that was quietly missing whole entities.
 *
 * Harness mirrors EntitySearchProvider.test.ts in this directory (hoisted mocks over
 * `@memberjunction/core`, entities pushed into a shared array).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockRunViewFn, mockEntities, mockLogError } = vi.hoisted(() => {
    const mockRunViewFn = vi.fn();
    const mockLogError = vi.fn();
    const mockEntities: Array<{
        Name: string;
        AllowUserSearchAPI: boolean;
        Fields: Array<{ Name: string; IncludeInUserSearchAPI: boolean; IsNameField: boolean }>;
        NameField?: { Name: string };
        PrimaryKeys?: Array<{ Name: string }>;
    }> = [];
    return { mockRunViewFn, mockEntities, mockLogError };
});

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    const withDefaultPK = (e: (typeof mockEntities)[number] | undefined) =>
        e ? { ...e, PrimaryKeys: e.PrimaryKeys ?? [{ Name: 'ID' }] } : undefined;
    class MockMetadata {
        get Entities() { return mockEntities; }
        EntityByName(name: string) { return withDefaultPK(mockEntities.find(e => e.Name === name)); }
        static Provider = {
            get Entities() { return mockEntities; },
            EntityByName(name: string) { return withDefaultPK(mockEntities.find(e => e.Name === name)); },
        };
    }
    class MockRunView {
        RunView = mockRunViewFn;
    }
    return {
        Metadata: MockMetadata,
        RunView: MockRunView,
        CompositeKey: actual.CompositeKey,
        LogError: mockLogError,
        LogStatus: vi.fn(),
        LogErrorEx: vi.fn(),
    };
});

import { EntitySearchProvider } from '../generic/EntitySearchProvider';
import type { EntitySearchIncompleteReport } from '../generic/EntitySearchProvider';
import type { UserInfo } from '@memberjunction/core';

const USER = { ID: 'user-123', Name: 'Test User', Email: 'test@example.com' } as UserInfo;

/** Register `count` searchable entities named Entity0…Entity{count-1}. */
function seedEntities(count: number): string[] {
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
        const name = `Entity${i}`;
        names.push(name);
        mockEntities.push({
            Name: name,
            AllowUserSearchAPI: true,
            NameField: { Name: 'Name' },
            Fields: [{ Name: 'Name', IncludeInUserSearchAPI: true, IsNameField: true }],
        });
    }
    return names;
}

interface ConcurrencyProbe {
    /** The highest number of simultaneously in-flight RunViews observed. */
    peak: number;
    /** Total RunView calls. */
    calls: number;
    /** Release all queries that are currently parked. */
    releaseAll(): void;
}

/**
 * Makes every RunView park until released, so the peak in-flight count is observable.
 *
 * The `settleDelayMs` gap is what makes the measurement meaningful: without it, each query
 * would resolve inside the same microtask the pool started it in and a serial loop would look
 * identical to an unbounded one.
 */
function probeConcurrency(settleDelayMs = 5): ConcurrencyProbe {
    const probe: ConcurrencyProbe = { peak: 0, calls: 0, releaseAll: () => { /* replaced below */ } };
    let inFlight = 0;
    const parked: Array<() => void> = [];
    probe.releaseAll = () => {
        parked.splice(0).forEach(release => release());
    };
    mockRunViewFn.mockImplementation(async () => {
        probe.calls++;
        inFlight++;
        probe.peak = Math.max(probe.peak, inFlight);
        await new Promise<void>(resolve => {
            const timer = setTimeout(resolve, settleDelayMs);
            parked.push(() => { clearTimeout(timer); resolve(); });
        });
        inFlight--;
        return { Success: true, Results: [], ErrorMessage: '' };
    });
    return probe;
}

describe('EntitySearchProvider.mapWithConcurrency', () => {
    it('never exceeds the ceiling, and still returns results in INPUT order', async () => {
        let inFlight = 0;
        let peak = 0;
        const items = Array.from({ length: 20 }, (_, i) => i);

        const out = await EntitySearchProvider.mapWithConcurrency(items, 4, async (item) => {
            inFlight++;
            peak = Math.max(peak, inFlight);
            // Reverse the durations so the completion order is the opposite of the input
            // order — order preservation is then a real assertion, not a coincidence.
            await new Promise<void>(resolve => setTimeout(resolve, (20 - item) % 5));
            inFlight--;
            return item * 10;
        });

        expect(peak).toBeLessThanOrEqual(4);
        expect(peak).toBeGreaterThan(1); // it is a POOL, not a serial loop
        expect(out).toEqual(items.map(i => i * 10));
    });

    it('runs every item exactly once', async () => {
        const seen: number[] = [];
        await EntitySearchProvider.mapWithConcurrency(Array.from({ length: 13 }, (_, i) => i), 5, async (item) => {
            seen.push(item);
            return item;
        });
        expect(seen.slice().sort((a, b) => a - b)).toEqual(Array.from({ length: 13 }, (_, i) => i));
    });

    it('clamps a nonsensical ceiling to at least 1 rather than stalling', async () => {
        const out = await EntitySearchProvider.mapWithConcurrency([1, 2, 3], 0, async (n) => n + 1);
        expect(out).toEqual([2, 3, 4]);
    });

    it('returns an empty array for an empty input without invoking the worker', async () => {
        const worker = vi.fn();
        const out = await EntitySearchProvider.mapWithConcurrency([], 4, worker);
        expect(out).toEqual([]);
        expect(worker).not.toHaveBeenCalled();
    });
});

describe('EntitySearchProvider.Search — the entity fan-out is bounded', () => {
    const originalCap = EntitySearchProvider.MaxConcurrentEntitySearches;
    const originalTimeout = EntitySearchProvider.PerEntityTimeoutMS;

    beforeEach(() => {
        mockEntities.length = 0;
        mockRunViewFn.mockReset();
        mockLogError.mockReset();
        EntitySearchProvider.OnIncompleteResults = undefined;
    });

    afterEach(() => {
        EntitySearchProvider.MaxConcurrentEntitySearches = originalCap;
        EntitySearchProvider.PerEntityTimeoutMS = originalTimeout;
        EntitySearchProvider.OnIncompleteResults = undefined;
    });

    it('issues at most MaxConcurrentEntitySearches RunViews at a time over 40 entities', async () => {
        seedEntities(40);
        EntitySearchProvider.MaxConcurrentEntitySearches = 6;
        const probe = probeConcurrency();

        await new EntitySearchProvider().Search('alpha', 25, undefined, USER);

        expect(probe.calls).toBe(40);
        expect(probe.peak).toBeLessThanOrEqual(6);
    });

    it('honours a raised ceiling — the cap is read, not hardcoded', async () => {
        seedEntities(40);
        EntitySearchProvider.MaxConcurrentEntitySearches = 20;
        const probe = probeConcurrency();

        await new EntitySearchProvider().Search('alpha', 25, undefined, USER);

        expect(probe.peak).toBeGreaterThan(6);
        expect(probe.peak).toBeLessThanOrEqual(20);
    });

    it('never leaves the ceiling unused when there is more work than slots', async () => {
        seedEntities(40);
        EntitySearchProvider.MaxConcurrentEntitySearches = 6;
        const probe = probeConcurrency();

        await new EntitySearchProvider().Search('alpha', 25, undefined, USER);

        // A cap that serialised everything would also satisfy "<= 6" — pin the floor too.
        expect(probe.peak).toBe(6);
    });

    it('still searches every scoped entity despite the cap', async () => {
        const names = seedEntities(12);
        EntitySearchProvider.MaxConcurrentEntitySearches = 3;
        const searched: string[] = [];
        mockRunViewFn.mockImplementation(async (params: { EntityName: string }) => {
            searched.push(params.EntityName);
            return { Success: true, Results: [], ErrorMessage: '' };
        });

        await new EntitySearchProvider().Search('alpha', 25, undefined, USER);

        expect(searched.slice().sort()).toEqual(names.slice().sort());
    });
});

describe('EntitySearchProvider.Search — an entity that did not answer is reported, not swallowed', () => {
    const originalCap = EntitySearchProvider.MaxConcurrentEntitySearches;
    const originalTimeout = EntitySearchProvider.PerEntityTimeoutMS;

    beforeEach(() => {
        mockEntities.length = 0;
        mockRunViewFn.mockReset();
        mockLogError.mockReset();
        EntitySearchProvider.OnIncompleteResults = undefined;
    });

    afterEach(() => {
        EntitySearchProvider.MaxConcurrentEntitySearches = originalCap;
        EntitySearchProvider.PerEntityTimeoutMS = originalTimeout;
        EntitySearchProvider.OnIncompleteResults = undefined;
    });

    /** Entity1 hangs past the per-entity timeout; the others answer immediately. */
    function seedOneSlowEntity(): void {
        seedEntities(3);
        EntitySearchProvider.PerEntityTimeoutMS = 20;
        EntitySearchProvider.MaxConcurrentEntitySearches = 3;
        mockRunViewFn.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'Entity1') {
                await new Promise<void>(resolve => setTimeout(resolve, 500));
            }
            return {
                Success: true,
                Results: [{ ID: `${params.EntityName}-1`, Name: 'alpha match' }],
                ErrorMessage: '',
            };
        });
    }

    it('names the timed-out entity in an OnIncompleteResults report', async () => {
        seedOneSlowEntity();
        const reports: EntitySearchIncompleteReport[] = [];
        EntitySearchProvider.OnIncompleteResults = r => reports.push(r);

        await new EntitySearchProvider().Search('alpha', 25, undefined, USER);

        expect(reports).toHaveLength(1);
        expect(reports[0].TimedOutEntities).toEqual(['Entity1']);
        expect(reports[0].FailedEntities).toEqual([]);
        expect(reports[0].EntitiesRequested).toBe(3);
        expect(reports[0].Query).toBe('alpha');
    });

    it('still returns the entities that DID answer', async () => {
        seedOneSlowEntity();

        const results = await new EntitySearchProvider().Search('alpha', 25, undefined, USER);

        expect(results.map(r => r.RecordID).sort()).toEqual(['Entity0-1', 'Entity2-1']);
    });

    it('reports a FAILED entity separately from a timed-out one', async () => {
        seedEntities(3);
        EntitySearchProvider.MaxConcurrentEntitySearches = 3;
        mockRunViewFn.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'Entity2') {
                return { Success: false, Results: [], ErrorMessage: 'Invalid column name' };
            }
            return { Success: true, Results: [], ErrorMessage: '' };
        });
        const reports: EntitySearchIncompleteReport[] = [];
        EntitySearchProvider.OnIncompleteResults = r => reports.push(r);

        await new EntitySearchProvider().Search('alpha', 25, undefined, USER);

        expect(reports).toHaveLength(1);
        expect(reports[0].FailedEntities).toEqual(['Entity2']);
        expect(reports[0].TimedOutEntities).toEqual([]);
    });

    it('reports a THROWN query failure too', async () => {
        seedEntities(2);
        EntitySearchProvider.MaxConcurrentEntitySearches = 2;
        mockRunViewFn.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'Entity0') {
                throw new Error('connection reset');
            }
            return { Success: true, Results: [], ErrorMessage: '' };
        });
        const reports: EntitySearchIncompleteReport[] = [];
        EntitySearchProvider.OnIncompleteResults = r => reports.push(r);

        await new EntitySearchProvider().Search('alpha', 25, undefined, USER);

        expect(reports[0]?.FailedEntities).toEqual(['Entity0']);
    });

    it('does NOT fire the hook when every entity answered — even with zero matches', async () => {
        seedEntities(4);
        EntitySearchProvider.MaxConcurrentEntitySearches = 4;
        mockRunViewFn.mockResolvedValue({ Success: true, Results: [], ErrorMessage: '' });
        const reports: EntitySearchIncompleteReport[] = [];
        EntitySearchProvider.OnIncompleteResults = r => reports.push(r);

        const results = await new EntitySearchProvider().Search('alpha', 25, undefined, USER);

        // Empty results from a COMPLETE fan-out is not a partial answer, and this is the
        // distinction the old `[]`-for-everything shape could not express.
        expect(results).toEqual([]);
        expect(reports).toEqual([]);
    });

    it('logs ONE rolled-up partial-results line rather than one line per entity', async () => {
        seedEntities(4);
        EntitySearchProvider.PerEntityTimeoutMS = 20;
        EntitySearchProvider.MaxConcurrentEntitySearches = 4;
        mockRunViewFn.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName !== 'Entity3') {
                await new Promise<void>(resolve => setTimeout(resolve, 500));
            }
            return { Success: true, Results: [], ErrorMessage: '' };
        });

        await new EntitySearchProvider().Search('alpha', 25, undefined, USER);

        const partialLines = mockLogError.mock.calls
            .map(args => String(args[0]))
            .filter(line => line.includes('PARTIAL RESULTS'));
        expect(partialLines).toHaveLength(1);
        expect(partialLines[0]).toContain('3 of 4 entities did not answer');
    });

    it('a throwing host hook cannot fail the search it is reporting on', async () => {
        seedOneSlowEntity();
        EntitySearchProvider.OnIncompleteResults = () => { throw new Error('host blew up'); };

        const results = await new EntitySearchProvider().Search('alpha', 25, undefined, USER);

        expect(results.map(r => r.RecordID).sort()).toEqual(['Entity0-1', 'Entity2-1']);
    });
});
