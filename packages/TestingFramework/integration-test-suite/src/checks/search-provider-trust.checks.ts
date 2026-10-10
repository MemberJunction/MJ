/**
 * search-provider-trust.checks.ts — the 'search-provider-trust' bundle (SPT1–SPT2): two ways the search
 * engine used to trust what it should not, checked against a live database.
 *
 * SPT1 — an external-index hit is verified against the entity it names. Every shipped external-index
 * provider (Azure AI Search, Typesense, Elasticsearch, OpenSearch) stamps `SourceType: 'fulltext'`, with the
 * index name as `EntityName` and the document's own id as `RecordID`. When the permission pass trusted the
 * label, an index named after an entity the user can read admitted any document as that entity's row. Trust
 * now follows the provider the engine stamped on the result (`ProviderId`), and only providers that read the
 * labelled entity through `RunView` skip the `PK IN (...)` read.
 *
 * SPT2 — a named scope that cannot be resolved refuses the search. Before, it was skipped, and a search
 * whose scopes were all skipped ran with no scope at all: a global search. The contrast legs use the seeded
 * 'IT: Integration Test Scope' (Database provider over MJ: AI Agent Notes, keyword only — no model): naming it
 * alone searches, naming it together with the dead scope is refused. No unscoped search is run, because the
 * vector lane would embed the query.
 *
 * TRANSPORT: SERVER. `filterByPermissions` is a protected server-side step with no client surface; a test
 * subclass exposes it (the keyhole pattern of search-origin-gate). No network and no model: SPT1 hands the
 * engine hits built exactly as `AzureAISearchProvider` builds them instead of calling the provider.
 *
 * FIXTURES: none created. SPT1 borrows one existing `MJ: AI Agents` row (read-only); SPT2 borrows the seeded
 * scope (read-only) and skips only its contrast legs, loudly, when that scope is absent. SPT2's searches write
 * `MJ: Search Execution Logs` rows; every query starts with QUERY_PREFIX and Teardown sweeps them.
 */
