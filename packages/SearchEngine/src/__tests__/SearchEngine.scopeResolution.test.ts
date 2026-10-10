/**
 * Tests for how the engine treats a named scope it cannot resolve (inactive, expired, or missing).
 *
 * Before: `resolveScopes` skipped such a scope, and a search whose scopes were all skipped had no resolved
 * scope — which the engine reads as Global — so naming a dead scope ran an UNSCOPED search: every provider,
 * every entity, no scope filter. Now the search is refused (`Success: false`, a `Failure` audit row) when ANY
 * named scope fails to resolve, before the cache is consulted, and `ExplainScope` reports the same.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { resolveSpy } = vi.hoisted(() => ({
    resolveSpy: vi.fn(async () => ({
        Allowed: true, Level: 'Search', Source: 'DirectGrant', Reason: 'ok', toSqlPredicate: () => '1=1',
    })),
}));

// The dry run resolves entitlement through this seam; stub it so ExplainScope needs no permission corpus.
vi.mock('../permissions/SearchScopePermissionResolver', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    GetSearchScopePermissionResolver: () => ({ ResolveEffectivePermission: resolveSpy }),
}));

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    class MockMetadata {
        static Provider = { EntityByName: (_name: string) => null, Entities: [] };
    }
    return { ...actual, Metadata: MockMetadata, LogError: vi.fn(), LogStatus: vi.fn() };
});

import { LogError } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJSearchScopeEntity, ScopeBundle, SearchEngineBase } from '@memberjunction/core-entities';
import { SearchEngine } from '../generic/SearchEngine';
import { BaseSearchProvider } from '../generic/ISearchProvider';
import type { SearchResultItem, SearchSource } from '../generic/search.types';
import type { LaneKind } from '../generic/ScopeExplanation';

const ACTIVE = 'A0000000-0000-4000-8000-000000000001';
const INACTIVE = 'A0000000-0000-4000-8000-000000000002';
const MISSING = 'A0000000-0000-4000-8000-0000000000ff';

const user = { ID: 'u-1', Name: 'Test User', Email: 't@example.com' } as UserInfo;

/** The one entity the fixture scopes have a lane on. */
const DOCS_ENTITY = { ID: 'E0000000-0000-4000-8000-0000000000d0', Name: 'Docs', FirstPrimaryKey: { Name: 'ID' }, PrimaryKeys: [{ Name: 'ID' }] };

/** Counts its calls: a refused search must run no provider, which is what proves it did not go global. */
class CountingProvider extends BaseSearchProvider {
    public readonly SourceType: SearchSource = 'vector';
    /** Its hits are `Docs` rows and the fixture scopes give it an entity lane on `Docs`, so it reads entity lanes. */
    public override readonly ConsumesLaneKinds: readonly LaneKind[] = ['Entity'];
    public Calls = 0;
    public async Search(): Promise<SearchResultItem[]> {
        this.Calls++;
        return [{
            ID: 'r-1', EntityName: 'Docs', RecordID: 'doc-1', SourceType: 'vector', Title: 'doc', Snippet: '',
            Score: 0.5, ScoreBreakdown: {}, Tags: [], MatchedAt: new Date(), ResultType: 'entity-record',
        }];
    }
}

/** The fields a saved `MJ: Search Execution Logs` row carries, as the engine fills them. */
interface AuditRow {
    SearchScopeID: string | null;
    Status: string;
    FailureReason: string | null;
    Query: string;
}

/** An in-memory stand-in for the scope catalogue `SearchEngineBase` caches. */
class FakeScopeCatalogue {
    public Scopes: MJSearchScopeEntity[] = [
        { ID: ACTIVE, Name: 'Active Scope', IsGlobal: false, ScopeConfig: null, SearchContextConfig: null } as MJSearchScopeEntity,
        { ID: INACTIVE, Name: 'Retired Scope', IsGlobal: false, ScopeConfig: null, SearchContextConfig: null } as MJSearchScopeEntity,
    ];
    public Active = new Set([ACTIVE]);

