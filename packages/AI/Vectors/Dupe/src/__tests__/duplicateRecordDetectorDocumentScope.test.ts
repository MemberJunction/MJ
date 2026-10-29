import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Scoping duplicate-detection vector queries to the run's entity document. NO live DB, NO vector DB.
 *
 * An external index (Pinecone, Qdrant, pgvector, SQL Server) can hold the vectors of several entity
 * documents — People, Organizations and Products in one index. Without a filter, an Organizations
 * run's nearest neighbours include People vectors, which point at records that are not
 * Organizations. Sync stores `EntityDocumentID` with each vector, and the detector filters on it
 * through the provider's own `BuildMetadataFilter`. The in-process SimpleVectorServiceProvider
 * already keys its queries by the document ID, so it gets no filter.
 */

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

vi.mock('@memberjunction/ai-prompts', () => ({ AIEmbeddingRunner: class {} }));

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
        _currentUser: Record<string, unknown> = { ID: 'user-1' };
        get CurrentUser() { return this._currentUser; }
        set CurrentUser(user: unknown) { this._currentUser = user as Record<string, unknown>; }
    },
}));

vi.mock('@memberjunction/ai-vector-sync', () => ({
    GetEntityDocumentRecordFilter: vi.fn().mockReturnValue(null),
    CombineExtraFilters: vi.fn(),
    EntityDocumentTemplateParser: { CreateInstance: vi.fn() },
    EntityVectorSyncer: class {},
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

import { CompositeKey, DuplicateDetectionOptions, PotentialDuplicateResult } from '@memberjunction/core';
import { DuplicateRecordDetector } from '../duplicateRecordDetector';

/** Structural twin of the detector's module-private `RecordQueryResult`. */
interface RecordQueryResult {
    SourceKey: CompositeKey;
    TemplateText: string;
    Duplicates: PotentialDuplicateResult;
    RawMatchCount?: number;
}

const DOCUMENT_ID = 'doc-orgs';
const INDEX_NAME = 'morecheese-duplicates';
const PINECONE_STYLE_FILTER = { EntityDocumentID: { $in: [DOCUMENT_ID] } };

/** A vector DB double with the members the detector's query path reads. */
function fakeVectorDB(options: { KeyedByDocument?: boolean; Hybrid?: boolean } = {}) {
    return {
        QueryKeyIsEntityDocumentID: options.KeyedByDocument ?? false,
        SupportsHybridSearch: options.Hybrid ?? false,
        BuildMetadataFilter: vi.fn().mockReturnValue(PINECONE_STYLE_FILTER),
        QueryIndex: vi.fn().mockResolvedValue({ success: true, data: { matches: [] } }),
        HybridQuery: vi.fn().mockResolvedValue({ success: true, data: { matches: [] } }),
    };
}

/** Exposes the protected seams under test with the provider fields a real init would set. */
class TestableDetector extends DuplicateRecordDetector {
    public UseVectorDB(vectorDB: ReturnType<typeof fakeVectorDB>): void {
        const fields = this as unknown as { vectorDB: object; indexName: string; entityDocumentID: string };
        fields.vectorDB = vectorDB;
        fields.indexName = INDEX_NAME;
        fields.entityDocumentID = DOCUMENT_ID;
    }
    public Query(templateText = ''): Promise<object> {
        return this.executeVectorQuery([0.1, 0.2], templateText, 5, {} as DuplicateDetectionOptions);
    }
    public Assert(results: RecordQueryResult[]): void {
        this.AssertDocumentVectorsFound(results);
    }
}

function queryResult(rawMatchCount: number | undefined): RecordQueryResult {
    return {
        SourceKey: CompositeKey.FromID('rec-1'), // first-pk-ok: test fixture, single-column key
        TemplateText: '',
        Duplicates: new PotentialDuplicateResult(),
        RawMatchCount: rawMatchCount,
    };
}

describe('DuplicateRecordDetector — vector queries are scoped to the entity document', () => {
    let detector: TestableDetector;

    beforeEach(() => {
        detector = new TestableDetector();
    });

    describe('the query filter', () => {
        it('filters an index-keyed provider to this document through the provider\'s own filter syntax', async () => {
            const vectorDB = fakeVectorDB();
            detector.UseVectorDB(vectorDB);

            await detector.Query();

            expect(vectorDB.BuildMetadataFilter).toHaveBeenCalledWith({ EntityDocumentIDs: [DOCUMENT_ID] });
            expect(vectorDB.QueryIndex).toHaveBeenCalledWith(
                expect.objectContaining({ id: INDEX_NAME, filter: PINECONE_STYLE_FILTER }),
                expect.anything()
            );
        });

        it('filters a hybrid query the same way', async () => {
            const vectorDB = fakeVectorDB({ Hybrid: true });
            detector.UseVectorDB(vectorDB);

            await detector.Query('Orchardmere Cheese & Provisions');

            expect(vectorDB.HybridQuery).toHaveBeenCalledWith(
                expect.objectContaining({ filter: PINECONE_STYLE_FILTER }),
                expect.anything()
            );
        });

        it('adds no filter for a provider that already keys its queries by the document', async () => {
            const vectorDB = fakeVectorDB({ KeyedByDocument: true });
            detector.UseVectorDB(vectorDB);

            await detector.Query();

            expect(vectorDB.BuildMetadataFilter).not.toHaveBeenCalled();
            const params = vectorDB.QueryIndex.mock.calls[0][0] as Record<string, unknown>;
            expect(params.id).toBe(DOCUMENT_ID);
            expect('filter' in params).toBe(false);
        });
    });

    describe('vectors that predate the document tag', () => {
        it('fails the batch when every query came back empty', () => {
            detector.UseVectorDB(fakeVectorDB());

            expect(() => detector.Assert([queryResult(0), queryResult(0)]))
                .toThrow(/No vectors in index "morecheese-duplicates" are tagged with entity document doc-orgs/);
        });

        it('passes when any query returned a match', () => {
            detector.UseVectorDB(fakeVectorDB());

            expect(() => detector.Assert([queryResult(0), queryResult(3)])).not.toThrow();
        });

        it('leaves failed queries to the existing error handling', () => {
            detector.UseVectorDB(fakeVectorDB());

            expect(() => detector.Assert([queryResult(undefined), queryResult(undefined)])).not.toThrow();
        });

        it('does not apply to a provider that keys its queries by the document', () => {
            detector.UseVectorDB(fakeVectorDB({ KeyedByDocument: true }));

            expect(() => detector.Assert([queryResult(0)])).not.toThrow();
        });
    });
});
