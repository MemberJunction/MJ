import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock variables
const { mockRunViewFn, mockAvailable } = vi.hoisted(() => {
    const mockRunViewFn = vi.fn();
    const mockAvailable = { value: false };
    return { mockRunViewFn, mockAvailable };
});

vi.mock('@memberjunction/core', () => {
    class MockMetadata {
        get Entities() { return []; }
        EntityByName(_name: string) { return undefined; }
        // Multi-provider migration: VectorSearchProvider uses this.Provider which falls back
        // to Metadata.Provider when the SearchEngine doesn't supply one. Mirror the helper
        // shape on the static so callers find the EntityByName/Entities API.
        static Provider = {
            Entities: [],
            EntityByName: (_name: string) => undefined,
        };
    }
    class MockRunView {
        RunView = mockRunViewFn;
    }
    class MockCompositeKey {
        KeyValuePairs: Array<{ FieldName: string; Value: string }> = [];
        SimpleLoadFromURLSegment(urlSegment: string) {
            if (urlSegment.includes('|')) {
                const parts = urlSegment.split('||');
                const pkVals: Array<{ FieldName: string; Value: string }> = [];
                for (const p of parts) {
                    const kv = p.split('|');
                    pkVals.push({ FieldName: kv[0], Value: kv[1] });
                }
                this.KeyValuePairs = pkVals;
            }
        }
    }
    return {
        Metadata: MockMetadata,
        RunView: MockRunView,
        CompositeKey: MockCompositeKey,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        UserInfo: vi.fn(),
        UUIDsEqual: vi.fn(),
    };
});

vi.mock('@memberjunction/core-entities', () => ({
    MJVectorIndexEntity: vi.fn(),
    MJVectorDatabaseEntity: vi.fn(),
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: vi.fn(),
            Models: [],
        },
    },
}));

vi.mock('@memberjunction/ai', () => ({
    BaseEmbeddings: vi.fn(),
    GetAIAPIKey: vi.fn().mockReturnValue('mock-api-key'),
}));

vi.mock('@memberjunction/ai-vectordb', () => ({
    VectorDBBase: vi.fn(),
    BaseResponse: vi.fn(),
}));

vi.mock('@memberjunction/global', () => ({
    MJGlobal: {
        Instance: {
            ClassFactory: {
                CreateInstance: vi.fn(),
            },
        },
    },
    UUIDsEqual: vi.fn(),
    RegisterClass: () => (target: Function) => target,
}));

import { VectorSearchProvider } from '../generic/VectorSearchProvider';
import { MJGlobal } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';

type CreateInstanceMock = { mockReturnValue: (v: unknown) => void };
const createInstanceMock = MJGlobal.Instance.ClassFactory.CreateInstance as unknown as CreateInstanceMock;

function createMockUser(): UserInfo {
    return {
        ID: 'user-123',
        Name: 'Test User',
        Email: 'test@example.com',
    } as UserInfo;
}

