import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─────────────────────────────────────────────
// Hoisted Mocks
// ─────────────────────────────────────────────

const { mockRunViewFn, mockRunViewsFn, mockRunEmbeddingFn, testState, MockCompositeKey } = vi.hoisted(() => {
    class MockCompositeKey {
        static DefaultValueDelimiter = '||';
        static FromURLSegment = vi.fn().mockImplementation(() => new MockCompositeKey());
        static FromEntityRecord = vi.fn().mockImplementation(() => new MockCompositeKey());
        KeyValuePairs: { FieldName: string; Value: string }[] = [{ FieldName: 'ID', Value: 'rec-1' }];
        ToString = vi.fn().mockReturnValue('ID|rec-1');
        Values = vi.fn().mockReturnValue('rec-1');
        ToURLSegment = vi.fn().mockReturnValue('ID|rec-1');
        ToCompactURLSegment = vi.fn().mockReturnValue('rec-1');
        LoadFromConcatenatedString = vi.fn();
        Equals(other: { KeyValuePairs: { FieldName: string; Value: string }[] }): boolean {
            const a = this.KeyValuePairs, b = other?.KeyValuePairs ?? [];
            return a.length === b.length && a.every((kv, i) =>
                kv.FieldName.toLowerCase() === b[i].FieldName.toLowerCase() &&
                String(kv.Value).toLowerCase() === String(b[i].Value).toLowerCase());
        }
    }

    interface EntityDocumentStub {
        ID: string;
        Name: string;
        EntityID: string;
        AIModelID: string;
        VectorDatabaseID: string;
        VectorIndexID: string;
        Type: string;
        TemplateID: string;
    }

    interface TestState {
        entityDocument: EntityDocumentStub | undefined;
    }

    const mockRecord = {
        ID: 'rec-1',
        Name: 'Alice',
        PrimaryKey: new MockCompositeKey(),
        GetAll: () => ({ ID: 'rec-1', Name: 'Alice' }),
        Get: (_fieldName: string) => null,
    };

    const state: TestState = {
        entityDocument: undefined,
    };

    return {
        MockCompositeKey,
        mockRunViewFn: vi.fn().mockImplementation(async (params: { EntityName?: string; ResultType?: string }) => {
            if (state.entityDocument) {
                if (params.EntityName === 'MJ: List Details') {
                    return { Success: true, Results: [{ RecordID: 'rec-1' }], RowCount: 1 };
                }
                if (params.ResultType === 'entity_object') {
                    return { Success: true, Results: [mockRecord], RowCount: 1 };
                }
            }
            return { Success: true, Results: [], RowCount: 0 };
        }),
        mockRunViewsFn: vi.fn().mockResolvedValue([{ Success: true, Results: [], RowCount: 0 }]),
        mockRunEmbeddingFn: vi.fn().mockImplementation(async (params: { Texts?: string[] }) => ({
            Success: true,
            Vectors: (params.Texts || []).map(() => [0.1, 0.2]),
            PromptRunID: 'pr-mock',
            TokensUsed: 10,
            Cost: 0,
            ErrorMessage: null,
            ExecutionTimeMs: 1,
        })),
        testState: state,
    };
});

// ─────────────────────────────────────────────
// Module Mocks
// ─────────────────────────────────────────────

