/**
 * Tests for SearchEngine's `filterByPermissions` safety net.
 *
 * Closes the P2A.8 / plans/search-scopes-rag-plus/RAG_plan.md §5.4 PM-10 gap: even when the resolver allows
 * the search and the agent has SearchScopeAccess='All', records the calling
 * user cannot read at the entity layer must NEVER appear in the result.
 *
 * The plan also requires asserting that forbidden records never reach the
 * fusion stage — that is a per-provider push-down audit and is tracked
 * separately. This file covers the post-fusion safety net which is the last
 * line of defense if any provider's push-down is incomplete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockEntityByName, mockRunViewFn } = vi.hoisted(() => ({
    mockEntityByName: vi.fn(),
    mockRunViewFn: vi.fn(),
}));

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    class MockMetadata {
        EntityByName(name: string) { return mockEntityByName(name); }
    }
    class MockRunView {
        RunView = mockRunViewFn;
    }
    return {
        ...actual,
        Metadata: MockMetadata,
        RunView: MockRunView,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

import { SearchEngine } from '../generic/SearchEngine';
import { SearchFusion } from '../generic/SearchFusion';
import { BaseSearchProvider } from '../generic/ISearchProvider';
import { EntitySearchProvider } from '../generic/EntitySearchProvider';
import { FullTextSearchProvider } from '../generic/FullTextSearchProvider';
import { VectorSearchProvider } from '../generic/VectorSearchProvider';
import { AzureAISearchProvider } from '../providers/AzureAISearchProvider';
import { TypesenseSearchProvider } from '../providers/TypesenseSearchProvider';
import { ElasticsearchSearchProvider } from '../providers/ElasticsearchSearchProvider';
import { OpenSearchSearchProvider } from '../providers/OpenSearchSearchProvider';
import type { SearchResultItem, SearchSource } from '../generic/search.types';
import type { UserInfo, EntityInfo, IMetadataProvider, RunViewParams } from '@memberjunction/core';
import { SearchScopePermissionResolver } from '../permissions/SearchScopePermissionResolver';
import type { SearchScopePermissionSource } from '../permissions/SearchScopePermissionResolver';

/**
 * A third-party provider that labels its hits `'entity'`. `SearchSource` is a closed union, so a provider has
 * to pick one of its values — and nothing stops it picking the one the engine used to trust on sight.
 */
class SelfLabelledEntityProvider extends BaseSearchProvider {
    public readonly SourceType: SearchSource = 'entity';
    public async Search(): Promise<SearchResultItem[]> { return []; }
}

/** The engine-stamped `ProviderId` of each configured provider the tests inject. */
const PROVIDER = {
    Entity: 'prov-entity',
    FullText: 'prov-fulltext',
    Vector: 'prov-vector',
    Azure: 'prov-azure',
    Typesense: 'prov-typesense',
    Elasticsearch: 'prov-elasticsearch',
    OpenSearch: 'prov-opensearch',
    SelfLabelledEntity: 'prov-self-labelled-entity',
} as const;

/** The private fields the harness sets to bypass Config(), narrowed structurally rather than through `any`. */
interface SearchEngineTestState {
    _providerEntries: Array<{
        Provider: BaseSearchProvider; ID: string; DisplayName: string; Icon: string; Priority: number;
        SupportsPreview: boolean; MaxResultsOverride: number | null; Record: unknown;
    }>;
}

class TestSearchEngine extends SearchEngine {
    /** Configure one entry per provider, as `Config()` would from the `MJ: Search Providers` rows. */
    public InjectProviders(providers: Array<[string, BaseSearchProvider]>): void {
        const state = this as unknown as SearchEngineTestState;
        state._providerEntries = providers.map(([ID, Provider], i) => ({
            Provider, ID, DisplayName: ID, Icon: 'fa-solid fa-circle', Priority: i,
            SupportsPreview: false, MaxResultsOverride: null, Record: {},
        }));
    }

    public async TestFilterByPermissions(
        results: SearchResultItem[],
        contextUser: UserInfo,
    ): Promise<SearchResultItem[]> {
        return this.filterByPermissions(results, contextUser);
    }
    // Stub IMetadataProvider that delegates to the existing mocks. The merged
    // multi-provider refactor reads `this.Base.ProviderToUse` which isn't
    // initialized when tests bypass Config().
    protected override get ProviderToUse(): IMetadataProvider {
        return {
            EntityByName: (name: string) => mockEntityByName(name),
            Entities: [],
        } as unknown as IMetadataProvider;
    }
}

function createUser(id: string): UserInfo {
    return { ID: id, Name: 'Test User', Email: 't@example.com' } as UserInfo;
}

/**
 * A hit as a provider returns it. `providerId` is the stamp the engine puts on every result a configured
 * provider returns; leave it out for a hit no provider stamped (a fusion fallback, a hand-built result).
 */
