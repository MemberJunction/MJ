import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BaseEntity, EntityInfo, RunViewParams } from '@memberjunction/core';
import type { EmbeddingRunParams, EmbeddingRunResult } from '@memberjunction/ai-prompts';
import type {
    MJDuplicateRunDetailEntity,
    MJDuplicateRunEntity,
    MJEntityDocumentEntity,
} from '@memberjunction/core-entities';

/**
 * What a detection run reads before it compares anything: WHICH records it checks, and HOW WIDE
 * the probe vectors are. NO live DB, NO vector DB, NO model.
 *
 * Both defects made a run report success while doing almost nothing:
 *
 * - The three record-id loads ran without `IgnoreMaxRows`, so RunView fell back to the entity's
 *   `UserViewMaxRows` and returned the first 1,000 ids. `TotalItemCount` was then set from that
 *   page, so a run over 61,671 records read "1000 of 1000 complete".
 * - The probe was embedded at the model's default width, never the index's `Dimensions`. The
 *   write path (entity vector sync) honours `Dimensions`, so a 512-wide index was queried with
 *   1,536-wide vectors: the vector DB rejected every query and the run completed with no matches.
 *
 * `@memberjunction/core` is the real module (only logging is stubbed), so CompositeKey and the
 * request classes are exercised as shipped; the engines around the detector are mocked as in
 * duplicateRecordDetectorPrimaryKeys.test.ts.
 */

// ─────────────────────────────────────────────
// Hoisted mocks
// ─────────────────────────────────────────────

const { mockRunViewFn, mockSaveEntity, mockCreateInstance, mockGetVectorIndexByID, mockEntityByID, embeddingRequests } = vi.hoisted(() => ({
    mockRunViewFn: vi.fn(),
    mockSaveEntity: vi.fn(),
    mockCreateInstance: vi.fn(),
    mockGetVectorIndexByID: vi.fn(),
    mockEntityByID: vi.fn(),
    /** Every request the detector sent to the embedding runner, in order. */
    embeddingRequests: [] as EmbeddingRunParams[],
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        RegisterClass: () => () => { /* no-op */ },
        MJGlobal: { Instance: { ClassFactory: { CreateInstance: mockCreateInstance } } },
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});

/** The embedding runner double: records each request and answers with one vector per text. */
vi.mock('@memberjunction/ai-prompts', () => ({
    AIEmbeddingRunner: class {
        async RunEmbedding(params: EmbeddingRunParams): Promise<EmbeddingRunResult> {
            embeddingRequests.push(params);
            return {
                Success: true,
                Vectors: params.Texts.map(() => [0.1, 0.2]),
                PromptRunID: null,
                TokensUsed: 0,
                Cost: 0,
                ErrorMessage: null,
                ExecutionTimeMs: 0,
            };
        }
    },
}));

vi.mock('@memberjunction/ai', () => ({
    BaseEmbeddings: class {},
    GetAIAPIKey: vi.fn().mockReturnValue(''),
}));

vi.mock('@memberjunction/ai-vectordb', () => ({
    VectorDBBase: class {},
    BaseResponse: class {},
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJDuplicateRunDetailEntity: vi.fn(),
    MJDuplicateRunDetailMatchEntity: vi.fn(),
    MJDuplicateRunEntity: vi.fn(),
    MJEntityDocumentEntity: vi.fn(),
    MJListDetailEntity: vi.fn(),
    MJListEntity: vi.fn(),
    RecordComparisonCompareOperation: class {},
    KnowledgeHubMetadataEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            EntityDocuments: [],
            VectorIndexes: [],
            GetEntityDocumentByID: vi.fn().mockReturnValue(undefined),
        },
    },
}));

vi.mock('@memberjunction/ai-vectors', () => ({
    VectorBase: class VectorBase {
        _runView = { RunView: mockRunViewFn, RunViews: vi.fn() };
        _metadata = { EntityByID: mockEntityByID, EntityByName: vi.fn() };
        _currentUser: Record<string, unknown> = { ID: 'user-1' };

        get Metadata() { return this._metadata; }
        get RunView() { return this._runView; }
        get CurrentUser() { return this._currentUser; }
        set CurrentUser(user: unknown) { this._currentUser = user as Record<string, unknown>; }
        SaveEntity = mockSaveEntity;
        /** A saved view that exists: LoadRecordIDsFromView only checks that it does. */
        RunViewForSingleValue = vi.fn().mockResolvedValue({ ID: 'view-1' });
        GetAIModel = vi.fn().mockReturnValue({ ID: 'model-1', DriverClass: 'TestEmbeddings', APIName: 'test-embedding-model' });
        GetVectorDatabase = vi.fn().mockReturnValue({ ID: 'vdb-1', ClassKey: 'TestVectorDB', Configuration: null });
        BuildExtraFilter = vi.fn().mockReturnValue("ID = 'rec-1'");
    },
}));

