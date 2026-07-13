import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Hoisted mocks
// ============================================================================

const { mockRunView, mockRunViews } = vi.hoisted(() => ({
    mockRunView: vi.fn(),
    mockRunViews: vi.fn(),
}));

vi.mock('@memberjunction/global', () => ({
    BaseSingleton: class BaseSingleton<T> {
        public static getInstance<T>(): T { return new (this as unknown as new () => T)(); }
    },
}));

vi.mock('@memberjunction/core', () => {
    class MockMetadata {}
    class MockRunView {
        RunView = mockRunView;
        RunViews = mockRunViews;
        static FromMetadataProvider = vi.fn();
    }
    return {
        Metadata: MockMetadata,
        RunView: MockRunView,
        RunViewParams: class {},
        UserInfo: class {},
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

import { ClassifyAnalyticsEngine, ClassifyAnalyticsScope } from '../ClassifyAnalyticsEngine';

/** Build a successful single RunView result. */
function ok<T>(results: T[]) {
    return { Success: true, Results: results, ErrorMessage: '' };
}

describe('ClassifyAnalyticsEngine', () => {
    let engine: ClassifyAnalyticsEngine;
    const mockUser = { ID: 'user-1' } as never;

    beforeEach(() => {
        vi.clearAllMocks();
        engine = ClassifyAnalyticsEngine.Instance;
    });

    describe('GetTagDistribution', () => {
        it('counts and sorts tags descending, ignoring blanks', async () => {
            mockRunView.mockResolvedValueOnce(ok([
                { ItemID: 'i1', Tag: 'alpha' },
                { ItemID: 'i2', Tag: 'alpha' },
                { ItemID: 'i3', Tag: 'beta' },
                { ItemID: 'i4', Tag: '  ' },
            ]));

            const result = await engine.GetTagDistribution(undefined, mockUser);

            expect(result).toEqual([
                { Tag: 'alpha', Count: 2 },
                { Tag: 'beta', Count: 1 },
            ]);
        });

        it('honors the top-N limit', async () => {
            mockRunView.mockResolvedValueOnce(ok([
                { ItemID: 'i1', Tag: 'a' },
                { ItemID: 'i2', Tag: 'a' },
                { ItemID: 'i3', Tag: 'b' },
                { ItemID: 'i4', Tag: 'c' },
            ]));

            const result = await engine.GetTagDistribution(undefined, mockUser, undefined, 1);
            expect(result).toEqual([{ Tag: 'a', Count: 2 }]);
        });

        it('returns [] on RunView failure', async () => {
            mockRunView.mockResolvedValueOnce({ Success: false, Results: [], ErrorMessage: 'boom' });
            const result = await engine.GetTagDistribution(undefined, mockUser);
            expect(result).toEqual([]);
        });

        it('resolves source/content-type scope via an item pre-query, then filters tags', async () => {
            // First call = resolve content item IDs; second = tags filtered to those items.
            mockRunView
                .mockResolvedValueOnce(ok([{ ID: 'item-A' }, { ID: 'item-B' }]))
                .mockResolvedValueOnce(ok([
                    { ItemID: 'item-A', Tag: 'x' },
                    { ItemID: 'item-B', Tag: 'x' },
                ]));

            const scope: ClassifyAnalyticsScope = { ContentSourceIDs: ['src-1'] };
            const result = await engine.GetTagDistribution(scope, mockUser);

            expect(result).toEqual([{ Tag: 'x', Count: 2 }]);
            // The 2nd RunView's filter should constrain by the resolved item IDs.
            const tagCallParams = mockRunView.mock.calls[1][0];
            expect(tagCallParams.ExtraFilter).toContain('ItemID IN');
            expect(tagCallParams.ExtraFilter).toContain('item-A');
        });

        it('short-circuits to [] when scope resolves to no items', async () => {
            mockRunView.mockResolvedValueOnce(ok([])); // no matching items
            const scope: ClassifyAnalyticsScope = { ContentTypeIDs: ['ct-1'] };
            const result = await engine.GetTagDistribution(scope, mockUser);
            expect(result).toEqual([]);
            // Only the item pre-query should have run.
            expect(mockRunView).toHaveBeenCalledTimes(1);
        });
    });

    describe('GetItemsOverTime', () => {
        it('buckets by day in ascending order', async () => {
            mockRunView.mockResolvedValueOnce(ok([
                { ItemID: 'i1', __mj_CreatedAt: '2026-01-02T10:00:00Z' },
                { ItemID: 'i2', __mj_CreatedAt: '2026-01-02T22:00:00Z' },
                { ItemID: 'i3', __mj_CreatedAt: '2026-01-01T05:00:00Z' },
            ]));

            const result = await engine.GetItemsOverTime('day', undefined, mockUser);
            expect(result).toEqual([
                { BucketStart: '2026-01-01T00:00:00.000Z', Count: 1 },
                { BucketStart: '2026-01-02T00:00:00.000Z', Count: 2 },
            ]);
        });

        it('buckets by month', async () => {
            mockRunView.mockResolvedValueOnce(ok([
                { ItemID: 'i1', __mj_CreatedAt: '2026-01-15T10:00:00Z' },
                { ItemID: 'i2', __mj_CreatedAt: '2026-02-03T10:00:00Z' },
            ]));
            const result = await engine.GetItemsOverTime('month', undefined, mockUser);
            expect(result).toEqual([
                { BucketStart: '2026-01-01T00:00:00.000Z', Count: 1 },
                { BucketStart: '2026-02-01T00:00:00.000Z', Count: 1 },
            ]);
        });
    });

    describe('GetWeightHistogram', () => {
        it('bins weights across [0,1] with the final bin inclusive of 1.0', async () => {
            mockRunView.mockResolvedValueOnce(ok([
                { ItemID: 'i1', Weight: 0.05 },  // bin 0
                { ItemID: 'i2', Weight: 0.95 },  // bin 9
                { ItemID: 'i3', Weight: 1.0 },   // bin 9 (inclusive)
                { ItemID: 'i4', Weight: null },  // ignored
            ]));

            const result = await engine.GetWeightHistogram(10, undefined, mockUser);
            expect(result).toHaveLength(10);
            expect(result[0].Count).toBe(1);
            expect(result[9].Count).toBe(2);
            expect(result[0]).toMatchObject({ RangeStart: 0, RangeEnd: 0.1 });
        });

        it('returns empty bins (still shaped) on failure', async () => {
            mockRunView.mockResolvedValueOnce({ Success: false, Results: [], ErrorMessage: 'x' });
            const result = await engine.GetWeightHistogram(4, undefined, mockUser);
            expect(result).toHaveLength(4);
            expect(result.every(b => b.Count === 0)).toBe(true);
        });
    });

    describe('GetCoverage', () => {
        it('computes tagged vs untagged items', async () => {
            mockRunViews.mockResolvedValueOnce([
                ok([{ ID: 'item-A' }, { ID: 'item-B' }, { ID: 'item-C' }]),
                ok([{ ItemID: 'item-A' }, { ItemID: 'item-A' }, { ItemID: 'item-B' }]),
            ]);

            const result = await engine.GetCoverage(undefined, mockUser);
            expect(result).toEqual({
                TotalItems: 3,
                TaggedItems: 2,
                UntaggedItems: 1,
                CoverageRatio: 2 / 3,
            });
        });

        it('returns zeros when item load fails', async () => {
            mockRunViews.mockResolvedValueOnce([
                { Success: false, Results: [], ErrorMessage: 'fail' },
                ok([]),
            ]);
            const result = await engine.GetCoverage(undefined, mockUser);
            expect(result).toEqual({ TotalItems: 0, TaggedItems: 0, UntaggedItems: 0, CoverageRatio: 0 });
        });
    });

    describe('GetKPIs', () => {
        it('aggregates totals, average, and distinct tags', async () => {
            mockRunViews.mockResolvedValueOnce([
                ok([{ ID: 'item-A' }, { ID: 'item-B' }]),
                ok([
                    { ItemID: 'item-A', Tag: 'alpha' },
                    { ItemID: 'item-A', Tag: 'Beta' },
                    { ItemID: 'item-B', Tag: 'beta' }, // distinct is case-insensitive
                    { ItemID: 'item-OUT', Tag: 'orphan' }, // not in scope, excluded
                ]),
            ]);

            const result = await engine.GetKPIs(undefined, mockUser);
            expect(result.TotalItems).toBe(2);
            expect(result.TotalTags).toBe(3); // orphan excluded
            expect(result.DistinctTags).toBe(2); // alpha + beta
            expect(result.AvgTagsPerItem).toBe(1.5);
        });
    });
});