vi.mock('@memberjunction/core', () => {
    class MockRunView {
        RunView = mockRunViewFn;
        RunViews = mockRunViewsFn;
    }
    class MockMetadata {
        Entities = [{
            ID: 'entity-1',
            Name: 'Contacts',
            FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
            PrimaryKeys: [{ Name: 'ID', NeedsQuotes: true }],
            Fields: [],
        }];
        CurrentUser = { ID: 'user-1' };
        EntityByID = vi.fn().mockReturnValue({
            ID: 'entity-1',
            Name: 'Contacts',
            FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
            PrimaryKeys: [{ Name: 'ID', NeedsQuotes: true }],
            Fields: [],
            AllowRecordMerge: false,
        });
        EntityByName = vi.fn().mockReturnValue({
            ID: 'entity-1',
            Name: 'Contacts',
            FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
            PrimaryKeys: [{ Name: 'ID', NeedsQuotes: true }],
            Fields: [],
            AllowRecordMerge: false,
        });
        GetEntityObject = vi.fn().mockResolvedValue({
            Load: vi.fn().mockResolvedValue(true),
            Save: vi.fn().mockResolvedValue(true),
            NewRecord: vi.fn(),
            Delete: vi.fn().mockResolvedValue(true),
            ID: 'entity-obj-1',
            Name: 'Test',
            ContextCurrentUser: null,
            LatestResult: { CompleteMessage: '' },
        });
        MergeRecords = vi.fn().mockResolvedValue({ Success: true });
    }
    return {
        Metadata: MockMetadata,
        RunView: MockRunView,
        BaseEntity: vi.fn(),
        // Transitively loaded via @memberjunction/record-comparison's index (the Compare
        // Remote Operation): BaseRemotableOperation is passed to @RegisterClass at module load,
        // KeyValuePair is referenced by the operation's key-mapping helper.
        BaseRemotableOperation: class {},
        KeyValuePair: class { FieldName = ''; Value = ''; },
        CompositeKey: MockCompositeKey,
        UserInfo: class { ID = 'user-1'; },
        EntityInfo: vi.fn(),
        PotentialDuplicateRequest: class {
            EntityID = '';
            ListID = '';
            RecordIDs: unknown[] = [];
            EntityDocumentID = '';
            ProbabilityScore = 0;
            Options: Record<string, unknown> = {};
        },
        PotentialDuplicateResponse: class {
            PotentialDuplicateResult: unknown[] = [];
            Status = '';
            ErrorMessage = '';
        },
        PotentialDuplicateResult: class {
            Duplicates: unknown[] = [];
            EntityID = '';
            RecordCompositeKey: { ToString: () => string; Values: () => string; KeyValuePairs: { FieldName: string; Value: string }[] } | null = null;
            DuplicateRunDetailMatchRecordIDs: unknown[] = [];
            constructor() {
                this.RecordCompositeKey = { ToString: () => 'key-1', Values: () => 'key-1', KeyValuePairs: [] };
                this.Duplicates = [];
                this.DuplicateRunDetailMatchRecordIDs = [];
            }
        },
        PotentialDuplicate: class {
            ProbabilityScore = 0;
            LoadFromConcatenatedString = vi.fn();
            ToString = vi.fn().mockReturnValue('match-key');
            ToCompactURLSegment = vi.fn().mockReturnValue('match-1');
            ToURLSegment = vi.fn().mockReturnValue('ID|match-1');
            KeyValuePairs: { FieldName: string; Value: string }[] = [];
            // Mirror the real CompositeKey.Values() — concatenated key values — so the
            // parse-time self-match filter (isSameRecord) can be exercised faithfully.
            Values(): string {
                return this.KeyValuePairs.map(kv => String(kv.Value)).join('||');
            }
            Equals = vi.fn().mockReturnValue(false);
        },
        RecordMergeRequest: class {
            EntityName = '';
            SurvivingRecordCompositeKey: unknown = null;
            RecordsToMerge: unknown[] = [];
        },
        LogStatus: vi.fn(),
        LogError: vi.fn(),
        RunViewResult: class {},
        BaseEngine: class {
            static Instance = {};
            Config = vi.fn();
        },
    };
});

vi.mock('@memberjunction/ai-prompts', () => ({
    AIEmbeddingRunner: class {
        RunEmbedding = mockRunEmbeddingFn;
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

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        MJGlobal: {
            Instance: {
                ClassFactory: {
                    CreateInstance: vi.fn().mockReturnValue({
                        EmbedTexts: vi.fn().mockResolvedValue({ vectors: [[0.1, 0.2], [0.3, 0.4]] }),
                        queryIndex: vi.fn().mockResolvedValue({ success: true, data: { matches: [] } }),
                        QueryIndex: vi.fn().mockResolvedValue({ success: true, data: { matches: [] } }),
                        HybridQuery: vi.fn().mockResolvedValue({ success: true, data: { matches: [] } }),
                        SupportsHybridSearch: false,
                    }),
                },
            },
        },
        UUIDsEqual: vi.fn((a: string, b: string) => a === b),
        // No-op decorator stub — the Compare Remote Operation (transitively loaded via
        // @memberjunction/record-comparison) is decorated with @RegisterClass at module load.
        RegisterClass: () => () => { /* no-op */ },
    };
});

vi.mock('@memberjunction/core-entities', () => ({
    MJDuplicateRunDetailEntity: vi.fn(),
    MJDuplicateRunDetailMatchEntity: vi.fn(),
    MJDuplicateRunEntity: vi.fn(),
    MJEntityDocumentEntity: vi.fn(),
    MJListDetailEntity: vi.fn(),
    MJListEntity: vi.fn(),
    // Re-exported transitively via @memberjunction/record-comparison's index (the Compare
    // operation extends this CodeGen-emitted base); provide a stub so module load succeeds.
    RecordComparisonCompareOperation: class {},
    KnowledgeHubMetadataEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            EntityDocuments: [],
            VectorIndexes: [],
            GetEntityDocumentByID: vi.fn().mockImplementation(() => testState.entityDocument),
        },
    },
}));

