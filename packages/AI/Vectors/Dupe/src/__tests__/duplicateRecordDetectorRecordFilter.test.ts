import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BaseEntity, EntityInfo, PotentialDuplicateRequest } from '@memberjunction/core';
import type { MJDuplicateRunDetailEntity, MJDuplicateRunEntity, MJEntityDocumentEntity } from '@memberjunction/core-entities';

/**
 * The entity document's record filter (`Configuration.recordFilter.extraFilter`) in duplicate
 * detection. NO live DB, NO vector DB.
 *
 * The filter names the records that take part: a record that fails it (e.g. one its source system
 * has flagged deleted or merged) is never checked, and never offered as anyone's duplicate, but
 * stays readable everywhere else. Vector sync skips those records too, but their vectors can
 * already be in the index, so the candidate side is filtered at query time as well.
 *
 * `@memberjunction/ai-vector-sync` supplies the real GetEntityDocumentRecordFilter; only the syncer
 * class is stubbed.
 */

// ─────────────────────────────────────────────
// Hoisted mocks
// ─────────────────────────────────────────────

const { mockRunViewFn, mockEntityByID } = vi.hoisted(() => ({
    mockRunViewFn: vi.fn(),
    mockEntityByID: vi.fn(),
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

vi.mock('@memberjunction/ai-prompts', () => ({
    AIEmbeddingRunner: class {
        async RunEmbedding(params: { Texts: string[] }) {
            return { Success: true, Vectors: params.Texts.map(() => [0.1, 0.2]) };
        }
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

vi.mock('@memberjunction/core-entities', () => ({
    MJDuplicateRunDetailEntity: vi.fn(),
    MJDuplicateRunDetailMatchEntity: vi.fn(),
    MJDuplicateRunEntity: vi.fn(),
    MJEntityDocumentEntity: vi.fn(),
    MJListDetailEntity: vi.fn(),
    MJListEntity: vi.fn(),
    RecordComparisonCompareOperation: class {},
    KnowledgeHubMetadataEngine: { Instance: { Config: vi.fn().mockResolvedValue(undefined) } },
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
        SaveEntity = vi.fn().mockResolvedValue(true);
        /** A saved view that exists: LoadRecordIDsFromView only checks that it does. */
        RunViewForSingleValue = vi.fn().mockResolvedValue({ ID: 'view-1' });
    },
}));

vi.mock('@memberjunction/ai-vector-sync', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/ai-vector-sync')>();
    return {
        GetEntityDocumentRecordFilter: actual.GetEntityDocumentRecordFilter,
        CombineExtraFilters: actual.CombineExtraFilters,
        EntityDocumentTemplateParser: { CreateInstance: vi.fn() },
        EntityVectorSyncer: class {},
        VectorizeEntityParams: class {},
    };
});

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

import { CompositeKey, DuplicateDetectionOptions, PotentialDuplicate, PotentialDuplicateResult } from '@memberjunction/core';
import { DuplicateRecordDetector } from '../duplicateRecordDetector';

/** Structural twin of the detector's module-private `RecordQueryResult`. */
interface RecordQueryResult {
    SourceKey: CompositeKey;
    TemplateText: string;
    Duplicates: PotentialDuplicateResult;
}

const INDIVIDUALS = {
    ID: 'individuals-id',
    Name: 'Individuals',
    PrimaryKeys: [{ Name: 'individual_id' }],
    FirstPrimaryKey: { Name: 'individual_id' },
    Fields: [],
} as unknown as EntityInfo;

const NOT_DELETED = "ind_delete_flag <> '1'";

function entityDocument(configuration: Record<string, unknown> | null): MJEntityDocumentEntity {
    return {
        Name: 'Individuals Duplicate',
        EntityID: 'individuals-id',
        PotentialMatchThreshold: 0.5,
        Configuration: configuration ? JSON.stringify(configuration) : null,
    } as unknown as MJEntityDocumentEntity;
}

const FILTERED = entityDocument({ recordFilter: { extraFilter: NOT_DELETED } });
const UNFILTERED = entityDocument(null);

function candidate(id: string, score: number): PotentialDuplicate {
    const d = new PotentialDuplicate();
    d.KeyValuePairs = [{ FieldName: 'individual_id', Value: id }];
    d.ProbabilityScore = score;
    return d;
}

function queryResult(sourceID: string, candidateIDs: string[]): RecordQueryResult {
    const result = new PotentialDuplicateResult();
    result.Duplicates = candidateIDs.map((id, i) => candidate(id, 0.99 - i * 0.01));
    return { SourceKey: CompositeKey.FromKeyValuePair('individual_id', sourceID), TemplateText: '', Duplicates: result };
}

/** Exposes the protected seams under test; the embedding and the vector query are stubbed. */
class TestableDetector extends DuplicateRecordDetector {
    public QueriedTopK: number[] = [];
    public QueryResults: RecordQueryResult[] = [];

    public recordFilter(doc: MJEntityDocumentEntity): string | null {
        return this.GetRecordFilter(doc);
    }
    public idsToCheck(params: Partial<PotentialDuplicateRequest>, recordFilter?: string | null): Promise<string[]> {
        return this.LoadRecordIDsToCheck(params as PotentialDuplicateRequest, INDIVIDUALS, recordFilter);
    }
    public filterCandidates(results: RecordQueryResult[], recordFilter?: string | null): Promise<void> {
        return this.FilterNonExistentMatches(results, INDIVIDUALS, recordFilter);
    }
    public candidatesFor(doc: MJEntityDocumentEntity, options: DuplicateDetectionOptions): Promise<RecordQueryResult | null> {
        const record = { EntityInfo: INDIVIDUALS, PrimaryKey: CompositeKey.FromKeyValuePair('individual_id', '1') } as unknown as BaseEntity;
        return this.QueryCandidatesForRecord(record, doc, options);
    }

    protected override GetQueryConcurrency(): number {
        return 1;
    }
    protected override async GenerateTemplateTexts(): Promise<string[]> {
        return ['rendered'];
    }
    protected override async QueryDuplicatesForRecords(
        _records: BaseEntity[], _vectors: number[][], _texts: string[], _doc: MJEntityDocumentEntity, topK: number
    ): Promise<RecordQueryResult[]> {
        this.QueriedTopK.push(topK);
        return this.QueryResults;
    }
}

function runViewCalls(): Record<string, unknown>[] {
    return mockRunViewFn.mock.calls.map((c) => c[0] as Record<string, unknown>);
}

describe('DuplicateRecordDetector — the entity document\'s record filter', () => {
    let detector: TestableDetector;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRunViewFn.mockReset();
        detector = new TestableDetector();
    });

    describe('GetRecordFilter', () => {
        it('reads Configuration.recordFilter.extraFilter, and is null when none is set', () => {
            expect(detector.recordFilter(FILTERED)).toBe(NOT_DELETED);
            expect(detector.recordFilter(UNFILTERED)).toBeNull();
        });
    });

    describe('the records checked', () => {
        it('ANDs the filter into a whole-entity run\'s own ExtraFilter', async () => {
            mockRunViewFn.mockResolvedValueOnce({ Success: true, Results: [{ individual_id: 42 }] });

            await detector.idsToCheck({ ExtraFilter: "State = 'MD'" }, NOT_DELETED);

            expect(runViewCalls()[0].ExtraFilter).toBe(`(State = 'MD') AND (${NOT_DELETED})`);
        });

        it('uses the filter alone when the run has no ExtraFilter, and changes nothing without one', async () => {
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

            await detector.idsToCheck({}, NOT_DELETED);
            await detector.idsToCheck({ ExtraFilter: "State = 'MD'" }, null);

            expect(runViewCalls().map((p) => p.ExtraFilter)).toEqual([NOT_DELETED, "State = 'MD'"]);
        });

        it('narrows a list run to the members that pass the filter', async () => {
            mockRunViewFn
                .mockResolvedValueOnce({ Success: true, Results: [{ RecordID: '42' }, { RecordID: '43' }] })
                .mockResolvedValueOnce({ Success: true, Results: [{ individual_id: '42' }] });

            const ids = await detector.idsToCheck({ ListID: 'list-1' }, NOT_DELETED);

            expect(ids).toEqual(['42']);
            expect(runViewCalls()[1].ExtraFilter).toBe(`(individual_id IN ('42','43')) AND (${NOT_DELETED})`);
        });

        it('leaves a list run alone without a filter: one query, every member', async () => {
            mockRunViewFn.mockResolvedValueOnce({ Success: true, Results: [{ RecordID: '42' }, { RecordID: '43' }] });

            expect(await detector.idsToCheck({ ListID: 'list-1' }, null)).toEqual(['42', '43']);
            expect(mockRunViewFn).toHaveBeenCalledTimes(1);
        });

        it('narrows a view run to the rows that pass the filter', async () => {
            mockRunViewFn
                .mockResolvedValueOnce({ Success: true, Results: [{ individual_id: '42' }, { individual_id: '43' }] })
                .mockResolvedValueOnce({ Success: true, Results: [{ individual_id: '42' }] });

            const ids = await detector.idsToCheck({ ViewID: 'view-1' }, NOT_DELETED);

            expect(ids).toEqual(['42']);
            expect(runViewCalls()[0].ViewID).toBe('view-1');
            expect(runViewCalls()[1].ExtraFilter).toBe(`(individual_id IN ('42','43')) AND (${NOT_DELETED})`);
        });
    });

    describe('the candidates offered', () => {
        it('drops a candidate that fails the filter, as it drops one that no longer exists', async () => {
            const qr = queryResult('1', ['42', '43']);
            mockRunViewFn.mockResolvedValueOnce({ Success: true, Results: [{ individual_id: '42' }] });

            await detector.filterCandidates([qr], NOT_DELETED);

            expect(qr.Duplicates.Duplicates.map((d) => d.ToCompactURLSegment())).toEqual(['42']);
            expect(runViewCalls()[0]).toMatchObject({
                ExtraFilter: `(individual_id IN ('42','43')) AND (${NOT_DELETED})`,
                IgnoreMaxRows: true,
            });
        });

        it('fails the run when the filter can\'t be applied, rather than let filtered records through', async () => {
            mockRunViewFn.mockResolvedValueOnce({ Success: false, Results: [], ErrorMessage: "Invalid column name 'ind_delete_flag'" });

            await expect(detector.filterCandidates([queryResult('1', ['42'])], NOT_DELETED)).rejects.toThrow(/record filter/);
        });

        it('still fails open without a filter when existence can\'t be verified', async () => {
            const qr = queryResult('1', ['42']);
            mockRunViewFn.mockResolvedValueOnce({ Success: false, Results: [], ErrorMessage: 'timeout' });

            await detector.filterCandidates([qr], null);

            expect(qr.Duplicates.Duplicates).toHaveLength(1);
        });
    });

    describe('a single-record or entry-time check', () => {
        it('over-fetches when a filter is set, filters the candidates, and returns at most TopK', async () => {
            detector.QueryResults = [queryResult('1', ['10', '11', '12', '13', '14', '15', '16'])];
            // 11 and 13 are flagged deleted; the rest pass.
            mockRunViewFn.mockResolvedValueOnce({
                Success: true,
                Results: ['10', '12', '14', '15', '16'].map((id) => ({ individual_id: id })),
            });

            const result = await detector.candidatesFor(FILTERED, { TopK: 3 });

            expect(detector.QueriedTopK).toEqual([9]);
            expect(result?.Duplicates.Duplicates.map((d) => d.ToCompactURLSegment())).toEqual(['10', '12', '14']);
        });

        it('queries TopK and filters nothing without a filter', async () => {
            detector.QueryResults = [queryResult('1', ['10', '11'])];

            const result = await detector.candidatesFor(UNFILTERED, { TopK: 3 });

            expect(detector.QueriedTopK).toEqual([3]);
            expect(mockRunViewFn).not.toHaveBeenCalled();
            expect(result?.Duplicates.Duplicates).toHaveLength(2);
        });
    });
});

// ─────────────────────────────────────────────
// The batch run: GetDuplicateRecords wires the filter through every step
// ─────────────────────────────────────────────

function duplicateRun(): MJDuplicateRunEntity {
    return {
        ID: 'run-1',
        LastProcessedOffset: 0,
        CancellationRequested: false,
        Load: vi.fn().mockResolvedValue(true),
    } as unknown as MJDuplicateRunEntity;
}

/**
 * Drives the REAL batch loop (GetDuplicateRecords → processBatch) with the setup and persistence
 * stubbed. The record-id load, the candidate query width, the existence check and the trim to TopK
 * all run as shipped; what reaches persistence is recorded per source record.
 */
class BatchHarness extends TestableDetector {
    /** The candidate ids each source record carried into persistence, in order. */
    public Persisted: string[][] = [];
    private readonly entityDocument: MJEntityDocumentEntity;

    constructor(entityDocument: MJEntityDocumentEntity) {
        super();
        this.entityDocument = entityDocument;
    }

    protected override async ValidateEntityDocument(): Promise<MJEntityDocumentEntity | null> {
        return this.entityDocument;
    }
    protected override async InitializeProviders(): Promise<void> {
        // the embedding runner and vector query are stubbed
    }
    protected override async ResolveOrCreateDuplicateRun(): Promise<MJDuplicateRunEntity> {
        return duplicateRun();
    }
    protected override async LoadRecordsByKeys(compositeKeys: CompositeKey[]): Promise<BaseEntity[]> {
        return compositeKeys.map(() => ({}) as unknown as BaseEntity);
    }
    protected override buildSourceMetadataMap(): Map<string, string> {
        return new Map();
    }
    protected override async CreateRunDetailRecords(): Promise<MJDuplicateRunDetailEntity[]> {
        return [];
    }
    protected override AssertDocumentVectorsFound(): void {
        // no vector DB here; the document-scope check is covered by duplicateRecordDetectorDocumentScope.test.ts
    }
    protected override async PersistMatchResults(queryResults: RecordQueryResult[]): Promise<PotentialDuplicateResult[]> {
        this.Persisted.push(...queryResults.map((qr) => qr.Duplicates.Duplicates.map((d) => d.ToCompactURLSegment())));
        return [];
    }
    protected override async ProcessAutoMerges(): Promise<void> {
        // nothing to merge: persistence is stubbed
    }
}

describe('DuplicateRecordDetector — a batch run with a record filter', () => {
    const RUN = { EntityDocumentID: 'doc-1', ExtraFilter: "State = 'MD'", Options: { TopK: 3 } } as unknown as PotentialDuplicateRequest;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRunViewFn.mockReset();
        mockEntityByID.mockReturnValue(INDIVIDUALS);
    });

    it('loads only filtered records, over-fetches 3× TopK, filters the candidates, and keeps TopK', async () => {
        const harness = new BatchHarness(FILTERED);
        harness.QueryResults = [queryResult('1', ['10', '11', '12', '13', '14', '15', '16'])];
        mockRunViewFn
            // the records to check
            .mockResolvedValueOnce({ Success: true, Results: [{ individual_id: '1' }] })
            // the candidates that exist and pass the filter (11 and 13 are flagged deleted)
            .mockResolvedValueOnce({ Success: true, Results: ['10', '12', '14', '15', '16'].map((id) => ({ individual_id: id })) });

        const response = await harness.GetDuplicateRecords(RUN);

        expect(response.Status).toBe('Success');
        expect(runViewCalls()[0].ExtraFilter).toBe(`(State = 'MD') AND (${NOT_DELETED})`);
        expect(harness.QueriedTopK).toEqual([9]);
        expect(runViewCalls()[1].ExtraFilter).toBe(
            `(individual_id IN ('10','11','12','13','14','15','16')) AND (${NOT_DELETED})`
        );
        expect(harness.Persisted).toEqual([['10', '12', '14']]);
    });

    it('without a filter: the run\'s own ExtraFilter, TopK, and an existence-only check', async () => {
        const harness = new BatchHarness(UNFILTERED);
        harness.QueryResults = [queryResult('1', ['10', '11'])];
        mockRunViewFn
            .mockResolvedValueOnce({ Success: true, Results: [{ individual_id: '1' }] })
            .mockResolvedValueOnce({ Success: true, Results: [{ individual_id: '10' }, { individual_id: '11' }] });

        await harness.GetDuplicateRecords(RUN);

        expect(runViewCalls()[0].ExtraFilter).toBe("State = 'MD'");
        expect(harness.QueriedTopK).toEqual([3]);
        expect(runViewCalls()[1].ExtraFilter).toBe("individual_id IN ('10','11')");
        expect(harness.Persisted).toEqual([['10', '11']]);
    });
});
