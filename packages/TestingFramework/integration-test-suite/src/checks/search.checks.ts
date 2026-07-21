/**
 * search.checks.ts — the 'search' bundle (SR1–SR7), Domain 13 (Unified Search).
 *
 * Deterministic legs over the search decision-tree APIs from the Search Overview guide:
 *  - `EntityByName` (definition lookup — case/trim-insensitive, undefined-not-throw) vs
 *    `SearchEntity` (ranked RECORD search) — the two sides of the guide's decision tree,
 *  - per-entity `SearchEntity`/`SearchEntities` through the run's provider (client-first: over
 *    the wire under the GraphQL bootstrap, in-process otherwise) — pinned to `mode: 'lexical'`
 *    so no embedding model is ever touched (semantic legs are the LLM-gated tier, omitted here),
 *  - hostile-input robustness of the lexical pass (quotes + LIKE wildcards stay literal),
 *  - `SearchEngine.Search` graceful-configuration contracts — an UNCONFIGURED deployment (no
 *    active search providers) must return empty-success, never throw; sub-minimum-length
 *    queries short-circuit to empty success,
 *  - `SearchScopePermissionResolver` fail-closed semantics against REAL scope metadata,
 *  - the `GraphQLSearchClient` scope-list wire round-trip (Network transport only).
 *
 * The only DB rows this bundle can create are the `MJ: Search Execution Logs` audit rows the
 * SearchEngine writes per invocation — every query is prefixed with LOG_QUERY_PREFIX and the
 * bundle lifecycle Teardown sweeps those rows.
 */