describe('VectorSearchProvider', () => {
    let provider: VectorSearchProvider;
    let contextUser: UserInfo;

    beforeEach(() => {
        provider = new VectorSearchProvider();
        contextUser = createMockUser();
        mockRunViewFn.mockReset();
    });

    describe('SourceType', () => {
        it('should be "vector"', () => {
            expect(provider.SourceType).toBe('vector');
        });
    });

    describe('IsAvailable', () => {
        it('should return false when not configured (default)', () => {
            expect(provider.IsAvailable()).toBe(false);
        });

        it('should return true after successful CheckAvailability with vector indexes', async () => {
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ ID: 'index-1' }],
            });

            await provider.CheckAvailability(contextUser);
            expect(provider.IsAvailable()).toBe(true);
        });

        it('should return false after CheckAvailability when no vector indexes exist', async () => {
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [],
            });

            await provider.CheckAvailability(contextUser);
            expect(provider.IsAvailable()).toBe(false);
        });

        it('should return false after CheckAvailability when RunView fails', async () => {
            mockRunViewFn.mockResolvedValue({
                Success: false,
                Results: [],
            });

            await provider.CheckAvailability(contextUser);
            expect(provider.IsAvailable()).toBe(false);
        });

        it('should return false after CheckAvailability when RunView throws', async () => {
            mockRunViewFn.mockRejectedValue(new Error('Connection failed'));

            await provider.CheckAvailability(contextUser);
            expect(provider.IsAvailable()).toBe(false);
        });
    });

    describe('CompositeKey parsing (extractRecordIDFromCompositeKey)', () => {
        // We test this indirectly through convertMatches via the Search method,
        // but the most targeted test is through the private method's behavior
        // observed in the output. We can test by creating a provider instance and
        // checking the output of convertMatches via a controlled Search call.

        // Instead, let's test the parsing logic directly by accessing the private method
        // through a test-friendly approach.

        it('should return plain UUID unchanged when no pipe delimiter present', () => {
            // Access private method for focused testing
            const extractFn = (provider as unknown as { extractRecordIDFromCompositeKey: (raw: string) => string }).extractRecordIDFromCompositeKey;
            const result = extractFn.call(provider, 'abc-123-def-456');
            expect(result).toBe('abc-123-def-456');
        });

        it('should extract just the UUID from "ID|UUID" composite key format', () => {
            const extractFn = (provider as unknown as { extractRecordIDFromCompositeKey: (raw: string) => string }).extractRecordIDFromCompositeKey;
            const result = extractFn.call(provider, 'ID|abc-123-def-456');
            expect(result).toBe('abc-123-def-456');
        });

        it('should extract concatenated values from multi-field composite key "F1|V1||F2|V2"', () => {
            const extractFn = (provider as unknown as { extractRecordIDFromCompositeKey: (raw: string) => string }).extractRecordIDFromCompositeKey;
            const result = extractFn.call(provider, 'Field1|Value1||Field2|Value2');
            expect(result).toBe('Value1||Value2');
        });
    });

    describe('Search', () => {
        it('should return empty array when no vector indexes are configured', async () => {
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [],
            });

            const results = await provider.Search('test query', 10, undefined, contextUser);
            expect(results).toEqual([]);
        });

        it('should return empty array when Search throws an error internally', async () => {
            mockRunViewFn.mockRejectedValue(new Error('Unexpected error'));

            const results = await provider.Search('test query', 10, undefined, contextUser);
            expect(results).toEqual([]);
        });

        it('should pass raw cosine scores through without normalization', async () => {
            // This test verifies that convertMatches preserves the raw score
            // by testing the conversion logic through the private method.
            const convertFn = (provider as unknown as {
                convertMatches: (
                    matches: Array<{ id: string; score?: number; metadata?: Record<string, unknown> }>,
                    indexName: string
                ) => Array<{ Score: number; ScoreBreakdown: { Vector?: number } }>
            }).convertMatches;

            const rawScore = 0.4237;
            const matches = [{
                id: 'match-1',
                score: rawScore,
                metadata: {
                    Entity: 'People',
                    RecordID: 'rec-1',
                    Name: 'Test Person',
                },
            }];

            const results = convertFn.call(provider, matches, 'test-index');
            expect(results[0].Score).toBe(rawScore);
            expect(results[0].ScoreBreakdown.Vector).toBe(rawScore);
        });

        it('should set SourceType to "vector" on converted matches', () => {
            const convertFn = (provider as unknown as {
                convertMatches: (
                    matches: Array<{ id: string; score?: number; metadata?: Record<string, unknown> }>,
                    indexName: string
                ) => Array<{ SourceType: string; ResultType: string }>
            }).convertMatches;

            const results = convertFn.call(provider, [
                { id: 'match-1', score: 0.5, metadata: { Entity: 'People', RecordID: 'rec-1' } },
            ], 'test-index');

            expect(results[0].SourceType).toBe('vector');
            expect(results[0].ResultType).toBe('entity-record');
        });

        it('should extract entity name from vector metadata', () => {
            const convertFn = (provider as unknown as {
                convertMatches: (
                    matches: Array<{ id: string; score?: number; metadata?: Record<string, unknown> }>,
                    indexName: string
                ) => Array<{ EntityName: string }>
            }).convertMatches;

            const results = convertFn.call(provider, [
                { id: 'match-1', score: 0.5, metadata: { Entity: 'Companies', RecordID: 'c-1' } },
            ], 'test-index');

            expect(results[0].EntityName).toBe('Companies');
        });

        it('should default EntityName to "Unknown" when metadata has no Entity field', () => {
            const convertFn = (provider as unknown as {
                convertMatches: (
                    matches: Array<{ id: string; score?: number; metadata?: Record<string, unknown> }>,
                    indexName: string
                ) => Array<{ EntityName: string }>
            }).convertMatches;

            const results = convertFn.call(provider, [
                { id: 'match-1', score: 0.5, metadata: {} },
            ], 'test-index');

            expect(results[0].EntityName).toBe('Unknown');
        });

        it('should use the fallback entity name when metadata has no Entity field', () => {
            const convertFn = (provider as unknown as {
                convertMatches: (
                    matches: Array<{ id: string; score?: number; metadata?: Record<string, unknown> }>,
                    indexName: string,
                    fallbackEntityName?: string | null
                ) => Array<{ EntityName: string }>
            }).convertMatches;

            const results = convertFn.call(provider, [
                { id: 'match-1', score: 0.5, metadata: {} },
                { id: 'match-2', score: 0.4, metadata: { Entity: 'Companies' } },
            ], 'test-index', 'Content Items');

            // Missing Entity → fallback; explicit Entity metadata always wins
            expect(results[0].EntityName).toBe('Content Items');
            expect(results[1].EntityName).toBe('Companies');
        });

        it('should resolve record identity from the vector ID when RecordID metadata is absent', () => {
            const convertFn = (provider as unknown as {
                convertMatches: (
                    matches: Array<{ id: string; score?: number; metadata?: Record<string, unknown> }>,
                    indexName: string
                ) => Array<{ RecordID: string }>
            }).convertMatches;

            // Vector populated with vectorIdStrategy 'recordId' + fieldStrategy 'explicit':
            // the vector ID IS the record's UUID and metadata carries no RecordID
            const results = convertFn.call(provider, [
                { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', score: 0.5, metadata: {} },
            ], 'test-index');

            expect(results[0].RecordID).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
        });
    });

    describe('getFallbackEntityName / resolveIndexEntityName', () => {
        type GetFallback = (
            matches: Array<{ metadata?: Record<string, unknown> }> | undefined,
            vectorIndex: { ID: string },
            contextUser: UserInfo
        ) => Promise<string | null>;

        function getFallbackFn(): GetFallback {
            return (provider as unknown as { getFallbackEntityName: GetFallback }).getFallbackEntityName.bind(provider);
        }

        it('should skip the lookup entirely when every match carries Entity metadata', async () => {
            const result = await getFallbackFn()(
                [{ metadata: { Entity: 'People' } }, { metadata: { Entity: 'People' } }],
                { ID: 'idx-1' },
                contextUser
            );
            expect(result).toBeNull();
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('should resolve the entity name from the index entity documents when a match lacks Entity', async () => {
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ Entity: 'Content Items' }],
            });

            const result = await getFallbackFn()(
                [{ metadata: {} }],
                { ID: 'idx-1' },
                contextUser
            );
            expect(result).toBe('Content Items');
            expect(mockRunViewFn).toHaveBeenCalledWith(
                expect.objectContaining({
                    EntityName: 'MJ: Entity Documents',
                    ExtraFilter: `VectorIndexID='idx-1'`,
                }),
                contextUser
            );
        });

        it('should return null when the index serves multiple entities (ambiguous)', async () => {
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ Entity: 'Content Items' }, { Entity: 'People' }],
            });

            const result = await getFallbackFn()([{ metadata: {} }], { ID: 'idx-2' }, contextUser);
            expect(result).toBeNull();
        });

        it('should cache the resolution per index (one lookup for repeated queries)', async () => {
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ Entity: 'Content Items' }],
            });

            const fn = getFallbackFn();
            await fn([{ metadata: {} }], { ID: 'idx-3' }, contextUser);
            await fn([{ metadata: {} }], { ID: 'idx-3' }, contextUser);
            await fn([{ metadata: {} }], { ID: 'IDX-3' }, contextUser); // case-insensitive cache key

            expect(mockRunViewFn).toHaveBeenCalledTimes(1);
        });

        it('should return null (and not throw) when the lookup fails', async () => {
            mockRunViewFn.mockRejectedValue(new Error('DB unavailable'));

            const result = await getFallbackFn()([{ metadata: {} }], { ID: 'idx-4' }, contextUser);
            expect(result).toBeNull();
        });
    });

    describe('Search — score handling', () => {
        it('should handle zero score in metadata', () => {
            const convertFn = (provider as unknown as {
                convertMatches: (
                    matches: Array<{ id: string; score?: number; metadata?: Record<string, unknown> }>,
                    indexName: string
                ) => Array<{ Score: number }>
            }).convertMatches;

            const results = convertFn.call(provider, [
                { id: 'match-1', score: 0, metadata: { Entity: 'People', RecordID: 'r-1' } },
            ], 'test-index');

            expect(results[0].Score).toBe(0);
        });

        it('should handle missing score (undefined) in metadata', () => {
            const convertFn = (provider as unknown as {
                convertMatches: (
                    matches: Array<{ id: string; score?: number; metadata?: Record<string, unknown> }>,
                    indexName: string
                ) => Array<{ Score: number }>
            }).convertMatches;

            const results = convertFn.call(provider, [
                { id: 'match-1', metadata: { Entity: 'People', RecordID: 'r-1' } },
            ], 'test-index');

            expect(results[0].Score).toBe(0);
        });
    });

    describe('queryOneIndex — colocated routing', () => {
        type QueryOneIndex = (
            vectorIndex: { Name: string; VectorDatabaseID: string },
            queryVector: number[],
            queryText: string,
            topK: number,
            filter: object | undefined,
            providerConfig: Record<string, unknown> | undefined,
            contextUser: UserInfo
        ) => Promise<Array<{ Score: number }>>;

        it('routes a colocated provider through ColocatedQuery, passing the query text as the keyword', async () => {
            // VectorDatabase lookup resolves to a colocated ClassKey
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ ClassKey: 'PgVectorColocated', VectorDatabaseID: 'db-1' }],
            });

            const tryWire = vi.fn();
            const colocatedQuery = vi.fn().mockResolvedValue({
                matches: [{ id: 'r1', score: 0.91, metadata: { Entity: 'People', RecordID: 'r1' } }],
            });
            const queryIndex = vi.fn();
            createInstanceMock.mockReturnValue({
                SupportsColocatedQuery: true,
                TryWireColocatedHost: tryWire,
                ColocatedQuery: colocatedQuery,
                QueryIndex: queryIndex,
            });

            const queryOneIndex = (provider as unknown as { queryOneIndex: QueryOneIndex }).queryOneIndex;
            const results = await queryOneIndex.call(
                provider, { Name: 'idx', VectorDatabaseID: 'db-1' }, [0.1, 0.2], 'climate policy', 5, undefined, undefined, contextUser
            );

            expect(tryWire).toHaveBeenCalledTimes(1);
            expect(colocatedQuery).toHaveBeenCalledWith(
                expect.objectContaining({ indexName: 'idx', keyword: 'climate policy', fusion: 'rrf' }),
                contextUser
            );
            expect(queryIndex).not.toHaveBeenCalled();
            expect(results[0].Score).toBe(0.91);
        });

        it('falls back to QueryIndex for a non-colocated provider', async () => {
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ ClassKey: 'PgVectorDatabase', VectorDatabaseID: 'db-1' }],
            });

            const colocatedQuery = vi.fn();
            const queryIndex = vi.fn().mockResolvedValue({
                success: true,
                data: { matches: [{ id: 'r2', score: 0.7, metadata: { Entity: 'People', RecordID: 'r2' } }] },
            });
            createInstanceMock.mockReturnValue({
                SupportsColocatedQuery: false,
                TryWireColocatedHost: vi.fn(),
                ColocatedQuery: colocatedQuery,
                QueryIndex: queryIndex,
            });

            const queryOneIndex = (provider as unknown as { queryOneIndex: QueryOneIndex }).queryOneIndex;
            const results = await queryOneIndex.call(
                provider, { Name: 'idx', VectorDatabaseID: 'db-1' }, [0.1], 'q', 5, undefined, undefined, contextUser
            );

            expect(queryIndex).toHaveBeenCalledTimes(1);
            expect(colocatedQuery).not.toHaveBeenCalled();
            expect(results[0].Score).toBe(0.7);
        });
    });
});
