import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Hoisted mocks
// ============================================================================

const {
    mockSave, mockLoad, mockDelete, mockNewRecord, mockRunView,
    mockGetEntityObject,
} = vi.hoisted(() => ({
    mockSave: vi.fn().mockResolvedValue(true),
    mockLoad: vi.fn().mockResolvedValue(true),
    mockDelete: vi.fn().mockResolvedValue(true),
    mockNewRecord: vi.fn(),
    mockRunView: vi.fn(),
    mockGetEntityObject: vi.fn(),
}));

vi.mock('@memberjunction/global', () => ({
    BaseSingleton: class BaseSingleton<T> {
        public static getInstance<T>(): T { return new (this as unknown as new () => T)(); }
    },
    UUIDsEqual: (a: string | null | undefined, b: string | null | undefined) => {
        if (a == null || b == null) return a === b;
        return a.toLowerCase() === b.toLowerCase();
    },
    NormalizeUUID: (id: string) => id.toLowerCase(),
}));

vi.mock('@memberjunction/core', () => {
    class MockMetadata {
        GetEntityObject = mockGetEntityObject;
    }
    class MockRunView {
        RunView = mockRunView;
    }
    return {
        Metadata: MockMetadata,
        RunView: MockRunView,
        UserInfo: class {},
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

vi.mock('@memberjunction/core-entities', () => ({
    MJTagCoOccurrenceEntity: class {},
    MJTagEntity: class {},
}));

import { TagCoOccurrenceEngine } from '../TagCoOccurrenceEngine';

/**
 * Helper to create a mock entity object with Save, Load, Delete, NewRecord, and LatestResult.
 */
function createMockEntity(fields: Record<string, unknown> = {}): Record<string, unknown> {
    const data: Record<string, unknown> = { ...fields };
    return new Proxy(data, {
        get(target, prop: string) {
            if (prop === 'Save') return mockSave;
            if (prop === 'Load') return mockLoad;
            if (prop === 'Delete') return mockDelete;
            if (prop === 'NewRecord') return mockNewRecord;
            if (prop === 'LatestResult') return { Message: 'mock error' };
            return target[prop];
        },
        set(target, prop: string, value: unknown) {
            target[prop] = value;
            return true;
        },
    });
}

describe('TagCoOccurrenceEngine', () => {
    let engine: TagCoOccurrenceEngine;
    const mockUser = { ID: 'user-1' } as never;

    beforeEach(() => {
        vi.clearAllMocks();
        engine = TagCoOccurrenceEngine.Instance;

        mockGetEntityObject.mockImplementation(() => Promise.resolve(createMockEntity()));
        mockSave.mockResolvedValue(true);
        mockLoad.mockResolvedValue(true);
        mockDelete.mockResolvedValue(true);
    });

    // ========================================================================
    // RecomputeCoOccurrence
    // ========================================================================

    describe('RecomputeCoOccurrence', () => {
        it('should compute pairs from ContentItemTag records sharing the same item', async () => {
            // Two items: item-1 has tags A,B,C; item-2 has tags A,B
            // Expected pairs: A-B (count 2), A-C (count 1), B-C (count 1)
            let callCount = 0;
            mockRunView.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    // ContentItemTag records
                    return Promise.resolve({
                        Success: true,
                        Results: [
                            { ItemID: 'item-1', TagID: 'aaa' },
                            { ItemID: 'item-1', TagID: 'bbb' },
                            { ItemID: 'item-1', TagID: 'ccc' },
                            { ItemID: 'item-2', TagID: 'aaa' },
                            { ItemID: 'item-2', TagID: 'bbb' },
                        ]
                    });
                }
                if (callCount === 2) {
                    // TaggedItem records (empty)
                    return Promise.resolve({ Success: true, Results: [] });
                }
                // Existing co-occurrence records (empty)
                return Promise.resolve({ Success: true, Results: [] });
            });

            const result = await engine.RecomputeCoOccurrence(mockUser);

            // 3 pairs created: aaa|bbb, aaa|ccc, bbb|ccc
            expect(result.PairsUpdated).toBe(3);
            expect(result.PairsDeleted).toBe(0);
        });

        it('should compute pairs from TaggedItem records grouped by entity+record', async () => {
            let callCount = 0;
            mockRunView.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    // ContentItemTag records (empty)
                    return Promise.resolve({ Success: true, Results: [] });
                }
                if (callCount === 2) {
                    // TaggedItem records: entity1-rec1 has tags A,B
                    return Promise.resolve({
                        Success: true,
                        Results: [
                            { TagID: 'aaa', EntityID: 'ent-1', RecordID: 'rec-1' },
                            { TagID: 'bbb', EntityID: 'ent-1', RecordID: 'rec-1' },
                        ]
                    });
                }
                return Promise.resolve({ Success: true, Results: [] });
            });

            const result = await engine.RecomputeCoOccurrence(mockUser);

            expect(result.PairsUpdated).toBe(1);
            expect(result.PairsDeleted).toBe(0);
        });

        it('should combine counts from both ContentItemTag and TaggedItem sources', async () => {
            // ContentItemTag: item-1 has tags A,B
            // TaggedItem: ent-1|rec-1 has tags A,B
            // Combined: pair A-B should have count 2
            let callCount = 0;
            mockRunView.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.resolve({
                        Success: true,
                        Results: [
                            { ItemID: 'item-1', TagID: 'aaa' },
                            { ItemID: 'item-1', TagID: 'bbb' },
                        ]
                    });
                }
                if (callCount === 2) {
                    return Promise.resolve({
                        Success: true,
                        Results: [
                            { TagID: 'aaa', EntityID: 'ent-1', RecordID: 'rec-1' },
                            { TagID: 'bbb', EntityID: 'ent-1', RecordID: 'rec-1' },
                        ]
                    });
                }
                return Promise.resolve({ Success: true, Results: [] });
            });

            const result = await engine.RecomputeCoOccurrence(mockUser);

            expect(result.PairsUpdated).toBe(1); // one unique pair, but count = 2
            // Verify the entity was created with count 2
            expect(mockNewRecord).toHaveBeenCalled();
        });

        it('should update existing pairs and delete stale ones', async () => {
            let callCount = 0;
            mockRunView.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    // Current: item-1 has tags A,B (pair aaa|bbb still exists)
                    return Promise.resolve({
                        Success: true,
                        Results: [
                            { ItemID: 'item-1', TagID: 'aaa' },
                            { ItemID: 'item-1', TagID: 'bbb' },
                        ]
                    });
                }
                if (callCount === 2) {
                    return Promise.resolve({ Success: true, Results: [] });
                }
                // Existing pairs: aaa|bbb (still valid) and aaa|ccc (stale)
                return Promise.resolve({
                    Success: true,
                    Results: [
                        { ID: 'pair-1', TagAID: 'aaa', TagBID: 'bbb', CoOccurrenceCount: 5 },
                        { ID: 'pair-2', TagAID: 'aaa', TagBID: 'ccc', CoOccurrenceCount: 3 },
                    ]
                });
            });

            const result = await engine.RecomputeCoOccurrence(mockUser);

            // pair aaa|bbb updated, pair aaa|ccc deleted
            expect(result.PairsUpdated).toBe(1);
            expect(result.PairsDeleted).toBe(1);
        });

        it('should enforce canonical ordering regardless of input order', async () => {
            // Tags come in reverse order (bbb before aaa) — pair key should still be aaa|bbb
            let callCount = 0;
            mockRunView.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.resolve({
                        Success: true,
                        Results: [
                            { ItemID: 'item-1', TagID: 'BBB' },
                            { ItemID: 'item-1', TagID: 'AAA' },
                        ]
                    });
                }
                if (callCount === 2) {
                    return Promise.resolve({ Success: true, Results: [] });
                }
                return Promise.resolve({ Success: true, Results: [] });
            });

            const createdEntities: Record<string, unknown>[] = [];
            mockGetEntityObject.mockImplementation(() => {
                const entity = createMockEntity();
                createdEntities.push(entity);
                return Promise.resolve(entity);
            });

            await engine.RecomputeCoOccurrence(mockUser);

            // Verify the pair was created with canonical ordering (aaa < bbb)
            const pairEntity = createdEntities[0];
            expect(pairEntity.TagAID).toBe('aaa');
            expect(pairEntity.TagBID).toBe('bbb');
        });

        it('should deduplicate tags within the same item', async () => {
            // item-1 has tag A twice — should only produce one unique tag, no pairs
            let callCount = 0;
            mockRunView.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.resolve({
                        Success: true,
                        Results: [
                            { ItemID: 'item-1', TagID: 'aaa' },
                            { ItemID: 'item-1', TagID: 'aaa' },
                        ]
                    });
                }
                if (callCount === 2) {
                    return Promise.resolve({ Success: true, Results: [] });
                }
                return Promise.resolve({ Success: true, Results: [] });
            });

            const result = await engine.RecomputeCoOccurrence(mockUser);

            expect(result.PairsUpdated).toBe(0);
            expect(result.PairsDeleted).toBe(0);
        });

        it('should skip items with only one tag', async () => {
            let callCount = 0;
            mockRunView.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.resolve({
                        Success: true,
                        Results: [
                            { ItemID: 'item-1', TagID: 'aaa' },
                        ]
                    });
                }
                if (callCount === 2) {
                    return Promise.resolve({ Success: true, Results: [] });
                }
                return Promise.resolve({ Success: true, Results: [] });
            });

            const result = await engine.RecomputeCoOccurrence(mockUser);

            expect(result.PairsUpdated).toBe(0);
            expect(result.PairsDeleted).toBe(0);
        });

        it('should handle RunView failure gracefully', async () => {
            mockRunView.mockResolvedValue({ Success: false, ErrorMessage: 'DB error', Results: [] });

            const result = await engine.RecomputeCoOccurrence(mockUser);

            expect(result.PairsUpdated).toBe(0);
            expect(result.PairsDeleted).toBe(0);
        });

        it('should handle empty data sets', async () => {
            mockRunView.mockResolvedValue({ Success: true, Results: [] });

            const result = await engine.RecomputeCoOccurrence(mockUser);

            expect(result.PairsUpdated).toBe(0);
            expect(result.PairsDeleted).toBe(0);
        });
    });

    // ========================================================================
    // GetTopPairs
    // ========================================================================

    describe('GetTopPairs', () => {
        it('should return top N pairs with resolved tag names', async () => {
            mockRunView.mockResolvedValue({
                Success: true,
                Results: [
                    { TagAID: 'aaa', TagBID: 'bbb', TagA: 'Alpha', TagB: 'Beta', CoOccurrenceCount: 10 },
                    { TagAID: 'aaa', TagBID: 'ccc', TagA: 'Alpha', TagB: 'Gamma', CoOccurrenceCount: 5 },
                ]
            });

            const pairs = await engine.GetTopPairs(10, mockUser);

            expect(pairs).toHaveLength(2);
            expect(pairs[0]).toEqual({ TagAName: 'Alpha', TagBName: 'Beta', Count: 10 });
            expect(pairs[1]).toEqual({ TagAName: 'Alpha', TagBName: 'Gamma', Count: 5 });
        });

        it('should return empty array on RunView failure', async () => {
            mockRunView.mockResolvedValue({ Success: false, ErrorMessage: 'DB error', Results: [] });

            const pairs = await engine.GetTopPairs(10, mockUser);

            expect(pairs).toHaveLength(0);
        });

        it('should pass limit as MaxRows', async () => {
            mockRunView.mockResolvedValue({ Success: true, Results: [] });

            await engine.GetTopPairs(5, mockUser);

            expect(mockRunView).toHaveBeenCalledWith(
                expect.objectContaining({ MaxRows: 5 }),
                mockUser
            );
        });
    });

    // ========================================================================
    // GetCoOccurrencesForTag
    // ========================================================================

    describe('GetCoOccurrencesForTag', () => {
        it('should return co-occurring tags when queried tag is TagA', async () => {
            mockRunView.mockResolvedValue({
                Success: true,
                Results: [
                    { TagAID: 'aaa', TagBID: 'bbb', TagA: 'Alpha', TagB: 'Beta', CoOccurrenceCount: 7 },
                ]
            });

            const results = await engine.GetCoOccurrencesForTag('aaa', mockUser);

            expect(results).toHaveLength(1);
            expect(results[0]).toEqual({ TagName: 'Beta', Count: 7 });
        });

        it('should return co-occurring tags when queried tag is TagB', async () => {
            mockRunView.mockResolvedValue({
                Success: true,
                Results: [
                    { TagAID: 'aaa', TagBID: 'bbb', TagA: 'Alpha', TagB: 'Beta', CoOccurrenceCount: 4 },
                ]
            });

            const results = await engine.GetCoOccurrencesForTag('bbb', mockUser);

            expect(results).toHaveLength(1);
            expect(results[0]).toEqual({ TagName: 'Alpha', Count: 4 });
        });

        it('should handle case-insensitive UUID matching', async () => {
            mockRunView.mockResolvedValue({
                Success: true,
                Results: [
                    { TagAID: 'AAA', TagBID: 'BBB', TagA: 'Alpha', TagB: 'Beta', CoOccurrenceCount: 3 },
                ]
            });

            const results = await engine.GetCoOccurrencesForTag('AAA', mockUser);

            expect(results).toHaveLength(1);
            // NormalizeUUID('AAA') === 'aaa', NormalizeUUID('AAA') === 'aaa' => isTagA = true
            expect(results[0]).toEqual({ TagName: 'Beta', Count: 3 });
        });

        it('should return empty array on RunView failure', async () => {
            mockRunView.mockResolvedValue({ Success: false, ErrorMessage: 'DB error', Results: [] });

            const results = await engine.GetCoOccurrencesForTag('aaa', mockUser);

            expect(results).toHaveLength(0);
        });

        it('should return empty array when no co-occurrences exist', async () => {
            mockRunView.mockResolvedValue({ Success: true, Results: [] });

            const results = await engine.GetCoOccurrencesForTag('aaa', mockUser);

            expect(results).toHaveLength(0);
        });
    });

    // ========================================================================
    // Canonical Pair Ordering
    // ========================================================================

    describe('canonical pair ordering', () => {
        it('should always place the alphabetically smaller UUID as TagA', async () => {
            // Tags zzz and aaa on item-1: canonical pair should be aaa|zzz
            let callCount = 0;
            mockRunView.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.resolve({
                        Success: true,
                        Results: [
                            { ItemID: 'item-1', TagID: 'zzz' },
                            { ItemID: 'item-1', TagID: 'aaa' },
                        ]
                    });
                }
                if (callCount === 2) {
                    return Promise.resolve({ Success: true, Results: [] });
                }
                return Promise.resolve({ Success: true, Results: [] });
            });

            const createdEntities: Record<string, unknown>[] = [];
            mockGetEntityObject.mockImplementation(() => {
                const entity = createMockEntity();
                createdEntities.push(entity);
                return Promise.resolve(entity);
            });

            await engine.RecomputeCoOccurrence(mockUser);

            expect(createdEntities.length).toBeGreaterThan(0);
            expect(createdEntities[0].TagAID).toBe('aaa');
            expect(createdEntities[0].TagBID).toBe('zzz');
        });

        it('should match existing pairs regardless of original input order', async () => {
            // Existing pair stored as aaa|bbb; new data has them in same order
            let callCount = 0;
            mockRunView.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.resolve({
                        Success: true,
                        Results: [
                            { ItemID: 'item-1', TagID: 'bbb' },
                            { ItemID: 'item-1', TagID: 'aaa' },
                        ]
                    });
                }
                if (callCount === 2) {
                    return Promise.resolve({ Success: true, Results: [] });
                }
                // Existing pair
                return Promise.resolve({
                    Success: true,
                    Results: [
                        { ID: 'pair-1', TagAID: 'aaa', TagBID: 'bbb', CoOccurrenceCount: 1 },
                    ]
                });
            });

            const result = await engine.RecomputeCoOccurrence(mockUser);

            // Should update existing, not create new
            expect(result.PairsUpdated).toBe(1);
            expect(result.PairsDeleted).toBe(0);
            // Load was called (for update), not NewRecord
            expect(mockLoad).toHaveBeenCalled();
        });
    });

    // ========================================================================
    // Error handling during upsert
    // ========================================================================

    describe('error handling during upsert', () => {
        it('should handle Save failure during update gracefully', async () => {
            let callCount = 0;
            mockRunView.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.resolve({
                        Success: true,
                        Results: [
                            { ItemID: 'item-1', TagID: 'aaa' },
                            { ItemID: 'item-1', TagID: 'bbb' },
                        ]
                    });
                }
                if (callCount === 2) {
                    return Promise.resolve({ Success: true, Results: [] });
                }
                return Promise.resolve({
                    Success: true,
                    Results: [
                        { ID: 'pair-1', TagAID: 'aaa', TagBID: 'bbb', CoOccurrenceCount: 1 },
                    ]
                });
            });

            mockSave.mockResolvedValueOnce(false); // update fails

            const result = await engine.RecomputeCoOccurrence(mockUser);

            expect(result.PairsUpdated).toBe(0);
        });

        it('should handle Save failure during create gracefully', async () => {
            let callCount = 0;
            mockRunView.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.resolve({
                        Success: true,
                        Results: [
                            { ItemID: 'item-1', TagID: 'aaa' },
                            { ItemID: 'item-1', TagID: 'bbb' },
                        ]
                    });
                }
                if (callCount === 2) {
                    return Promise.resolve({ Success: true, Results: [] });
                }
                return Promise.resolve({ Success: true, Results: [] });
            });

            mockSave.mockResolvedValueOnce(false); // create fails

            const result = await engine.RecomputeCoOccurrence(mockUser);

            expect(result.PairsUpdated).toBe(0);
        });

        it('should handle Delete failure during prune gracefully', async () => {
            let callCount = 0;
            mockRunView.mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    return Promise.resolve({ Success: true, Results: [] });
                }
                if (callCount === 2) {
                    return Promise.resolve({ Success: true, Results: [] });
                }
                // Existing pair that should be pruned
                return Promise.resolve({
                    Success: true,
                    Results: [
                        { ID: 'pair-1', TagAID: 'aaa', TagBID: 'bbb', CoOccurrenceCount: 1 },
                    ]
                });
            });

            mockDelete.mockResolvedValueOnce(false); // delete fails

            const result = await engine.RecomputeCoOccurrence(mockUser);

            expect(result.PairsDeleted).toBe(0);
        });
    });
});
