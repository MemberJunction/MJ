/**
 * search-scope-bound.checks.ts — the 'search-scope-bound' bundle (SSB1–SSB3): a scoped search is bounded by its
 * scope's rows, against a live database.
 *
 * The unit tier (SearchEngine.boundedScopes.test.ts) pins the rules against faked scope rows; this bundle proves
 * them through the real `SearchEngineBase` load of real `MJ: Search Scope*` rows, the real scope-permission
 * resolver behind `ExplainScope`, the real lane-filter read against `MJ: AI Agents`, and the real search-log row:
 *
 *  - SSB1: a non-global scope with an entity lane and NO provider rows runs no provider and returns nothing, and
 *    its logged scope decision (and `ExplainScope`) is `Reachable: false`. It used to run every provider.
 *  - SSB2: with an enabled provider row and a lane `ExtraFilter` of `ID='<agent A>'`, a non-entity provider's
 *    full-text hits for agents A and B are held to the lane filter: only A survives.
 *  - SSB3: every fixture row (and the search-log rows the searches wrote) is deleted and gone.
 *
 * TRANSPORT: SERVER. A test subclass of `SearchEngine` (the keyhole pattern of search-origin-gate) binds the run's
 * provider and injects ONE provider entry — a stub that returns hand-built `'fulltext'` hits, so no model, index or
 * network is touched. The entry carries the ID of a borrowed `MJ: Search Providers` row, because a scope's provider
 * row must name a real provider record; what runs is the stub. The injection writes the engine's private provider
 * list the way the SearchEngine unit tests do — there is no public seam for it, and `Config()` would instantiate the
 * deployment's real providers instead.
 *
 * FIXTURES (own rows, tagged "(mj-integration-test — safe to delete)", created by Setup as ctx.User): one non-global
 * Active `MJ: Search Scopes` row (whose save auto-grants its creator a Manage permission row) and one
 * `MJ: Search Scope Entities` lane on `MJ: AI Agents`; SSB2 adds one `MJ: Search Scope Providers` row. Borrowed,
 * read-only: two agents and one search provider record. Missing borrowed rows → every check SKIPS-AS-PASS LOUDLY.
 * Not RequiresMutation-gated, mirroring search-origin-gate: it writes only its own tagged rows and removes them.
 */