function makeResult(
    recordId: string,
    entityName: string,
    resultType: SearchResultItem['ResultType'] = 'entity-record',
    sourceType: string = 'entity',
    providerId?: string
): SearchResultItem {
    return {
        ID: `r-${recordId}`,
        EntityName: entityName,
        RecordID: recordId,
        SourceType: sourceType,
        Title: `record ${recordId}`,
        Snippet: `snippet for ${recordId}`,
        Score: 0.9,
        ScoreBreakdown: {},
        Tags: [],
        MatchedAt: new Date(),
        ResultType: resultType,
        ProviderId: providerId,
    };
}

/** A hit from the entity lane, stamped with the configured `EntitySearchProvider`. */
function entityLaneHit(recordId: string, entityName: string): SearchResultItem {
    return makeResult(recordId, entityName, 'entity-record', 'entity', PROVIDER.Entity);
}

/** The record ids a `PK IN (...)` verification RunView asked about. */
function idsAskedAbout(call: unknown[]): string[] {
    const filter = (call[0] as RunViewParams).ExtraFilter ?? '';
    return Array.from(String(filter).matchAll(/'([^']+)'/g), m => m[1]);
}

interface MockEntity {
    Name: string;
    FirstPrimaryKey: { Name: string };
    PrimaryKeys: Array<{ Name: string }>;
    GetUserPermisions: (u: UserInfo) => { CanRead: boolean } | null;
    UserExemptFromRowLevelSecurity: (u: UserInfo, _t: number) => boolean;
    GetEffectiveRowFilterWhereClause: (u: UserInfo, _t: number, _prefix: string) => string;
}

function makeEntity(opts: {
    Name: string;
    CanRead: boolean;
    Exempt: boolean;
    RlsClause: string;
    /** Primary key column name(s); defaults to a single `ID`. Pass several for a composite key. */
    PrimaryKeyNames?: string[];
}): MockEntity {
    const keys = (opts.PrimaryKeyNames ?? ['ID']).map((Name) => ({ Name }));
    return {
        Name: opts.Name,
        FirstPrimaryKey: keys[0],
        PrimaryKeys: keys,
        GetUserPermisions: () => ({ CanRead: opts.CanRead }),
        UserExemptFromRowLevelSecurity: () => opts.Exempt,
        GetEffectiveRowFilterWhereClause: () => opts.RlsClause,
    };
}

