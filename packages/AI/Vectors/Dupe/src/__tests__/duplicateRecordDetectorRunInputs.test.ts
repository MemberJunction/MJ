import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { EntityInfo, RunViewParams } from '@memberjunction/core';

/**
 * Which records a detection run checks. NO live DB, NO vector DB, NO model.
 *
 * The three record-id loads ran without `IgnoreMaxRows`, so RunView fell back to the entity's
 * `UserViewMaxRows` and returned the first 1,000 ids. `TotalItemCount` was then set from that page,
 * so a run over 61,671 records read "1000 of 1000 complete": success while doing almost nothing.
 *
 * `@memberjunction/core` is the real module (only logging is stubbed), so CompositeKey and the
 * request classes are exercised as shipped; the engines around the detector are mocked as in
 * duplicateRecordDetectorPrimaryKeys.test.ts.
 */

// ─────────────────────────────────────────────
// Hoisted mocks
// ─────────────────────────────────────────────

const { mockRunViewFn, mockSaveEntity, mockCreateInstance, mockGetVectorIndexByID, mockEntityByID } = vi.hoisted(() => ({
    mockRunViewFn: vi.fn(),
    mockSaveEntity: vi.fn(),
    mockCreateInstance: vi.fn(),
    mockGetVectorIndexByID: vi.fn(),
    mockEntityByID: vi.fn(),
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
            GetVectorIndexByID: mockGetVectorIndexByID,
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
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { Instance: { Models: [], VectorDatabases: [] } },
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

import { PotentialDuplicateRequest } from '@memberjunction/core';
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