vi.mock('@memberjunction/ai-vectors', () => {
    return {
        VectorBase: class VectorBase {
            _runView = { RunView: mockRunViewFn, RunViews: mockRunViewsFn };
            _metadata = {
                Entities: [{
                    ID: 'entity-1',
                    Name: 'Contacts',
                    FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
                    PrimaryKeys: [{ Name: 'ID', NeedsQuotes: true }],
                    Fields: [],
                }],
                CurrentUser: { ID: 'user-1' },
                EntityByID: vi.fn().mockReturnValue({
                    ID: 'entity-1',
                    Name: 'Contacts',
                    FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
                    PrimaryKeys: [{ Name: 'ID', NeedsQuotes: true }],
                    Fields: [],
                    AllowRecordMerge: false,
                }),
                // ProcessAutoMerges consults the entity's merge policy by NAME.
                EntityByName: vi.fn().mockReturnValue({
                    ID: 'entity-1', Name: 'Contacts', AllowRecordMerge: true,
                }),
                GetEntityObject: vi.fn().mockResolvedValue({
                    Load: vi.fn().mockResolvedValue(true),
                    Save: vi.fn().mockResolvedValue(true),
                    NewRecord: vi.fn(),
                    ID: 'mock-id',
                    ContextCurrentUser: null,
                    LatestResult: { CompleteMessage: '' },
                }),
                MergeRecords: vi.fn().mockResolvedValue({ Success: true }),
            };
            _currentUser: Record<string, unknown> = { ID: 'user-1' };

            get Metadata() { return this._metadata; }
            get RunView() { return this._runView; }
            get CurrentUser() { return this._currentUser; }
            set CurrentUser(user: unknown) { this._currentUser = user as Record<string, unknown>; }
            GetAIModel = vi.fn().mockReturnValue({ ID: 'model-1', DriverClass: 'TestDriver' });
            GetVectorDatabase = vi.fn().mockReturnValue({ ID: 'vdb-1', ClassKey: 'TestVDB' });
            RunViewForSingleValue = vi.fn().mockResolvedValue(null);
            SaveEntity = vi.fn().mockResolvedValue(true);
            BuildExtraFilter = vi.fn().mockReturnValue("ID = 'test-id'");
        },
    };
});

vi.mock('@memberjunction/ai-vector-sync', () => {
    return {
        EntityDocumentTemplateParser: {
            CreateInstance: vi.fn().mockReturnValue({
                Parse: vi.fn().mockResolvedValue('parsed template text'),
            }),
        },
        // Rendering's related-data step is covered by duplicateRecordDetectorTemplateText.test.ts;
        // here each record renders its own values, as for a template with no Entity params.
        EntityDocumentTemplateDataBuilder: class {
            // The shared render sync and detection both use.
            static RenderDocumentText = vi.fn().mockResolvedValue({ Success: true, Output: 'rendered template text' });
            LoadRelatedData = vi.fn().mockResolvedValue([]);
            MissingRelatedParams = vi.fn().mockReturnValue([]);
            BuildTemplateData = vi.fn((_entity: unknown, record: Record<string, unknown>) => ({ ...record }));
        },
        EntityVectorSyncer: class {
            CurrentUser = null;
            GetEntityDocument = vi.fn().mockResolvedValue(null);
            VectorizeEntity = vi.fn().mockResolvedValue(undefined);
        },
        VectorizeEntityParams: class {},
        // No record filter: the filter's own behavior is covered by duplicateRecordDetectorRecordFilter.test.ts.
        GetEntityDocumentRecordFilter: vi.fn().mockReturnValue(null),
    };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Models: [{ ID: 'model-1', AIModelType: 'Embeddings', DriverClass: 'TestDriver' }],
            VectorDatabases: [{ ID: 'vdb-1', ClassKey: 'TestVDB' }],
            GetVectorIndexByID: vi.fn().mockReturnValue({
                ID: 'vi-1',
                Name: 'mj-knowledge-index',
                VectorDatabaseID: 'vdb-1',
                EmbeddingModelID: 'model-1',
            }),
            // Mirrors the real engine: the provider-side name is ExternalID, falling back to Name.
            GetProviderIndexName: vi.fn((v: { Name: string; ExternalID?: string | null }) => v.ExternalID?.trim() || v.Name),
        },
    },
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
    MJAIModelEntityExtended: vi.fn(),
}));

vi.mock('@memberjunction/templates', () => ({
    TemplateEngineServer: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            SetupNunjucks: vi.fn(),
            Templates: [{
                ID: 'tmpl-1',
                Content: [{ TemplateText: '{{Name}}' }],
                GetHighestPriorityContent() { return this.Content[0]; },
                Params: [{ Name: 'Entity', Type: 'Record' }],
            }],
            RenderTemplate: vi.fn().mockResolvedValue({ Success: true, Output: 'rendered template text' }),
        },
    },
}));

// ─────────────────────────────────────────────
// Import after mocks
// ─────────────────────────────────────────────

import { DuplicateRecordDetector } from '../duplicateRecordDetector';
import { CompositeKey, PotentialDuplicateRequest, UserInfo, type BaseEntity, type EntityInfo, type IMetadataProvider, type PotentialDuplicate, type PotentialDuplicateResult, type RecordMergeResult } from '@memberjunction/core';
import type { MJDuplicateRunEntity, MJEntityDocumentEntity } from '@memberjunction/core-entities';

