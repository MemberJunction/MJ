# Search Scopes & RAG+ Guide

> Implementation guide for MemberJunction's **Search Scopes** + **agent RAG+** architecture. Use this alongside the full design in [`plans/search-scopes-rag-plus.md`](../plans/search-scopes-rag-plus.md).

---

## 1. The Three Context Subsystems

MJ agents have three distinct mechanisms for bringing context into an LLM call. They are **not** interchangeable — each serves a different purpose:

| Subsystem | Mental Model | Source of Truth | Typical Content |
|---|---|---|---|
| **Notes & Examples** (`AgentContextInjector`) | The agent's **brain** | `MJ: AI Agent Notes` / `MJ: AI Agent Examples` | Learned behaviors, few-shot patterns, personality |
| **Data Sources** (`AgentDataPreloader`) | The agent's **briefing packet** | `MJ: AI Agent Data Sources` | Config tables, user profiles, static per-run data |
| **Search Scopes** (this guide) | The agent's **research library** | `MJ: Search Scopes` | Documents, policies, vectorized content relevant to *this query* |

**Decision tree**
- Does the content change per query based on retrieval? → **Search Scope**
- Does the agent always need it regardless of the question? → **Data Source**
- Is it about *how the agent should think* (tone, examples, corrections)? → **Note / Example**

**Rule of thumb:** If the reference content fits comfortably in every prompt (glossaries, acronym lists, short policy snippets), put it in a Note, not a Scope. RAG is for corpora that are too large to stuff into the prompt wholesale.

---

## 2. Search Scope Configuration

A `MJ: Search Scope` is a named, reusable search boundary. Each scope owns 4 child tables that determine what "in-scope" means:

```
Search Scope
├─ Search Scope Providers          → which providers participate (+ per-provider query transforms)
├─ Search Scope External Indexes   → which vector / 3rd-party indexes
├─ Search Scope Entities           → which entities for entity + full-text search
└─ Search Scope Storage Accounts   → which file storage accounts / folders
```

### Creating a scope (metadata sync)

Create `metadata/search-scopes/.your-scope.json`:

```json
[
  {
    "fields": {
      "Name": "HR Policies",
      "Description": "Company HR documents, PTO policy, benefits FAQ",
      "Icon": "fa-solid fa-user-tie",
      "IsGlobal": false,
      "IsDefault": false,
      "Status": "Active"
    },
    "relatedEntities": {
      "MJ: Search Scope Entities": [
        {
          "fields": {
            "SearchScopeID": "@parent:ID",
            "EntityID": "@lookup:Entities.Name=Knowledge Articles",
            "ExtraFilter": "CategoryID = '<hr-category-uuid>'"
          }
        }
      ],
      "MJ: Search Scope Providers": [
        {
          "fields": {
            "SearchScopeID": "@parent:ID",
            "SearchProviderID": "@lookup:MJ: Search Providers.Name=Semantic",
            "Enabled": true
          }
        }
      ]
    }
  }
]
```

Run `npx mj sync push --dir=metadata --include="search-scopes"`.

### Personal vs. Organization-wide scopes
- Set `OwnerUserID=<user-id>` for **personal scopes** (only visible to that user in the selector UI).
- Leave `OwnerUserID=NULL` for **organization-wide scopes** (visible to all users — Phase 2 adds per-role permission control).

### Time-windowed activation
Set `StartAt` / `EndAt` to auto-activate a scope for a specific window:
- Incident response: "give the support agent access to these logs for 48 hours"
- Seasonal: "Q4 financial reports are searchable Oct 1 – Jan 31"
- Onboarding: "new-hire documents are scoped for the first 30 days of employment"

### Advanced `ScopeConfig` JSON

```json
{
  "rrfK": 60,
  "fusionWeights": { "vector": 2.0, "fulltext": 1.0, "entity": 1.0, "storage": 0.5 },
  "reRanker": {
    "driverClass": "CohereReRanker",
    "inputTopN": 100,
    "outputTopN": 20,
    "config": { "model": "rerank-v3.5" }
  },
  "permissionOverfetchFactor": 3
}
```