import { EntityPermissionType, RunView, UserInfo } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import { SearchEngineBase } from '@memberjunction/core-entities';
import type { MJSearchExecutionLogEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { AzureAISearchProvider, BaseSearchProvider, FullTextSearchProvider, SearchEngine } from '@memberjunction/search-engine';
import type { SearchResultItem } from '@memberjunction/search-engine';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';

/** Every search this bundle runs starts with this, so Teardown can sweep exactly its audit rows. */
const QUERY_PREFIX = 'mj-integration-test search-provider-trust';
const AGENTS = 'MJ: AI Agents';
/** A syntactically valid agent id that is never minted: an index document that is not an agent. */
const NEVER_MINTED_AGENT_ID = '00000000-0000-4000-8000-00000000a122';
/** A syntactically valid scope id that is never minted. */
const NEVER_MINTED_SCOPE_ID = '00000000-0000-4000-8000-00000000a123';
/** The seeded keyword-only scope (metadata-optional/integration-test/ai-search/.it-search-scope.json). */
const IT_SCOPE_NAME = 'IT: Integration Test Scope';
/** The `ProviderId` stamps the probe maps to provider instances, as `Config()` maps a provider row's ID. */
const AZURE_PROVIDER_ID = 'it-spt-azure-ai-search';
const FULLTEXT_PROVIDER_ID = 'it-spt-full-text';

/**
 * SearchEngine with its permission filter exposed and its provider lookup pointed at two real provider
 * instances, without configuring the engine (which would probe each provider's endpoint).
 */
class ProviderTrustProbe extends SearchEngine {
    private probeProvider: IMetadataProvider | undefined;
    private readonly stamped = new Map<string, BaseSearchProvider>([
        [AZURE_PROVIDER_ID, new AzureAISearchProvider()],
        [FULLTEXT_PROVIDER_ID, new FullTextSearchProvider()],
    ]);

    public static For(provider: IMetadataProvider): ProviderTrustProbe {
        const probe = ProviderTrustProbe.getInstance<ProviderTrustProbe>();
        probe.probeProvider = provider;
        return probe;
    }

    protected override get ProviderToUse(): IMetadataProvider {
        if (!this.probeProvider) {
            throw new Error('ProviderTrustProbe used before For(provider)');
        }
        return this.probeProvider;
    }

    /** The provider a stamped hit came from — the engine's own lookup, over this probe's two entries. */
    protected override ProviderForResult(item: SearchResultItem): BaseSearchProvider | undefined {
        return item.ProviderId ? this.stamped.get(item.ProviderId) : undefined;
    }

    public async FilterByPermissions(results: SearchResultItem[], contextUser: UserInfo): Promise<SearchResultItem[]> {
        return this.filterByPermissions(results, contextUser);
    }
}

function skipNote(checkId: string, reason: string): void {
    console.warn(`  ⚠ search-provider-trust.${checkId} SKIPPED — ${reason}`);
}

/** A hit exactly as `AzureAISearchProvider.Search` maps one: index name as EntityName, document id as RecordID. */
function externalIndexHit(index: string, documentID: string, providerID: string, sourceType: string): SearchResultItem {
    return {
        ID: `azs-${index}-${documentID}`,
        EntityName: index,
        RecordID: documentID,
        SourceType: sourceType,
        ResultType: 'entity-record',
        Title: `document ${documentID}`,
        Snippet: '',
        Score: 0.9,
        ScoreBreakdown: { FullText: 0.9 },
        Tags: [],
        MatchedAt: new Date(),
        EntityIcon: 'fa-solid fa-cloud',
        ProviderId: providerID,
    };
}

/** One existing agent id the run user can read, or a reason to skip. */
async function borrowReadableAgentID(ctx: IntegrationCheckContext): Promise<string | { Skip: string }> {
    const entity = ctx.Provider.EntityByName(AGENTS);
    if (!entity?.GetUserPermisions(ctx.User)?.CanRead) {
        return { Skip: `the run user cannot read '${AGENTS}', so there is no readable row to label a hit with` };
    }
    const rows = await new RunView().RunView<{ ID: string }>(
        { EntityName: AGENTS, Fields: ['ID'], OrderBy: 'ID', MaxRows: 1, ResultType: 'simple' }, ctx.User);
    Assert(rows.Success, `agent lookup failed: ${rows.ErrorMessage ?? 'unknown error'}`);
    return rows.Results[0]?.ID ?? { Skip: `no '${AGENTS}' row is readable by the run user` };
}

/** Whether a row filter applies to the run user on `MJ: AI Agents` (then every hit is verified, trusted lane or not). */
function agentsRowFilterApplies(ctx: IntegrationCheckContext): boolean {
    const entity = ctx.Provider.EntityByName(AGENTS);
    return !!entity?.GetEffectiveRowFilterWhereClause(ctx.User, EntityPermissionType.Read, '');
}

/** SPT1's anti-vacuity control: the never-minted id, stamped by the full-text provider, is not verified. */
async function assertTrustedLaneSkipsVerification(ctx: IntegrationCheckContext, probe: ProviderTrustProbe): Promise<void> {
    if (agentsRowFilterApplies(ctx)) {
        console.log('      → control not run: a row filter applies to the run user on MJ: AI Agents, so every lane is verified');
        return;
    }
    const sameHitFromFullText = externalIndexHit(AGENTS, NEVER_MINTED_AGENT_ID, FULLTEXT_PROVIDER_ID, 'fulltext');
    const kept = await probe.FilterByPermissions([sameHitFromFullText], ctx.User);
    AssertEqual(kept.length, 1, 'control: the same hit stamped by the full-text provider (which reads through RunView) skips verification '
        + '— so the drop above is the provider identity, not the label or the id');
}

/** Poll for this bundle's audit row for `query` (the engine writes it fire-and-forget). */
async function awaitAuditRow(ctx: IntegrationCheckContext, query: string): Promise<MJSearchExecutionLogEntity | undefined> {
    for (let attempt = 0; attempt < 10; attempt++) {
        const rows = await new RunView().RunView<MJSearchExecutionLogEntity>({
            EntityName: 'MJ: Search Execution Logs', ExtraFilter: `Query='${EscapeSQLString(query)}'`,
            ResultType: 'entity_object', BypassCache: true,
        }, ctx.User);
        if (rows.Success && rows.Results.length > 0) {
            return rows.Results[0];
        }
        await new Promise(r => setTimeout(r, 300));
    }
    return undefined;
}

/** SPT2: the dead scope alone is refused — no results, the scope named, and a Failure audit row with no scope row. */
async function assertDeadScopeRefused(ctx: IntegrationCheckContext, query: string): Promise<void> {
    const refused = await SearchEngine.Instance.Search({ Query: query, ScopeIDs: [NEVER_MINTED_SCOPE_ID] }, ctx.User);
    AssertEqual(refused.Success, false, 'naming a scope that does not exist must refuse the search, not run it unscoped (SECURITY)');
    AssertEqual(refused.Results.length, 0, 'a refused search returns no results');
    Assert((refused.ErrorMessage ?? '').includes(NEVER_MINTED_SCOPE_ID), `the error must name the scope: ${refused.ErrorMessage ?? ''}`);

    const audit = await awaitAuditRow(ctx, query);
    Assert(!!audit, 'the refused search must leave an audit row in MJ: Search Execution Logs');
    AssertEqual(audit!.Status, 'Failure', 'the refused search is logged as a Failure');
    Assert(!audit!.SearchScopeID, 'the audit row names no scope row (the scope does not exist; SearchScopeID is a foreign key)');
    Assert(UUIDsEqual(audit!.UserID, ctx.User.ID), 'the audit row is attributed to the run user');
}

/** SPT2's contrast: the seeded scope alone searches; the same scope named with the dead one is refused. */
async function assertRefusedEvenBesideARealScope(ctx: IntegrationCheckContext, query: string): Promise<void> {
    const itScope = SearchEngineBase.Instance.GetScopeByName(IT_SCOPE_NAME);
    if (!itScope || !SearchEngineBase.Instance.GetActiveScopeByID(itScope.ID)) {
        skipNote('SPT2 (contrast legs)', `seeded scope '${IT_SCOPE_NAME}' is absent or inactive — push metadata-optional/integration-test`);
        return;
    }
    const alone = await SearchEngine.Instance.Search({ Query: `${query} control`, ScopeIDs: [itScope.ID] }, ctx.User);
    AssertEqual(alone.Success, true, `control: a search naming only the seeded scope runs: ${alone.ErrorMessage ?? ''}`);
    const mixed = await SearchEngine.Instance.Search({ Query: `${query} mixed`, ScopeIDs: [itScope.ID, NEVER_MINTED_SCOPE_ID] }, ctx.User);
    AssertEqual(mixed.Success, false, 'naming a real scope beside one that does not exist is still refused — the dead one is not silently dropped');
    AssertEqual(mixed.Results.length, 0, 'the mixed search returns no results');
}

/** SPT2's ExplainScope leg: the dry run must report the scope as unreachable, as the search refuses it. */
async function assertExplainAgrees(ctx: IntegrationCheckContext): Promise<void> {
    const [explained] = await SearchEngine.Instance.ExplainScope({ ScopeIDs: [NEVER_MINTED_SCOPE_ID] }, ctx.User);
    Assert(!!explained, 'ExplainScope returned no explanation for the requested scope');
    AssertEqual(explained.Reachable, false, 'ExplainScope must report a scope that cannot be resolved as unreachable');
    Assert(explained.Diagnostics.some(d => d.includes('refused')),
        `ExplainScope must say a search naming it is refused; got: ${explained.Diagnostics.join(' | ')}`);
}

/** Delete this bundle's audit rows, re-sweeping until a pass finds none (the writes are fire-and-forget). */
async function sweepAuditRows(ctx: IntegrationCheckContext): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
        const leftovers = await new RunView().RunView<MJSearchExecutionLogEntity>({
            EntityName: 'MJ: Search Execution Logs', ExtraFilter: `Query LIKE '${QUERY_PREFIX}%'`,
            ResultType: 'entity_object', BypassCache: true,
        }, ctx.User);
        const rows = leftovers.Success ? leftovers.Results : [];
        if (rows.length === 0 && attempt > 0) {
            return;
        }
        for (const row of rows) {
            if (!await row.Delete()) {
                console.error(`search-provider-trust teardown: could not delete log row ${row.ID}: ${row.LatestResult?.CompleteMessage}`);
            }
        }
        await new Promise(r => setTimeout(r, 300));
    }
}

