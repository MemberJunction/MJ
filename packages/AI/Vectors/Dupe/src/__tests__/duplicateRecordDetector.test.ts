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
});