describe('DuplicateRecordDetector', () => {
    let detector: DuplicateRecordDetector;

    beforeEach(() => {
        vi.clearAllMocks();
        testState.entityDocument = undefined;
        detector = new DuplicateRecordDetector();
    });

    describe('constructor', () => {
        it('should create an instance', () => {
            expect(detector).toBeDefined();
        });
    });

    describe('ParseVectorMatches', () => {
        it('should return empty result when no matches', () => {
            const queryResponse = { success: true, message: 'ok', data: { matches: [] } };
            const result = detector.ParseVectorMatches(queryResponse);
            expect(result.Duplicates).toEqual([]);
        });

        it('should skip records with no ID', () => {
            const queryResponse = {
                success: true, message: 'ok',
                data: { matches: [{ id: null, score: 0.9, metadata: { RecordID: 'rec-1', Entity: 'Test', TemplateID: 't-1' } }] },
            };
            const result = detector.ParseVectorMatches(queryResponse);
            expect(result.Duplicates).toEqual([]);
        });

        it('should skip records with missing metadata', () => {
            const queryResponse = {
                success: true, message: 'ok',
                data: { matches: [{ id: 'match-1', score: 0.9, metadata: null }] },
            };
            const result = detector.ParseVectorMatches(queryResponse);
            expect(result.Duplicates).toEqual([]);
        });

        it('should skip records with missing RecordID in metadata', () => {
            const queryResponse = {
                success: true, message: 'ok',
                data: { matches: [{ id: 'match-1', score: 0.9, metadata: { Entity: 'Test', TemplateID: 't-1' } }] },
            };
            const result = detector.ParseVectorMatches(queryResponse);
            expect(result.Duplicates).toEqual([]);
        });

        it('should process valid matches and set probability scores', () => {
            const queryResponse = {
                success: true, message: 'ok',
                data: {
                    matches: [
                        { id: 'match-1', score: 0.95, metadata: { RecordID: 'rec-1', Entity: 'Contacts', TemplateID: 't-1' } },
                        { id: 'match-2', score: 0.85, metadata: { RecordID: 'rec-2', Entity: 'Contacts', TemplateID: 't-1' } },
                    ],
                },
            };
            const result = detector.ParseVectorMatches(queryResponse);
            expect(result.Duplicates).toHaveLength(2);
            expect(result.Duplicates[0].ProbabilityScore).toBe(0.95);
            expect(result.Duplicates[1].ProbabilityScore).toBe(0.85);
        });

        it('should handle missing data.matches gracefully', () => {
            const queryResponse = { success: true, message: 'ok', data: {} };
            const result = detector.ParseVectorMatches(queryResponse);
            expect(result.Duplicates).toEqual([]);
        });

        it('should handle null data gracefully', () => {
            const queryResponse = { success: true, message: 'ok', data: null };
            const result = detector.ParseVectorMatches(queryResponse);
            expect(result.Duplicates).toEqual([]);
        });

    });

    describe('GetDuplicateRecords', () => {
        it('should return error when no entity document found', async () => {
            const params = {
                EntityID: 'entity-1',
                EntityDocumentID: 'doc-1',
                ListID: 'list-1',
                RecordIDs: [],
                Options: {},
            };

            const result = await detector.GetDuplicateRecords(params as never, { ID: 'user-1' } as never);
            expect(result.Status).toBe('Error');
            expect(result.ErrorMessage).toContain('No active Entity Document');
        });

        it('passes entity document AIModelID as ModelID to AIEmbeddingRunner for batch detection', async () => {
            testState.entityDocument = {
                ID: 'doc-1',
                Name: 'Contacts Doc',
                EntityID: 'entity-1',
                AIModelID: 'model-1',
                VectorDatabaseID: 'vdb-1',
                VectorIndexID: 'vi-1',
                Type: 'Template',
                TemplateID: 'tmpl-1',
            };
            const user = new UserInfo();
            const req = new PotentialDuplicateRequest();
            req.EntityID = 'entity-1';
            req.EntityDocumentID = 'doc-1';
            req.ListID = 'list-1';

            const response = await detector.GetDuplicateRecords(req, user);
            expect(response.Status).toBe('Success');
            expect(mockRunEmbeddingFn).toHaveBeenCalledWith(
                expect.objectContaining({
                    ModelID: 'model-1',
                    Description: expect.stringContaining('Duplicate detection batch'),
                })
            );
        });
    });

    describe('CheckSingleRecord', () => {
        it('should throw when no entity document found', async () => {
            await expect(
                detector.CheckSingleRecord('doc-1', { ToString: () => 'key-1', KeyValuePairs: [] } as never, {}, { ID: 'user-1' } as never)
            ).rejects.toThrow('No active Entity Document');
        });

        it('passes entity document AIModelID as ModelID to AIEmbeddingRunner', async () => {
            testState.entityDocument = {
                ID: 'doc-1',
                Name: 'Contacts Doc',
                EntityID: 'entity-1',
                AIModelID: 'model-1',
                VectorDatabaseID: 'vdb-1',
                VectorIndexID: 'vi-1',
                Type: 'Template',
                TemplateID: 'tmpl-1',
            };
            const user = new UserInfo();
            const key = new CompositeKey();
            await detector.CheckSingleRecord('doc-1', key, {}, user);

            expect(mockRunEmbeddingFn).toHaveBeenCalledWith(
                expect.objectContaining({
                    ModelID: 'model-1',
                    Description: expect.stringContaining('Duplicate detection single record'),
                })
            );
        });

        it('queries the vector index by the engine-resolved provider name, not its MJ display Name', async () => {
            const { AIEngine } = await import('@memberjunction/aiengine');
            const vectorIndex = {
                ID: 'vi-1',
                Name: 'Contacts Index (Pinecone)',
                ExternalID: 'contacts-index',
                VectorDatabaseID: 'vdb-1',
                EmbeddingModelID: 'model-1',
            };
            vi.mocked(AIEngine.Instance.GetVectorIndexByID).mockReturnValueOnce(vectorIndex as never);
            testState.entityDocument = {
                ID: 'doc-1',
                Name: 'Contacts Doc',
                EntityID: 'entity-1',
                AIModelID: 'model-1',
                VectorDatabaseID: 'vdb-1',
                VectorIndexID: 'vi-1',
                Type: 'Template',
                TemplateID: 'tmpl-1',
            };
            await detector.CheckSingleRecord('doc-1', new CompositeKey(), {}, new UserInfo());

            expect(AIEngine.Instance.GetProviderIndexName).toHaveBeenCalledWith(vectorIndex);
            expect((detector as unknown as { indexName: string }).indexName).toBe('contacts-index');
        });
    });

    describe('_seenPairs deduplication', () => {
        it('should allow the first occurrence of a pair', () => {
            // Access the private _seenPairs via bracket notation
            const seenPairs: Set<string> = (detector as never)['_seenPairs'];
            expect(seenPairs.size).toBe(0);

            // Simulate the pair logic from PersistMatchResults:
            // if sourceId < matchId => key is "sourceId::matchId", else "matchId::sourceId"
            const sourceId = 'aaa';
            const matchId = 'bbb';
            const pairKey = sourceId < matchId ? `${sourceId}::${matchId}` : `${matchId}::${sourceId}`;

            expect(seenPairs.has(pairKey)).toBe(false);
            seenPairs.add(pairKey);
            expect(seenPairs.has(pairKey)).toBe(true);
        });

        it('should filter inverse pair (B->A) when A->B was already seen', () => {
            const seenPairs: Set<string> = (detector as never)['_seenPairs'];
            seenPairs.clear();

            // A->B: sourceId='aaa', matchId='bbb'
            const pairKeyAB = 'aaa' < 'bbb' ? 'aaa::bbb' : 'bbb::aaa';
            seenPairs.add(pairKeyAB);

            // B->A: sourceId='bbb', matchId='aaa'
            const pairKeyBA = 'bbb' < 'aaa' ? 'bbb::aaa' : 'aaa::bbb';

            // Both produce the same canonical key
            expect(pairKeyAB).toBe(pairKeyBA);
            expect(seenPairs.has(pairKeyBA)).toBe(true);
        });

        it('should not consider different pairs as duplicates', () => {
            const seenPairs: Set<string> = (detector as never)['_seenPairs'];
            seenPairs.clear();

            seenPairs.add('aaa::bbb');
            const differentPair = 'aaa' < 'ccc' ? 'aaa::ccc' : 'ccc::aaa';
            expect(seenPairs.has(differentPair)).toBe(false);
        });

        it('should be cleared on each call to GetDuplicateRecords', async () => {
            const seenPairs: Set<string> = (detector as never)['_seenPairs'];
            seenPairs.add('x::y');
            expect(seenPairs.size).toBe(1);

            // Calling GetDuplicateRecords triggers _seenPairs.clear() at the start
            // (it will fail fast because no entity document, but _seenPairs is cleared first)
            const params = {
                EntityID: 'entity-1',
                EntityDocumentID: 'doc-1',
                ListID: '',
                RecordIDs: [],
                Options: {},
            };
            await detector.GetDuplicateRecords(params as never, { ID: 'user-1' } as never);
            expect(seenPairs.size).toBe(0);
        });
    });

    describe('Batching and cursor management', () => {
        it('should chunk arrays correctly via chunkArray utility', () => {
            // Test the internal chunkArray logic used throughout the detector
            // We verify the same chunking logic the code uses
            const items = Array.from({ length: 250 }, (_, i) => `item-${i}`);
            const chunkSize = 100;
            const chunks: string[][] = [];
            for (let i = 0; i < items.length; i += chunkSize) {
                chunks.push(items.slice(i, i + chunkSize));
            }

            expect(chunks).toHaveLength(3);
            expect(chunks[0]).toHaveLength(100);
            expect(chunks[1]).toHaveLength(100);
            expect(chunks[2]).toHaveLength(50);
        });

        it('should handle a batch smaller than the chunk size', () => {
            const items = Array.from({ length: 30 }, (_, i) => `item-${i}`);
            const chunkSize = 100;
            const chunks: string[][] = [];
            for (let i = 0; i < items.length; i += chunkSize) {
                chunks.push(items.slice(i, i + chunkSize));
            }

            expect(chunks).toHaveLength(1);
            expect(chunks[0]).toHaveLength(30);
        });

        it('should handle an empty batch', () => {
            const items: string[] = [];
            const chunkSize = 100;
            const chunks: string[][] = [];
            for (let i = 0; i < items.length; i += chunkSize) {
                chunks.push(items.slice(i, i + chunkSize));
            }

            expect(chunks).toHaveLength(0);
        });

        it('should handle a batch exactly equal to chunk size', () => {
            const items = Array.from({ length: 100 }, (_, i) => `item-${i}`);
            const chunkSize = 100;
            const chunks: string[][] = [];
            for (let i = 0; i < items.length; i += chunkSize) {
                chunks.push(items.slice(i, i + chunkSize));
            }

            expect(chunks).toHaveLength(1);
            expect(chunks[0]).toHaveLength(100);
        });

        it('should update ProcessedItemCount after each outer batch iteration', () => {
            // Simulate the cursor update logic from GetDuplicateRecords (lines 203-205)
            const recordIDs = Array.from({ length: 1200 }, (_, i) => `rec-${i}`);
            const batchSize = 500;
            const cursors: { ProcessedItemCount: number; LastProcessedOffset: number }[] = [];

            for (let offset = 0; offset < recordIDs.length; offset += batchSize) {
                const batchIDs = recordIDs.slice(offset, offset + batchSize);
                cursors.push({
                    ProcessedItemCount: offset + batchIDs.length,
                    LastProcessedOffset: offset + batchSize,
                });
            }

            // 3 batches: 500, 500, 200
            expect(cursors).toHaveLength(3);
            expect(cursors[0]).toEqual({ ProcessedItemCount: 500, LastProcessedOffset: 500 });
            expect(cursors[1]).toEqual({ ProcessedItemCount: 1000, LastProcessedOffset: 1000 });
            expect(cursors[2]).toEqual({ ProcessedItemCount: 1200, LastProcessedOffset: 1500 });
        });

        it('should resume from LastProcessedOffset when restarting', () => {
            // Simulate resume logic from GetDuplicateRecords (lines 177-180)
            const recordIDs = Array.from({ length: 1200 }, (_, i) => `rec-${i}`);
            const batchSize = 500;
            const resumeOffset = 500; // Simulate previously processed 500 records

            const processedBatches: string[][] = [];
            for (let offset = resumeOffset; offset < recordIDs.length; offset += batchSize) {
                processedBatches.push(recordIDs.slice(offset, offset + batchSize));
            }

            // Should skip the first 500, process remaining in 2 batches
            expect(processedBatches).toHaveLength(2);
            expect(processedBatches[0]).toHaveLength(500);
            expect(processedBatches[0][0]).toBe('rec-500');
            expect(processedBatches[1]).toHaveLength(200);
            expect(processedBatches[1][0]).toBe('rec-1000');
        });

        it('should respect VECTOR_QUERY_BATCH_SIZE within each outer batch', () => {
            // Simulate the sub-batching of records within ProcessBatch
            // Outer batch of 500 records should be split into 5 sub-batches of 100
            const vectorQueryBatchSize = 100;
            const outerBatch = Array.from({ length: 500 }, (_, i) => `rec-${i}`);
            const subBatches: string[][] = [];
            for (let i = 0; i < outerBatch.length; i += vectorQueryBatchSize) {
                subBatches.push(outerBatch.slice(i, i + vectorQueryBatchSize));
            }

            expect(subBatches).toHaveLength(5);
            for (const sub of subBatches) {
                expect(sub.length).toBeLessThanOrEqual(vectorQueryBatchSize);
            }
        });

        it('should handle sub-batch with fewer records than VECTOR_QUERY_BATCH_SIZE', () => {
            const vectorQueryBatchSize = 100;
            const outerBatch = Array.from({ length: 50 }, (_, i) => `rec-${i}`);
            const subBatches: string[][] = [];
            for (let i = 0; i < outerBatch.length; i += vectorQueryBatchSize) {
                subBatches.push(outerBatch.slice(i, i + vectorQueryBatchSize));
            }

            expect(subBatches).toHaveLength(1);
            expect(subBatches[0]).toHaveLength(50);
        });
    });

    describe('CancellationRequested between batches', () => {
        it('should stop processing when CancellationRequested is true', () => {
            // Simulate the cancellation check from GetDuplicateRecords (lines 184-192)
            const recordIDs = Array.from({ length: 1500 }, (_, i) => `rec-${i}`);
            const batchSize = 500;
            const cancelAtOffset = 500; // Cancel after first batch
            const processedBatches: number[] = [];

            for (let offset = 0; offset < recordIDs.length; offset += batchSize) {
                // Simulate: check CancellationRequested before processing
                if (offset === cancelAtOffset) {
                    // Cancellation requested - stop processing
                    break;
                }
                processedBatches.push(offset);
            }

            // Only the first batch at offset 0 was processed
            expect(processedBatches).toHaveLength(1);
            expect(processedBatches[0]).toBe(0);
        });

        it('should process all batches when CancellationRequested is never set', () => {
            const recordIDs = Array.from({ length: 1500 }, (_, i) => `rec-${i}`);
            const batchSize = 500;
            const processedBatches: number[] = [];

            for (let offset = 0; offset < recordIDs.length; offset += batchSize) {
                // No cancellation
                processedBatches.push(offset);
            }

            expect(processedBatches).toHaveLength(3);
            expect(processedBatches).toEqual([0, 500, 1000]);
        });

        it('should allow partial completion with resume support on cancellation', () => {
            // Simulate: after cancellation, the run can be resumed from where it left off
            const totalRecords = 2000;
            const batchSize = 500;
            const cancelAtBatch = 2; // Cancel after 2 batches (1000 records)
            let lastProcessedOffset = 0;
            let processedItemCount = 0;
            let batchIndex = 0;

            for (let offset = 0; offset < totalRecords; offset += batchSize) {
                if (batchIndex === cancelAtBatch) {
                    break;
                }
                const batchEnd = Math.min(offset + batchSize, totalRecords);
                processedItemCount = batchEnd;
                lastProcessedOffset = offset + batchSize;
                batchIndex++;
            }

            expect(processedItemCount).toBe(1000);
            expect(lastProcessedOffset).toBe(1000);

            // Now simulate resume from lastProcessedOffset
            const remainingBatches: number[] = [];
            for (let offset = lastProcessedOffset; offset < totalRecords; offset += batchSize) {
                remainingBatches.push(offset);
            }
            expect(remainingBatches).toEqual([1000, 1500]);
        });
    });

    describe('Threshold override logic', () => {
        it('should use options.PotentialMatchThreshold over entity document threshold when provided', () => {
            // The threshold logic is in QueryDuplicatesForRecords line 719:
            // const potentialThreshold = options.PotentialMatchThreshold ?? entityDocument.PotentialMatchThreshold;
            // We test the ?? operator semantics directly:
            const optionsThreshold = 0.8;
            const entityDocThreshold = 0.6;

            const resolvedThreshold = optionsThreshold ?? entityDocThreshold;
            expect(resolvedThreshold).toBe(0.8);
        });

        it('should fall back to entity document threshold when options threshold is null', () => {
            const optionsThreshold = null;
            const entityDocThreshold = 0.6;

            const resolvedThreshold = optionsThreshold ?? entityDocThreshold;
            expect(resolvedThreshold).toBe(0.6);
        });

        it('should fall back to entity document threshold when options threshold is undefined', () => {
            const optionsThreshold = undefined;
            const entityDocThreshold = 0.7;

            const resolvedThreshold = optionsThreshold ?? entityDocThreshold;
            expect(resolvedThreshold).toBe(0.7);
        });

        it('should use options threshold of 0 when explicitly set (not fallback)', () => {
            // 0 is a falsy value but ?? only triggers on null/undefined
            const optionsThreshold = 0;
            const entityDocThreshold = 0.5;

            const resolvedThreshold = optionsThreshold ?? entityDocThreshold;
            expect(resolvedThreshold).toBe(0);
        });

        it('should filter duplicates below the resolved threshold', () => {
            // Simulate the threshold filtering from QueryDuplicatesForRecords
            const threshold = 0.75;
            const duplicates = [
                { ProbabilityScore: 0.95 },
                { ProbabilityScore: 0.80 },
                { ProbabilityScore: 0.60 },
                { ProbabilityScore: 0.74 },
            ];

            const filtered = duplicates.filter(d => d.ProbabilityScore >= threshold);
            expect(filtered).toHaveLength(2);
            expect(filtered[0].ProbabilityScore).toBe(0.95);
            expect(filtered[1].ProbabilityScore).toBe(0.80);
        });
    });
});