Recognized keys:
- `rrfK` — RRF smoothing constant (default 60).
- `fusionWeights` — per-provider weights for cross-source RRF fusion within this scope.
- `reRanker` — optional re-ranker stage (see [§6](#6-optional-re-ranker)).
- `permissionOverfetchFactor` — multiplier on per-provider `topK` to compensate for residual permission filtering. Default 2.

---

## 3. Agent Integration

Agents connect to scopes via the `MJ: AI Agent Search Scopes` M:N table. Each row controls:

| Field | Purpose |
|---|---|
| `Phase` | `PreExecution` (RAG injected before first LLM call), `AgentInvoked` (callable via `__Scoped_Search` action), or `Both`. |
| `QueryTemplateID` | MJ Template for generating a search query from conversation context. Variables available: `lastUserMessage`, `recentMessages`, `conversationSummary`, `payload`, `agentName`, `scopeName`, `scopeDescription`. NULL = use last user message as-is. |
| `MaxResults` / `MinScore` | Per-agent overrides (tighter than scope / engine defaults). |
| `FusionWeightsOverride` | Per-agent RRF weight override (JSON). Resolution order: this > `SearchScope.ScopeConfig.fusionWeights` > engine defaults. |
| `Priority` | Ordering within phase. Lower = higher priority. |
| `StartAt` / `EndAt` | Time-windowed activation for this specific agent-scope assignment. |
| `IsDefault` | Marks the agent's default scope for tool calls that omit `ScopeID`. |

### `AIAgent.SearchScopeAccess`

Every agent has one of three access levels:

| Value | Behavior |
|---|---|
| `All` | Can use any scope including Global. `__Scoped_Search` does not restrict. |
| `Assigned` | Can use ONLY scopes in its `MJ: AI Agent Search Scopes` rows. `__Scoped_Search` rejects anything else with `ACCESS_DENIED`. |
| `None` | No search capability. `__Scoped_Search` rejects all requests. |

### Pre-Execution RAG

When an agent has any active `Phase IN ('PreExecution','Both')` rows, `BaseAgent` automatically runs `AgentPreExecutionRAG` during Phase 2 (in parallel with config load, data preload, and memory injection). The results are formatted as a `<retrieved_context>` system message and unshifted onto the conversation messages.

**Zero added latency** — Phase 2 already has slower tasks running in parallel; RAG slots alongside them without extending the critical path.

### Agent-Invoked Search

Assign `__Scoped_Search` to an agent's action set. When the agent calls it, the action:
1. Resolves the agent identity from `params.Context.AgentID` (or explicit `AgentID` param).
2. Enforces `SearchScopeAccess`.
3. Resolves the target scope (explicit `ScopeID`, agent's default, or Global).
4. Reads the optional `PrimaryScopeRecordID` (string UUID) and `SecondaryScopes` (JSON string) inputs, assembling a `SearchContext` when at least one is supplied. See [§10](#10-multi-tenant-search-context) for the runtime context model.
5. Runs `SearchEngine.Search()` with `ScopeIDs: [resolvedScopeID]` and `SearchContext: <assembled>`.
6. Returns ranked results + `ScopeID_Resolved` / `ScopeName_Resolved` output params.

#### Per-call multi-tenant inputs

The action accepts two optional inputs whose values flow into `SearchParams.SearchContext` and are then Nunjucks-rendered into every scope-level filter (MetadataFilter, ExtraFilter, UserSearchString, FolderPath):

| Input | Type | Purpose |
|---|---|---|
| `PrimaryScopeRecordID` | string (UUID) | Primary tenant key (e.g. `OrganizationID`). Available in templates as `{{ context.PrimaryScopeRecordID }}`. |
| `SecondaryScopes` | JSON string | Flat object of additional dimensions as `{ "<key>": <value> }`. Each value must be `string \| number \| boolean \| string[]`. Available in templates as `{{ context.SecondaryScopes.<key> }}`. Incompatible value types are dropped at parse time with a log; malformed JSON falls back to `undefined` rather than failing the call. |

Example agent tool call selecting only Finance-department content for Org `O1`:

```json
{
  "tool": "Scoped Search",
  "params": {
    "Query":               "Q3 budget approval",
    "AgentID":             "<agent-uuid>",
    "PrimaryScopeRecordID":"O1",
    "SecondaryScopes":     "{\"Department\":\"Finance\",\"Tags\":[\"q3\",\"approved\"]}"
  }
}
```

For this to actually narrow results, the scope's `SearchScopeEntity.ExtraFilter` (or `SearchScopeExternalIndex.MetadataFilter`) must reference the matching context fields, e.g. `OrganizationID = '{{ context.PrimaryScopeRecordID }}' AND Department = '{{ context.SecondaryScopes.Department }}'`. One scope definition then serves every tenant.

### Per-agent `FusionWeightsOverride`

Two agents can use the same scope but weight vector vs. full-text differently:
```json
// Betty: prefers semantic matches
{ "vector": 2.0, "fulltext": 1.0, "entity": 1.0 }

// Skip: values all sources equally
{ "vector": 1.0, "fulltext": 1.0, "entity": 1.0 }
```
No scope duplication needed.

---

## 4. Permission Push-Down (Section 3.6)

**The rule:** No result the calling user cannot see should ever enter the RRF or re-ranker stage. Permission filtering is a provider-level responsibility, not a post-processing afterthought.

**Why it matters:** If permissions are applied only at the end, an agent (or user) can issue a query that retrieves the "best" 25 matches globally, then loses all 25 after permission filtering — seeing empty results even though they would have seen plenty of matches within their actual permission set. Fusion and re-ranking compute over the wrong set, dropping valid results off the tail.

### Per-provider push-down mechanisms

| Provider | Mechanism |
|---|---|
| `EntitySearchProvider` / `FullTextSearchProvider` | RunView already evaluates `UserRowLevelSecurity` for `ContextCurrentUser`. The providers thread `contextUser` through to RunView — nothing extra required. |
| `VectorSearchProvider` | Each embedded record must carry permission metadata (role IDs, owner ID, tenant ID) at ingest time. At query time, translate `contextUser`'s roles into a native metadata filter and merge it with the scope's rendered `MetadataFilter` via `$and`. |
| `StorageSearchProvider` | Already folder-path / account-permission bounded via `MJ: File Storage Account Permissions`. |
| 3rd-party index providers | Use the engine's native permission/ACL filter. Documented in the "how to add a provider" guide. |

### Overfetch factor tuning

`effectiveTopK = userTopK * permissionOverfetchFactor` compensates for residual filtering. Default 2. Tune higher for corpora where permission sparsity is high (>50% of matches filtered).

### Observability

The engine logs `lateFilteredCount` per search whenever the residual safety net trims anything. If this is consistently non-zero for a provider, that provider's push-down is incomplete and should be fixed.

### Test requirements (Phase 1F integration)

- **Heavy-permission corpus**: 95% restricted, 5% visible to the test user. Verify the user still gets a full `topK` of visible results, not an empty set.
- **Cross-tenant isolation**: tenant-A user searching with tenant-B content present returns zero tenant-B results even when tenant-B content scores higher.
- **Overfetch sufficiency**: with `permissionOverfetchFactor = 2`, final result count is still `>= userTopK` when half the matches are filtered.

---

## 5. Multi-Scope Fusion

When multiple scopes are queried (either via UI multi-select or multiple pre-execution rows):

1. Each scope runs independently with its own provider subset, query transform, and fusion weights → per-scope RRF produces one ranked list.
2. The per-scope lists become inputs to **cross-scope RRF** (`SearchFusion.CrossScopeFusion()`), which uses the same `ComputeRRF` primitive from `@memberjunction/core`.
3. Records appearing in multiple scopes get boosted scores (standard RRF behavior).
4. The result is deduplicated by `EntityName::RecordID`, with the max score and merged ScoreBreakdown retained.

### Per-agent weight override

`AIAgentSearchScope.FusionWeightsOverride` (JSON) flows into `SearchParams.FusionWeightsOverride` and is honored per-provider inside each scope's fusion. This happens before cross-scope RRF.

---

## 6. Optional Re-Ranker

RRF merges ranked lists but each list comes from a different retrieval modality. A dedicated **re-ranker** — typically a cross-encoder LLM call — scores each candidate against the query text and produces a more accurate final ordering.

### Enabling

Add to `SearchScope.ScopeConfig`:
```json
{
  "reRanker": {
    "driverClass": "CohereReRanker",
    "inputTopN": 100,
    "outputTopN": 20,
    "config": { "model": "rerank-v3.5" }
  }
}
```

### The `BaseReRanker` primitive

Implementations subclass `BaseReRanker` and register via `@RegisterClass(BaseReRanker, 'DriverClassName')`. The engine resolves via `MJGlobal.Instance.ClassFactory`, calls `ReRank(query, candidates, topN, contextUser, config)`, then feeds the output into dedup → permission safety net → enrich.

- `NoopReRanker` (default, shipped) — returns candidates unchanged. Useful for wiring verification.
- `CohereReRanker`, `BGEReRanker`, `VoyageReRanker` — build as needed.

### Cost/latency note

Re-ranking adds **tens to hundreds of ms** and a per-call LLM cost. Turn it on only where result quality matters enough to pay for it — typically high-stakes pre-execution RAG scopes.

---

## 7. Per-Provider Query Transforms

A single scope can ask different providers to receive different query shapes:

- Vector provider: a chunk-shaped rewrite that resembles how chunks were embedded.
- Full-text provider: keyword-extracted phrases.
- Entity provider: pass-through.

### Resolution order (highest priority wins)
1. `SearchScopeProvider.QueryTransformTemplateID` — per-provider rewrite (stored MJ Template).
2. `AIAgentSearchScope.QueryTemplateID` — agent-scoped query generation.
3. Raw `lastUserMessage`.

The runtime dispatch lives in `SearchEngine.ts` (forwards) + `AgentPreExecutionRAG.resolveQuery()` (renders stored templates via `TemplateEngineServer`). Providers accept pre-rendered strings via `ScopeConstraints.QueryTransforms[sourceType]`.

---

## 8. Adding a 3rd-Party Retriever (Elasticsearch / Typesense / etc.)

The `SearchScopeExternalIndex` table is intentionally generic — it covers vector stores AND text/hybrid engines.

### Steps

1. **Register a new provider**: `@RegisterClass(BaseSearchProvider, 'ElasticsearchSearchProvider')`. Implement `Search(query, topK, filters, contextUser, scopeConstraints)`.
2. **Seed a `MJ: Search Provider` row** for it (DriverClass matches your registered key).
3. **Populate `MJ: Search Scope External Indexes`** rows with `IndexType='Elasticsearch'`, `ExternalIndexName='your-es-index'`, plus optional `MetadataFilter` (rendered as Nunjucks with SearchContext) and `ExternalIndexConfig`.
4. **Inside your provider's `Search()`**: filter `scopeConstraints.ExternalIndexes` to `IndexType === 'Elasticsearch'`, use the native index name + rendered filter.
5. **Implement permission push-down** natively (ES has its own document-level security).

Zero schema changes required. The generic `SearchScopeExternalIndex` row carries everything.

---

## 9. Search Results as Artifacts

When an agent's scoped search produces results that will be referenced in conversation, persist them as a `Search Result Set` artifact rather than inlining the full payload in the chat message.

### How

1. Call `AgentPreExecutionRAG.BuildArtifactPayload(result)` — returns a **Data Snapshot–shaped** payload (tables + computations + interpretation + scope/query metadata).
2. Set `agentResult.payload = payload` before returning from your agent.
3. `ProcessAgentArtifacts()` in `AgentRunner` picks it up and creates an `ArtifactVersion` with `ContentType='application/vnd.mj.search-result-set'`.
4. Visibility is controlled by the agent's `ArtifactCreationMode` (`'System Only'` vs. `'Always'`).

### Free benefits (available today)
- Versioning, SHA-256 dedup, conversation anchoring, artifact sharing permissions, JSON UI viewer.

### Unlocked when PR #2237 lands (zero code on our side)
- Agents navigate the result set across turns via inherited Data Snapshot + JSON tools (`get_rows`, `search_rows`, `aggregate`, `json_path`, `json_iterate`) — no re-search, no full-payload re-ingest.
- MJStorage backing for large result sets.

After #2237 lands, update `metadata/artifact-types/.artifact-types.json` → change `Search Result Set.ParentID` to `@lookup:MJ: Artifact Types.Name=Data Snapshot` and `DriverClass` to `DataArtifactViewerPlugin`.

---

## 10. Multi-Tenant Search Context

**Search Scope** = *what* to search (definition). **Search Context** = *whose perspective* to search from (runtime).

### Flowing context through agents

Two distinct paths populate `SearchContext` at runtime. They use the same `SecondaryScopeValue` union (`string | number | boolean | string[]`) shared with the agent memory system via `@memberjunction/ai-core-plus`, so there is no per-subsystem translation regardless of how the values arrive:

| Path | How context arrives | Where it's read |
|---|---|---|
| **Pre-execution RAG** (auto) | `ExecuteAgentParams.primaryScopeRecordId` + `secondaryScopes` flow directly from the agent run config | `AgentPreExecutionRAG` constructs `SearchContext` and calls `SearchEngine.Search()` before the agent's first LLM turn |
| **Agent-invoked Scoped Search** (explicit) | `PrimaryScopeRecordID` and `SecondaryScopes` (JSON string) supplied as action params on each `__Scoped_Search` call | `ScopedSearchAction` parses and validates the inputs, builds `SearchContext`, and passes it via `SearchParams.SearchContext` to `SearchEngine.Search()` |

The explicit-input path lets a single agent run multiple scoped queries with different tenant contexts (e.g. comparison across orgs in one turn) and lets callers other than `BaseAgent` — manual GraphQL invocations, external orchestrators — drive the action with per-call tenant info. Use `ActionInputMapping` on the agent step to wire `ExecuteAgentParams`-style values into the action's `PrimaryScopeRecordID` / `SecondaryScopes` inputs when you want a single agent payload to drive both paths consistently.

### Nunjucks rendering of scope config

The engine renders these fields at search time with `context.PrimaryScopeRecordID` and `context.SecondaryScopes.*` available:
- `SearchScopeExternalIndex.MetadataFilter` (rendered + JSON-parsed → native vector/ES filter)
- `SearchScopeEntity.ExtraFilter` (rendered → RunView `ExtraFilter`)
- `SearchScopeEntity.UserSearchString` (rendered → RunView `UserSearchString`)
- `SearchScopeStorageAccount.FolderPath` (rendered → path prefix filter)

Available filters in scope templates (matching `@memberjunction/templates`): `json`, `jsoninline`, `jsonparse`.

### Inheritance modes

Configured per dimension in `SearchScope.SearchContextConfig.dimensions[].inheritanceMode`:
- **Strict**: only exact matches. Content must be tagged with the queried dimension value.
- **Cascading**: broader — content without a dimension tag is treated as "applies to all". Use for soft hierarchies (e.g., org-wide policies visible to every department, but department-specific content only within that department).

### Tenant provisioning flow

Typical onboarding for a new tenant:
1. Create a dedicated vector index (Pinecone namespace / Qdrant collection).
2. Create a tenant storage folder.
3. Insert `MJ: Search Scope External Indexes` + `MJ: Search Scope Storage Accounts` rows wiring the shared scope to the tenant's infrastructure.
4. Ingest tenant content (Knowledge Pipeline).

Wrap these steps in an MJ Action invoked by the onboarding workflow so every new tenant automatically gets isolated search infrastructure linked to the shared scope definition.

---

## 11. Observability & Telemetry

The engine logs at key points (check `LogStatus` / `LogError` output):
- `SearchEngine: Search complete in Nms - K result(s) [across N scope(s)]` — per-search completion.
- `SearchEngine: Residual permission filter removed X result(s)` — non-zero values indicate incomplete provider push-down.
- `SearchEngine: Re-ranker "DriverClass" returned N result(s) (input=I, outputTopN=O)` — re-rank stage telemetry.
- `AgentPreExecutionRAG: Exception searching scope "NAME"` — per-scope search failures.
- `AgentPreExecutionRAG: Template "ID" render failed` — template-rendering failures fall back to `lastUserMessage`.

Key signals to watch:
- Consistent `lateFilteredCount > 0` → fix provider push-down.
- `AgentPreExecutionRAG` latency → should be within Phase 2's parallel budget (usually free). If it exceeds config-load time, either the scope is too broad or the provider is slow.
- `ScopedSearchAction` `ACCESS_DENIED` spikes → agent assignments drifted from calling patterns; review `MJ: AI Agent Search Scopes` rows.

---

## 12. Implementation Status

The plan-doc at `plans/search-scopes-rag-plus.md` carries the canonical
Phase-2-onward delivery log. Quick status here:

- **Phase 1** (entities, runtime, providers, RAG hook, ScopedSearchAction, GraphQL, Angular, dashboards) — shipped.
- **Phase 2A** (per-user permissions) — `SearchScopePermission` table, `SearchScopePermissionResolver`, GraphQL + Action enforcement, child-grid UIs, RLS safety-net test (PM-01–PM-10) — shipped.
- **Phase 2B** (`SearchResultSetToolLibrary`) — re-parented onto Data Snapshot, 5 search-specific tools (`filterByScore`, `groupBySourceProvider`, `getMatchingChunks`, `followSourceLink`, `rerankInline`) — shipped.
- **Phase 2C** (streaming) — `SearchEngine.streamSearch` async iterable, `StreamScopedSearch` mutation + `SearchStreamEvents` subscription, `AgentPreExecutionRAG` partials, `ScopedSearchAction.streamingMode`, Angular UI with per-provider chip strip (opt-in via `?stream=1`) — shipped.
- **Phase 2D** (reranker catalog) — `BaseReRanker` contract additions (Name, Version, GetMaxResultCount, EstimateCostCents, CostReporter), CohereReRanker, VoyageReRanker, OpenAIReRanker (chat-judge), BGEReRanker, `RerankerBudgetGuard` + `SearchScope.RerankerBudgetCents` — shipped (server). Form dropdown + budget field UI owed.
- **Phase 3** (observability) — `SearchExecutionLog` entity + logging hook in `SearchEngine.Search` — shipped (server). Analytics dashboard tab + per-scope CSV export owed.
- **Phase 4** (tuning UI) — fully owed (Angular session): live preview side-panel, fusion weight sliders, reranker A/B comparison with Kendall-tau / RBO, `SearchScopeTestQuery` per-scope canonical queries.
- **Phase 5** (external providers) — `ElasticsearchSearchProvider`, `TypesenseSearchProvider`, `AzureAISearchProvider`, `OpenSearchSearchProvider`, plus `BaseSearchProvider.GetAvailableProviders()` discovery helper — shipped (server). Form provider dropdown owed.
- **Phase 6** (cleanup) — UUIDsEqual sweep, ChildGrid audit, metadata-tripwire test for Search Result Set ParentID, this delivery log — shipped. Guide updates (this doc), fresh-DB migration audit owed.

---

## 13. Per-User Permissions (Phase 2A)

`SearchScopePermission` (table `__mj.SearchScopePermission`) grants or
restricts access to a scope on a per-user OR per-role basis. Each row
authorizes exactly one principal (UserID OR RoleID, never both — enforced
by `CK_SearchScopePermission_Principal`) at one of four levels:
`'None' | 'Read' | 'Search' | 'Manage'`.

### Resolution order

`SearchScopePermissionResolver.ResolveEffectivePermission(input)` evaluates:

1. **Direct user grant** — `UserID = caller.ID` rows in `SearchScopePermission`.
2. **Role grants** — rows where `RoleID` matches any role the caller belongs to. The highest-level grant across roles wins.
3. **AIAgent.SearchScopeAccess fallback** — when an agent context is present, `'All'` lets the agent search any scope (granted as `'Search'`); `'None'` blocks; `'Assigned'` requires an explicit grant above.

`'None'` entries at any tier mean "no-grant from this tier" — they fall through to the next tier rather than terminating.

### Push-down vs safety-net

The resolver's `toSqlPredicate()` returns either `'1=1'` (allowed) or `'1=0'`
(rejected) — providers must compose this into their WHERE clause / filter so
forbidden records never reach fusion. As a backstop,
`SearchEngine.filterByPermissions()` runs after fusion and drops any row the
provider missed (entity-level RLS check via `RunView`). When the late-filter
removes more than a handful of rows, that's a signal the responsible provider's
push-down is incomplete and should be tightened.

### Worked example

```typescript
const resolver = new SearchScopePermissionResolver();
const result = await resolver.ResolveEffectivePermission({
  User: contextUser,
  SearchScopeID: scopeID,
  Agent: maybeAgent,
});
if (!result.Allowed) {
  throw new ForbiddenError(`Search scope access denied: ${result.Reason}`);
}
// result.Level === 'Read' | 'Search' | 'Manage'
// result.Source === 'DirectGrant' | 'RoleGrant' | 'AgentUnscopedAll' | 'NoGrant'
```

---

## 14. Streaming Search (Phase 2C)

The synchronous `SearchEngine.Search()` call blocks until every provider has
returned and fusion + reranking complete. `streamSearch()` yields events as
each provider reports, letting agents reason about partials and the UI render
progressively.

### GraphQL surface

Two-step protocol:

1. **`StreamScopedSearch` mutation** — kicks off the run, returns
   `{ Success, StreamID, ErrorMessage }`. The server starts the search in
   the background, keyed by StreamID.
2. **`SearchStreamEvents(streamID)` subscription** — delivers events:
   `{ phase: 'provider', providerName, results, durationMs }`,
   `{ phase: 'fused', results }`, `{ phase: 'reranked', results }`,
   `{ phase: 'final', results }`, `{ phase: 'error', errorMessage }`.

The Angular `GraphQLSearchClient.StreamSearch(params)` returns an `Observable`
that wraps the two steps so component code only sees a single subscribe point.

### Angular consumer (P2C.5)

`SearchOverlayComponent` and `SearchResultsResource` both opt in via
`EnableStreaming` (Input on the overlay; URL query param `?stream=1` on the
resource page during rollout). On opt-in, both components subscribe to
`SearchService.StreamSearch(request)`, append per-provider results to the
list as 'provider' events arrive, and replace partials with the canonical
fused list on 'final'. A small status chip strip above the results renders
each provider's name + count + latency (or error message).

Defaulting `EnableStreaming` to `false` preserves Phase 1 request-response UX.
When the team is ready to flip the default, change the `false` to `true`
in the consuming component.

### Agent consumer

`AgentPreExecutionRAG` consumes `streamSearch` and appends partials to the
agent's scratchpad as markdown (not JSON — markdown's lower token cost +
better LLM accuracy is the standing convention). The `'reranked'` and
`'final'` events are flushed into the prompt at logical boundaries.

---

## 15. Reranker Catalog (Phase 2D)

Five rerankers ship today:

| Driver Class | Provider | Cost model | Notes |
|---|---|---|---|
| `NoopReRanker` | n/a | $0 | Default pass-through; preserves RRF order |
| `CohereReRanker` | Cohere `rerank-v3.5` (or `rerank-multilingual-v3.0`) | $2.00 / 1k searches (1 search = up to 100 docs) | Most accurate for English; multilingual variant via `config.model` |
| `VoyageReRanker` | Voyage `rerank-2` (or `rerank-2-lite`) | $0.05 / 1M tokens (`rerank-2`); $0.02 / 1M tokens (`rerank-2-lite`) | Per-token billing; exact `usage.total_tokens` reported |
| `OpenAIReRanker` | gpt-4o-mini chat-judge (no first-party endpoint as of 2026-04) | $0.15 / 1M input + $0.60 / 1M output (`gpt-4o-mini`) | Override model via `config.model`; revisit when OpenAI ships first-party rerank |
| `BGEReRanker` | Local `Xenova/bge-reranker-base` (or `-large`, `-v2-m3`) | $0 — local model | Lazy-loads weights via `@xenova/transformers`; never bundle weights |

### Configuring a scope to use a reranker

Set `SearchScope.ScopeConfig.reRanker.driverClass = 'CohereReRanker'` (etc.).
Optional `config.model` overrides the default model for the chosen driver.

### Cost tracking + budget guard

`SearchScope.RerankerBudgetCents` (nullable INT) caps real-provider rerank
spend per search invocation. NULL = uncapped (existing behavior preserved).
When set, `RerankerBudgetGuard`:

1. **Pre-call** — asks each reranker for `EstimateCostCents(N)` and
   short-circuits the rerank if the projected cost exceeds the remaining
   budget. The unranked top-N is returned and the skip is logged.
2. **Post-call** — wires `BaseReRanker.CostReporter` so the reranker's
   actual cost (Cohere: per-search × 0.2¢; Voyage / OpenAI: usage tokens
   × per-token price; BGE / Noop: 0) accumulates into `Spent`. Subsequent
   `EstimateCostCents` checks see the real burn rate.

### Observability

Each invocation writes a `MJSearchExecutionLog` row (Phase 3) with the
reranker driver-class name and `RerankerCostCents` populated.

---

## 16. Search Analytics (Phase 3)

`__mj.SearchExecutionLog` carries one row per `SearchEngine.Search`
invocation. Read by the Knowledge Hub Search Analytics dashboard (P3.3 —
owed), the per-scope tuning CSV export (P3.4 — owed), and direct
SQL queries.

### Schema (CodeGen-generated entity wrapper: `MJSearchExecutionLogEntity`)

| Column | Purpose |
|---|---|
| `ID`, `SearchScopeID`, `UserID`, `AIAgentID` | Identity (FKs all nullable for unscoped / unauthenticated / human-direct calls) |
| `Query` | Raw query text (`NVARCHAR(MAX)` — long natural-language queries) |
| `TotalDurationMs`, `ResultCount` | Per-run timing + final result count |
| `RerankerName`, `RerankerCostCents` | Populated when a reranker ran |
| `Status` | `'Success' \| 'Failure' \| 'Forbidden'` |
| `FailureReason` | Short message when not Success |
| `ProvidersJSON` | Per-source breakdown — feeds dashboard charts |

### Write semantics

The hook in `SearchEngine.logSearchExecution()` is best-effort: errors during
the write are swallowed and logged, never propagated. Observability must
never bring down search.

---

## 17. External Search Providers (Phase 5)

Four external providers ship today:

| Driver Class | Engine | Auth | Notes |
|---|---|---|---|
| `ElasticsearchSearchProvider` | Elasticsearch | apiKey OR username+password OR cloudId | SDK via optional peer `@elastic/elasticsearch` |
| `TypesenseSearchProvider` | Typesense | apiKey | Direct REST, parallel per-collection queries |
| `AzureAISearchProvider` | Azure AI Search | api-key | OData `$filter` push-down |
| `OpenSearchSearchProvider` | OpenSearch (incl. Amazon OpenSearch Service) | username+password OR pre-signed AWS SigV4 header | OS query DSL = ES 7.x compatible |

Each consumes `SearchScope.ExternalIndexes` rows with the matching
`IndexType`. The scope's rendered `MetadataFilter` (a JSON object or string in
the engine's native filter DSL — already-rendered with SearchContext via
Nunjucks) composes into the engine's filter clause for permission / tenant
push-down. Per-engine connection options live on `SearchProvider.ProviderConfig`.

---

## 18. How-to Templates

### How to add a new search provider

```typescript
// packages/SearchEngine/src/providers/my-search-provider.ts
import { RegisterClass } from '@memberjunction/global';
import { BaseSearchProvider, SearchProviderConfig } from '../generic/ISearchProvider';

@RegisterClass(BaseSearchProvider, 'MySearchProvider')
export class MySearchProvider extends BaseSearchProvider {
    public readonly SourceType: SearchSource = 'fulltext'; // or 'vector' | 'entity' | 'storage'

    public override async Initialize(config: SearchProviderConfig, contextUser: UserInfo): Promise<void> {
        await super.Initialize(config, contextUser);
        // Pull connection details from config.ProviderConfig (already-parsed JSON)
    }

    public async Search(query, topK, filters, contextUser, scopeConstraints?): Promise<SearchResultItem[]> {
        // 1. If scopeConstraints?.ExternalIndexes is set, filter to your IndexType
        // 2. If scopeConstraints?.QueryTransforms?.[this.SourceType] is set, use that as the query
        // 3. Push permission predicate (scope.MetadataFilter / equivalent) into your engine's WHERE clause
        // 4. Map results to SearchResultItem[]
        return [];
    }
}
```

Then seed a `MJ: Search Provider` row with `DriverClass = 'MySearchProvider'`.
The provider auto-appears in the discovery dropdown via
`BaseSearchProvider.GetAvailableProviders()`.

### How to add a new reranker

```typescript
// packages/SearchEngine/src/rerankers/MyReRanker.ts
import { RegisterClass } from '@memberjunction/global';
import { BaseReRanker } from '../generic/BaseReRanker';

@RegisterClass(BaseReRanker, 'MyReRanker')
export class MyReRanker extends BaseReRanker {
    public get DriverClass(): string { return 'MyReRanker'; }
    public override get Name(): string { return 'My'; }
    public override get Version(): string { return '1'; }
    public override GetMaxResultCount(): number { return 1000; }
    public override EstimateCostCents(n: number): number { /* ... */ return 0; }

    protected override getAIReranker(config, contextUser) {
        // Return a configured @memberjunction/ai BaseReranker instance, OR
        // override `ReRank()` directly to bypass the AI layer.
        return null;
    }
}
```

Configure via `SearchScope.ScopeConfig.reRanker.driverClass = 'MyReRanker'`.
Auto-appears in `BaseReRanker.GetAvailableRerankers()`.

### How to add a new artifact tool library

See `packages/AI/Agents/src/artifact-tools/SearchResultSetToolLibrary.ts` for
the canonical example. Pattern: `@RegisterClass(BaseArtifactToolLibrary, 'My
Artifact Type')`, override `getToolDefinitions()`, register the artifact type
in `metadata/artifact-types/.artifact-types.json` with `ParentID`
pointing at a parent type that supplies inherited tools (e.g.
`@lookup:MJ: Artifact Types.Name=Data Snapshot`).

### Alpha-sequence IDs in agent prompts

When an agent needs to refer back to a result row in a tool call, use
`A`, `B`, `C` … `AA`, `AB` (base-26) instead of UUIDs. UUIDs in prompts
waste tokens, are noisy in tool-call output, and tempt the model to
hallucinate them. The artifact tool library maps alpha-sequence IDs back
to internal UUIDs without leaking those UUIDs to the prompt.

### Embedding regeneration contract (operations note)

Several entities (`MJ: AI Agent Notes`, `MJ: AI Agent Examples`,
`MJ: Queries`) maintain `EmbeddingVector` + `EmbeddingModelID` columns
that the Vector search provider consumes. Embeddings are regenerated
inside the entity's server-side `Save()` override **only when the
fields they're derived from are dirty**:

| Entity | Composite text source | Regenerates when dirty |
|---|---|---|
| `MJ: AI Agent Notes` | `Note` | `Note` |
| `MJ: AI Agent Examples` | `ExampleInput` | `ExampleInput` |
| `MJ: Queries` | `Name + UserQuestion + Description` | any of those three |

**Implication for ops**: any code path that bypasses `BaseEntity.Save()`
— direct `INSERT`/`UPDATE` SQL, raw `mj sync` of pre-computed metadata,
restoration from a logical backup that doesn't replay through entity
saves — will produce records whose `EmbeddingVector` is stale or
missing. Vector search will then return outdated matches (or skip the
record entirely if the column is `NULL`).

**Operational guidance**:
- For bulk imports, prefer running through `BaseEntity.Save()` (e.g.
  `mj sync push --all`) so the embedding hook fires.
- After any direct SQL mutation, queue a re-embed by re-saving the
  affected records through the entity API (e.g. set `Note = Note + ' '`
  to mark the field dirty, then `Save()`).
- A future enhancement could add an `EmbeddingRegeneratedAt` column and
  a maintenance action that re-embeds rows where
  `__mj_UpdatedAt > EmbeddingRegeneratedAt`. Not yet implemented.

The shipped tests (`s16-sage-vector-end-to-end`,
`SimpleVectorDatabase.QueryIndex.test.ts`) implicitly cover the
fire-on-dirty path — they all save through `Metadata.GetEntityObject`
and assert that downstream Vector search finds the newly-embedded
records.

### How to enable vector search for an existing entity (in-process)

Several core entities ship with `EmbeddingVector` + `EmbeddingModelID`
columns whose contents are auto-populated by their server-side
`Save()` override (see "Embedding regeneration contract" above).
Today: `MJ: Queries`, `MJ: AI Agent Notes`, `MJ: AI Agent Examples`.

**The data is there, but it isn't indexed by default.** The
`VectorSearchProvider` only knows about an entity's embeddings when an
`MJVectorIndex` row points at the column. Adding that row is what
brings the entity into the global shell search bar's vector path.

#### Recipe — point `SimpleVectorDatabase` at any embedded column

`SimpleVectorDatabase` (in `@memberjunction/ai-vectors-memory`) is the
in-process driver. It backs a `VectorDBBase` interface onto a single
entity column, runs cosine similarity over the loaded vectors via
`SimpleVectorService`, and requires no external service. Suitable for
dev, agent-memory, and small/medium corpora (≤ ~50K records). For
larger corpora use Pinecone/Qdrant/pgvector.

Steps (one-time per entity):

```sql
-- 1. Register the database (the "how to load" definition)
INSERT INTO __mj.VectorDatabase (Name, ClassKey, DefaultURL, Description)
VALUES (
    'Memory-Queries',                    -- friendly name
    'SimpleVectorDatabase',              -- ClassFactory key
    'memory://queries',                  -- nominal URL (cosmetic)
    'In-process vector DB over MJ: Queries.EmbeddingVector'
);

-- 2. Register the index (the "what to load" definition)
INSERT INTO __mj.VectorIndex (
    Name, Description, VectorDatabaseID, EmbeddingModelID,
    ExternalID, Dimensions, Metric, ProviderConfig
) VALUES (
    'Queries-Vector',
    'Persistent index over MJ: Queries.EmbeddingVector',
    '<VectorDatabase.ID from step 1>',
    '<EmbeddingModelID — must match what saves the column>',
    'queries',                            -- cosmetic
    768,                                  -- mpnet=768, OpenAI-3=1536, etc.
    'cosine',
    '{
        "entityName": "MJ: Queries",
        "vectorField": "EmbeddingVector",
        "filter": "EmbeddingVector IS NOT NULL",
        "titleField": "Name",
        "snippetField": "Description"
    }'
);
```

**Field meanings (`ProviderConfig` JSON):**
| Key | Purpose |
|---|---|
| `entityName` | The entity whose rows hold the vectors. Used for `RunView`. |
| `vectorField` | The column name. Stored as JSON-stringified `number[]`. |
| `filter` | Optional `ExtraFilter` for the load — typically `EmbeddingVector IS NOT NULL` so unembedded rows are skipped. |
| `titleField` | Field used as the result's display Title. Falls back to entity NameField. |
| `snippetField` | Field used as the result's display Snippet. |

**EmbeddingModelID must match the model the column was generated
with.** `MJQueryEntityServer` and `MJAIAgentNoteEntityServer` use
`AIEngine.Instance.EmbedTextLocal()` which routes through the
`LocalEmbedding` driver — currently `Xenova/all-mpnet-base-v2` at 768
dimensions (model ID `1d45aa65-41ec-4572-9ecd-ab2826c9b059` on this
deployment). Mismatched dimensions throw at load via
`SimpleVectorService.validateAndSetDimensions`.

#### Restart, then verify

After inserting, restart MJAPI so `VectorSearchProvider.CheckAvailability`
re-counts indexes and flips `IsAvailable()=true`. Then in any client:

```typescript
const result = await SearchEngine.Instance.Search({
    Query: 'whatever',
    MaxResults: 10
}, contextUser);

// Look for SourceType: 'vector' items in result.Results
// SourceCounts.Vector should be > 0
```

Or just use the global "Search everything…" bar in MJ Explorer — the
vector hits will appear inline alongside Entity LIKE / FullText hits,
ranked by RRF when multiple providers contribute (`ScoreBreakdown:
{Vector: 0.X, Entity: 0.Y}`) or surfaced as-is when only one provider
contributes (single-source fast path in `SearchFusion.Fuse`).

#### Coexistence with `AllowUserSearchAPI`

`MJ: Queries` ships with `AllowUserSearchAPI=false` — meaning even
after wiring the vector index, the LIKE-based `EntitySearchProvider`
still skips it. To get **fused** scores across both providers, also
flip the entity flag:

```sql
UPDATE __mj.Entity SET AllowUserSearchAPI = 1 WHERE Name = 'MJ: Queries';
```

That's a wider-blast-radius change (the entity also becomes available
in any other surface that respects `AllowUserSearchAPI`), so make it
deliberately rather than as part of the vector wiring.

#### Limitations of the in-process driver

- **Process-local cache invalidation only by row count.** In-place
  edits of an existing row's `EmbeddingVector` (without changing row
  count) won't bust the cache until process restart. See
  "Embedding regeneration contract" above for full operational notes.
- **All vectors loaded into memory** at first query, then cached.
  Sized for small/medium corpora — RAM scales linearly with row count.
- **Single-process.** Two MJAPI replicas each maintain their own
  in-memory cache. For sticky-session deployments that's fine; for
  load-balanced multi-replica setups, prefer Pinecone/Qdrant.

- Re-ranker catalog entity + visual configuration UI.
