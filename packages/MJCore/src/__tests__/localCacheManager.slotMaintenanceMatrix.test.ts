/**
 * Slot-maintenance matrix for LocalCacheManager.
 *
 * ## Why this file exists
 * MJ's RunView cache has shipped TWO production bugs in the same family:
 *   - #3195: cached SUBSET slots collapsed `totalRowCount`
 *   - #3199: cached SUBSET slots had their ROWS maintained in place, so a `MaxRows: 1` slot grew
 *            to 2, 3, 4 … on save, and shrank to 0 on delete while the DB still had 47 rows
 *
 * Both slipped through ~290 existing cache unit tests because those tests cover the axes
 * *slot identity* (does MaxRows produce a distinct fingerprint?) and *invalidation* (does a
 * change blow the entry away?) — but never the axis where the bugs actually live:
 *
 *              **SLOT TYPE  ×  MUTATION EVENT**
 *
 * A slot is only safe to maintain in place when it is BOTH unfiltered (we could not evaluate a
 * SQL predicate in JS to know whether a saved row matches) AND unlimited (we could not know
 * whether a saved row falls inside a TOP/OFFSET window, nor which row it displaces). Any other
 * combination must be conservatively invalidated.
 *
 * This file asserts that rule across the full matrix, so a regression in ANY cell fails rather
 * than only the cell someone happened to think of. New slot types or mutation paths should be
 * added as a row/column here, not as a one-off test.
 */

import { LocalCacheManager, CacheCategory } from '../generic/localCacheManager';
import { RunViewParams } from '../views/runView';
import { CompositeKey } from '../generic/compositeKey';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { GetGlobalObjectStore } from '@memberjunction/global';

function resetLocalCacheManager(): void {
    const g = GetGlobalObjectStore();
    delete g['___SINGLETON__LocalCacheManager'];
}

/** Minimal row factory — stable IDs so set comparisons are meaningful. */
function rows(count: number, startId = 1): Record<string, unknown>[] {
    return Array.from({ length: count }, (_, i) => ({
        ID: `id-${(startId + i).toString().padStart(4, '0')}`,
        Name: `Record ${startId + i}`,
        __mj_UpdatedAt: new Date(2024, 0, 1).toISOString(),
    }));
}

/**
 * The slot-type axis. `maintainable` encodes the contract: TRUE only when the slot is both
 * unfiltered and unlimited, because those are the only conditions under which in-place
 * upsert/remove is provably correct.
 */
interface SlotType {
    name: string;
    params: RunViewParams;
    /**
     * Maintainability is PER-OPERATION, not per-slot — the two mutations fail for different
     * reasons and therefore have different safe sets:
     *
     *   SAVE   is unsafe when we cannot prove the new row BELONGS in the slot — either because a
     *          SQL predicate is unevaluable in JS (filtered) or because window membership needs
     *          a TOP/OFFSET re-run (subset).
     *   DELETE is unsafe ONLY for subset slots, where removal shrinks the slot below the caller's
     *          own limit. For a FILTERED slot removal is always safe: a deleted row matches no
     *          predicate, so dropping it can never make the slot wrong.
     *
     * That asymmetry is precisely why #3199's delete half was a SEPARATE bug from its save half —
     * subset slots were riding the filtered slots' legitimate remove-in-place path.
     */
    saveMaintains: boolean;
    deleteMaintains: boolean;
    why: string;
}

const ENTITY = 'Test Entity';

