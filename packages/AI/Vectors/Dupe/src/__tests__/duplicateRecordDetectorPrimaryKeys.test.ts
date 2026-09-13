import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CompositeKey as CompositeKeyType, EntityInfo } from '@memberjunction/core';
import type { MJDuplicateRunDetailEntity } from '@memberjunction/core-entities';

/**
 * Primary-key handling in the duplicate detector. NO live DB, NO vector DB.
 *
 * The entity being de-duplicated is whatever the Entity Document points at — a customer
 * entity keyed by any column name(s). Every id the detector carries between steps is a compact
 * CompositeKey URL segment (the bare value for a single-column key, `F1|v1||F2|v2` for a
 * composite key), and every filter / persisted RecordID is rebuilt from the entity's REAL
 * primary key(s). The previous code read `FirstPrimaryKey.Name` everywhere, which truncated a
 * composite key to its first column: two `(OrderID, LineNo)` rows sharing an OrderID were the
 * same record as far as the detector could tell.
 *
 * `@memberjunction/core` is the real module here (only logging is stubbed) so the actual
 * CompositeKey primitives are exercised; the surrounding engines are mocked as in
 * duplicateRecordDetector.test.ts.
 */

// ─────────────────────────────────────────────
// Hoisted mocks
// ─────────────────────────────────────────────

const { mockRunViewFn, mockGetEntityObject, mockSaveEntity } = vi.hoisted(() => ({
    mockRunViewFn: vi.fn(),
    mockGetEntityObject: vi.fn(),
    mockSaveEntity: vi.fn(),
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        RegisterClass: () => () => { /* no-op */ },
        MJGlobal: { Instance: { ClassFactory: { CreateInstance: vi.fn() } } },
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});

vi.mock('@memberjunction/ai', () => ({
    BaseEmbeddings: vi.fn(),
    GetAIAPIKey: vi.fn().mockReturnValue('mock-api-key'),
}));

vi.mock('@memberjunction/ai-vectordb', () => ({
    VectorDBBase: vi.fn(),
    BaseResponse: vi.fn(),
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
            GetVectorIndexByID: vi.fn().mockReturnValue(undefined),
        },
    },
}));

