import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogError } from '@memberjunction/core';

// Hoisted mock variables
const { mockRunViewFn, mockAvailable, mockKHConfig, mockEntityDocumentsRef, mockContentSourcesRef, mockEntitiesRef, mockConstrainedRef } = vi.hoisted(() => {
    const mockRunViewFn = vi.fn();
    const mockAvailable = { value: false };
    const mockKHConfig = vi.fn();
    const mockEntityDocumentsRef: { value: Array<{ VectorIndexID: string; Entity: string }> } = { value: [] };
    const mockContentSourcesRef: { value: Array<{ ID: string; ConfigurationObject: { VectorEntityName?: string } | null }> } = { value: [] };
    // Entities the mocked Metadata can resolve, with their IS-A chain for the attribution-family check.
    // Shaped like EntityInfo for the bits VectorSearchProvider touches: the IS-A chain for the
    // attribution-family check, and Fields/NameField for the title path.
    const mockEntitiesRef: {
        value: Array<{ ID: string; Name: string; ParentID: string | null; Fields: Array<{ Name: string; IsNameField: boolean; Sequence: number }>; NameField: { Name: string } | null }>
    } = { value: [] };
    const mockConstrainedRef = { value: false };
    return { mockRunViewFn, mockAvailable, mockKHConfig, mockEntityDocumentsRef, mockContentSourcesRef, mockEntitiesRef, mockConstrainedRef };
});