import { BaseEntity, RunView } from '@memberjunction/core';
import type { IMetadataProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import { SearchEngineBase } from '@memberjunction/core-entities';
import type {
    MJSearchProviderEntity,
    MJSearchScopeEntity,
    MJSearchScopeEntityEntity,
    MJSearchScopeProviderEntity
} from '@memberjunction/core-entities';
import { BaseSearchProvider, SearchEngine } from '@memberjunction/search-engine';
import type { ScopeExplanation, SearchResult, SearchResultItem, SearchSource } from '@memberjunction/search-engine';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const MARKER = '(mj-integration-test — safe to delete)';
const AGENTS = 'MJ: AI Agents';
const SCOPES = 'MJ: Search Scopes';
const SCOPE_ENTITIES = 'MJ: Search Scope Entities';
const SCOPE_PROVIDERS = 'MJ: Search Scope Providers';
const SCOPE_PERMISSIONS = 'MJ: Search Scope Permissions';
const SEARCH_LOGS = 'MJ: Search Execution Logs';

/** A fixture row, kept so it can be deleted and then looked for again. */
interface CreatedRow {
    EntityName: string;
    Row: BaseEntity;
    Deleted: boolean;
}

/** Bundle state (module-level: IntegrationCheckContext has no slot for it and the framework is not modified). */
interface ScopeBoundFixture {
    Prefix: string;
    SkipReason?: string;
    /** In creation order; deleted in reverse. */
    Created: CreatedRow[];
    ScopeID?: string;
    AgentA?: string;
    AgentB?: string;
    /** The borrowed provider record the scope's provider row names. */
    ProviderRecord?: MJSearchProviderEntity;
    /** Set by SSB3 once every row is deleted and proven gone, so Teardown has nothing left to do. */
    Removed: boolean;
}
let fixture: ScopeBoundFixture | undefined;

/** The fixture once Setup has built it, with the fields every search check needs narrowed to present. */
interface UsableFixture {
    Fx: ScopeBoundFixture;
    ScopeID: string;
    AgentA: string;
    AgentB: string;
    ProviderRecord: MJSearchProviderEntity;
}

/** The shape of one entry in `SearchEngine`'s private provider list. */
interface InjectedProviderEntry {
    Provider: BaseSearchProvider;
    ID: string;
    DisplayName: string;
    Icon: string;
    Priority: number;
    SupportsPreview: boolean;
    MaxResultsOverride: number | null;
    Record: MJSearchProviderEntity;
}

/** The private engine state the probe writes (see the file header for why there is no public seam). */
interface ProbeEngineState {
    _providerEntries: InjectedProviderEntry[];
    _configured: boolean;
}

/** A non-entity provider that returns fixed hits and counts its calls. */
class FixedHitsProvider extends BaseSearchProvider {
    public readonly SourceType: SearchSource = 'fulltext';
    public Calls = 0;
    private hits: SearchResultItem[];

    public constructor(hits: SearchResultItem[]) {
        super();
        this.hits = hits;
    }

    public override async Search(): Promise<SearchResultItem[]> {
        this.Calls++;
        return this.hits.map(h => ({ ...h }));
    }
}

/** SearchEngine bound to the run's provider, with exactly one injected provider entry. */
class ScopeBoundProbe extends SearchEngine {
    private probeProvider: IMetadataProvider | undefined;

    public static For(provider: IMetadataProvider, stub: FixedHitsProvider, record: MJSearchProviderEntity): ScopeBoundProbe {
        const probe = ScopeBoundProbe.getInstance<ScopeBoundProbe>();
        probe.probeProvider = provider;
        const state = probe as unknown as ProbeEngineState;
        state._providerEntries = [{
            Provider: stub, ID: record.ID, DisplayName: `${record.Name} (stub)`, Icon: '', Priority: 1,
            SupportsPreview: true, MaxResultsOverride: null, Record: record
        }];
        state._configured = true;
        probe.ClearResultCache();
        return probe;
    }

    protected override get ProviderToUse(): IMetadataProvider {
        if (!this.probeProvider) {
            throw new Error('ScopeBoundProbe used before For(provider)');
        }
        return this.probeProvider;
    }
}

function skipNote(checkId: string, reason: string): void {
    console.warn(`  ⚠ search-scope-bound.${checkId} SKIPPED — ${reason}`);
}

/** A full-text hit on an agent, as a non-entity provider would return it. */
function agentHit(agentID: string, label: string): SearchResultItem {
    return {
        ID: `ssb-${label}`, EntityName: AGENTS, RecordID: agentID, SourceType: 'fulltext', Title: `${label} ${MARKER}`,
        RecordName: label, Snippet: '', Score: 0.9, ScoreBreakdown: {}, Tags: [], MatchedAt: new Date(), ResultType: 'entity-record'
    };
}

/** Create one fixture row as ctx.User, recording it for deletion before anything else can throw. */
async function saveRow<T extends BaseEntity>(
    ctx: IntegrationCheckContext,
    fx: ScopeBoundFixture,
    entityName: string,
    fill: (row: T) => void
): Promise<T> {
    const row = await ctx.Provider.GetEntityObject<T>(entityName, ctx.User);
    row.NewRecord();
    fill(row);
    const saved = await row.Save();
    Assert(saved, `${entityName} fixture save failed: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    fx.Created.push({ EntityName: entityName, Row: row, Deleted: false });
    return row;
}

/** Reload the scope cache the engine resolves scopes from, so it sees the fixture rows as they are now. */
async function refreshScopeCache(ctx: IntegrationCheckContext): Promise<void> {
    await SearchEngineBase.Instance.Config(true, ctx.User, ctx.Provider);
}

/** Two agents and one search-provider record to borrow; a string names what is missing. */
async function borrowSeeds(ctx: IntegrationCheckContext): Promise<{ Agents: string[]; Provider: MJSearchProviderEntity } | string> {
    const rv = new RunView();
    const agents = await rv.RunView<{ ID: string }>({ EntityName: AGENTS, Fields: ['ID'], OrderBy: 'ID', MaxRows: 2, ResultType: 'simple' }, ctx.User);
    if (!agents.Success || agents.Results.length < 2) {
        return `fewer than two readable rows in ${AGENTS}`;
    }
    const providers = await rv.RunView<MJSearchProviderEntity>({
        EntityName: 'MJ: Search Providers', ExtraFilter: `DriverClass <> 'EntitySearchProvider'`, OrderBy: 'Name', MaxRows: 1, ResultType: 'entity_object'
    }, ctx.User);
    if (!providers.Success || providers.Results.length === 0) {
        return 'no non-entity MJ: Search Providers row to borrow';
    }
    return { Agents: agents.Results.map(a => a.ID), Provider: providers.Results[0] };
}

/** Setup: publish the accumulator first (so Teardown sees partial work), then the scope and its entity lane. */
async function createFixture(ctx: IntegrationCheckContext): Promise<void> {
    const fx: ScopeBoundFixture = { Prefix: `it-ssb-${Date.now()}`, Created: [], Removed: false };
    fixture = fx;
    const agentsEntity = ctx.Provider.EntityByName(AGENTS);
    const seeds = await borrowSeeds(ctx);
    if (!agentsEntity || typeof seeds === 'string') {
        fx.SkipReason = typeof seeds === 'string' ? seeds : `'${AGENTS}' is not in metadata`;
        return;
    }
    [fx.AgentA, fx.AgentB] = seeds.Agents;
    fx.ProviderRecord = seeds.Provider;
    const scope = await saveRow<MJSearchScopeEntity>(ctx, fx, SCOPES, r => {
        r.Name = `${fx.Prefix} ${MARKER}`; r.Description = MARKER; r.IsGlobal = false; r.IsDefault = false;
        r.Status = 'Active'; r.OwnerUserID = ctx.User.ID;
    });
    fx.ScopeID = scope.ID;
    await saveRow<MJSearchScopeEntityEntity>(ctx, fx, SCOPE_ENTITIES, r => {
        r.SearchScopeID = scope.ID; r.EntityID = agentsEntity.ID; r.ExtraFilter = `ID='${EscapeSQLString(fx.AgentA ?? '')}'`;
    });
    await refreshScopeCache(ctx);
}

/** The fixture, or undefined after a loud skip note. */
function usableFixture(checkId: string): UsableFixture | undefined {
    const fx = fixture;
    if (!fx?.ScopeID || !fx.AgentA || !fx.AgentB || !fx.ProviderRecord) {
        skipNote(checkId, fx?.SkipReason ?? 'the fixtures were not created');
        return undefined;
    }
    return { Fx: fx, ScopeID: fx.ScopeID, AgentA: fx.AgentA, AgentB: fx.AgentB, ProviderRecord: fx.ProviderRecord };
}

/** One scoped search through the probe, with a query unique to this run and check. */
async function scopedSearch(
    ctx: IntegrationCheckContext,
    probe: ScopeBoundProbe,
    usable: UsableFixture,
    checkId: string
): Promise<{ Query: string; Result: SearchResult }> {
    const query = `${usable.Fx.Prefix} ${checkId} bounded scope`;
    const result = await probe.Search({ Query: query, ScopeIDs: [usable.ScopeID], MaxResults: 10 }, ctx.User);
    return { Query: query, Result: result };
}

/**
 * The scope decision the engine logged for `query`. The log row is written fire-and-forget, so this polls
 * (up to ~5 s) rather than reading once.
 */
async function loggedDecision(ctx: IntegrationCheckContext, query: string): Promise<ScopeExplanation> {
    const params: RunViewParams = {
        EntityName: SEARCH_LOGS, ExtraFilter: `Query='${EscapeSQLString(query)}'`, Fields: ['ID', 'ScopeDecisionJSON'],
        ResultType: 'simple', BypassCache: true
    };
    for (let attempt = 0; attempt < 20; attempt++) {
        const rows = await new RunView().RunView<{ ID: string; ScopeDecisionJSON: string | null }>(params, ctx.User);
        Assert(rows.Success, `search-log lookup failed: ${rows.ErrorMessage ?? 'unknown error'}`);
        const json = rows.Results[0]?.ScopeDecisionJSON;
        if (json) {
            const decisions = JSON.parse(json) as ScopeExplanation[];
            return decisions[0];
        }
        await new Promise(r => setTimeout(r, 250));
    }
    throw new Error(`no search-log row with a scope decision was written for "${query}"`);
}

/** How many of `ids` are `MJ: AI Agents` rows `user` can read, straight from the view. */
async function readableAgents(user: UserInfo, ids: string[]): Promise<number> {
    const inList = ids.map(id => `'${EscapeSQLString(id)}'`).join(',');
    const rows = await new RunView().RunView<{ ID: string }>({
        EntityName: AGENTS, ExtraFilter: `ID IN (${inList})`, Fields: ['ID'], ResultType: 'simple', BypassCache: true
    }, user);
    Assert(rows.Success, `agent lookup failed: ${rows.ErrorMessage ?? 'unknown error'}`);
    return rows.Results.length;
}

/** Delete the search-log rows this bundle's searches wrote against the fixture scope (written late, so re-swept). */
async function deleteScopeLogs(ctx: IntegrationCheckContext, scopeID: string, failures: string[]): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
        const rows = await scopeRows(ctx, SEARCH_LOGS, scopeID);
        for (const row of rows) {
            if (!await row.Delete()) {
                failures.push(`${SEARCH_LOGS} ${row.PrimaryKey.ToString()}: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        }
        if (rows.length === 0 && attempt > 0) {
            return;
        }
        await new Promise(r => setTimeout(r, 300));
    }
}