const SLOT_TYPES: SlotType[] = [
    {
        name: 'unfiltered + unlimited (the ONLY maintainable slot)',
        params: { EntityName: ENTITY },
        saveMaintains: true,
        deleteMaintains: true,
        why: 'complete set, no predicate and no window — a saved row provably belongs, a deleted row provably leaves',
    },
    {
        name: 'filtered',
        params: { EntityName: ENTITY, ExtraFilter: "Status='Active'" },
        saveMaintains: false,
        deleteMaintains: true,   // a deleted row matches no predicate, so removal is always safe
        why: 'cannot evaluate a SQL predicate in JS, so we cannot know whether a saved row matches',
    },
    {
        name: 'MaxRows (truncation)  <-- the #3199 bug',
        params: { EntityName: ENTITY, MaxRows: 1 },
        saveMaintains: false,
        deleteMaintains: false,  // removal shrinks the slot below the caller's own MaxRows
        why: 'cannot know whether a saved row falls inside TOP N, nor which row it displaces',
    },
    {
        name: 'StartRow (offset window)',
        params: { EntityName: ENTITY, StartRow: 10, MaxRows: 5 },
        saveMaintains: false,
        deleteMaintains: false,
        why: 'an offset window is not the head of the set; maintaining it in place silently shifts the page',
    },
    {
        name: 'aggregates (aggHash segment)  <-- H2',
        params: { EntityName: ENTITY, Aggregates: [{ expression: 'COUNT(*)', alias: 'Cnt' }] },
        saveMaintains: false,
        deleteMaintains: false,
        why: 'the aggregate was computed by the DB over the pre-mutation set and is not derivable in JS — carrying it forward served COUNT(*)=6 alongside rows=7',
    },
    {
        name: 'saved view (vw: segment)  <-- H1',
        params: { EntityName: ENTITY, ViewID: '00000000-0000-0000-0000-0000000000AA' },
        saveMaintains: false,
        // DELETE stays maintainable — same reasoning as a filtered slot: a deleted row is gone
        // from the view too, so removing it can never make the slot wrong. Only SAVE is unsafe
        // (we cannot evaluate the view's WhereClause in JS to know whether the new row belongs).
        deleteMaintains: true,
        why: "a view's WhereClause lives ON THE VIEW, not in ExtraFilter, so the filter segment is '_' — maintaining a SAVE in place served rows the view excludes",
    },
    {
        name: 'filtered + MaxRows (both axes)',
        params: { EntityName: ENTITY, ExtraFilter: "Status='Active'", MaxRows: 2 },
        saveMaintains: false,
        deleteMaintains: false,  // the subset axis dominates — filtered-delete safety does NOT rescue it
        why: 'either axis alone disqualifies maintenance; together they must not cancel out',
    },
];