vi.mock('@memberjunction/core', () => {
    class MockMetadata {
        get Entities() { return mockEntitiesRef.value; }
        EntityByID(id: string) { return mockEntitiesRef.value.find(e => e.ID === id); }
        EntityByName(name: string) { return mockEntitiesRef.value.find(e => e.Name.trim().toLowerCase() === name.trim().toLowerCase()); }
        // Multi-provider migration: VectorSearchProvider uses this.Provider which falls back
        // to Metadata.Provider when the SearchEngine doesn't supply one. Mirror the helper
        // shape on the static so callers find the EntityByName/Entities API.
        static Provider = {
            get Entities() { return mockEntitiesRef.value; },
            EntityByName: (name: string) => mockEntitiesRef.value.find(e => e.Name.trim().toLowerCase() === name.trim().toLowerCase()),
            EntityByID: (id: string) => mockEntitiesRef.value.find(e => e.ID === id),
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
        UUIDsEqual: (a: unknown, b: unknown) =>
        typeof a === 'string' && typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase(),
    };
});

vi.mock('@memberjunction/core-entities', () => ({
    MJVectorIndexEntity: vi.fn(),
    MJVectorDatabaseEntity: vi.fn(),
    KnowledgeHubMetadataEngine: {
        Instance: {
            Config: mockKHConfig,
            get EntityDocuments() { return mockEntityDocumentsRef.value; },
            // Mirrors the engine's O(1) cached ByID helper.
            GetContentSourceByID: (id: string) =>
                mockContentSourcesRef.value.find(c => c.ID.trim().toLowerCase() === id.trim().toLowerCase()),
            get IsPermissionConstrained() { return mockConstrainedRef.value; },
            // The real BaseEngine exposes the denied list alongside the flag; the diagnostic names it
            // rather than guessing at "MJ: Content Sources", since the flag trips on ANY denied config.
            get PermissionConstrainedEntities() { return mockConstrainedRef.value ? ['MJ: Content File Types'] : []; },
        },
    },
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
    UUIDsEqual: (a: unknown, b: unknown) =>
        typeof a === 'string' && typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase(),
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
        mockKHConfig.mockReset().mockResolvedValue(undefined);
        vi.mocked(LogError).mockClear(); // asserted on by the unattributed-match tests
        mockEntityDocumentsRef.value = [];
        mockContentSourcesRef.value = [];
        mockConstrainedRef.value = false;
        mockEntitiesRef.value = [
            // Real name-field metadata, NOT empty: with `Fields: []` the title path cannot produce a
            // name at all, so the sentinel leg below would assert the same string whether the method
            // reads `meta['Entity']` or the resolved entity — passing under the very mutation it names.
            // These field names are deliberately absent from extractDisplayTitle's heuristic list so the
            // name-field branch is the only thing that can produce 'Jane Smith'.
            {
                ID: 'e1', Name: 'MJ: Content Items', ParentID: null, NameField: null,
                Fields: [
                    { Name: 'FirstName', IsNameField: true, Sequence: 1 },
                    { Name: 'LastName', IsNameField: true, Sequence: 2 },
                ],
            },
            { ID: 'e2', Name: 'MJ: Content Item Chunks', ParentID: null, Fields: [], NameField: null },
            // An IS-A subtype of the content-item entity — the legitimate reason to declare at all.
            { ID: 'e3', Name: 'Acme: Content Items', ParentID: 'e1', Fields: [], NameField: null },
            // Resolvable but unrelated: must be refused, not trusted.
            { ID: 'e4', Name: 'MJ: Users', ParentID: null, Fields: [], NameField: null },
        ];
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

        // Chunk-Identity Contract (content autotagging): chunk vectors are written with the
        // chunk's own identity in metadata (Entity='MJ: Content Item Chunks', RecordID=<chunk PK>,
        // ContentItemID=<parent>). This asserts a scoped-search hit on such a vector surfaces the
        // matched CHUNK id (not the parent content item) with no search-side transformation — the
        // read side of that contract, guarding against future drift in convertMatches.
        it('surfaces the ContentItemChunk id + chunk entity for a chunk-identity match', () => {
            const convertFn = (provider as unknown as {
                convertMatches: (
                    matches: Array<{ id: string; score?: number; metadata?: Record<string, unknown> }>,
                    indexName: string
                ) => Array<{ ID: string; EntityName: string; RecordID: string; RawMetadata: string }>
            }).convertMatches;

            const chunkID = '7c3f2a10-9b4d-4e6a-8f21-0a1b2c3d4e5f';
            const results = convertFn.call(provider, [{
                id: chunkID, // recordId strategy: the vector id IS the chunk id
                score: 0.83,
                metadata: {
                    Entity: 'MJ: Content Item Chunks',
                    RecordID: chunkID,            // bare UUID (not composite-key format)
                    ContentItemID: 'item-parent-1',
                    Sequence: 0,
                },
            }], 'content-index');

            // The result identifies the CHUNK: entity + record id both point at the chunk row...
            expect(results[0].EntityName).toBe('MJ: Content Item Chunks');
            expect(results[0].RecordID).toBe(chunkID);
            expect(results[0].ID).toBe(chunkID);
            // ...and the parent content item id is available for the external hydrator via metadata.
            expect(JSON.parse(results[0].RawMetadata).ContentItemID).toBe('item-parent-1');
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
            expect(mockKHConfig).not.toHaveBeenCalled();
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('should resolve the entity name from the cached KnowledgeHubMetadataEngine entity documents when a match lacks Entity', async () => {
            mockEntityDocumentsRef.value = [{ VectorIndexID: 'idx-1', Entity: 'Content Items' }];

            const result = await getFallbackFn()(
                [{ metadata: {} }],
                { ID: 'idx-1' },
                contextUser
            );
            expect(result).toBe('Content Items');
            // Third argument is load-bearing, not decoration: the engine binds its provider on first
            // load, so both callers in this class must pass one or the cached metadata set depends on
            // which search ran first.
            expect(mockKHConfig).toHaveBeenCalledWith(false, contextUser, provider.Provider);
            // No RunView/RunQuery — this is a lookup against the already-cached engine, never a query.
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('should match VectorIndexID case-insensitively', async () => {
            mockEntityDocumentsRef.value = [{ VectorIndexID: 'IDX-1', Entity: 'Content Items' }];

            const result = await getFallbackFn()([{ metadata: {} }], { ID: 'idx-1' }, contextUser);
            expect(result).toBe('Content Items');
        });

        it('should return null when the index serves multiple entities (ambiguous)', async () => {
            mockEntityDocumentsRef.value = [
                { VectorIndexID: 'idx-2', Entity: 'Content Items' },
                { VectorIndexID: 'idx-2', Entity: 'People' },
            ];

            const result = await getFallbackFn()([{ metadata: {} }], { ID: 'idx-2' }, contextUser);
            expect(result).toBeNull();
        });

        it('should ignore entity documents belonging to other vector indexes', async () => {
            mockEntityDocumentsRef.value = [
                { VectorIndexID: 'idx-other', Entity: 'People' },
                { VectorIndexID: 'idx-3', Entity: 'Content Items' },
            ];

            const result = await getFallbackFn()([{ metadata: {} }], { ID: 'idx-3' }, contextUser);
            expect(result).toBe('Content Items');
        });

        it('should resolve consistently across repeated calls without issuing a RunView/RunQuery', async () => {
            // KnowledgeHubMetadataEngine IS the cache — Config() is a cheap no-op once loaded,
            // so there is no need for (and no correctness benefit to) a second, hand-rolled
            // per-index cache layer inside VectorSearchProvider.
            mockEntityDocumentsRef.value = [{ VectorIndexID: 'idx-4', Entity: 'Content Items' }];

            const fn = getFallbackFn();
            const r1 = await fn([{ metadata: {} }], { ID: 'idx-4' }, contextUser);
            const r2 = await fn([{ metadata: {} }], { ID: 'idx-4' }, contextUser);

            expect(r1).toBe('Content Items');
            expect(r2).toBe('Content Items');
            expect(mockKHConfig).toHaveBeenCalledTimes(2);
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('should return null (and not throw) when the engine fails to load', async () => {
            mockKHConfig.mockRejectedValueOnce(new Error('metadata unavailable'));

            const result = await getFallbackFn()([{ metadata: {} }], { ID: 'idx-5' }, contextUser);
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

    // ────────────────────────────────────────────────────────────────
    // Attribution from the vector's CONTENT SOURCE.
    //
    // The ContentSource pipeline with `fieldStrategy: 'explicit'` writes only the configured
    // fields — so `ContentSourceID` is present and the identity keys are not.
    // `Configuration.VectorEntityName` is set by the source's owner, which makes this a DECLARATION
    // rather than a guess, and it resolves per match rather than per index (one index serves many).
    //
    // Why it is a correctness concern and not a label: `SearchEngine.filterEntityResults` groups by
    // `EntityName` and evaluates THAT entity's CanRead/RLS. For an ISA extension the row-level
    // security lives on the extension, not the base entity it inherits from — so naming the base is
    // a security difference, and per-source declaration is the only way to express which one.
    // ────────────────────────────────────────────────────────────────
    describe('attribution from ContentSource.Configuration.VectorEntityName', () => {
        type QueryOneIdx = (
            vectorIndex: { ID: string; Name: string; VectorDatabaseID: string },
            queryVector: number[],
            queryText: string,
            topK: number,
            filter: object | undefined,
            providerConfig: Record<string, unknown> | undefined,
            contextUser: UserInfo
        ) => Promise<Array<{ EntityName: string; RecordID: string; Title: string }>>;

        const SOURCE_A = 'a0000000-0000-4000-8000-00000000000a';
        const SOURCE_B = 'b0000000-0000-4000-8000-00000000000b';
        const RECORD_GUID = 'c1b2c3d4-e5f6-7890-abcd-ef1234567890';

        /** Query one index, returning whatever the provider's matches convert to. */
        const queryWith = async (matches: Array<{ id: string; score?: number; metadata: Record<string, unknown> }>) => {
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ ClassKey: 'PineconeDatabase', VectorDatabaseID: 'db-1' }],
            });
            createInstanceMock.mockReturnValue({
                SupportsColocatedQuery: false,
                TryWireColocatedHost: vi.fn(),
                ColocatedQuery: vi.fn(),
                QueryIndex: vi.fn().mockResolvedValue({ success: true, data: { matches } }),
            });
            const queryOneIndex = (provider as unknown as { queryOneIndex: QueryOneIdx }).queryOneIndex;
            return queryOneIndex.call(
                provider, { ID: 'idx-1', Name: 'idx', VectorDatabaseID: 'db-1' }, [0.1], 'q', 5, undefined, undefined, contextUser
            );
        };

        it('attributes a match to the entity its content source declares', async () => {
            mockContentSourcesRef.value = [{ ID: SOURCE_A, ConfigurationObject: { VectorEntityName: 'MJ: Content Items' } }];

            const results = await queryWith([{ id: RECORD_GUID, score: 0.8, metadata: { ContentSourceID: SOURCE_A, ContentDate: 1786000000 } }]);

            expect(results[0].EntityName).toBe('MJ: Content Items');
        });

        it('attributes PER MATCH, so one index can serve several sources', async () => {
            // The reason this cannot be an index-wide answer.
            mockContentSourcesRef.value = [
                { ID: SOURCE_A, ConfigurationObject: { VectorEntityName: 'MJ: Content Items' } },
                { ID: SOURCE_B, ConfigurationObject: { VectorEntityName: 'MJ: Content Item Chunks' } },
            ];

            const results = await queryWith([
                { id: RECORD_GUID, score: 0.9, metadata: { ContentSourceID: SOURCE_A } },
                { id: 'd2b2c3d4-e5f6-7890-abcd-ef1234567890', score: 0.8, metadata: { ContentSourceID: SOURCE_B } },
            ]);

            expect(results.map(r => r.EntityName)).toEqual(['MJ: Content Items', 'MJ: Content Item Chunks']);
        });

        it("never overrides a match's own Entity metadata", async () => {
            mockContentSourcesRef.value = [{ ID: SOURCE_A, ConfigurationObject: { VectorEntityName: 'MJ: Content Items' } }];

            const results = await queryWith([{ id: RECORD_GUID, score: 0.8, metadata: { Entity: 'People', ContentSourceID: SOURCE_A } }]);

            expect(results[0].EntityName).toBe('People');
        });

        it('outranks the index-wide Entity Document, being the more specific declaration', async () => {
            mockEntityDocumentsRef.value = [{ VectorIndexID: 'idx-1', Entity: 'People' }];
            mockContentSourcesRef.value = [{ ID: SOURCE_A, ConfigurationObject: { VectorEntityName: 'MJ: Content Items' } }];

            const results = await queryWith([{ id: RECORD_GUID, score: 0.8, metadata: { ContentSourceID: SOURCE_A } }]);

            expect(results[0].EntityName).toBe('MJ: Content Items');
        });

        it('falls back to the Entity Document when the source declares no vector entity', async () => {
            mockEntityDocumentsRef.value = [{ VectorIndexID: 'idx-1', Entity: 'People' }];
            mockContentSourcesRef.value = [{ ID: SOURCE_A, ConfigurationObject: null }];

            const results = await queryWith([{ id: RECORD_GUID, score: 0.8, metadata: { ContentSourceID: SOURCE_A } }]);

            expect(results[0].EntityName).toBe('People');
        });

        it("stays 'Unknown' when neither the source nor the index declares anything", async () => {
            const results = await queryWith([{ id: RECORD_GUID, score: 0.8, metadata: { ContentSourceID: SOURCE_A } }]);

            expect(results[0].EntityName).toBe('Unknown');
        });

        it('recovers the record identity from the vector ID, since explicit mode stores no RecordID', async () => {
            mockContentSourcesRef.value = [{ ID: SOURCE_A, ConfigurationObject: { VectorEntityName: 'MJ: Content Items' } }];

            const results = await queryWith([{ id: RECORD_GUID, score: 0.8, metadata: { ContentSourceID: SOURCE_A } }]);

            // Load-bearing: the permission filter validates these against the attributed entity's table.
            expect(results[0].RecordID).toBe(RECORD_GUID);
        });

        it('applies the resolved entity to a match whose Entity metadata is an empty string', async () => {
            // The "needs attributing" test is falsy, so `Entity: ''` resolves a name — applying it with
            // `??` would discard it and the result would be dropped with the work already done.
            mockContentSourcesRef.value = [{ ID: SOURCE_A, ConfigurationObject: { VectorEntityName: 'MJ: Content Items' } }];

            const results = await queryWith([{ id: RECORD_GUID, score: 0.8, metadata: { Entity: '', ContentSourceID: SOURCE_A } }]);

            expect(results[0].EntityName).toBe('MJ: Content Items');
        });

        it('titles the hit from a name-ish metadata field once attributed', async () => {
            mockContentSourcesRef.value = [{ ID: SOURCE_A, ConfigurationObject: { VectorEntityName: 'MJ: Content Items' } }];

            const results = await queryWith([{ id: RECORD_GUID, score: 0.8, metadata: { ContentSourceID: SOURCE_A, Name: 'Q3 Board Minutes' } }]);

            expect(results[0].Title).toBe('Q3 Board Minutes');
        });

        it('does not consult the engine at all when every match carries Entity', async () => {
            const results = await queryWith([{ id: RECORD_GUID, score: 0.8, metadata: { Entity: 'People', RecordID: RECORD_GUID } }]);

            expect(results[0].EntityName).toBe('People');
            expect(mockKHConfig).not.toHaveBeenCalled();
        });

        it('refuses a declaration that does not resolve, leaving the Entity Document to answer', async () => {
            // A typo or a missing `MJ: ` prefix must not delete a source's results. Before validation
            // the unresolvable name won, filterEntityResults found no EntityInfo, and the whole group
            // was silently discarded.
            mockEntityDocumentsRef.value = [{ VectorIndexID: 'idx-1', Entity: 'MJ: Content Items' }];
            mockContentSourcesRef.value = [{ ID: SOURCE_A, ConfigurationObject: { VectorEntityName: 'Content Items' } }];

            const results = await queryWith([{ id: RECORD_GUID, score: 0.8, metadata: { ContentSourceID: SOURCE_A } }]);

            expect(results[0].EntityName).toBe('MJ: Content Items');
        });

        it('says so when a match cannot be attributed, because it is about to disappear', async () => {
            // The failure this whole feature has to avoid recreating. filterEntityResults resolves
            // 'Unknown' to no EntityInfo and returns before admitting the group — fail-closed, and
            // silent. The one existing trace, `Residual permission filter removed N result(s)`, blames
            // incomplete push-down, so without this line the only signal points away from the cause.
            const results = await queryWith([
                { id: RECORD_GUID, score: 0.8, metadata: { ContentDate: 1786000000 } },
                { id: 'd0000000-0000-4000-8000-00000000000d', score: 0.7, metadata: {} },
            ]);

            expect(results.map(r => r.EntityName)).toEqual(['Unknown', 'Unknown']);
            expect(vi.mocked(LogError)).toHaveBeenCalledTimes(1); // once per batch, not per match
            const message = vi.mocked(LogError).mock.calls[0][0];
            expect(message).toContain('2 match(es)');
            expect(message).toContain('"idx"');        // the index, so the reader knows where to look
            expect(message).toContain(RECORD_GUID);    // a sample id, so they can find the vector
            expect(message).toContain('VectorEntityName');
        });

        it('stays quiet when every match is attributed', async () => {
            // Guards the log against becoming noise on the healthy path, which is what gets a
            // diagnostic ignored.
            mockContentSourcesRef.value = [{ ID: SOURCE_A, ConfigurationObject: { VectorEntityName: 'MJ: Content Items' } }];

            await queryWith([{ id: RECORD_GUID, score: 0.8, metadata: { ContentSourceID: SOURCE_A } }]);

            expect(vi.mocked(LogError)).not.toHaveBeenCalled();
        });

        it('refuses a resolvable but unrelated entity, so the blob cannot pick the permissions', async () => {
            // The security property: whatever is returned becomes the entity whose CanRead/RLS is
            // evaluated, and filterEntityResults never checks the record ids belong to it. An
            // arbitrary world-readable entity must not be declarable.
            mockContentSourcesRef.value = [{ ID: SOURCE_A, ConfigurationObject: { VectorEntityName: 'MJ: Users' } }];

            const results = await queryWith([{ id: RECORD_GUID, score: 0.8, metadata: { ContentSourceID: SOURCE_A } }]);

            expect(results[0].EntityName).toBe('Unknown');
        });

        it('accepts an IS-A subtype of a content-item entity — the case worth declaring', async () => {
            mockContentSourcesRef.value = [{ ID: SOURCE_A, ConfigurationObject: { VectorEntityName: 'Acme: Content Items' } }];

            const results = await queryWith([{ id: RECORD_GUID, score: 0.8, metadata: { ContentSourceID: SOURCE_A } }]);

            expect(results[0].EntityName).toBe('Acme: Content Items');
        });

        it('canonicalises the declared name from metadata rather than trusting its casing', async () => {
            mockContentSourcesRef.value = [{ ID: SOURCE_A, ConfigurationObject: { VectorEntityName: '  mj: content items  ' } }];

            const results = await queryWith([{ id: RECORD_GUID, score: 0.8, metadata: { ContentSourceID: SOURCE_A } }]);

            expect(results[0].EntityName).toBe('MJ: Content Items');
        });

        it('declines when content sources are unreadable, rather than reading empty as "nothing declared"', async () => {
            // BaseEngine reports a permission-denied load as SUCCESSFUL with empty collections, so
            // without this check attribution would depend on who is searching.
            mockConstrainedRef.value = true;
            mockContentSourcesRef.value = [{ ID: SOURCE_A, ConfigurationObject: { VectorEntityName: 'MJ: Content Items' } }];

            const results = await queryWith([{ id: RECORD_GUID, score: 0.8, metadata: { ContentSourceID: SOURCE_A } }]);

            expect(results[0].EntityName).toBe('Unknown');
        });

        it('isolates a malformed source so it cannot take the rest of the batch with it', async () => {
            // ConfigurationObject is a bare JSON.parse. One guard around the loop would abandon every
            // source after the bad one and silently downgrade those matches to another entity.
            mockContentSourcesRef.value = [
                { ID: SOURCE_A, get ConfigurationObject(): { VectorEntityName?: string } | null { throw new SyntaxError('bad json'); } },
                { ID: SOURCE_B, ConfigurationObject: { VectorEntityName: 'MJ: Content Item Chunks' } },
            ];

            const results = await queryWith([
                { id: RECORD_GUID, score: 0.9, metadata: { ContentSourceID: SOURCE_A } },
                { id: 'd2b2c3d4-e5f6-7890-abcd-ef1234567890', score: 0.8, metadata: { ContentSourceID: SOURCE_B } },
            ]);

            expect(results.map(r => r.EntityName)).toEqual(['Unknown', 'MJ: Content Item Chunks']);
        });

        it('falls back to the vector id when RecordID is present but empty', async () => {
            mockContentSourcesRef.value = [{ ID: SOURCE_A, ConfigurationObject: { VectorEntityName: 'MJ: Content Items' } }];

            const results = await queryWith([{ id: RECORD_GUID, score: 0.8, metadata: { ContentSourceID: SOURCE_A, RecordID: '' } }]);

            expect(results[0].RecordID).toBe(RECORD_GUID);
        });

        it('leaves the "<Entity> Record" sentinel intact so the enricher can refresh the title', async () => {
            // extractDisplayTitle must keep reading meta['Entity'], not the resolved name: the sentinel
            // is what SearchEnricher.resolveRecordNames matches to replace the title from the database.
            // This discriminates only because 'MJ: Content Items' carries IsNameField metadata in the
            // fixture and the match supplies those fields — read the resolved entity instead and the
            // name-field branch returns 'Jane Smith', so the sentinel never forms.
            mockContentSourcesRef.value = [{ ID: SOURCE_A, ConfigurationObject: { VectorEntityName: 'MJ: Content Items' } }];

            const results = await queryWith([
                { id: RECORD_GUID, score: 0.8, metadata: { ContentSourceID: SOURCE_A, FirstName: 'Jane', LastName: 'Smith' } },
            ]);

            expect(results[0].Title).toBe('MJ: Content Items Record');
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

    // ────────────────────────────────────────────────────────────────
    // Scope MetadataFilter — must fail CLOSED when authored but unusable
    // ────────────────────────────────────────────────────────────────
    // ────────────────────────────────────────────────────────────────
    // The entity filter is PUSHED DOWN to the vector database, which is why omitting the `Entity`
    // metadata key has consequences beyond attribution: a store cannot match a key that is absent, so
    // the match never comes back and nothing downstream — including the unattributed-match warning —
    // ever sees it.
    //
    // These two legs compose to pin exactly that: the shape the provider builds, and the fact that it
    // survives to `QueryIndex` rather than being dropped or rewritten on the way.
    // ────────────────────────────────────────────────────────────────
    describe('entity-name filter push-down', () => {
        type BuildFilter = (filters?: { EntityNames?: string[]; SourceTypes?: string[]; Tags?: string[] }) => object | undefined;
        type QueryOne = (
            vectorIndex: { ID: string; Name: string; VectorDatabaseID: string },
            queryVector: number[],
            queryText: string,
            topK: number,
            filter: object | undefined,
            providerConfig: Record<string, unknown> | undefined,
            contextUser: UserInfo
        ) => Promise<unknown>;

        const buildFilter = (filters?: { EntityNames?: string[]; SourceTypes?: string[]; Tags?: string[] }) =>
            (provider as unknown as { buildMetadataFilter: BuildFilter }).buildMetadataFilter.call(provider, filters);

        it('constrains on the `Entity` metadata key, which an omitted key cannot satisfy', () => {
            expect(buildFilter({ EntityNames: ['MJ: Content Item Chunks'] }))
                .toEqual({ Entity: { $in: ['MJ: Content Item Chunks'] } });
        });

        it('hands that constraint to the vector database unchanged', async () => {
            const queryIndex = vi.fn().mockResolvedValue({ success: true, data: { matches: [] } });
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ ClassKey: 'PineconeDatabase', VectorDatabaseID: 'db-1' }],
            });
            createInstanceMock.mockReturnValue({
                SupportsColocatedQuery: false,
                TryWireColocatedHost: vi.fn(),
                ColocatedQuery: vi.fn(),
                QueryIndex: queryIndex,
            });

            const filter = buildFilter({ EntityNames: ['MJ: Content Item Chunks'] });
            const queryOneIndex = (provider as unknown as { queryOneIndex: QueryOne }).queryOneIndex;
            await queryOneIndex.call(
                provider, { ID: 'idx-1', Name: 'idx', VectorDatabaseID: 'db-1' }, [0.1], 'q', 5, filter, undefined, contextUser
            );

            // The store receives the constraint verbatim. Nothing in the provider relaxes it for vectors
            // that might legitimately lack the key, so a source whose vectors omit `Entity` is filtered
            // out at the database and never reaches attribution or the warning path.
            expect(queryIndex).toHaveBeenCalledTimes(1);
            expect(queryIndex.mock.calls[0][0]).toMatchObject({ filter: { Entity: { $in: ['MJ: Content Item Chunks'] } } });
        });
    });

    describe('mergeMetadataFilters — tenant-safety of the scope filter', () => {
        type Merge = (base: object | undefined, scope: unknown) =>
            { Status: 'absent' } | { Status: 'usable'; Value: object } | { Status: 'unusable'; Reason: string };
        const merge = (base: object | undefined, scope: unknown) =>
            (provider as unknown as { mergeMetadataFilters: Merge })
                .mergeMetadataFilters.call(provider, base, scope);

        it('reports absent when no scope filter and no base filter — legitimately unfiltered', () => {
            expect(merge(undefined, null).Status).toBe('absent');
        });

        it('passes the base filter through when no scope filter was authored', () => {
            const base = { Entity: { $in: ['People'] } };
            const result = merge(base, undefined);
            expect(result.Status).toBe('usable');
            if (result.Status === 'usable') expect(result.Value).toBe(base);
        });

        it('ANDs the scope filter with the base filter', () => {
            const result = merge({ Entity: { $in: ['People'] } }, '{"OrganizationID":{"$eq":"org-a"}}');
            expect(result.Status).toBe('usable');
            if (result.Status === 'usable') {
                expect(result.Value).toEqual({
                    $and: [{ Entity: { $in: ['People'] } }, { OrganizationID: { $eq: 'org-a' } }],
                });
            }
        });

        it('uses the scope filter alone when there is no base filter', () => {
            const result = merge(undefined, { OrganizationID: { $eq: 'org-a' } });
            expect(result.Status).toBe('usable');
            if (result.Status === 'usable') expect(result.Value).toEqual({ OrganizationID: { $eq: 'org-a' } });
        });

        it('reports UNUSABLE for malformed JSON instead of silently dropping the filter', () => {
            // THE REGRESSION GUARD. This previously returned `baseFilter` — usually
            // `undefined` — so a broken template meant the vector query ran across the
            // ENTIRE index with no tenant predicate at all.
            const result = merge(undefined, '[');
            expect(result.Status).toBe('unusable');
        });

        it('reports UNUSABLE even when a base filter exists, so the lane cannot run under-filtered', () => {
            // Especially important: a surviving base filter would look "filtered" while the
            // scope's tenant clause had vanished.
            const result = merge({ Entity: { $in: ['People'] } }, '{"OrganizationID": ');
            expect(result.Status).toBe('unusable');
        });

        it('never reports absent for an authored-but-broken filter', () => {
            for (const broken of ['[', '{oops', 42, true]) {
                expect(merge(undefined, broken).Status).not.toBe('absent');
                expect(merge({ Entity: { $in: ['X'] } }, broken).Status).not.toBe('absent');
            }
        });
    });
});