describe('SearchEngine.filterByPermissions (safety net)', () => {
    let engine: TestSearchEngine;
    const user = createUser('00000000-0000-0000-0000-000000000001');

    beforeEach(() => {
        vi.clearAllMocks();
        engine = TestSearchEngine.getInstance<TestSearchEngine>();
        engine.InjectProviders([
            [PROVIDER.Entity, new EntitySearchProvider()],
            [PROVIDER.FullText, new FullTextSearchProvider()],
            [PROVIDER.Vector, new VectorSearchProvider()],
            [PROVIDER.Azure, new AzureAISearchProvider()],
            [PROVIDER.Typesense, new TypesenseSearchProvider()],
            [PROVIDER.Elasticsearch, new ElasticsearchSearchProvider()],
            [PROVIDER.OpenSearch, new OpenSearchSearchProvider()],
            [PROVIDER.SelfLabelledEntity, new SelfLabelledEntityProvider()],
        ]);
    });

    describe('PM-10: RLS-blocked records never appear in results', () => {
        it('drops rows the user cannot read under RLS, even when entity-level CanRead is true', async () => {
            // Two rows for the same entity. RLS allows one, blocks the other.
            const allowedRow = makeResult('aaa', 'Customers');
            const forbiddenRow = makeResult('bbb', 'Customers');

            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Customers',
                CanRead: true,
                Exempt: false,
                RlsClause: 'OwnerID = @CurrentUserID',
            }) as unknown as EntityInfo);
            // RunView simulates RLS: returns only the allowed row's ID
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ ID: 'aaa' }],
            });

            const out = await engine.TestFilterByPermissions([allowedRow, forbiddenRow], user);

            expect(out).toHaveLength(1);
            expect(out[0].RecordID).toBe('aaa');
        });

        it('drops ALL rows for the entity when the user lacks entity-level CanRead', async () => {
            const r1 = makeResult('aaa', 'Customers');
            const r2 = makeResult('bbb', 'Customers');

            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Customers',
                CanRead: false, // entity-level deny
                Exempt: false,
                RlsClause: '',
            }) as unknown as EntityInfo);

            const out = await engine.TestFilterByPermissions([r1, r2], user);

            expect(out).toHaveLength(0);
            // RunView must NOT have been called — no point checking RLS when CanRead is false
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('drops rows when the entity is unknown to MJ Metadata (fail-closed)', async () => {
            const r1 = makeResult('aaa', 'NonExistentEntity');
            mockEntityByName.mockImplementation(() => { throw new Error('Unknown entity'); });

            const out = await engine.TestFilterByPermissions([r1], user);

            expect(out).toHaveLength(0);
        });

        it('drops rows when the RunView used to validate RLS fails (fail-closed)', async () => {
            const r1 = makeResult('aaa', 'Customers');
            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Customers',
                CanRead: true,
                Exempt: false,
                RlsClause: 'OwnerID = @CurrentUserID',
            }) as unknown as EntityInfo);
            mockRunViewFn.mockResolvedValue({ Success: false, ErrorMessage: 'SQL timeout' });

            const out = await engine.TestFilterByPermissions([r1], user);

            expect(out).toHaveLength(0);
        });
    });

    describe('Allowed cases', () => {
        it('passes entity-lane rows through when the user is RLS-exempt', async () => {
            const r1 = entityLaneHit('aaa', 'Customers');
            const r2 = entityLaneHit('bbb', 'Customers');

            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Customers',
                CanRead: true,
                Exempt: true, // exempt — no RLS check
                RlsClause: '',
            }) as unknown as EntityInfo);

            const out = await engine.TestFilterByPermissions([r1, r2], user);

            expect(out).toHaveLength(2);
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('passes entity-lane rows through when there is no RLS clause for the user/entity', async () => {
            const r1 = entityLaneHit('aaa', 'Customers');

            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Customers',
                CanRead: true,
                Exempt: false,
                RlsClause: '', // no clause produced — pass through
            }) as unknown as EntityInfo);

            const out = await engine.TestFilterByPermissions([r1], user);

            expect(out).toHaveLength(1);
            expect(out[0].RecordID).toBe('aaa');
        });

        it('preserves input order (RRF / re-rank order) of permitted rows', async () => {
            // Three rows from one entity, all RLS-permitted. The function groups by
            // entity internally, so we want to confirm the original order is restored.
            const r1 = entityLaneHit('first', 'Customers');
            const r2 = entityLaneHit('second', 'Customers');
            const r3 = entityLaneHit('third', 'Customers');

            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Customers',
                CanRead: true,
                Exempt: true,
                RlsClause: '',
            }) as unknown as EntityInfo);

            const out = await engine.TestFilterByPermissions([r1, r2, r3], user);

            expect(out.map(r => r.RecordID)).toEqual(['first', 'second', 'third']);
        });

        // ─────────────────────────────────────────────────────────────────
        // Ownership verification when no row filter applies.
        //
        // `CanRead` establishes that the user may read THIS ENTITY. It does not establish that the
        // results are this entity's records — `EntityName` is provider output, and for the vector and
        // 3rd-party lanes it comes from the index (vector metadata's `Entity` key, or the index name).
        // Admitting on the label alone lets whoever writes the index choose which entity's permissions
        // are evaluated.
        //
        // Results from a configured provider that queried the entity through RunView are exempt, because their
        // ids came out of it. Trust follows the engine-stamped provider (`ProviderId`), never the label.
        // ─────────────────────────────────────────────────────────────────
        const readableNoRowFilter = () => makeEntity({
            Name: 'Customers',
            CanRead: true,
            Exempt: false,
            RlsClause: '',      // no row filter for this user/entity
        }) as unknown as EntityInfo;

        it('drops a vector hit whose record id is not a record of the entity it claims', async () => {
            // The defect this closes: before, the label alone admitted the group.
            mockEntityByName.mockReturnValue(readableNoRowFilter());
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] }); // id is not a Customer

            const out = await engine.TestFilterByPermissions(
                [makeResult('not-a-customer', 'Customers', 'entity-record', 'vector')], user
            );

            expect(out).toHaveLength(0);
            expect(mockRunViewFn).toHaveBeenCalled();
        });

        it('keeps a vector hit whose record id IS a record of the entity', async () => {
            mockEntityByName.mockReturnValue(readableNoRowFilter());
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [{ ID: 'aaa' }] });

            const out = await engine.TestFilterByPermissions(
                [makeResult('aaa', 'Customers', 'entity-record', 'vector')], user
            );

            expect(out).toHaveLength(1);
            expect(out[0].RecordID).toBe('aaa');
        });

        it('verifies an entity whose single primary key is not named ID against that column', async () => {
            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Individuals', CanRead: true, Exempt: false, RlsClause: '', PrimaryKeyNames: ['individual_id'],
            }) as unknown as EntityInfo);
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [{ individual_id: 'ind-1' }] });

            const out = await engine.TestFilterByPermissions(
                [makeResult('ind-1', 'Individuals', 'entity-record', 'vector')], user
            );

            expect(out).toHaveLength(1);
            const params = mockRunViewFn.mock.calls[0][0] as { ExtraFilter: string; Fields: string[] };
            expect(params.ExtraFilter).toBe("individual_id IN ('ind-1')");
            expect(params.Fields).toEqual(['individual_id']);
        });

        it('verifies a composite-key result with one (F1=.. AND F2=..) term per record instead of IN() on the first column', async () => {
            // Before: `OrderID IN ('OrderID|o1||LineNo|3')` could never match, and because this
            // check fails closed every composite-key result was dropped as unauthorized.
            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Order Lines', CanRead: true, Exempt: false, RlsClause: '', PrimaryKeyNames: ['OrderID', 'LineNo'],
            }) as unknown as EntityInfo);
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [{ OrderID: 'o1', LineNo: 3 }] });

            const out = await engine.TestFilterByPermissions(
                [
                    makeResult('OrderID|o1||LineNo|3', 'Order Lines', 'entity-record', 'vector'),
                    makeResult('OrderID|o2||LineNo|9', 'Order Lines', 'entity-record', 'vector'), // not returned → dropped
                ],
                user
            );

            expect(out).toHaveLength(1);
            expect(out[0].RecordID).toBe('OrderID|o1||LineNo|3');
            const params = mockRunViewFn.mock.calls[0][0] as { ExtraFilter: string; Fields: string[] };
            expect(params.ExtraFilter).toBe("(OrderID='o1' AND LineNo='3') OR (OrderID='o2' AND LineNo='9')");
            expect(params.Fields).toEqual(['OrderID', 'LineNo']);
        });

        it('reads a prefixed `PK|value` record id as its key value, and keeps it when readable', async () => {
            // Behaviour change (a fix of over-strict dropping): before, `ID IN ('ID|k1')` never matched, so a
            // result written with the prefixed encoding (`CompositeKey.ToRecordID()`) was dropped as unauthorized.
            mockEntityByName.mockReturnValue(readableNoRowFilter());
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [{ ID: 'k1' }] });

            const out = await engine.TestFilterByPermissions(
                [makeResult('ID|k1', 'Customers', 'entity-record', 'vector')], user
            );

            expect(out.map(r => r.RecordID)).toEqual(['ID|k1']);
            const params = mockRunViewFn.mock.calls[0][0] as { ExtraFilter: string; MaxRows: number };
            expect(params.ExtraFilter).toBe("ID IN ('k1')");
            expect(params.MaxRows).toBe(1); // one id, at most one row — UserViewMaxRows cannot truncate it
        });

        it('keeps a composite segment that names a non-key field out of the SQL, and drops its result', async () => {
            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Order Lines', CanRead: true, Exempt: false, RlsClause: '', PrimaryKeyNames: ['OrderID', 'LineNo'],
            }) as unknown as EntityInfo);
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [{ OrderID: 'o1', LineNo: 3 }] });

            const out = await engine.TestFilterByPermissions(
                [
                    makeResult('OrderID|o1||LineNo|3', 'Order Lines', 'entity-record', 'vector'),
                    makeResult('OrderID|o1||LineNo|3||1=1 OR Region|x', 'Order Lines', 'entity-record', 'vector'),
                ],
                user
            );

            expect(out.map(r => r.RecordID)).toEqual(['OrderID|o1||LineNo|3']);
            const params = mockRunViewFn.mock.calls[0][0] as { ExtraFilter: string };
            expect(params.ExtraFilter).toBe("(OrderID='o1' AND LineNo='3')");
        });

        it('issues no RunView when no composite segment names the key', async () => {
            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Order Lines', CanRead: true, Exempt: false, RlsClause: '', PrimaryKeyNames: ['OrderID', 'LineNo'],
            }) as unknown as EntityInfo);

            const out = await engine.TestFilterByPermissions(
                [makeResult('OrderID|o1||Bogus|1', 'Order Lines', 'entity-record', 'vector')], user
            );

            expect(out).toHaveLength(0);
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('matches a composite-key result regardless of segment field-name casing or UUID casing', async () => {
            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Order Lines', CanRead: true, Exempt: false, RlsClause: '', PrimaryKeyNames: ['OrderID', 'LineNo'],
            }) as unknown as EntityInfo);
            mockRunViewFn.mockResolvedValue({
                Success: true,
                Results: [{ OrderID: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890', LineNo: 3 }],
            });

            const out = await engine.TestFilterByPermissions(
                [makeResult('orderid|a1b2c3d4-e5f6-7890-abcd-ef1234567890||lineno|3', 'Order Lines', 'entity-record', 'vector')],
                user
            );

            expect(out).toHaveLength(1);
        });

        it('ANDs the composite membership with the row filter when one applies', async () => {
            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Order Lines', CanRead: true, Exempt: false, RlsClause: "Region='West'", PrimaryKeyNames: ['OrderID', 'LineNo'],
            }) as unknown as EntityInfo);
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

            await engine.TestFilterByPermissions(
                [makeResult('OrderID|o1||LineNo|3', 'Order Lines', 'entity-record', 'entity')], user
            );

            const params = mockRunViewFn.mock.calls[0][0] as { ExtraFilter: string };
            expect(params.ExtraFilter).toBe("((OrderID='o1' AND LineNo='3')) AND (Region='West')");
        });

        it('does NOT verify entity-lane results — the hot path costs nothing extra', async () => {
            mockEntityByName.mockReturnValue(readableNoRowFilter());

            const out = await engine.TestFilterByPermissions([entityLaneHit('aaa', 'Customers')], user);

            expect(out).toHaveLength(1);
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('does NOT verify full-text results either', async () => {
            mockEntityByName.mockReturnValue(readableNoRowFilter());

            const out = await engine.TestFilterByPermissions(
                [makeResult('aaa', 'Customers', 'entity-record', 'fulltext', PROVIDER.FullText)], user
            );

            expect(out).toHaveLength(1);
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        it('verifies an unrecognised SourceType even from a provider that reads through RunView — the allowlist fails safe', async () => {
            mockEntityByName.mockReturnValue(readableNoRowFilter());
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

            const out = await engine.TestFilterByPermissions(
                [makeResult('aaa', 'Customers', 'entity-record', 'azure-ai-search', PROVIDER.Entity)], user
            );

            expect(out).toHaveLength(0);
            expect(mockRunViewFn).toHaveBeenCalledTimes(1);
        });

        it('partitions a mixed group: entity-lane passes through, vector hit is verified', async () => {
            mockEntityByName.mockReturnValue(readableNoRowFilter());
            // Only the entity-lane id is a real Customer; the vector hit's id is not.
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

            const out = await engine.TestFilterByPermissions([
                entityLaneHit('from-entity-lane', 'Customers'),
                makeResult('from-vector-lane', 'Customers', 'entity-record', 'vector', PROVIDER.Vector),
            ], user);

            expect(out.map(r => r.RecordID)).toEqual(['from-entity-lane']);
            // One verification read, and it asks only about the vector hit: the entity lane adds nothing to it.
            expect(mockRunViewFn).toHaveBeenCalledTimes(1);
            expect(idsAskedAbout(mockRunViewFn.mock.calls[0])).toEqual(['from-vector-lane']);
        });

        it('still verifies ownership for an RLS-EXEMPT user', async () => {
            // Exemption says which ROWS of an entity the user may see. It says nothing about whether a
            // result is that entity's row at all, so the check still applies.
            mockEntityByName.mockReturnValue(makeEntity({
                Name: 'Customers',
                CanRead: true,
                Exempt: true,
                RlsClause: '',
            }) as unknown as EntityInfo);
            mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });

            const out = await engine.TestFilterByPermissions(
                [makeResult('not-a-customer', 'Customers', 'entity-record', 'vector')], user
            );

            expect(out).toHaveLength(0);
        });

        it('fails closed when the ownership RunView fails', async () => {
            mockEntityByName.mockReturnValue(readableNoRowFilter());
            mockRunViewFn.mockResolvedValue({ Success: false, ErrorMessage: 'SQL timeout' });

            const out = await engine.TestFilterByPermissions(
                [makeResult('aaa', 'Customers', 'entity-record', 'vector')], user
            );

            expect(out).toHaveLength(0);
        });

        it('no longer passes storage-file results through on their type: one the engine cannot attribute to a storage provider is dropped', async () => {
            // `ResultType` is provider output, so `storage-file` alone proves nothing. This result carries no
            // engine-stamped ProviderId, so it cannot be tied to a StorageSearchProvider and is dropped. The full
            // storage re-check (provider attribution + per-user account permissions) is covered in
            // SearchEngine.storagePermissions.test.ts.
            const fileResult = makeResult('file-1', '__synthetic__', 'storage-file');
            const out = await engine.TestFilterByPermissions([fileResult], user);
            expect(out).toHaveLength(0);
            // The storage path never consults entity metadata.
            expect(mockEntityByName).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────────────────────────────
    // A12.2(a): trust follows the provider the engine stamped on the result, never the label.
    //
    // Every shipped external-index provider labels its hits `SourceType: 'fulltext'`, with the index name
    // as `EntityName` and the document's own id as `RecordID`. When trust followed the label, an index
    // named after an entity the user can read admitted any document in it as that entity's row, unverified.
    // ─────────────────────────────────────────────────────────────────
    describe('trust follows the engine-stamped provider, not the SourceType label', () => {
        /** `Customers` has no row filter for the user; only `real-1` is a Customer. */
        const REAL_CUSTOMERS = new Set(['real-1']);
        beforeEach(() => {
            mockEntityByName.mockReturnValue(makeEntity({ Name: 'Customers', CanRead: true, Exempt: false, RlsClause: '' }) as unknown as EntityInfo);
            mockRunViewFn.mockImplementation(async (params: RunViewParams) => ({
                Success: true,
                Results: idsAskedAbout([params]).filter(id => REAL_CUSTOMERS.has(id)).map(ID => ({ ID })),
            }));
        });

        const externalProviders: Array<[string, BaseSearchProvider, string]> = [
            ['AzureAISearchProvider', new AzureAISearchProvider(), PROVIDER.Azure],
            ['TypesenseSearchProvider', new TypesenseSearchProvider(), PROVIDER.Typesense],
            ['ElasticsearchSearchProvider', new ElasticsearchSearchProvider(), PROVIDER.Elasticsearch],
            ['OpenSearchSearchProvider', new OpenSearchSearchProvider(), PROVIDER.OpenSearch],
        ];

        it.each(externalProviders)('verifies a %s hit labelled with the SourceType it really emits', async (_name, provider, providerId) => {
            // The SourceType the shipped provider declares and stamps — 'fulltext' for all four.
            expect(provider.SourceType).toBe('fulltext');
            expect(provider.ResultsAreRowsOfLabelledEntity).toBe(false);
            const hits = [
                makeResult('real-1', 'Customers', 'entity-record', provider.SourceType, providerId),
                makeResult('index-doc-7', 'Customers', 'entity-record', provider.SourceType, providerId),
            ];

            const out = await engine.TestFilterByPermissions(hits, user);

            expect(out.map(r => r.RecordID)).toEqual(['real-1']); // the document id that is not a Customer is dropped
            expect(mockRunViewFn).toHaveBeenCalledTimes(1);
            expect(idsAskedAbout(mockRunViewFn.mock.calls[0])).toEqual(['real-1', 'index-doc-7']);
        });

        it('verifies a third-party provider that labels its hits \'entity\'', async () => {
            const out = await engine.TestFilterByPermissions(
                [makeResult('forged', 'Customers', 'entity-record', 'entity', PROVIDER.SelfLabelledEntity)], user
            );
            expect(out).toHaveLength(0);
            expect(mockRunViewFn).toHaveBeenCalledTimes(1);
        });

        it('trusts only the two providers that read the labelled entity through RunView', () => {
            expect(new EntitySearchProvider().ResultsAreRowsOfLabelledEntity).toBe(true);
            expect(new FullTextSearchProvider().ResultsAreRowsOfLabelledEntity).toBe(true);
            expect(new VectorSearchProvider().ResultsAreRowsOfLabelledEntity).toBe(false);
            expect(new SelfLabelledEntityProvider().ResultsAreRowsOfLabelledEntity).toBe(false);
        });

        it.each([
            ['no ProviderId (a fusion fallback or a hand-built hit)', undefined],
            ['a ProviderId that names no configured provider', 'prov-never-configured'],
        ])('verifies an \'entity\' or \'fulltext\' hit with %s', async (_label, providerId) => {
            const out = await engine.TestFilterByPermissions([
                makeResult('real-1', 'Customers', 'entity-record', 'entity', providerId),
                makeResult('forged', 'Customers', 'entity-record', 'fulltext', providerId),
            ], user);
            expect(out.map(r => r.RecordID)).toEqual(['real-1']);
            expect(mockRunViewFn).toHaveBeenCalledTimes(1);
        });

        it('keeps the hot path free: entity and full-text hits next to an external hit add nothing to its one read', async () => {
            const out = await engine.TestFilterByPermissions([
                entityLaneHit('entity-1', 'Customers'),
                makeResult('fts-1', 'Customers', 'entity-record', 'fulltext', PROVIDER.FullText),
                makeResult('index-doc-7', 'Customers', 'entity-record', 'fulltext', PROVIDER.Azure),
            ], user);

            expect(out.map(r => r.RecordID)).toEqual(['entity-1', 'fts-1']);
            expect(mockRunViewFn).toHaveBeenCalledTimes(1);
            expect(idsAskedAbout(mockRunViewFn.mock.calls[0])).toEqual(['index-doc-7']);
        });

        it('issues no read at all for a group of only entity and full-text hits', async () => {
            const out = await engine.TestFilterByPermissions([
                entityLaneHit('entity-1', 'Customers'),
                makeResult('fts-1', 'Customers', 'entity-record', 'fulltext', PROVIDER.FullText),
            ], user);
            expect(out).toHaveLength(2);
            expect(mockRunViewFn).not.toHaveBeenCalled();
        });

        describe('a hit merged by fusion or dedup keeps the ProviderId of the item it came from', () => {
            const fusion = new SearchFusion();
            const fts = (id: string, score = 0.5) => ({ ...makeResult(id, 'Customers', 'entity-record', 'fulltext', PROVIDER.FullText), Score: score });
            const azure = (id: string, score = 0.5) => ({ ...makeResult(id, 'Customers', 'entity-record', 'fulltext', PROVIDER.Azure), Score: score });

            it('RRF keeps the full-text item for a key both lanes returned, and still verifies the external-only hit', async () => {
                const fused = fusion.Deduplicate(fusion.Fuse([
                    { Source: 'fulltext', Results: [fts('real-1')] },
                    { Source: 'fulltext', Results: [azure('real-1'), azure('index-doc-7')] },
                ], 10));

                const out = await engine.TestFilterByPermissions(fused, user);

                expect(out.map(r => [r.RecordID, r.ProviderId])).toEqual([['real-1', PROVIDER.FullText]]);
                expect(idsAskedAbout(mockRunViewFn.mock.calls[0])).toEqual(['index-doc-7']);
            });

            it('RRF that keeps the external item for a shared key verifies it — the merge never upgrades it', async () => {
                const fused = fusion.Deduplicate(fusion.Fuse([
                    { Source: 'fulltext', Results: [azure('real-1')] },
                    { Source: 'fulltext', Results: [fts('real-1')] },
                ], 10));

                const out = await engine.TestFilterByPermissions(fused, user);

                expect(fused.map(r => r.ProviderId)).toEqual([PROVIDER.Azure]);
                expect(out.map(r => r.RecordID)).toEqual(['real-1']); // kept because it IS a Customer, not because of the merge
                expect(idsAskedAbout(mockRunViewFn.mock.calls[0])).toEqual(['real-1']);
            });

            it('dedup prefers an \'entity\' label, and the preferred item keeps its own ProviderId, so a self-labelled hit is still verified', async () => {
                const selfLabelled = { ...makeResult('forged', 'Customers', 'entity-record', 'entity', PROVIDER.SelfLabelledEntity), Score: 0.4 };
                const merged = fusion.Deduplicate([fts('forged', 0.9), selfLabelled]);

                expect(merged.map(r => [r.SourceType, r.ProviderId])).toEqual([['entity', PROVIDER.SelfLabelledEntity]]);
                const out = await engine.TestFilterByPermissions(merged, user);
                expect(out).toHaveLength(0);
                expect(idsAskedAbout(mockRunViewFn.mock.calls[0])).toEqual(['forged']);
            });

            it('a fusion fallback item carries no ProviderId and is verified', async () => {
                const fallback = { ...makeResult('forged', 'Customers', 'entity-record', 'fused'), ProviderId: undefined };
                const out = await engine.TestFilterByPermissions([fallback], user);
                expect(out).toHaveLength(0);
                expect(mockRunViewFn).toHaveBeenCalledTimes(1);
            });
        });

        it('verifies every hit, trusted lane or not, when a row filter applies', async () => {
            const westOnly = makeEntity({ Name: 'Customers', CanRead: true, Exempt: false, RlsClause: "Region='West'" });
            mockEntityByName.mockReturnValue(westOnly as unknown as EntityInfo);
            await engine.TestFilterByPermissions([entityLaneHit('entity-1', 'Customers')], user);
            expect(mockRunViewFn).toHaveBeenCalledTimes(1);
            expect((mockRunViewFn.mock.calls[0][0] as RunViewParams).ExtraFilter).toBe("(ID IN ('entity-1')) AND (Region='West')");
        });

        // A content item promoted to its origin record names a row its provider never read: the provider read the
        // content item. A stale document can name an origin that no longer exists (a ghost hit), so trust is cleared.
        describe('a hit promoted from a content item to its origin record is verified, whichever provider found it', () => {
            const promoted = (id: string, providerId: string, sourceType: string) =>
                ({ ...makeResult(id, 'Customers', 'entity-record', sourceType, providerId), PromotedFromContentItemID: `ci-${id}` });

            it.each([
                ['the full-text provider', PROVIDER.FullText, 'fulltext'],
                ['the entity provider', PROVIDER.Entity, 'entity'],
            ])('verifies a hit %s found on a content item, and drops it when the origin row does not exist', async (_label, providerId, sourceType) => {
                const hits = [promoted('ghost-1', providerId, sourceType), promoted('real-1', providerId, sourceType)];
                const out = await engine.TestFilterByPermissions(hits, user);

                expect(out.map(r => r.RecordID)).toEqual(['real-1']);
                expect(mockRunViewFn).toHaveBeenCalledTimes(1);
                expect(idsAskedAbout(mockRunViewFn.mock.calls[0])).toEqual(['ghost-1', 'real-1']);
            });

            it('control: the same full-text hit, not promoted, skips verification', async () => {
                const out = await engine.TestFilterByPermissions([makeResult('ghost-1', 'Customers', 'entity-record', 'fulltext', PROVIDER.FullText)], user);
                expect(out).toHaveLength(1);
                expect(mockRunViewFn).not.toHaveBeenCalled();
            });

            it('keeps the provider attribution on the promoted hit — only the trust is withdrawn', async () => {
                const [kept] = await engine.TestFilterByPermissions([promoted('real-1', PROVIDER.FullText, 'fulltext')], user);
                expect(kept.ProviderId).toBe(PROVIDER.FullText);
            });
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase D — the SKILL principal, and time/tenant scoping on a grant.
//
// A skill is a principal in the same sense an agent is, so these mirror the agent rules
// exactly. The pure helpers (window + tenant applicability) are asserted directly because
// they are where an off-by-one or a null-handling slip would silently widen a grant.
// ─────────────────────────────────────────────────────────────────────────────
describe('SearchScopePermissionResolver — skill principal and grant scoping', () => {
    class TestResolver extends SearchScopePermissionResolver {
        public InWindow(row: unknown, now: Date) {
            return (this as unknown as { isGrantInWindow: (r: unknown, n: Date) => boolean })
                .isGrantInWindow(row, now);
        }
        public ForTenant(row: unknown, tenant: string | null) {
            return (this as unknown as { isGrantForTenant: (r: unknown, t: string | null) => boolean })
                .isGrantForTenant(row, tenant);
        }
        public Applicable(rows: unknown[], tenant: string | null, now: Date) {
            return (this as unknown as { applicableGrants: (r: unknown[], t: string | null, n: Date) => unknown[] })
                .applicableGrants(rows, tenant, now);
        }
    }
    const r = new TestResolver();
    const NOW = new Date('2026-07-27T12:00:00Z');
    const ORG_A = 'AAAAAAAA-0000-4000-8000-000000000001';
    const ORG_B = 'BBBBBBBB-0000-4000-8000-000000000002';

    describe('time window', () => {
        it('a grant with no window is always in force (every pre-existing row)', () => {
            expect(r.InWindow({}, NOW)).toBe(true);
            expect(r.InWindow({ StartAt: null, EndAt: null }, NOW)).toBe(true);
        });
        it('honours an open window and rejects one not yet started or already ended', () => {
            expect(r.InWindow({ StartAt: '2026-07-01T00:00:00Z', EndAt: '2026-08-01T00:00:00Z' }, NOW)).toBe(true);
            expect(r.InWindow({ StartAt: '2026-08-01T00:00:00Z' }, NOW)).toBe(false);
            expect(r.InWindow({ EndAt: '2026-07-01T00:00:00Z' }, NOW)).toBe(false);
        });
        it('treats a half-open window correctly', () => {
            expect(r.InWindow({ StartAt: '2026-07-01T00:00:00Z' }, NOW)).toBe(true);
            expect(r.InWindow({ EndAt: '2026-08-01T00:00:00Z' }, NOW)).toBe(true);
        });
    });

    describe('tenant applicability', () => {
        it('a grant with no tenant applies everywhere, including to an untenanted search', () => {
            expect(r.ForTenant({ PrimaryScopeRecordID: null }, ORG_A)).toBe(true);
            expect(r.ForTenant({}, null)).toBe(true);
        });
        it('a tenant-scoped grant applies ONLY to that tenant', () => {
            expect(r.ForTenant({ PrimaryScopeRecordID: ORG_A }, ORG_A)).toBe(true);
            expect(r.ForTenant({ PrimaryScopeRecordID: ORG_A }, ORG_B)).toBe(false);
        });
        it('a tenant-scoped grant does NOT apply when the search supplies no tenant', () => {
            // "This grant is for org A" cannot be honoured by an untenanted search, so the safe
            // reading is that it does not apply.
            expect(r.ForTenant({ PrimaryScopeRecordID: ORG_A }, null)).toBe(false);
        });
        it('matches tenants case-insensitively (uuid casing varies by source)', () => {
            expect(r.ForTenant({ PrimaryScopeRecordID: ORG_A.toLowerCase() }, ORG_A.toUpperCase())).toBe(true);
        });
    });

    describe('applicableGrants composes both filters', () => {
        it('keeps only rows in force for this tenant', () => {
            const rows = [
                { ID: 'keep-untenanted-unwindowed' },
                { ID: 'keep-matching-tenant', PrimaryScopeRecordID: ORG_A },
                { ID: 'drop-other-tenant', PrimaryScopeRecordID: ORG_B },
                { ID: 'drop-expired', EndAt: '2026-01-01T00:00:00Z' },
                { ID: 'drop-future', StartAt: '2027-01-01T00:00:00Z' },
            ];
            const kept = r.Applicable(rows, ORG_A, NOW).map((x) => (x as { ID: string }).ID);
            expect(kept).toEqual(['keep-untenanted-unwindowed', 'keep-matching-tenant']);
        });
    });

    describe('skill sources mirror the agent sources', () => {
        it('exposes SkillNone / SkillAssignedNotListed / SkillUnscopedAll', () => {
            // Compile-time assertion that the union grew; a typo here fails the build.
            const sources: SearchScopePermissionSource[] = ['SkillNone', 'SkillAssignedNotListed', 'SkillUnscopedAll'];
            expect(sources).toHaveLength(3);
        });
    });
});