import { ProviderBase, Metadata, RunView } from '@memberjunction/core';
import type { EntitySearchResult, SearchEntityParams } from '@memberjunction/core';
import { UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import type { MJSearchExecutionLogEntity, MJSearchScopeEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider, GraphQLSearchClient } from '@memberjunction/graphql-dataprovider';
import { SearchEngine, DefaultSearchScopePermissionResolver } from '@memberjunction/search-engine';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/** Every SearchEngine query this bundle issues starts with this, so teardown can sweep the audit rows. */
export const LOG_QUERY_PREFIX = 'mj-integration-test search';

/** A syntactically valid UUID that cannot exist as a seeded scope (fixed, never minted into the DB). */
const UNKNOWN_SCOPE_ID = '00000000-0000-4000-8000-00000000abcd';

/** Run a lexical-only per-entity search through the run's provider (never touches embeddings). */
async function lexicalSearch(ctx: IntegrationCheckContext, entityName: string, searchText: string, topK = 10): Promise<EntitySearchResult[]> {
    const params: SearchEntityParams = {
        entityName,
        searchText,
        options: { mode: 'lexical', topK, contextUser: ctx.User }
    };
    return (ctx.Provider as unknown as ProviderBase).SearchEntity(params);
}

export const SearchChecks: NamedCheck[] = [
    {
        Id: 'search.SR1',
        Name: 'SR1: EntityByName definition lookup — case/trim-insensitive hit, clean undefined for unknown names',
        Fn: async (ctx): Promise<void> => {
            const md = new Metadata(); // global-provider-ok: integration test script — single-provider process by design
            const canonical = md.EntityByName('MJ: Users');
            Assert(!!canonical, "'MJ: Users' must resolve");
            const mangled = md.EntityByName('  mj: users  ');
            Assert(!!mangled, 'EntityByName must be trim + case-insensitive');
            Assert(UUIDsEqual(canonical!.ID, mangled!.ID), 'case/trim variants must resolve the SAME EntityInfo');
            AssertEqual(md.EntityByName('MJ: Definitely Not An Entity'), undefined,
                'an unknown entity name must return undefined, never throw');
            // The provider surface must agree with the Metadata facade (same map underneath).
            const viaProvider = ctx.Provider.EntityByName('mj: users');
            Assert(!!viaProvider && UUIDsEqual(viaProvider.ID, canonical!.ID), 'provider EntityByName must agree with the Metadata facade');
            console.log(`      → definition lookup contract holds (ID ${canonical!.ID})`);
        }
    },
    {
        Id: 'search.SR2',
        Name: "SR2: SearchEntity (lexical) returns relevance-ordered results with the exact-name record at rank 1",
        Fn: async (ctx): Promise<void> => {
            const expected = new Metadata().EntityByName('MJ: Users'); // global-provider-ok: integration test script — single-provider process by design
            Assert(!!expected, "'MJ: Users' must exist");
            // Searching the 'MJ: Entities' catalog for the literal name — the lexical pass scores an
            // exact name match 1.0, so it must be rank 1 ahead of substring/field matches.
            const results = await lexicalSearch(ctx, 'MJ: Entities', 'MJ: Users', 10);
            Assert(results.length > 0, "lexical SearchEntity over 'MJ: Entities' returned nothing for an existing name — the lexical pass is broken");
            Assert(UUIDsEqual(results[0].recordId, expected!.ID),
                `the exact-name record must rank first — got '${results[0].recordId}', expected '${expected!.ID}'`);
            AssertEqual(results[0].matchType, 'lexical', 'lexical-mode results must be attributed to the lexical signal');
            for (let i = 1; i < results.length; i++) {
                Assert(results[i].score <= results[i - 1].score,
                    `results must be relevance-ordered (descending score): rank ${i} score ${results[i].score} > rank ${i - 1} score ${results[i - 1].score}`);
            }
            console.log(`      → ${results.length} ranked results; exact-name hit at rank 1 (score ${results[0].score})`);
        }
    },
    {
        Id: 'search.SR3',
        Name: 'SR3: SearchEntities batch stays input-aligned; unknown entities and empty queries degrade to clean empties',
        Fn: async (ctx): Promise<void> => {
            const batch: SearchEntityParams[] = [
                { entityName: 'MJ: Entities', searchText: 'MJ: Users', options: { mode: 'lexical', topK: 5, contextUser: ctx.User } },
                { entityName: 'MJ: Definitely Not An Entity', searchText: 'anything', options: { mode: 'lexical', contextUser: ctx.User } },
                { entityName: 'MJ: Entities', searchText: '   ', options: { mode: 'lexical', contextUser: ctx.User } },
            ];
            const groups = await (ctx.Provider as unknown as ProviderBase).SearchEntities(batch);
            AssertEqual(groups.length, batch.length, 'the batch result must stay aligned with the input (one group per param)');
            Assert(groups[0].length > 0, 'the valid slot must return results (anti-vacuity: proven searchable in SR2)');
            AssertEqual(groups[1].length, 0, 'an unknown entity must yield a clean empty group, never a throw');
            AssertEqual(groups[2].length, 0, 'a whitespace query must yield a clean empty group');
            console.log(`      → batch of ${batch.length} aligned: [${groups.map((g: EntitySearchResult[]) => g.length).join(', ')}]`);
        }
    },
    {
        Id: 'search.SR4',
        Name: 'SR4: hostile search text stays literal — quotes and LIKE wildcards never widen the match set',
        Fn: async (ctx): Promise<void> => {
            // A quote-breaking tautology probe: if the lexical pass failed to escape quotes, the
            // LIKE clause would degenerate into a match-everything predicate (or a SQL error/throw).
            const injection = await lexicalSearch(ctx, 'MJ: Entities', `zz' OR '1'='1`, 10);
            AssertEqual(injection.length, 0,
                'the quote-tautology probe must match nothing — any results mean the search text escaped its literal');
            // Wildcard probe: '%' and '_' must be escaped, not interpreted.
            const wildcard = await lexicalSearch(ctx, 'MJ: Entities', '%__nonexistent__%', 10);
            AssertEqual(wildcard.length, 0, 'LIKE wildcards in search text must be treated as literals');
            console.log('      → hostile inputs stayed literal (0 matches, no throw)');
        }
    },
    {
        Id: 'search.SR5',
        Name: 'SR5: SearchEngine.Search — unconfigured deployments return empty-success; short queries short-circuit',
        Fn: async (ctx): Promise<void> => {
            const engine = SearchEngine.Instance;
            await engine.Config({}, ctx.User, true);

            // Sub-minimum-length query: deterministic empty SUCCESS regardless of configuration
            // (and no provider fan-out, no audit row).
            const short = await engine.Search({ Query: 'mj' }, ctx.User);
            AssertEqual(short.Success, true, 'a sub-minimum-length query must return empty success');
            AssertEqual(short.TotalCount, 0, 'a sub-minimum-length query must return zero results');

            // A real (tagged) query: whatever the deployment's provider configuration, the engine
            // must return a STRUCTURED result — Success true with ranked items, or empty success
            // when no active providers exist. A throw or Success=false here is the graceful-
            // degradation regression this check pins.
            const probe = await engine.Search({ Query: `${LOG_QUERY_PREFIX} probe ${Date.now()}`, MaxResults: 5 }, ctx.User);
            AssertEqual(probe.Success, true, `a well-formed query must never fail structurally: ${probe.ErrorMessage ?? ''}`);
            Assert(Array.isArray(probe.Results), 'Results must always be an array');
            AssertEqual(probe.TotalCount, probe.Results.length, 'TotalCount must agree with the returned result set');
            if (probe.Providers.length === 0) {
                console.warn('  ⚠ search.SR5 NOTE — no active search providers configured in this deployment; the '
                    + 'empty-success contract was verified, but ranked cross-source results were not exercised '
                    + '(seed MJ: Search Providers to widen coverage)');
            } else {
                console.log(`      → ${probe.Providers.length} providers active; ${probe.TotalCount} results for the probe query`);
            }
        }
    },
    {
        Id: 'search.SR6',
        Name: 'SR6: SearchScopePermissionResolver is fail-closed — unknown scopes deny; real-scope decisions are internally consistent',
        Fn: async (ctx): Promise<void> => {
            // Fail-closed: a scope ID with no permission rows (guaranteed — it does not exist) must
            // resolve to a denial, and its SQL rendering must be the reject predicate.
            const denied = await DefaultSearchScopePermissionResolver.ResolveEffectivePermission({
                User: ctx.User,
                SearchScopeID: UNKNOWN_SCOPE_ID,
                Agent: null,
                ContextUser: ctx.User
            });
            AssertEqual(denied.Allowed, false, 'a scope with zero permission grants must resolve to DENY (fail-closed)');
            AssertEqual(denied.Level, 'None', 'the denied level must be None');
            AssertEqual(denied.toSqlPredicate(), '1=0', 'a denial must render the reject predicate');

            // Real metadata: every decision over the seeded scopes must be internally consistent
            // (Allowed ⇔ non-None level ⇔ allow predicate), whatever this deployment grants.
            const scopes = await new RunView().RunView<MJSearchScopeEntity>(
                { EntityName: 'MJ: Search Scopes', ResultType: 'entity_object', MaxRows: 10 }, ctx.User,
            );
            Assert(scopes.Success, `scope load failed: ${scopes.ErrorMessage}`);
            if (scopes.Results.length === 0) {
                console.warn('  ⚠ search.SR6 real-scope leg SKIPPED — no MJ: Search Scopes seeded in this deployment');
                return;
            }
            for (const scope of scopes.Results) {
                const decision = await DefaultSearchScopePermissionResolver.ResolveEffectivePermission({
                    User: ctx.User,
                    SearchScopeID: scope.ID,
                    Agent: null,
                    ContextUser: ctx.User
                });
                AssertEqual(decision.Allowed, decision.Level !== 'None',
                    `scope '${scope.Name}': Allowed must agree with Level (got Allowed=${decision.Allowed}, Level=${decision.Level})`);
                AssertEqual(decision.toSqlPredicate(), decision.Allowed ? '1=1' : '1=0',
                    `scope '${scope.Name}': the SQL predicate must agree with the decision`);
                Assert(decision.Reason.trim().length > 0, `scope '${scope.Name}': every decision must carry an auditable Reason`);
            }
            console.log(`      → fail-closed + ${scopes.Results.length} real-scope decisions internally consistent`);
        }
    },
    {
        Id: 'search.SR7',
        Name: 'SR7: GraphQLSearchClient scope list round-trips over the wire with no phantom scopes (Network transport only)',
        Fn: async (ctx): Promise<void> => {
            if (!(ctx.Provider instanceof GraphQLDataProvider)) {
                console.warn('  ⚠ search.SR7 SKIPPED — this run is not on the GraphQL client transport; '
                    + 'run the client dispatcher (bootstrapIntegrationClient) to exercise the wire leg');
                return;
            }
            const client = new GraphQLSearchClient(ctx.Provider);
            const wireScopes = await client.GetSearchScopes();
            Assert(Array.isArray(wireScopes), 'GetSearchScopes must return an array');
            const table = await new RunView().RunView<{ ID: string }>(
                { EntityName: 'MJ: Search Scopes', Fields: ['ID'], ResultType: 'simple' }, ctx.User,
            );
            Assert(table.Success, `scope table load failed: ${table.ErrorMessage}`);
            const known = new Set(table.Results.map(s => NormalizeUUID(s.ID)));
            for (const scope of wireScopes) {
                Assert(known.has(NormalizeUUID(scope.ID)),
                    `wire scope '${scope.Name}' (${scope.ID}) does not exist in MJ: Search Scopes — phantom scope over the wire`);
                Assert(scope.Name.trim().length > 0, `wire scope ${scope.ID} has an empty Name`);
            }
            // The wire list may legitimately be a permission-filtered SUBSET of the table — assert
            // only the no-phantom direction, and say so when the subset is strict.
            if (wireScopes.length < table.Results.length) {
                console.log(`      → wire returned ${wireScopes.length}/${table.Results.length} scopes (permission-filtered subset; no phantoms)`);
            } else {
                console.log(`      → ${wireScopes.length} scopes round-tripped with no phantoms`);
            }
        }
    }
];

for (const check of SearchChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// The SearchEngine writes one MJ: Search Execution Logs audit row per real invocation. Every query
// this bundle issues carries LOG_QUERY_PREFIX, so teardown can sweep exactly (and only) our rows.
IntegrationCheckRegistry.Instance.RegisterLifecycle('search', {
    Setup: async () => { /* stateless bundle — nothing to create */ },
    Teardown: async (ctx: IntegrationCheckContext) => {
        // The audit row this sweeps is written by SearchEngine.logSearchExecution FIRE-AND-
        // FORGET (SearchEngine.ts:446, unawaited) — a single synchronous sweep can run before
        // the write commits and leak the row (adversarial review F1). Bounded re-sweep: poll
        // until a pass finds zero rows (or 5 attempts × 300ms), so the late write is caught.
        for (let attempt = 0; attempt < 5; attempt++) {
            const leftovers = await new RunView().RunView<MJSearchExecutionLogEntity>(
                {
                    EntityName: 'MJ: Search Execution Logs',
                    ExtraFilter: `Query LIKE '${LOG_QUERY_PREFIX}%'`,
                    ResultType: 'entity_object',
                    BypassCache: true,
                },
                ctx.User,
            );
            const rows = leftovers.Success ? (leftovers.Results ?? []) : [];
            if (rows.length === 0 && attempt > 0) { break; }
            for (const row of rows) {
                // BaseEntity.Delete() returns false on logical failure (never throws) — check it.
                const ok = await row.Delete();
                if (!ok) { console.error(`search teardown: failed to delete log row ${row.ID}: ${row.LatestResult?.CompleteMessage}`); }
            }
            if (rows.length === 0) { break; }
            await new Promise(r => setTimeout(r, 300));
        }

    }
});