vi.mock('@memberjunction/ai-vector-sync', () => ({
    EntityDocumentTemplateParser: { CreateInstance: vi.fn() },
    EntityVectorSyncer: class { CurrentUser = null; },
    VectorizeEntityParams: class {},
    GetEntityDocumentRecordFilter: vi.fn().mockReturnValue(null),
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Models: [],
            VectorDatabases: [],
            GetVectorIndexByID: mockGetVectorIndexByID,
            // Mirrors the real engine: the provider-side name is ExternalID, falling back to Name.
            GetProviderIndexName: (v: { Name: string; ExternalID?: string | null }) => v.ExternalID?.trim() || v.Name,
        },
    },
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
    MJAIModelEntityExtended: vi.fn(),
}));

vi.mock('@memberjunction/templates', () => ({
    TemplateEngineServer: { Instance: { Config: vi.fn(), SetupNunjucks: vi.fn(), Templates: [], RenderTemplate: vi.fn() } },
}));

// ─────────────────────────────────────────────
// Import after mocks
// ─────────────────────────────────────────────

import { CompositeKey, PotentialDuplicateRequest, PotentialDuplicateResult } from '@memberjunction/core';
import { DuplicateRecordDetector } from '../duplicateRecordDetector';

/** A minimal entity-info double exposing only the members the detector reads. */
function fakeEntity(name: string, primaryKeys: string[]): EntityInfo {
    const pks = primaryKeys.map((n) => ({ Name: n }));
    return { ID: `${name}-id`, Name: name, PrimaryKeys: pks, FirstPrimaryKey: pks[0], Fields: [] } as unknown as EntityInfo;
}

const CUSTOMERS = fakeEntity('Customers', ['ID']);

function request(fields: Partial<PotentialDuplicateRequest>): PotentialDuplicateRequest {
    const req = new PotentialDuplicateRequest();
    req.EntityID = CUSTOMERS.ID;
    req.RecordIDs = [];
    return Object.assign(req, fields);
}

// ─────────────────────────────────────────────
// Which records a run checks
// ─────────────────────────────────────────────

/** The entity's `UserViewMaxRows`: what RunView returns when the caller sets no limit of its own. */
const USER_VIEW_MAX_ROWS = 1000;

/**
 * Serves `rows` under the row-limit rule of GenericDatabaseProvider.RunView: `IgnoreMaxRows` returns
 * every row, else `MaxRows`, else the entity's `UserViewMaxRows`.
 */
function serveRows(rows: Record<string, unknown>[]): void {
    mockRunViewFn.mockImplementation(async (params: RunViewParams) => {
        let limit = USER_VIEW_MAX_ROWS;
        if (params.IgnoreMaxRows === true) {
            limit = rows.length;
        } else if (params.MaxRows && params.MaxRows > 0) {
            limit = params.MaxRows;
        }
        const served = rows.slice(0, limit);
        return { Success: true, Results: served, RowCount: served.length, TotalRowCount: rows.length };
    });
}

/** Exposes the record-id loading seam. */
class LoaderHarness extends DuplicateRecordDetector {
    public recordIDsToCheck(params: PotentialDuplicateRequest, entity: EntityInfo): Promise<string[]> {
        return this.LoadRecordIDsToCheck(params, entity);
    }
}

describe('DuplicateRecordDetector — a run checks every record, not the first UserViewMaxRows', () => {
    /** More rows than one default RunView page. */
    const TOTAL = 2500;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('a list run loads every list member', async () => {
        serveRows(Array.from({ length: TOTAL }, (_, i) => ({ RecordID: `rec-${i}` })));
        const ids = await new LoaderHarness().recordIDsToCheck(request({ ListID: 'list-1' }), CUSTOMERS);
        expect(ids).toHaveLength(TOTAL);
        expect(ids[TOTAL - 1]).toBe(`rec-${TOTAL - 1}`);
    });

    it('a view run loads every row the view returns', async () => {
        serveRows(Array.from({ length: TOTAL }, (_, i) => ({ ID: `rec-${i}` })));
        const ids = await new LoaderHarness().recordIDsToCheck(request({ ViewID: 'view-1' }), CUSTOMERS);
        expect(ids).toHaveLength(TOTAL);
        expect(ids[TOTAL - 1]).toBe(`rec-${TOTAL - 1}`);
    });

    it('a filtered or whole-entity run loads every matching row', async () => {
        serveRows(Array.from({ length: TOTAL }, (_, i) => ({ ID: `rec-${i}` })));
        const ids = await new LoaderHarness().recordIDsToCheck(request({ ExtraFilter: "Status = 'Active'" }), CUSTOMERS);
        expect(ids).toHaveLength(TOTAL);
        expect(ids[TOTAL - 1]).toBe(`rec-${TOTAL - 1}`);
    });
});