vi.mock('@memberjunction/ai-vectors', () => ({
    VectorBase: class VectorBase {
        _runView = { RunView: mockRunViewFn, RunViews: vi.fn() };
        _metadata = { GetEntityObject: mockGetEntityObject, EntityByID: vi.fn() };
        _currentUser: Record<string, unknown> = { ID: 'user-1' };

        get Metadata() { return this._metadata; }
        get RunView() { return this._runView; }
        get CurrentUser() { return this._currentUser; }
        set CurrentUser(user: unknown) { this._currentUser = user as Record<string, unknown>; }
        SaveEntity = mockSaveEntity;
        RunViewForSingleValue = vi.fn().mockResolvedValue(null);
        /** Mirrors the real VectorBase.BuildExtraFilter so composite-key loads are exercised faithfully. */
        BuildExtraFilter(compositeKeys: CompositeKeyType[]): string {
            return compositeKeys.map((key) =>
                key.KeyValuePairs.map((kv) => `${kv.FieldName} = '${String(kv.Value).replace(/'/g, "''")}'`).join(' AND ')
            ).join('\n OR ');
        }
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

import { CompositeKey, PotentialDuplicate, PotentialDuplicateResult } from '@memberjunction/core';
import { DuplicateRecordDetector } from '../duplicateRecordDetector';

/** Structural twin of the detector's module-private `RecordQueryResult` (the shape FilterNonExistentMatches mutates). */
interface RecordQueryResult {
    SourceKey: CompositeKey;
    TemplateText: string;
    Duplicates: PotentialDuplicateResult;
}

/** A minimal entity-info double exposing only the members the key-handling code reads. */
function fakeEntity(name: string, primaryKeys: string[]): EntityInfo {
    const pks = primaryKeys.map((n) => ({ Name: n }));
    return { ID: `${name}-id`, Name: name, PrimaryKeys: pks, FirstPrimaryKey: pks[0], Fields: [] } as unknown as EntityInfo;
}

const INDIVIDUALS = fakeEntity('Individuals', ['individual_id']);
const ORDER_LINES = fakeEntity('OrderLines', ['OrderID', 'LineNo']);

/** Exposes the protected seams under test. */
class TestableDetector extends DuplicateRecordDetector {
    public idsFromEntity(entity: EntityInfo, filter?: string): Promise<string[]> {
        return this.LoadRecordIDsFromEntity(entity, filter);
    }
    public existingIDs(entity: EntityInfo, ids: string[]): Promise<Set<string>> {
        return this.LoadExistingRecordIDs(entity, entity.FirstPrimaryKey.Name, ids); // first-pk-ok: mirrors the production caller; only read for a single-column key
    }
    public runDetails(ids: string[], entity: EntityInfo): Promise<MJDuplicateRunDetailEntity[]> {
        return this.CreateRunDetailRecords(ids, 'run-1', entity);
    }
    public recordsByList(listID: string, entityID: string) {
        return this.LoadRecordsByListID(listID, entityID);
    }
    public filterGhosts(results: RecordQueryResult[], entity: EntityInfo): Promise<void> {
        return this.FilterNonExistentMatches(results, entity);
    }
}

function lastRunViewParams(): Record<string, unknown> {
    const calls = mockRunViewFn.mock.calls;
    return calls[calls.length - 1][0] as Record<string, unknown>;
}

describe('DuplicateRecordDetector — primary keys of any shape', () => {
    let detector: TestableDetector;

    beforeEach(() => {
        vi.clearAllMocks();
        mockSaveEntity.mockResolvedValue(true);
        detector = new TestableDetector();
    });

    describe('LoadRecordIDsFromEntity', () => {
        it('selects the real single key column and returns its bare values', async () => {
            mockRunViewFn.mockResolvedValueOnce({ Success: true, Results: [{ individual_id: 42 }, { individual_id: 43 }] });
            const ids = await detector.idsFromEntity(INDIVIDUALS, 'Status = 1');
            expect(lastRunViewParams().Fields).toEqual(['individual_id']);
            expect(lastRunViewParams().ExtraFilter).toBe('Status = 1');
            expect(ids).toEqual(['42', '43']);
        });

        it('selects every key column of a composite key and returns full segments', async () => {
            mockRunViewFn.mockResolvedValueOnce({ Success: true, Results: [{ OrderID: 11055, LineNo: 3 }, { OrderID: 11055, LineNo: 4 }] });
            const ids = await detector.idsFromEntity(ORDER_LINES);
            expect(lastRunViewParams().Fields).toEqual(['OrderID', 'LineNo']);
            expect(ids).toEqual(['OrderID|11055||LineNo|3', 'OrderID|11055||LineNo|4']);
        });
    });

    describe('LoadExistingRecordIDs', () => {
        it('uses one IN() over the real single key column', async () => {
            mockRunViewFn.mockResolvedValueOnce({ Success: true, Results: [{ individual_id: '42' }] });
            const existing = await detector.existingIDs(INDIVIDUALS, ['42', "a'b"]);
            expect(lastRunViewParams().ExtraFilter).toBe("individual_id IN ('42','a''b')");
            expect(lastRunViewParams().Fields).toEqual(['individual_id']);
            expect([...existing]).toEqual(['42']);
        });

        it('emits one (F1=.. AND F2=..) term per record for a composite key and reads back full segments', async () => {
            mockRunViewFn.mockResolvedValueOnce({ Success: true, Results: [{ OrderID: 11055, LineNo: 3 }] });
            const existing = await detector.existingIDs(ORDER_LINES, ['OrderID|11055||LineNo|3', 'OrderID|11055||LineNo|9']);
            expect(lastRunViewParams().ExtraFilter).toBe("(OrderID='11055' AND LineNo='3') OR (OrderID='11055' AND LineNo='9')");
            expect(lastRunViewParams().Fields).toEqual(['OrderID', 'LineNo']);
            expect([...existing]).toEqual(['orderid|11055||lineno|3']);
        });
    });

    describe('FilterNonExistentMatches', () => {
        function queryResult(source: CompositeKey, dupes: CompositeKey[]): RecordQueryResult {
            const result = new PotentialDuplicateResult();
            result.Duplicates = dupes.map((k) => {
                const d = new PotentialDuplicate();
                d.KeyValuePairs = k.KeyValuePairs;
                return d;
            });
            return { SourceKey: source, TemplateText: '', Duplicates: result };
        }

        it('drops a composite-key ghost while keeping the live match, comparing whole keys', async () => {
            const live = CompositeKey.FromURLSegment(ORDER_LINES, 'OrderID|11055||LineNo|3');
            const ghost = CompositeKey.FromURLSegment(ORDER_LINES, 'OrderID|11055||LineNo|9');
            const qr = queryResult(CompositeKey.FromURLSegment(ORDER_LINES, 'OrderID|1||LineNo|1'), [live, ghost]);
            // Only LineNo 3 still exists — same OrderID as the ghost, so a first-column compare could not tell them apart.
            mockRunViewFn.mockResolvedValueOnce({ Success: true, Results: [{ OrderID: 11055, LineNo: 3 }] });

            await detector.filterGhosts([qr], ORDER_LINES);

            expect(qr.Duplicates.Duplicates.map((d) => d.ToCompactURLSegment())).toEqual(['OrderID|11055||LineNo|3']);
        });
    });

    describe('CreateRunDetailRecords', () => {
        it('persists RecordID in full URL-segment form for a single non-ID key and for a composite key', async () => {
            const created: Array<Record<string, unknown>> = [];
            mockGetEntityObject.mockImplementation(async () => {
                const detail: Record<string, unknown> = { NewRecord: vi.fn() };
                created.push(detail);
                return detail;
            });

            await detector.runDetails(['42'], INDIVIDUALS);
            await detector.runDetails(['OrderID|11055||LineNo|3'], ORDER_LINES);

            expect(created.map((d) => d.RecordID)).toEqual(['individual_id|42', 'OrderID|11055||LineNo|3']);
            // persistDetailMatches parses these back with LoadFromConcatenatedString — prove the round trip.
            const parsed = new CompositeKey();
            parsed.LoadFromConcatenatedString(String(created[1].RecordID));
            expect(parsed.KeyValuePairs).toEqual([{ FieldName: 'OrderID', Value: '11055' }, { FieldName: 'LineNo', Value: '3' }]);
        });
    });

    describe('LoadRecordsByListID', () => {
        it('compares the real single key column against the list membership subquery', async () => {
            vi.mocked(detector.Metadata.EntityByID).mockReturnValue(INDIVIDUALS);
            mockRunViewFn.mockResolvedValueOnce({ Success: true, Results: [] });
            await detector.recordsByList('list-1', INDIVIDUALS.ID);
            expect(lastRunViewParams().ExtraFilter).toBe("individual_id IN (SELECT RecordID FROM __mj.vwListDetails WHERE ListID = 'list-1')");
        });

        it('rebuilds each composite key from the list segments and loads by whole key', async () => {
            vi.mocked(detector.Metadata.EntityByID).mockReturnValue(ORDER_LINES);
            mockRunViewFn
                .mockResolvedValueOnce({ Success: true, Results: [{ RecordID: 'OrderID|11055||LineNo|3' }, { RecordID: 'OrderID|11055||LineNo|4' }] })
                .mockResolvedValueOnce({ Success: true, Results: [] });
            await detector.recordsByList('list-1', ORDER_LINES.ID);
            expect(mockRunViewFn).toHaveBeenCalledTimes(2);
            expect(lastRunViewParams().EntityName).toBe('OrderLines');
            expect(lastRunViewParams().ExtraFilter).toBe("OrderID = '11055' AND LineNo = '3'\n OR OrderID = '11055' AND LineNo = '4'");
        });
    });
});