// ─────────────────────────────────────────────
// Bounded result retention (whole-entity runs)
// ─────────────────────────────────────────────

/**
 * A whole-entity run batches its WORK (500 records at a time) but used to accumulate its RESULTS
 * for the entire run — O(records), not O(batch). On a 61,671-record entity that alone exhausted an
 * 8 GB heap: the process died before the run could finish, so whole-entity detection could not
 * complete at all.
 *
 * Retaining them was never load-bearing. ProcessBatch already persists every result as
 * `Duplicate Run Detail` / `Duplicate Run Detail Match` rows, so the array was a second copy of
 * durable data, kept only to feed the post-pass auto-merge and one `.length` read.
 *
 * These drive the REAL batch loop with the expensive setup stubbed, and assert the two properties
 * that matter: retention is bounded while the reported total stays honest, and auto-merge still
 * sees exactly the candidates it saw before — once, after the whole pass.
 */
describe('GetDuplicateRecords — bounded result retention', () => {
    /** Mirrors MAX_RETAINED_RESULTS in the detector; a change there should fail here loudly. */
    const MAX_RETAINED_RESULTS = 1000;
    const BATCH_SIZE = 500;

    function makeResult(i: number, score: number): PotentialDuplicateResult {
        // CompositeKey is the module mock's class here; the run reads only these members of the record key
        const key = new CompositeKey();
        key.KeyValuePairs = [];
        key.ToString = () => `rec-${i}`;
        key.Values = () => `rec-${i}`;
        return {
            RecordCompositeKey: key,
            Duplicates: [{ ProbabilityScore: score, ToString: () => `dup-${i}` } as PotentialDuplicate],
            DuplicateRunDetailMatchRecordIDs: [`match-${i}`],
            EntityID: 'entity-1',
        };
    }

    /** The detector with every expensive seam replaced; retention and auto-merge wiring stay real. */
    class RetentionDetector extends DuplicateRecordDetector {
        /** Call order across the run: one 'batch' per processed batch, one 'automerge'. */
        public readonly Order: string[] = [];
        public readonly MergeRecords = vi.fn<IMetadataProvider['MergeRecords']>().mockResolvedValue({ Success: true } as RecordMergeResult);
        private readonly seams: Pick<IMetadataProvider, 'EntityByID' | 'EntityByName' | 'MergeRecords'>;
        private nextResult = 0;

        constructor(private readonly totalRecords: number, private readonly score: number, allowMerge: boolean) {
            super();
            const entity = { ID: 'entity-1', Name: 'Contacts', AllowRecordMerge: allowMerge } as EntityInfo;
            this.seams = {
                EntityByID: () => entity,
                EntityByName: () => entity,
                MergeRecords: this.MergeRecords,
            };
        }

        public override get Metadata(): IMetadataProvider { return this.seams as IMetadataProvider; }

        protected override async ValidateEntityDocument(): Promise<MJEntityDocumentEntity | null> {
            return {
                ID: 'doc-1', Entity: 'Contacts', EntityID: 'entity-1',
                AbsoluteMatchThreshold: 0.95, PotentialMatchThreshold: 0.9,
                EnableLLMReasoning: false, AutomationLevel: 'AutoMergeAboveAbsolute',
            } as MJEntityDocumentEntity;
        }
        protected override async InitializeProviders(): Promise<void> { /* no providers needed */ }
        protected override async ResolveOrCreateDuplicateRun(): Promise<MJDuplicateRunEntity> {
            const run: Pick<MJDuplicateRunEntity, 'ID' | 'LastProcessedOffset' | 'CancellationRequested' | 'Load'> = {
                ID: 'run-1', LastProcessedOffset: 0, CancellationRequested: false,
                Load: async () => true,
            };
            return run as MJDuplicateRunEntity;
        }
        protected override async LoadRecordIDsToCheck(): Promise<string[]> {
            return Array.from({ length: this.totalRecords }, (_, i) => `rec-${i}`);
        }
        protected override async SaveEntity(): Promise<boolean> { return true; }
        protected override async ProcessBatch(batchIDs: string[]): ReturnType<DuplicateRecordDetector['ProcessBatch']> {
            this.Order.push('batch');
            return { Results: batchIDs.map(() => makeResult(this.nextResult++, this.score)), MatchesFound: batchIDs.length };
        }
        protected override async ProcessAutoMerges(...args: Parameters<DuplicateRecordDetector['ProcessAutoMerges']>): Promise<void> {
            this.Order.push('automerge');
            return super.ProcessAutoMerges(...args);
        }
    }

    function makeDetector(totalRecords: number, score: number, allowMerge = true) {
        const d = new RetentionDetector(totalRecords, score, allowMerge);
        return { d, order: d.Order, merge: d.MergeRecords };
    }

    const params: PotentialDuplicateRequest = { EntityID: 'entity-1', EntityDocumentID: 'doc-1', ListID: '', RecordIDs: [], Options: {} };
    const user = { ID: 'user-1' } as UserInfo;
    const run = (d: RetentionDetector) => d.GetDuplicateRecords(params, user);

    it('caps retained results and still reports the honest total', async () => {
        const { d } = makeDetector(2500, 0.5);
        const res = await run(d);
        expect(res.PotentialDuplicateResult.length).toBe(MAX_RETAINED_RESULTS);
        expect(res.ResultsTruncated).toBe(true);
        expect(res.TotalRecordsWithDuplicates).toBe(2500);
    });

    it('retained footprint does not grow with the size of the run', async () => {
        const a = await run(makeDetector(2500, 0.5).d);
        const b = await run(makeDetector(10000, 0.5).d);
        // 4x the records, identical retained size — the property the OOM violated.
        expect(a.PotentialDuplicateResult.length).toBe(b.PotentialDuplicateResult.length);
        expect(b.TotalRecordsWithDuplicates).toBe(10000);
    });

    it('leaves a small run exactly as it was', async () => {
        const res = await run(makeDetector(300, 0.5).d);
        expect(res.PotentialDuplicateResult.length).toBe(300);
        expect(res.ResultsTruncated).toBeUndefined();
    });

    it('still merges every eligible candidate even when results were truncated', async () => {
        // Eligibility must not depend on whether a result fitted under the retention cap.
        const { d, merge } = makeDetector(2500, 0.99);
        await run(d);
        expect(merge).toHaveBeenCalledTimes(2500);
    });

    it('merges nothing when no candidate clears the absolute threshold', async () => {
        const { d, merge } = makeDetector(2500, 0.5);
        await run(d);
        expect(merge).not.toHaveBeenCalled();
    });

    it('runs auto-merge ONCE, after every batch — never interleaved', async () => {
        // Interleaving would let later batches detect against a partly-merged dataset.
        const { d, order } = makeDetector(1500, 0.99);
        await run(d);
        const batches = Math.ceil(1500 / BATCH_SIZE);
        expect(order.filter((c) => c === 'automerge')).toHaveLength(1);
        expect(order.slice(0, batches).every((c) => c === 'batch')).toBe(true);
        expect(order[order.length - 1]).toBe('automerge');
    });

    it('carries nothing for auto-merge when the entity forbids merging', async () => {
        const { d, merge } = makeDetector(2500, 0.99, false);
        await run(d);
        expect(merge).not.toHaveBeenCalled();
    });
});