    public GetScopeByID(id: string): MJSearchScopeEntity | undefined {
        return this.Scopes.find(s => s.ID.toLowerCase() === (id ?? '').toLowerCase());
    }
    public GetActiveScopeByID(id: string): MJSearchScopeEntity | undefined {
        const scope = this.GetScopeByID(id);
        return scope && this.Active.has(scope.ID) ? scope : undefined;
    }
    /**
     * A non-global scope is bounded by its rows (it runs only its enabled provider rows over its lanes), so each
     * fixture scope carries one enabled row for the injected provider and one entity lane on `Docs`.
     */
    public GetScopeBundle(id: string): ScopeBundle | undefined {
        const scope = this.GetScopeByID(id);
        if (!scope) return undefined;
        const providerRow = { ID: `${scope.ID}-p`, SearchScopeID: scope.ID, SearchProviderID: 'prov-1', Enabled: true, MaxResultsOverride: null };
        const lane = { ID: `${scope.ID}-e`, SearchScopeID: scope.ID, EntityID: DOCS_ENTITY.ID, Entity: DOCS_ENTITY.Name, ExtraFilter: null };
        return { Scope: scope, Providers: [providerRow], ExternalIndexes: [], Entities: [lane], StorageAccounts: [] } as unknown as ScopeBundle;
    }
}

interface SearchEngineTestState {
    _providerEntries: Array<{
        Provider: BaseSearchProvider; ID: string; DisplayName: string; Icon: string; Priority: number;
        SupportsPreview: boolean; MaxResultsOverride: number | null; Record: unknown;
    }>;
    _configured: boolean;
}

class TestSearchEngine extends SearchEngine {
    public Catalogue = new FakeScopeCatalogue();
    public AuditRows: AuditRow[] = [];

    public InjectProvider(provider: BaseSearchProvider): void {
        const state = this as unknown as SearchEngineTestState;
        state._providerEntries = [{
            Provider: provider, ID: 'prov-1', DisplayName: 'Vector', Icon: 'fa-solid fa-circle', Priority: 0,
            SupportsPreview: false, MaxResultsOverride: null, Record: {},
        }];
        state._configured = true;
    }

    protected override get Base(): SearchEngineBase {
        return this.Catalogue as unknown as SearchEngineBase;
    }

    protected override get ProviderToUse(): IMetadataProvider {
        const rows = this.AuditRows;
        return {
            EntityByName: (name: string) => (name.trim().toLowerCase() === 'docs' ? DOCS_ENTITY : null),
            Entities: [DOCS_ENTITY],
            GetEntityObject: async () => {
                const row = { SearchScopeID: null, Status: '', FailureReason: null, Query: '' } as AuditRow;
                return Object.assign(row, { Save: async () => { rows.push({ ...row }); return true; } });
            },
        } as unknown as IMetadataProvider;
    }

    protected override async filterByPermissions(results: SearchResultItem[]): Promise<SearchResultItem[]> {
        return results;
    }
}

