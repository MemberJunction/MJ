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
4. Runs `SearchEngine.Search()` with `ScopeIDs: [resolvedScopeID]`.
5. Returns ranked results + `ScopeID_Resolved` / `ScopeName_Resolved` output params.

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

`ExecuteAgentParams.primaryScopeRecordId` + `secondaryScopes` automatically flow into `AgentPreExecutionRAG` and `ScopedSearchAction` as `SearchContext`. No per-subsystem translation — the same `SecondaryScopeValue` type (`string | number | boolean | string[]`) is shared with the agent memory system via `@memberjunction/ai-core-plus`.

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

## 12. Phase 1 Implementation Status

Completed surfaces (see `plans/search-scopes-rag-plus.md` for per-task state):
- **1A** — Schema + CodeGen + metadata seeds (Global scope, Search Result Set artifact type, `__Scoped_Search` action).
- **1B** — `SearchEngine` scope resolution, `ScopeConstraints`, Nunjucks-rendered templates, per-provider push-down, cross-scope RRF, optional `BaseReRanker` + `NoopReRanker`.
- **1C** — `AgentPreExecutionRAG` + `BaseAgent.InjectPreExecutionRAG()` wired into Phase 2; Data Snapshot artifact payload builder.
- **1D** — `ScopedSearchAction` (`__Scoped_Search`) with full `SearchScopeAccess` enforcement.
- **1E** — GraphQL resolver (`SearchKnowledge` + `SearchScopes`), `GraphQLSearchClient.ExecuteSearch({ ScopeIDs })`, Angular `SearchScopeSelectorComponent`.
- **1F** — This guide.
- **1G** — Multi-tenant `SearchContext` wired inline with 1B (same runtime path, zero additional code).
- **1H** — UX mockups under `plans/search-scopes-rag-plus/mockups/`.

Not yet in scope (Phase 2):
- Scope-level `SearchScopePermission` entity.
- Search-specific artifact tool library (`SearchResultSetToolLibrary`).
- Progressive/streaming search results.
- Re-ranker catalog entity + visual configuration UI.