// ─────────────────────────────────────────────
// How wide the probe vectors are
// ─────────────────────────────────────────────

/** A vector-DB double that needs no key; the queries themselves are stubbed on the harness. */
const FAKE_VECTOR_DB = { SupportsColocatedQuery: false, RequiresAPIKey: false };

const ENTITY_DOCUMENT = {
    ID: 'doc-1',
    Name: 'Customer Duplicates',
    Entity: 'Customers',
    EntityID: CUSTOMERS.ID,
    AIModelID: 'model-1',
    VectorDatabaseID: 'vdb-1',
    VectorIndexID: 'vi-1',
    EnableLLMReasoning: false,
} as unknown as MJEntityDocumentEntity;

function duplicateRun(): MJDuplicateRunEntity {
    return {
        ID: 'run-1',
        LastProcessedOffset: 0,
        CancellationRequested: false,
        Load: vi.fn().mockResolvedValue(true),
    } as unknown as MJDuplicateRunEntity;
}

function sourceRecords(count: number): BaseEntity[] {
    return Array.from({ length: count }, () => ({}) as unknown as BaseEntity);
}

/**
 * Stubs everything around the two embedding calls. `InitializeProviders` is NOT stubbed: reading
 * the vector index is the code under test. The embedding runner is the `@memberjunction/ai-prompts`
 * double above, which records every `RunEmbedding` request in `embeddingRequests`.
 */
class ProbeHarness extends DuplicateRecordDetector {
    protected override async ValidateEntityDocument(): Promise<MJEntityDocumentEntity | null> {
        return ENTITY_DOCUMENT;
    }
    protected override async ResolveOrCreateDuplicateRun(): Promise<MJDuplicateRunEntity> {
        return duplicateRun();
    }
    protected override async LoadRecordIDsToCheck(): Promise<string[]> {
        return ['rec-1', 'rec-2'];
    }
    protected override async LoadRecordsByKeys(compositeKeys: CompositeKey[]): Promise<BaseEntity[]> {
        return sourceRecords(compositeKeys.length);
    }
    protected override buildSourceMetadataMap(): Map<string, string> {
        return new Map();
    }
    protected override async CreateRunDetailRecords(): Promise<MJDuplicateRunDetailEntity[]> {
        return [];
    }
    protected override async GenerateTemplateTexts(_parser: unknown, _doc: unknown, records: BaseEntity[]): Promise<string[]> {
        return records.map((_, i) => `record ${i}`);
    }
    protected override async QueryDuplicatesForRecords() {
        return [];
    }
    protected override async FilterNonExistentMatches(): Promise<void> {
        // nothing was matched, so nothing to filter
    }
    protected override async PersistMatchResults(): Promise<PotentialDuplicateResult[]> {
        return [];
    }
}

describe('DuplicateRecordDetector — the probe is embedded at the vector index width', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        embeddingRequests.length = 0;
        mockCreateInstance.mockReturnValue(FAKE_VECTOR_DB);
        mockSaveEntity.mockResolvedValue(true);
        mockEntityByID.mockReturnValue(CUSTOMERS);
    });

    it('a batch run asks the model for vectors as wide as the index', async () => {
        mockGetVectorIndexByID.mockReturnValue({ ID: 'vi-1', Name: 'customers-512', Dimensions: 512 });

        const response = await new ProbeHarness().GetDuplicateRecords(request({ EntityDocumentID: ENTITY_DOCUMENT.ID }));

        expect(response.Status).toBe('Success');
        expect(embeddingRequests).toHaveLength(1);
        expect(embeddingRequests[0].Dimensions).toBe(512);
    });

    it('a single-record check asks for the same width', async () => {
        mockGetVectorIndexByID.mockReturnValue({ ID: 'vi-1', Name: 'customers-512', Dimensions: 512 });
        mockRunViewFn.mockResolvedValue({ Success: true, Results: sourceRecords(1) });

        await new ProbeHarness().CheckSingleRecord(ENTITY_DOCUMENT.ID, CompositeKey.FromKeyValuePair('ID', 'rec-1'));

        expect(embeddingRequests).toHaveLength(1);
        expect(embeddingRequests[0].Dimensions).toBe(512);
    });

    it('an index with no configured width leaves the model at its default', async () => {
        mockGetVectorIndexByID.mockReturnValue({ ID: 'vi-1', Name: 'customers-default', Dimensions: null });

        await new ProbeHarness().GetDuplicateRecords(request({ EntityDocumentID: ENTITY_DOCUMENT.ID }));

        expect(embeddingRequests).toHaveLength(1);
        expect(embeddingRequests[0].Dimensions).toBeUndefined();
    });
});