export const SearchProviderTrustChecks: NamedCheck[] = [
    {
        Id: 'search-provider-trust.SPT1',
        Name: "SPT1: an Azure AI Search hit labelled 'fulltext' on MJ: AI Agents is verified — only the id that is a real agent survives",
        Fn: async (ctx): Promise<void> => {
            const agentID = await borrowReadableAgentID(ctx);
            if (typeof agentID !== 'string') {
                skipNote('SPT1', agentID.Skip);
                return;
            }
            const probe = ProviderTrustProbe.For(ctx.Provider);
            const azure = new AzureAISearchProvider();
            AssertEqual(azure.SourceType, 'fulltext', "precondition: AzureAISearchProvider labels its hits 'fulltext'");
            const hits = [
                externalIndexHit(AGENTS, agentID, AZURE_PROVIDER_ID, azure.SourceType),
                externalIndexHit(AGENTS, NEVER_MINTED_AGENT_ID, AZURE_PROVIDER_ID, azure.SourceType),
            ];
            const kept = await probe.FilterByPermissions(hits, ctx.User);
            AssertEqual(kept.map(r => r.RecordID).join(','), agentID,
                'only the hit whose document id is a real agent survives; the never-minted id is dropped (SECURITY)');
            await assertTrustedLaneSkipsVerification(ctx, probe);
            console.log('      → the external-index hit was verified against MJ: AI Agents as the run user; the forged id was dropped');
        }
    },
    {
        Id: 'search-provider-trust.SPT2',
        Name: 'SPT2: a search naming a scope that does not exist is refused with no results — not run unscoped, and not beside a real scope',
        Fn: async (ctx): Promise<void> => {
            await SearchEngine.Instance.Config({}, ctx.User);
            const query = `${QUERY_PREFIX} dead scope ${Date.now()}`;
            await assertDeadScopeRefused(ctx, query);
            await assertRefusedEvenBesideARealScope(ctx, query);
            await assertExplainAgrees(ctx);
            console.log('      → refused alone and beside a real scope, logged as a Failure; ExplainScope agrees');
        }
    }
];

for (const check of SearchProviderTrustChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// Nothing to create; Teardown sweeps the audit rows SPT2's searches wrote.
IntegrationCheckRegistry.Instance.RegisterLifecycle('search-provider-trust', {
    Setup: async () => { /* no fixtures */ },
    Teardown: async (ctx: IntegrationCheckContext) => {
        await sweepAuditRows(ctx);
    }
});