describe('a named scope that cannot be resolved', () => {
    let engine: TestSearchEngine;
    let provider: CountingProvider;

    beforeEach(() => {
        vi.mocked(LogError).mockClear();
        engine = new TestSearchEngine();
        provider = new CountingProvider();
        engine.InjectProvider(provider);
    });

    describe('Search()', () => {
        it.each([
            ['does not exist', MISSING],
            ['exists but is inactive or expired', INACTIVE],
        ])('refuses a search naming a scope that %s, and runs no provider — it is not a global search', async (_label, scopeID) => {
            const res = await engine.Search({ Query: 'budget', ScopeIDs: [scopeID] }, user);

            expect(res.Success).toBe(false);
            expect(res.Results).toEqual([]);
            expect(res.ErrorMessage).toContain(scopeID);
            expect(res.ErrorMessage).toMatch(/refused/);
            expect(provider.Calls).toBe(0);
            expect(vi.mocked(LogError)).toHaveBeenCalledWith(expect.stringContaining(scopeID));
        });

        it('refuses when ANY named scope cannot be resolved, even when another one can', async () => {
            const res = await engine.Search({ Query: 'budget', ScopeIDs: [ACTIVE, MISSING] }, user);

            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toContain(MISSING);
            expect(res.ErrorMessage).not.toContain(ACTIVE); // names only what failed
            expect(provider.Calls).toBe(0);
        });

        it('searches normally when every named scope resolves (control)', async () => {
            const res = await engine.Search({ Query: 'budget', ScopeIDs: [ACTIVE] }, user);

            expect(res.Success).toBe(true);
            expect(res.Results.map(r => r.RecordID)).toEqual(['doc-1']);
            expect(provider.Calls).toBe(1);
        });

        it('still searches globally when no scope is named (unchanged)', async () => {
            const res = await engine.Search({ Query: 'budget' }, user);
            expect(res.Success).toBe(true);
            expect(provider.Calls).toBe(1);
        });

        it('refuses before the cache: a scope deactivated after a search is not served from that search\'s entry', async () => {
            expect((await engine.Search({ Query: 'budget', ScopeIDs: [ACTIVE] }, user)).Success).toBe(true);
            engine.Catalogue.Active.delete(ACTIVE);

            const again = await engine.Search({ Query: 'budget', ScopeIDs: [ACTIVE] }, user);

            expect(again.Success).toBe(false);
            expect(again.Results).toEqual([]);
            expect(provider.Calls).toBe(1);
        });

        it('writes a Failure audit row, naming a scope row only when one exists (SearchScopeID is a foreign key)', async () => {
            await engine.Search({ Query: 'budget missing', ScopeIDs: [MISSING] }, user);
            await engine.Search({ Query: 'budget inactive', ScopeIDs: [INACTIVE] }, user);
            await vi.waitFor(() => expect(engine.AuditRows).toHaveLength(2), { timeout: 500, interval: 5 });

            const byQuery = new Map(engine.AuditRows.map(r => [r.Query, r]));
            expect(byQuery.get('budget missing')).toMatchObject({ Status: 'Failure', SearchScopeID: null });
            expect(byQuery.get('budget missing')?.FailureReason).toContain(MISSING);
            expect(byQuery.get('budget inactive')).toMatchObject({ Status: 'Failure', SearchScopeID: INACTIVE });
        });

        it('attributes the refusal to a scope that was refused, never to a valid scope searched beside a missing one', async () => {
            await engine.Search({ Query: 'budget active+missing', ScopeIDs: [ACTIVE, MISSING] }, user);
            await engine.Search({ Query: 'budget active+inactive', ScopeIDs: [ACTIVE, INACTIVE] }, user);
            await vi.waitFor(() => expect(engine.AuditRows).toHaveLength(2), { timeout: 500, interval: 5 });

            const byQuery = new Map(engine.AuditRows.map(r => [r.Query, r]));
            // The missing scope has no row to name, so none is named — ACTIVE was not refused.
            expect(byQuery.get('budget active+missing')).toMatchObject({ Status: 'Failure', SearchScopeID: null });
            // The inactive scope has a row: it is the one refused, so it is the one named.
            expect(byQuery.get('budget active+inactive')).toMatchObject({ Status: 'Failure', SearchScopeID: INACTIVE });
        });

        it('streams a single error event and no progress for a refused scope', async () => {
            const phases: string[] = [];
            for await (const ev of engine.streamSearch({ Query: 'budget', ScopeIDs: [MISSING] }, user)) phases.push(ev.phase);
            expect(phases).toEqual(['error']);
        });
    });

    describe('ExplainScope()', () => {
        it('explains an inactive scope as unreachable, by name, instead of as searchable', async () => {
            const [explained] = await engine.ExplainScope({ ScopeIDs: [INACTIVE] }, user);

            expect(explained.Reachable).toBe(false);
            expect(explained.ScopeName).toBe('Retired Scope');
            expect(explained.Lanes).toEqual([]);
            expect(explained.Diagnostics.join(' ')).toMatch(/refused, never widened to a global search/);
            // Nothing about the caller's grants was judged: the scope's status refused it, so the source says that.
            expect(explained.Entitlement?.Source).toBe('ScopeUnresolvable');
        });

        it('explains a missing scope as unreachable', async () => {
            const [explained] = await engine.ExplainScope({ ScopeIDs: [MISSING] }, user);
            expect(explained).toMatchObject({ ScopeID: MISSING, ScopeName: '(not found)', Reachable: false });
        });

        it('marks every scope unreachable when one of them cannot be resolved, as the search would refuse them all', async () => {
            const [active, missing] = await engine.ExplainScope({ ScopeIDs: [ACTIVE, MISSING] }, user);

            expect(missing.Reachable).toBe(false);
            expect(active.Reachable).toBe(false);
            expect(active.Diagnostics.join(' ')).toContain(`searched together with ${MISSING}`);
        });

        it('leaves a resolvable scope reachable when it is explained on its own (control)', async () => {
            const [active] = await engine.ExplainScope({ ScopeIDs: [ACTIVE] }, user);
            expect(active.Reachable).toBe(true);
            expect(active.ScopeName).toBe('Active Scope');
        });
    });
});