describe('LocalCacheManager — slot maintenance matrix (slot type x mutation)', () => {
    let cache: LocalCacheManager;
    let storage: MockCacheStorageProvider;

    beforeEach(async () => {
        resetLocalCacheManager();
        storage = new MockCacheStorageProvider();
        cache = LocalCacheManager.Instance;
        await cache.Initialize(storage, { verboseLogging: false });
    });

    describe('the subset predicate itself', () => {
        // Directly pins classification, independent of the event plumbing, so a failure here
        // localizes to the predicate rather than the maintenance path.
        const classify = (p: RunViewParams): boolean => {
            const fp = (cache as unknown as {
                GenerateRunViewFingerprint(params: RunViewParams, conn?: string, rls?: string): string;
            }).GenerateRunViewFingerprint(p);
            return (cache as unknown as { isSubsetFingerprint(f: string): boolean }).isSubsetFingerprint(fp);
        };

        it('classifies an unlimited slot as NOT a subset', () => {
            expect(classify({ EntityName: ENTITY })).toBe(false);
        });

        it('classifies MaxRows > 0 as a subset', () => {
            expect(classify({ EntityName: ENTITY, MaxRows: 1 })).toBe(true);
            expect(classify({ EntityName: ENTITY, MaxRows: 500 })).toBe(true);
        });

        it('classifies StartRow > 0 as a subset', () => {
            expect(classify({ EntityName: ENTITY, StartRow: 1 })).toBe(true);
        });

        it('treats the sentinel defaults (MaxRows -1 / StartRow 0) as NOT a subset', () => {
            // The builder defaults MaxRows to -1 and StartRow to 0. If the guards were `>= 0`
            // or truthiness-based, every ordinary unlimited slot would be misread as a subset
            // and the cache would stop maintaining anything — a silent perf cliff.
            expect(classify({ EntityName: ENTITY, MaxRows: -1, StartRow: 0 })).toBe(false);
        });

        it('treats an UNKNOWN trailing segment as narrowing (deny-by-default)', () => {
            // The whole point of hasNarrowingSegment: `vw:` and `rls:` were BOTH misclassified as
            // maintainable because the old check only read parts[1]. Enumerating the narrowing
            // segments would repeat that mistake for the NEXT segment someone appends, so unknown
            // segments must default to "do not maintain".
            const hasNarrowing = (cache as unknown as { hasNarrowingSegment(p: string[]): boolean }).hasNarrowingSegment.bind(cache);
            const base = ['E', '_', '_', '-1', '0', '_', '_'];
            expect(hasNarrowing([...base, 'mssql://localhost:1433/'])).toBe(false);  // connection = identity
            expect(hasNarrowing([...base, 'imr:1'])).toBe(false);                    // widens the set
            expect(hasNarrowing([...base, 'rls:abc123'])).toBe(true);                // narrows (H3)
            expect(hasNarrowing([...base, 'vw:some-view-id'])).toBe(true);           // narrows (H1)
            expect(hasNarrowing([...base, 'futureSegment:whatever'])).toBe(true);    // UNKNOWN → deny
        });

        it('classifies an aggregate-bearing slot as non-maintainable (H2)', () => {
            const hasAgg = (cache as unknown as { hasAggregates(p: string[]): boolean }).hasAggregates.bind(cache);
            expect(hasAgg(['E', '_', '_', '-1', '0', '_', '_'])).toBe(false);
            expect(hasAgg(['E', '_', '_', '-1', '0', 'a1b2c3', '_'])).toBe(true);
        });

        it('fails SAFE on a malformed fingerprint rather than over-invalidating', () => {
            const isSubset = (cache as unknown as { isSubsetFingerprint(f: string): boolean }).isSubsetFingerprint.bind(cache);
            expect(isSubset('too|few')).toBe(false);
            expect(isSubset('E|f|o|not-a-number|also-not|_|_')).toBe(false);
        });

        it('indexes MaxRows at segment [3] — guarding the off-by-one the stale comment invited', () => {
            // A prior comment in this file listed a `ResultType` segment that does not exist.
            // Following it would put MaxRows at [4]. This asserts the real layout.
            const fp = (cache as unknown as {
                GenerateRunViewFingerprint(params: RunViewParams): string;
            }).GenerateRunViewFingerprint({ EntityName: ENTITY, MaxRows: 7, StartRow: 3 });
            const parts = fp.split('|');
            expect(parts[3]).toBe('7');
            expect(parts[4]).toBe('3');
        });
    });

    describe.each(SLOT_TYPES)('slot: $name', (slot: SlotType) => {
        const fingerprintFor = (p: RunViewParams): string =>
            (cache as unknown as { GenerateRunViewFingerprint(params: RunViewParams): string }).GenerateRunViewFingerprint(p);

        const seed = async (p: RunViewParams, data: Record<string, unknown>[]): Promise<string> => {
            const fp = fingerprintFor(p);
            await cache.SetRunViewResult(fp, p, data, '2024-06-15T00:00:00.000Z', undefined, 50);
            return fp;
        };

        const readSlot = async (fp: string): Promise<{ results?: unknown[] } | null> =>
            (await cache.GetRunViewResult(fp)) as unknown as { results?: unknown[] } | null;

        it(`SAVE: ${slot.saveMaintains ? 'maintains in place' : 'INVALIDATES'} — ${slot.why}`, async () => {
            const fp = await seed(slot.params, rows(3));
            const before = await readSlot(fp);
            expect(before).not.toBeNull();               // anti-vacuity: the slot really was cached

            await (cache as unknown as {
                processEntityEventForFingerprint(
                    type: string, fingerprint: string, entity: unknown, key: unknown, nowISO: string
                ): Promise<void>;
            }).processEntityEventForFingerprint(
                'save', fp,
                { EntityName: ENTITY, GetAll: () => ({ ID: 'id-9999', Name: 'New Row' }) },
                CompositeKey.FromID('id-9999'),
                new Date().toISOString()
            );

            const after = await readSlot(fp);
            if (slot.saveMaintains) {
                expect(after).not.toBeNull();
                expect(after?.results?.length).toBe(4);   // upserted in place
            } else {
                // The load-bearing assertion. Pre-#3199 a MaxRows slot survived here with an
                // INFLATED row set — which is strictly worse than a miss, because it is served
                // as if authoritative.
                expect(after).toBeNull();
            }
        });

        it(`DELETE: ${slot.deleteMaintains ? 'removes in place (safe — a deleted row matches nothing)' : 'INVALIDATES — never serves a short set'}`, async () => {
            const seeded = rows(3);
            const fp = await seed(slot.params, seeded);
            expect(await readSlot(fp)).not.toBeNull();

            await (cache as unknown as {
                processEntityEventForFingerprint(
                    type: string, fingerprint: string, entity: unknown, key: unknown, nowISO: string
                ): Promise<void>;
            }).processEntityEventForFingerprint(
                'delete', fp,
                { EntityName: ENTITY, GetAll: () => seeded[0] },
                CompositeKey.FromID(String(seeded[0].ID)),
                new Date().toISOString()
            );

            const after = await readSlot(fp);
            if (slot.deleteMaintains) {
                expect(after).not.toBeNull();
                expect(after?.results?.length).toBe(2);   // removed in place
            } else {
                // The worse half of #3199: removal from a MaxRows:1 slot left ZERO rows cached
                // while the DB still had plenty to draw a TOP 1 from — a served empty result.
                expect(after).toBeNull();
            }
        });
    });

    describe('regression pins for the two shipped bugs', () => {
        it('#3199: repeated saves never inflate a MaxRows:1 slot past its limit', async () => {
            const params: RunViewParams = { EntityName: ENTITY, MaxRows: 1 };
            const fp = (cache as unknown as {
                GenerateRunViewFingerprint(p: RunViewParams): string;
            }).GenerateRunViewFingerprint(params);

            for (let i = 1; i <= 3; i++) {
                await cache.SetRunViewResult(fp, params, rows(1), '2024-06-15T00:00:00.000Z', undefined, 47 + i);
                await (cache as unknown as {
                    processEntityEventForFingerprint(t: string, f: string, e: unknown, k: unknown, n: string): Promise<void>;
                }).processEntityEventForFingerprint(
                    'save', fp,
                    { EntityName: ENTITY, GetAll: () => ({ ID: `id-new-${i}`, Name: `New ${i}` }) },
                    CompositeKey.FromID(`id-new-${i}`),
                    new Date().toISOString()
                );
                const after = (await cache.GetRunViewResult(fp)) as unknown as { results?: unknown[] } | null;
                // Either invalidated (null) or still within the limit — NEVER 2, 3, 4 rows.
                if (after) {
                    expect(after.results?.length ?? 0).toBeLessThanOrEqual(1);
                }
            }
        });

        it('#3195 remains intact: totalRowCount is still recorded on a subset slot', async () => {
            // The two fixes must compose: rows are dropped because they are unknowable, but the
            // DB total IS knowable and must not regress to the collapsed value.
            const params: RunViewParams = { EntityName: ENTITY, MaxRows: 1 };
            const fp = (cache as unknown as {
                GenerateRunViewFingerprint(p: RunViewParams): string;
            }).GenerateRunViewFingerprint(params);
            await cache.SetRunViewResult(fp, params, rows(1), '2024-06-15T00:00:00.000Z', undefined, 48);

            const got = (await cache.GetRunViewResult(fp)) as unknown as { totalRowCount?: number } | null;
            expect(got?.totalRowCount).toBe(48);   // NOT 1
        });
    });
});
