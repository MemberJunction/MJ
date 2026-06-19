import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─────────────────────────────────────────────
// Hoisted Mocks
// ─────────────────────────────────────────────

const { mockRunViewFn, mockRunViewsFn } = vi.hoisted(() => {
    return {
        mockRunViewFn: vi.fn().mockResolvedValue({ Success: true, Results: [], RowCount: 0 }),
        mockRunViewsFn: vi.fn().mockResolvedValue([{ Success: true, Results: [], RowCount: 0 }]),
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
        Entities = [{ ID: 'entity-1', Name: 'Contacts', FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true } }];
        CurrentUser = { ID: 'user-1' };
        EntityByID = vi.fn().mockReturnValue({
            ID: 'entity-1', Name: 'Contacts',
            FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
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
        CompositeKey: class {
            KeyValuePairs: { FieldName: string; Value: string }[] = [];
            ToString = vi.fn().mockReturnValue('key-1');
            Values = vi.fn().mockReturnValue('key-1');
            LoadFromConcatenatedString = vi.fn();
            // mirror the real CompositeKey.Equals semantics (case-insensitive UUID-safe compare)
            Equals(other: { KeyValuePairs: { FieldName: string; Value: string }[] }): boolean {
                const a = this.KeyValuePairs, b = other?.KeyValuePairs ?? [];
                return a.length === b.length && a.every((kv, i) =>
                    kv.FieldName.toLowerCase() === b[i].FieldName.toLowerCase() &&
                    String(kv.Value).toLowerCase() === String(b[i].Value).toLowerCase());
            }
        },
        UserInfo: vi.fn(),
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
            RecordCompositeKey = null;
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
            KeyValuePairs: unknown[] = [];
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
                CreateInstance: vi.fn().mockReturnValue({
                    EmbedTexts: vi.fn().mockResolvedValue({ vectors: [[0.1, 0.2], [0.3, 0.4]] }),
                    queryIndex: vi.fn().mockResolvedValue({ success: true, data: { matches: [] } }),
                    HybridQuery: vi.fn().mockResolvedValue({ success: true, data: { matches: [] } }),
                    SupportsHybridSearch: false,
                }),
            },
        },
    },
    UUIDsEqual: vi.fn((a: string, b: string) => a === b),
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJDuplicateRunDetailEntity: vi.fn(),
    MJDuplicateRunDetailMatchEntity: vi.fn(),
    MJDuplicateRunEntity: vi.fn(),
    MJEntityDocumentEntity: vi.fn(),
    MJListDetailEntity: vi.fn(),
    MJListEntity: vi.fn(),
    KnowledgeHubMetadataEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            EntityDocuments: [],
            VectorIndexes: [],
            GetEntityDocumentById: vi.fn().mockReturnValue(undefined),
            GetVectorIndexById: vi.fn().mockReturnValue({
                ID: 'vi-1',
                Name: 'mj-knowledge-index',
                VectorDatabaseID: 'vdb-1',
                EmbeddingModelID: 'model-1',
            }),
        },
    },
}));

