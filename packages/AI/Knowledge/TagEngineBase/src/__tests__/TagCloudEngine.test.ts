import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Hoisted mocks
// ============================================================================

const { mockRunView, mockGetCoOccurrencesForTag } = vi.hoisted(() => ({
    mockRunView: vi.fn(),
    mockGetCoOccurrencesForTag: vi.fn(),
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

// Mock the sibling engine so co-occurrence blending is deterministic and offline.
vi.mock('../TagCoOccurrenceEngine', () => ({
    TagCoOccurrenceEngine: {
        Instance: {
            GetCoOccurrencesForTag: mockGetCoOccurrencesForTag,
        },
    },
}));

import { TagCloudEngine, TagCloudScope } from '../TagCloudEngine';

/** Build a successful single RunView result. */
function ok<T>(results: T[]) {
    return { Success: true, Results: results, ErrorMessage: '' };
}

describe('TagCloudEngine', () => {
    let engine: TagCloudEngine;
    const mockUser = { ID: 'user-1' } as never;

    beforeEach(() => {
        vi.clearAllMocks();
        engine = TagCloudEngine.Instance;
    });

    describe('GetTagCloud — frequency weighting', () => {
        it('counts tags, ignores blanks, and min-max normalizes weights into [0,1]', async () => {
            mockRunView.mockResolvedValueOnce(ok([
                { ItemID: 'i1', Tag: 'alpha', TagID: null },
                { ItemID: 'i2', Tag: 'alpha', TagID: null },
                { ItemID: 'i3', Tag: 'alpha', TagID: null }, // count 3 -> weight 1
                { ItemID: 'i4', Tag: 'beta', TagID: null },  // count 1 -> weight 0
                { ItemID: 'i5', Tag: '  ', TagID: null },    // blank, ignored
            ]));

            const result = await engine.GetTagCloud(undefined, undefined, mockUser);

            expect(result).toEqual([
                { Text: 'alpha', Weight: 1, Count: 3 },
                { Text: 'beta', Weight: 0, Count: 1 },
            ]);
        });

        it('normalizes a single distinct count to a flat weight of 1.0', async () => {
            mockRunView.mockResolvedValueOnce(ok([
                { ItemID: 'i1', Tag: 'solo', TagID: null },
                { ItemID: 'i2', Tag: 'solo', TagID: null },
            ]));
            const result = await engine.GetTagCloud(undefined, undefined, mockUser);
            expect(result).toEqual([{ Text: 'solo', Weight: 1, Count: 2 }]);
        });

        it('honors the top-N limit (by weight, then alphabetical)', async () => {
            mockRunView.mockResolvedValueOnce(ok([
                { ItemID: 'i1', Tag: 'a', TagID: null },
                { ItemID: 'i2', Tag: 'a', TagID: null },
                { ItemID: 'i3', Tag: 'b', TagID: null },
                { ItemID: 'i4', Tag: 'c', TagID: null },
            ]));
            const result = await engine.GetTagCloud(undefined, { Limit: 1 }, mockUser);
            expect(result).toEqual([{ Text: 'a', Weight: 1, Count: 2 }]);
        });

        it('drops items below the MinWeight threshold', async () => {
            mockRunView.mockResolvedValueOnce(ok([
                { ItemID: 'i1', Tag: 'hi', TagID: null },
                { ItemID: 'i2', Tag: 'hi', TagID: null },
                { ItemID: 'i3', Tag: 'hi', TagID: null }, // weight 1
                { ItemID: 'i4', Tag: 'lo', TagID: null },  // weight 0, pruned
            ]));
            const result = await engine.GetTagCloud(undefined, { MinWeight: 0.5 }, mockUser);
            expect(result).toEqual([{ Text: 'hi', Weight: 1, Count: 3 }]);
        });

        it('returns [] on RunView failure', async () => {
            mockRunView.mockResolvedValueOnce({ Success: false, Results: [], ErrorMessage: 'boom' });
            const result = await engine.GetTagCloud(undefined, undefined, mockUser);
            expect(result).toEqual([]);
        });
    });

    describe('GetTagCloud — scope resolution', () => {
        it('resolves source/content-type scope via an item pre-query, then filters tags', async () => {
            mockRunView
                .mockResolvedValueOnce(ok([{ ID: 'item-A' }, { ID: 'item-B' }])) // item resolve
                .mockResolvedValueOnce(ok([
                    { ItemID: 'item-A', Tag: 'x', TagID: null },
                    { ItemID: 'item-B', Tag: 'x', TagID: null },
                ]));

            const scope: TagCloudScope = { ContentSourceIDs: ['src-1'] };
            const result = await engine.GetTagCloud(scope, undefined, mockUser);

            expect(result).toEqual([{ Text: 'x', Weight: 1, Count: 2 }]);
            const tagCallParams = mockRunView.mock.calls[1][0];
            expect(tagCallParams.ExtraFilter).toContain('ItemID IN');
            expect(tagCallParams.ExtraFilter).toContain('item-A');
        });

        it('short-circuits to [] when source scope resolves to no items', async () => {
            mockRunView.mockResolvedValueOnce(ok([])); // no matching items
            const scope: TagCloudScope = { ContentTypeIDs: ['ct-1'] };
            const result = await engine.GetTagCloud(scope, undefined, mockUser);
            expect(result).toEqual([]);
            expect(mockRunView).toHaveBeenCalledTimes(1);
        });

        it('restricts the cloud to tags under a tag root (incl. descendants)', async () => {
            // 1) tag rows, 2) tag tree for root resolution
            mockRunView
                .mockResolvedValueOnce(ok([
                    { ItemID: 'i1', Tag: 'root-tag', TagID: 'TAG-ROOT' },
                    { ItemID: 'i2', Tag: 'child-tag', TagID: 'TAG-CHILD' },
                    { ItemID: 'i3', Tag: 'outside-tag', TagID: 'TAG-OUT' },
                    { ItemID: 'i4', Tag: 'freetext', TagID: null }, // no ID -> excluded under root filter
                ]))
                .mockResolvedValueOnce(ok([
                    { ID: 'TAG-ROOT', ParentID: null },
                    { ID: 'TAG-CHILD', ParentID: 'TAG-ROOT' },
                    { ID: 'TAG-OUT', ParentID: null },
                ]));

            const scope: TagCloudScope = { TagRootIDs: ['TAG-ROOT'] };
            const result = await engine.GetTagCloud(scope, undefined, mockUser);

            const texts = result.map(r => r.Text).sort();
            expect(texts).toEqual(['child-tag', 'root-tag']);
        });
    });

    describe('GetTagCloud — co-occurrence blending', () => {
        it('blends co-occurrence connectedness into the weight', async () => {
            mockRunView.mockResolvedValueOnce(ok([
                { ItemID: 'i1', Tag: 'a', TagID: 'TAG-A' }, // freq 1 (min)
                { ItemID: 'i2', Tag: 'b', TagID: 'TAG-B' },
                { ItemID: 'i3', Tag: 'b', TagID: 'TAG-B' }, // freq 2 (max)
            ]));

            // a is highly connected (sum 10), b not connected (sum 0).
            mockGetCoOccurrencesForTag.mockImplementation(async (tagID: string) => {
                if (tagID === 'TAG-A') return [{ TagName: 'b', Count: 10 }];
                return [];
            });

            const result = await engine.GetTagCloud(
                undefined,
                { IncludeCoOccurrence: true, CoOccurrenceBlend: 0.5 },
                mockUser
            );

            const byText = new Map(result.map(r => [r.Text, r.Weight]));
            // a: freqNorm=0, coOccNorm=1 -> 0.5*0 + 0.5*1 = 0.5
            // b: freqNorm=1, coOccNorm=0 -> 0.5*1 + 0.5*0 = 0.5
            expect(byText.get('a')).toBeCloseTo(0.5, 5);
            expect(byText.get('b')).toBeCloseTo(0.5, 5);
            expect(mockGetCoOccurrencesForTag).toHaveBeenCalledWith('TAG-A', mockUser);
        });
    });
});