/** The rows of `entityName` that reference the fixture scope, as entity objects (BypassCache). */
async function scopeRows(ctx: IntegrationCheckContext, entityName: string, scopeID: string): Promise<BaseEntity[]> {
    const result = await new RunView().RunView<BaseEntity>({
        EntityName: entityName, ExtraFilter: `SearchScopeID='${EscapeSQLString(scopeID)}'`, ResultType: 'entity_object', BypassCache: true
    }, ctx.User);
    return result.Success ? result.Results : [];
}

/** Delete every fixture row: the scope's logs and auto-granted permissions first, then ours in reverse. */
async function deleteFixtures(ctx: IntegrationCheckContext, fx: ScopeBoundFixture): Promise<string[]> {
    const failures: string[] = [];
    if (fx.ScopeID) {
        await deleteScopeLogs(ctx, fx.ScopeID, failures);
        for (const grant of await scopeRows(ctx, SCOPE_PERMISSIONS, fx.ScopeID)) {
            if (!await grant.Delete()) {
                failures.push(`${SCOPE_PERMISSIONS}: ${grant.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        }
    }
    for (const created of [...fx.Created].reverse()) {
        if (created.Deleted) {
            continue;
        }
        try {
            created.Deleted = await created.Row.Delete();
            if (!created.Deleted) {
                failures.push(`${created.EntityName}: ${created.Row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        } catch (e) {
            failures.push(`${created.EntityName}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    await refreshScopeCache(ctx);
    return failures;
}

/** Rows that still reference (or are) the fixture scope, one message per entity that has any. */
async function remainingFixtureRows(ctx: IntegrationCheckContext, scopeID: string): Promise<string[]> {
    const id = EscapeSQLString(scopeID);
    const probes: Array<[string, string]> = [
        [SCOPES, `ID='${id}'`], [SCOPE_ENTITIES, `SearchScopeID='${id}'`], [SCOPE_PROVIDERS, `SearchScopeID='${id}'`],
        [SCOPE_PERMISSIONS, `SearchScopeID='${id}'`], [SEARCH_LOGS, `SearchScopeID='${id}'`]
    ];
    const params = probes.map(([EntityName, ExtraFilter]): RunViewParams =>
        ({ EntityName, ExtraFilter, Fields: ['ID'], ResultType: 'simple', BypassCache: true }));
    const results = await new RunView().RunViews<{ ID: string }>(params, ctx.User);
    return results.flatMap((r, i) => {
        if (!r.Success) {
            return [`${probes[i][0]}: lookup failed (${r.ErrorMessage ?? 'unknown error'})`];
        }
        return r.Results.length > 0 ? [`${probes[i][0]}: ${r.Results.length} row(s)`] : [];
    });
}

export const SearchScopeBoundChecks: NamedCheck[] = [
    {
        Id: 'search-scope-bound.SSB1',
        Name: 'SSB1: a non-global scope with an entity lane and NO provider rows runs no provider, returns nothing, and is Reachable:false',
        Fn: async (ctx): Promise<void> => {
            const fx = usableFixture('SSB1');
            if (!fx) { return; }
            const stub = new FixedHitsProvider([agentHit(fx.AgentA, 'agent-a'), agentHit(fx.AgentB, 'agent-b')]);
            const probe = ScopeBoundProbe.For(ctx.Provider, stub, fx.ProviderRecord);
            const { Query, Result } = await scopedSearch(ctx, probe, fx, 'SSB1');

            Assert(Result.Success, `the search failed: ${Result.ErrorMessage ?? 'unknown error'}`);
            // Anti-vacuity: an available provider WAS configured — the old rule would have run it and returned its hits.
            AssertEqual(Result.Providers.length, 1, 'configured providers the scope could have run');
            AssertEqual(stub.Calls, 0, 'provider calls for a scope with no provider rows');
            AssertEqual(Result.Results.length, 0, 'results for a scope with no provider rows');
            const decision = await loggedDecision(ctx, Query);
            AssertEqual(decision.Reachable, false, 'the logged scope decision is Reachable');
            Assert(decision.Diagnostics.some(d => d.includes('no enabled provider rows')), `logged diagnostics: ${decision.Diagnostics.join(' | ')}`);
            const [explained] = await probe.ExplainScope({ ScopeIDs: [fx.ScopeID] }, ctx.User);
            AssertEqual(explained.Reachable, false, 'ExplainScope agrees the scope is Reachable');
            const entitlement = explained.Entitlement?.Allowed ? 'granted' : 'denied';
            console.log(`      → no provider rows: 0 provider calls, 0 results; decision and dry run Reachable:false (entitlement ${entitlement})`);
        }
    },
    {
        Id: 'search-scope-bound.SSB2',
        Name: "SSB2: a lane ExtraFilter ID='<agent A>' holds a non-entity provider's full-text hits for agents A and B to A",
        Fn: async (ctx): Promise<void> => {
            const fx = usableFixture('SSB2');
            if (!fx) { return; }
            // Anti-vacuity: both agents are rows the run user can read, so only the lane filter can drop B.
            AssertEqual(await readableAgents(ctx.User, [fx.AgentA, fx.AgentB]), 2, 'precondition: both agents are readable by the run user');
            await saveRow<MJSearchScopeProviderEntity>(ctx, fx.Fx, SCOPE_PROVIDERS, r => {
                r.SearchScopeID = fx.ScopeID; r.SearchProviderID = fx.ProviderRecord.ID; r.Enabled = true;
            });
            await refreshScopeCache(ctx);

            const stub = new FixedHitsProvider([agentHit(fx.AgentA, 'agent-a'), agentHit(fx.AgentB, 'agent-b')]);
            const probe = ScopeBoundProbe.For(ctx.Provider, stub, fx.ProviderRecord);
            const { Query, Result } = await scopedSearch(ctx, probe, fx, 'SSB2');

            Assert(Result.Success, `the search failed: ${Result.ErrorMessage ?? 'unknown error'}`);
            AssertEqual(stub.Calls, 1, 'provider calls once the scope lists the provider');
            AssertEqual(Result.Results.map(r => r.RecordID).join(','), fx.AgentA, 'the hits that survive the lane ExtraFilter');
            AssertEqual((await loggedDecision(ctx, Query)).Reachable, true, 'the logged scope decision is Reachable');
            console.log('      → full-text hits for agents A and B; the lane filter read kept A and dropped B');
        }
    },
    {
        Id: 'search-scope-bound.SSB3',
        Name: 'SSB3: every fixture row, and the search-log rows the searches wrote, is deleted and gone',
        Fn: async (ctx): Promise<void> => {
            const fx = fixture;
            if (!fx?.ScopeID) {
                skipNote('SSB3', fx?.SkipReason ?? 'no fixture rows were created');
                return;
            }
            const failures = await deleteFixtures(ctx, fx);
            AssertEqual(failures.join('; '), '', 'every fixture row deletes');
            const remaining = await remainingFixtureRows(ctx, fx.ScopeID);
            AssertEqual(remaining.join('; '), '', 'no fixture row is left in the database');
            fx.Removed = true;
            console.log(`      → ${fx.Created.length} fixture row(s), the auto-granted permission and the search-log rows deleted and confirmed gone`);
        }
    }
];

for (const check of SearchScopeBoundChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// Setup creates the scope and its lane (publishing the accumulator first); Teardown deletes whatever SSB3 did not.
IntegrationCheckRegistry.Instance.RegisterLifecycle('search-scope-bound', {
    Setup: async (ctx: IntegrationCheckContext) => {
        await createFixture(ctx);
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const fx = fixture;
        if (fx && !fx.Removed && fx.Created.length > 0) {
            for (const failure of await deleteFixtures(ctx, fx)) {
                console.error(`search-scope-bound teardown: ${failure}`);
            }
        }
        fixture = undefined;
    }
});