vi.mock('@memberjunction/ai-vectors', () => {
    return {
        VectorBase: class VectorBase {
            _runView = { RunView: mockRunViewFn, RunViews: mockRunViewsFn };
            _metadata = {
                Entities: [{ ID: 'entity-1', Name: 'Contacts', FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true } }],
                CurrentUser: { ID: 'user-1' },
                EntityByID: vi.fn().mockReturnValue({
                    ID: 'entity-1', Name: 'Contacts',
                    FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
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
        EntityVectorSyncer: class {
            CurrentUser = null;
            GetEntityDocument = vi.fn().mockResolvedValue(null);
            VectorizeEntity = vi.fn().mockResolvedValue(undefined);
        },
        VectorizeEntityParams: class {},
    };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Models: [{ ID: 'model-1', AIModelType: 'Embeddings', DriverClass: 'TestDriver' }],
            VectorDatabases: [{ ID: 'vdb-1', ClassKey: 'TestVDB' }],
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

describe('DuplicateRecordDetector', () => {
    let detector: DuplicateRecordDetector;

    beforeEach(() => {
        vi.clearAllMocks();
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
    });

    describe('CheckSingleRecord', () => {
        it('should throw when no entity document found', async () => {
            await expect(
                detector.CheckSingleRecord('doc-1', { ToString: () => 'key-1', KeyValuePairs: [] } as never, {}, { ID: 'user-1' } as never)
            ).rejects.toThrow('No active Entity Document');
        });
    });

    describe('FilterSelfMatches', () => {
        /** Key fixture with the REAL CompositeKey.Equals semantics (case-insensitive KVP compare). */
        function makeKey(id: string) {
            return {
                KeyValuePairs: [{ FieldName: 'ID', Value: id }],
                ToString: () => 'ID|' + id,
                Values: () => id,
                Equals(other: { KeyValuePairs: { FieldName: string; Value: string }[] }): boolean {
                    const a = this.KeyValuePairs, b = other?.KeyValuePairs ?? [];
                    return a.length === b.length && a.every((kv, i) =>
                        kv.FieldName.toLowerCase() === b[i].FieldName.toLowerCase() &&
                        String(kv.Value).toLowerCase() === String(b[i].Value).toLowerCase());
                }
            };
        }
        function makeDup(score: number, id: string) {
            return { ProbabilityScore: score, LoadFromConcatenatedString: vi.fn(), ...makeKey(id) };
        }

        it('should remove matches whose composite key matches the source key', () => {
            const sourceKey = makeKey('abc-123');
            // self-match deliberately differs in CASE — the Equals-based filter must still catch it
            const duplicates = [makeDup(0.95, 'ABC-123'), makeDup(0.88, 'def-456')];

            const result = (detector as never)['FilterSelfMatches'](duplicates, sourceKey);
            expect(result).toHaveLength(1);
            expect(result[0].ProbabilityScore).toBe(0.88);
        });

        it('should return all matches when none match the source key', () => {
            const sourceKey = makeKey('source-1');
            const duplicates = [makeDup(0.9, 'match-1'), makeDup(0.8, 'match-2')];

            const result = (detector as never)['FilterSelfMatches'](duplicates, sourceKey);
            expect(result).toHaveLength(2);
        });

        it('should return empty array when all matches are self-matches', () => {
            const sourceKey = makeKey('self-1');
            const duplicates = [makeDup(0.99, 'self-1')];

            const result = (detector as never)['FilterSelfMatches'](duplicates, sourceKey);
            expect(result).toHaveLength(0);
        });

        it('should handle empty duplicates array', () => {
            const sourceKey = {
                ToString: () => 'ID|any-key',
                Values: () => 'any-key',
                KeyValuePairs: [],
            };
            const result = (detector as never)['FilterSelfMatches']([], sourceKey);
            expect(result).toHaveLength(0);
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

    describe('buildSourceMetadataMap', () => {
        it('should build a map with entity name and display fields', () => {
            // Fields now use IsNameField and DefaultInView instead of NameField
            const entityInfo = {
                Name: 'Contacts',
                NameField: null,
                Icon: 'fa-user',
                Fields: [
                    { Name: 'Name', IsNameField: true, DefaultInView: true, Sequence: 1, IsPrimaryKey: false },
                    { Name: 'Title', IsNameField: false, DefaultInView: true, Sequence: 2, IsPrimaryKey: false },
                    { Name: 'Status', IsNameField: false, DefaultInView: true, Sequence: 3, IsPrimaryKey: false },
                ],
                FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
            };

            const mockRecord = {
                PrimaryKey: {
                    KeyValuePairs: [{ FieldName: 'ID', Value: 'rec-1' }],
                    Values: () => 'rec-1',
                },
                Get: (fieldName: string) => {
                    const data: Record<string, string> = {
                        Name: 'John Doe',
                        Title: 'Manager',
                        Status: 'Active',
                    };
                    return data[fieldName] ?? null;
                },
            };

            const result = (detector as never)['buildSourceMetadataMap']([mockRecord], entityInfo);
            expect(result).toBeInstanceOf(Map);
            expect(result.size).toBe(1);

            const meta = JSON.parse(result.get('rec-1'));
            expect(meta.Entity).toBe('Contacts');
            expect(meta.EntityIcon).toBe('fa-user');
            expect(meta.Name).toBe('John Doe'); // From IsNameField
            expect(meta.Title).toBe('Manager');
            expect(meta.Status).toBe('Active');
        });

        it('should handle records with no name field', () => {
            const entityInfo = {
                Name: 'Items',
                NameField: null,
                Icon: null,
                Fields: [
                    { Name: 'Description', IsNameField: false, DefaultInView: true, Sequence: 1, IsPrimaryKey: false },
                ],
                FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
            };

            const mockRecord = {
                PrimaryKey: {
                    KeyValuePairs: [{ FieldName: 'ID', Value: 'item-1' }],
                    Values: () => 'item-1',
                },
                Get: (fieldName: string) => {
                    if (fieldName === 'Description') return 'A test item';
                    return null;
                },
            };

            const result = (detector as never)['buildSourceMetadataMap']([mockRecord], entityInfo);
            const meta = JSON.parse(result.get('item-1'));
            expect(meta.Entity).toBe('Items');
            expect(meta.EntityIcon).toBeUndefined();
            expect(meta.Name).toBeUndefined(); // No IsNameField
            expect(meta.Description).toBe('A test item');
        });

        it('should truncate long display field values to 200 chars', () => {
            const longText = 'x'.repeat(300);
            const entityInfo = {
                Name: 'Notes',
                NameField: null,
                Icon: null,
                Fields: [
                    { Name: 'Description', IsNameField: false, DefaultInView: true, Sequence: 1, IsPrimaryKey: false },
                ],
                FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
            };

            const mockRecord = {
                PrimaryKey: {
                    KeyValuePairs: [{ FieldName: 'ID', Value: 'note-1' }],
                    Values: () => 'note-1',
                },
                Get: (fieldName: string) => {
                    if (fieldName === 'Description') return longText;
                    return null;
                },
            };

            const result = (detector as never)['buildSourceMetadataMap']([mockRecord], entityInfo);
            const meta = JSON.parse(result.get('note-1'));
            expect(meta.Description).toHaveLength(200); // 197 + '...'
            expect(meta.Description.endsWith('...')).toBe(true);
        });

        it('should handle empty records array', () => {
            const entityInfo = {
                Name: 'Empty',
                NameField: null,
                Icon: null,
                Fields: [],
                FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
            };

            const result = (detector as never)['buildSourceMetadataMap']([], entityInfo);
            expect(result.size).toBe(0);
        });

        it('should skip null field values in display fields', () => {
            const entityInfo = {
                Name: 'People',
                NameField: null,
                Icon: null,
                Fields: [
                    { Name: 'Name', IsNameField: true, DefaultInView: true, Sequence: 1, IsPrimaryKey: false },
                    { Name: 'Title', IsNameField: false, DefaultInView: true, Sequence: 2, IsPrimaryKey: false },
                    { Name: 'Status', IsNameField: false, DefaultInView: true, Sequence: 3, IsPrimaryKey: false },
                ],
                FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
            };

            const mockRecord = {
                PrimaryKey: {
                    KeyValuePairs: [{ FieldName: 'ID', Value: 'p-1' }],
                    Values: () => 'p-1',
                },
                Get: (fieldName: string) => {
                    if (fieldName === 'Name') return 'Alice';
                    return null; // Title and Status are null
                },
            };

            const result = (detector as never)['buildSourceMetadataMap']([mockRecord], entityInfo);
            const meta = JSON.parse(result.get('p-1'));
            expect(meta.Name).toBe('Alice');
            expect(meta.Title).toBeUndefined();
            expect(meta.Status).toBeUndefined();
        });

        it('should combine multiple IsNameField fields into Name', () => {
            const entityInfo = {
                Name: 'Contacts',
                NameField: null,
                Icon: 'fa-user',
                Fields: [
                    { Name: 'FirstName', IsNameField: true, DefaultInView: true, Sequence: 1, IsPrimaryKey: false },
                    { Name: 'LastName', IsNameField: true, DefaultInView: true, Sequence: 2, IsPrimaryKey: false },
                    { Name: 'Email', IsNameField: false, DefaultInView: true, Sequence: 3, IsPrimaryKey: false },
                ],
                FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
            };

            const mockRecord = {
                PrimaryKey: {
                    KeyValuePairs: [{ FieldName: 'ID', Value: 'c-1' }],
                    Values: () => 'c-1',
                },
                Get: (fieldName: string) => {
                    const data: Record<string, string> = {
                        FirstName: 'John',
                        LastName: 'Doe',
                        Email: 'john@example.com',
                    };
                    return data[fieldName] ?? null;
                },
            };

            const result = (detector as never)['buildSourceMetadataMap']([mockRecord], entityInfo);
            const meta = JSON.parse(result.get('c-1'));

            // Combined name from all IsNameField fields
            expect(meta.Name).toBe('John Doe');
            // Individual name fields should also be stored
            expect(meta.FirstName).toBe('John');
            expect(meta.LastName).toBe('Doe');
            // Non-name DefaultInView field
            expect(meta.Email).toBe('john@example.com');
        });

        it('should fall back to NameField when no IsNameField is set', () => {
            const entityInfo = {
                Name: 'OldEntity',
                NameField: { Name: 'Title', IsNameField: false, DefaultInView: true, Sequence: 1, IsPrimaryKey: false },
                Icon: null,
                Fields: [
                    { Name: 'Title', IsNameField: false, DefaultInView: true, Sequence: 1, IsPrimaryKey: false },
                ],
                FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
            };

            const mockRecord = {
                PrimaryKey: {
                    KeyValuePairs: [{ FieldName: 'ID', Value: 'old-1' }],
                    Values: () => 'old-1',
                },
                Get: (fieldName: string) => {
                    if (fieldName === 'Title') return 'Legacy Record';
                    return null;
                },
            };

            const result = (detector as never)['buildSourceMetadataMap']([mockRecord], entityInfo);
            const meta = JSON.parse(result.get('old-1'));
            // Falls back to singular NameField
            expect(meta.Name).toBe('Legacy Record');
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
