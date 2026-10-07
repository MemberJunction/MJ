# Search Scopes & RAG+ Guide

> Implementation guide for MemberJunction's **Search Scopes** + **agent RAG+** architecture. Use this alongside the full design in [`plans/search-scopes-rag-plus.md`](../plans/search-scopes-rag-plus.md).
>
> **Related search APIs:**
> - **[SEARCH_OVERVIEW_GUIDE.md](./SEARCH_OVERVIEW_GUIDE.md)** — decision tree for picking the right search API.
> - **[ENTITY_SEARCH_GUIDE.md](./ENTITY_SEARCH_GUIDE.md)** — `SearchEntity` / `SearchEntities` for ranked per-entity hybrid lexical + semantic search. Narrower than the cross-source `SearchEngine` covered here; use it when you know which entity (or set of entities) to search.
> - **[Full-Text Search Guide](../packages/MJCore/docs/FULL_TEXT_SEARCH_GUIDE.md)** — lexical-only `FullTextSearch` over FTS-enabled entities.

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
├─ Search Scope Entities           → which entities for entity + full-text + tag search (+ an ExtraFilter bound)
└─ Search Scope Storage Accounts   → which file storage accounts / folders
```

### How a scope bounds a search (empty means nothing)

A **non-global** scope is bounded by its rows. Nothing it leaves out is searched — an empty child table never means "everything":

- **It runs only its enabled provider rows.** A scope with no enabled `MJ: Search Scope Providers` row runs **no provider** and returns nothing; its scope decision is `Reachable: false` with a diagnostic saying so, and `ExplainScope` reports the same before you run anything. (Previously a scope with no provider rows ran *every* provider, so disabling a scope's last provider row widened it to all of them.)
- **Each provider searches only the lanes of its own kind.** An empty lane list means that provider returns no results, without querying: no entity rows → the entity, full-text and tag providers return nothing; no external-index rows of a provider's `IndexType` → that vector or 3rd-party provider returns nothing (it never falls back to its configured default index); no storage rows → the storage provider returns nothing. A scope with **no lanes at all** reaches nothing (`Reachable: false`).
- **A lane `ExtraFilter` bounds that entity for every provider.** The entity provider applies it in SQL. Every other provider's hits for that entity — full-text, tag, vector, 3rd-party — are kept only when the record satisfies the same rendered filter, checked as the searching user (`PK IN (...) AND (<ExtraFilter>)`, one read per filtered entity per scope). A failed check drops those hits. Several lanes on one entity are ORed; a lane on the entity with no `ExtraFilter` leaves it unbounded.
- **A storage lane's `FolderPath` restricts.** If it renders empty, renders a path with an empty segment (`clients/{{ context.SecondaryScopes.Client }}` with the dimension absent renders `clients/` — every client's folder), contains a `..` segment, or interpolates a value containing `..`, `/` or `\`, the scope is **refused** (the search fails with an error naming the lane) and `ExplainScope` marks the lane `Skipped` with the reason. A storage row with no `FolderPath` still covers the whole account.

A **global** scope (`IsGlobal = true`) is unconstrained: it runs every available provider with no scope constraints, as an unscoped search does.

To give a non-global scope its old breadth, add the rows explicitly — one enabled `MJ: Search Scope Providers` row per provider it should run, and lanes for what each provider should search.

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

Run `pnpm mj sync push --dir=metadata --include="search-scopes"`.

### Personal vs. Organization-wide scopes
- Set `OwnerUserID=<user-id>` for **personal scopes** (only visible to that user in the selector UI).
- Leave `OwnerUserID=NULL` for **organization-wide scopes** (visible to all users — Phase 2 adds per-role permission control).

### Time-windowed activation
Set `StartAt` / `EndAt` to auto-activate a scope for a specific window:
- Incident response: "give the support agent access to these logs for 48 hours"
- Seasonal: "Q4 financial reports are searchable Oct 1 – Jan 31"
- Onboarding: "new-hire documents are scoped for the first 30 days of employment"

**A search that names a scope it cannot resolve is refused.** If any ID in `SearchParams.ScopeIDs` is inactive, outside its `StartAt`/`EndAt` window, or not found, `Search()` returns `Success: false` with an error naming the scope, writes a `Failure` row to `MJ: Search Execution Logs`, and runs no provider. Before, such a scope was skipped, and a search whose only scopes were skipped ran with no scope at all — a global search. One dead scope among several refuses the whole search: dropping it silently would change what the caller asked for. The check runs before the result cache, so a scope that expired seconds ago is not served from its old entry. `ExplainScope` agrees: an inactive or expired scope is reported unreachable, and when one of several requested scopes cannot be resolved, every scope in that dry run is reported unreachable with the reason.

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
- `permissionOverfetchFactor` — multiplier on per-provider `topK` to compensate for residual permission filtering. Default 2; the largest factor across the resolved scopes applies (a scope that declares none counts as the default), clamped to 1–20. See [Overfetch factor tuning](#overfetch-factor-tuning).

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
| `None` | No search capability. `__Scoped_Search` rejects all requests, and pre-execution RAG searches nothing. |

### Pre-Execution RAG

When an agent has any active `Phase IN ('PreExecution','Both')` rows, `BaseAgent` automatically runs `AgentPreExecutionRAG` during Phase 2 (in parallel with config load, data preload, and memory injection). The results are formatted as a `<retrieved_context>` system message and unshifted onto the conversation messages.

**The same permission gate as `__Scoped_Search`.** An assignment row says which scopes the agent reads from; it is not a grant to the person asking. Before searching each scope, `AgentPreExecutionRAG` resolves `ResolveEffectivePermission` for the acting user, with the agent as principal, the run's `PrimaryScopeRecordID` as tenant, and — when exactly one skill is active in the run — that skill as a second principal (several active skills: none, the action's rule). The bar is the action's: allowed **and above `Read`**. In practice:

- `SearchScopeAccess='None'` → no pre-execution retrieval.
- `Assigned` → each scope needs a `MJ: Search Scope Permissions` grant at `Search` or `Manage` for the user or one of their roles.
- `All` → the agent supplies `Search` when the user has no grant of their own and may run the agent. A user or role grant at `Read` is found first and refuses the scope, as it does for the action and the GraphQL resolver.

A refused scope is skipped (the others still run) and logged as one `Forbidden` row in `MJ: Search Execution Logs`; a resolver failure skips the scope with a `LogError` and no `Forbidden` row. A turn with no query text (an empty or multimodal last message, and no query template) skips the scope before the gate.

**Zero added latency** — Phase 2 already has slower tasks running in parallel; RAG slots alongside them without extending the critical path.

### Agent-Invoked Search

Assign `__Scoped_Search` to an agent's action set. When the agent calls it, the action:
1. Resolves the agent identity from `params.Context.AgentID` (or explicit `AgentID` param).
2. Enforces `SearchScopeAccess`.
3. Resolves the target scope (explicit `ScopeID`, agent's default, or Global).
4. Resolves the tenant (`PrimaryScopeRecordID`) and secondary dimensions (`SecondaryScopes`). **Inside an agent run the run's scope is authoritative** (see [below](#inside-an-agent-run-the-runs-scope-is-authoritative)); outside one the optional inputs are used as given. A `SearchContext` is assembled when a tenant or a dimension applies, and the same tenant goes into the permission decision (`ResolveEffectivePermission`), so tenant-scoped grants and denies judge exactly the search that runs. See [§10](#10-multi-tenant-search-context) for the runtime context model.
5. Runs `SearchEngine.Search()` with `ScopeIDs: [resolvedScopeID]` and `SearchContext: <assembled>`.
6. Returns ranked results + `ScopeID_Resolved` / `ScopeName_Resolved` output params.

#### Per-call multi-tenant inputs

The action accepts two optional inputs whose values flow into `SearchParams.SearchContext` and are then Nunjucks-rendered into every scope-level filter (MetadataFilter, ExtraFilter, UserSearchString, FolderPath):

| Input | Type | Purpose |
|---|---|---|
| `PrimaryScopeRecordID` | string (UUID) | Primary tenant key (e.g. `OrganizationID`). Available in templates as `{{ context.PrimaryScopeRecordID }}`. Inside an agent run it may only restate the run's tenant — see below. |
| `SecondaryScopes` | JSON object string, or an object | Flat object of additional dimensions as `{ "<key>": <value> }`. Each value must be `string \| number \| boolean \| string[]`. Available in templates as `{{ context.SecondaryScopes.<key> }}`. Input that is not valid JSON, is not an object, or holds a value of another type is **refused** (`INVALID_PARAM`) — never dropped, which would run the search without that dimension. |

#### Inside an agent run, the run's scope is authoritative

Inside a Loop agent the action's inputs are written by the model, so they are bound to the run exactly as `AgentID` and `AISkillID` are. `BaseAgent.ExecuteSingleAction` stamps every dispatch with `RunActionParams.RunScope` — the run's tenant and secondary dimensions as `initializeAgentRun` validated them and wrote them to the `MJ: AI Agent Runs` row (the agent's `ScopeConfig` defaults applied; `null` fields for an unscoped run). It is a typed field beside `Audience`, not a `Context` key, and the model cannot set it. The action then:

| Model input | Run has tenant `A` | Run has no tenant |
|---|---|---|
| `PrimaryScopeRecordID` omitted | searches `A` | searches with no tenant |
| `PrimaryScopeRecordID` = `A` (any case) | searches `A` | — |
| `PrimaryScopeRecordID` = anything else | **refused**: `INVALID_PARAM` and a `Forbidden` search-log row (attributed to the run's tenant; the reason names both) | **refused**, the same way |

`SecondaryScopes` follows the same rule per key: a key the run sets may only be restated with an equal value (text compared case-insensitively, arrays as sets; the run's value is the one used) — a different value is refused like a tenant; a key the run does not set is added, as outside a run, and stays bounded by the scope's own dimension trust rules ([§10](#10-multi-tenant-search-context)).

**The host sets a run's tenant, never the model**: pass `ExecuteAgentParams.PrimaryScopeEntityName` / `PrimaryScopeRecordID` / `SecondaryScopes` (or, from a trusted server caller, the same keys in `data`). Sub-agents inherit the parent's scope; `BaseAgent` strips those keys (and `__agentTypePromptParams`) from a sub-agent request's model-authored `templateParameters` before they reach the child's `data` — the same reserved list (`RESERVED_AGENT_RUN_DATA_KEYS` in `@memberjunction/ai-core-plus`) the server strips from a browser's agent-run `data`. Outside an agent run (no `RunScope` — a direct action call, a workflow, an external orchestrator) the inputs are used as given.

One consequence: a single agent run can no longer search several tenants (e.g. compare orgs in one turn) by passing different `PrimaryScopeRecordID` values. Run one agent run per tenant instead.

#### The skill principal

A third optional input, `AISkillID`, is **not** a SearchContext value and does not reach those templates. It is a *principal*, in the same sense the calling agent is:

| Input | Type | Purpose |
|---|---|---|
| `AISkillID` | string (UUID) | The AI Skill this search runs under. Threaded onto `SearchParams.AISkillID` → `Principals.SkillID`, which a dimension's expansion query can bind. Also handed to `ResolveEffectivePermission`, so the skill's own `SearchScopeAccess` applies. |

Four consequences worth being explicit about, because a skill is a principal that can both widen and deny:

- **It is judged.** `AISkill.SearchScopeAccess` can reject a scope the user's roles allow (`None`, or `Assigned` without this scope listed) and can grant one they do not (`All`). The action resolves and passes the skill *before* the permission gate, so those rules fire — and denial rows are attributed to it.
- **A bad value fails closed.** A non-UUID, or an ID that will not load, is rejected with `INVALID_PARAM` rather than being dropped. Silently continuing would bind an unjudged ID into the expansion query.
- **The caller must be allowed to use it on this agent.** Loading a skill is not permission to wield it as a principal. Because `SkillUnscopedAll` grants `Search` on any scope, and AISkill permissions are open by default (no permission rows means everyone may View and Run), an unchecked ID would be a scope grant for the asking. `SearchScopePermissionResolver` intersects the skill against `GetSkillsForAgent(agent, user)` — agent-accepted ∩ user-permitted ∩ Active, the same call `BaseAgent.preActivateRequestedSkills` gates real activation on — and refuses with `PrincipalNotActivatable`, which the action returns as `ACCESS_DENIED`, attributed to the skill in the Forbidden log.

  The two principals are judged at **different points, for a reason**. A skill is judged wherever it is named, because a skill is only ever supplied to steer: it binds into `Principals.SkillID` and, for a `restricts: true` dimension, the expansion query's output *is* the bound — so judging it only at the `All` fallback would let a user who holds their own grant name any skill and widen with it. An agent is judged only where it **widens** (its `All` fallback). Every agent-mediated search supplies the running agent as a principal — `__Scoped_Search` and pre-execution RAG both do — and where it only restricts, checking whether the caller may run it would let an agent missing from the AI metadata cache refuse users whose own grant covers the scope. `ExplainScope` applies both gates, so a preview cannot promise what the search would refuse.

- **Containment of a principal id is the QUERY AUTHOR's job, not the platform's.** An expansion query
  is server-authored SQL, but MJ renders query parameters through Nunjucks with `autoescape: false`
  (`QueryParameterProcessor`), so escaping is opt-in — `| sqlString`, or a declared validation chain.
  The gate above decides *whether* a principal may steer the bound; it does not make the id safe to
  interpolate. Write the predicate so a malformed value narrows rather than widens: e.g.
  `TRY_CONVERT(uniqueidentifier, …)`, which degrades anything unparseable to NULL and therefore
  to an empty bound.

Omit the input and the principal is null, which is the behaviour for every caller that does not pass it.

Example call **outside an agent run** (a direct invocation) selecting only Finance-department content for Org `O1`. Inside a run scoped to `O1` the same call would omit `PrimaryScopeRecordID` — the run's tenant applies:

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

| Provider | Mechanism | Late ownership check (no row filter) |
|---|---|---|
| `EntitySearchProvider` / `FullTextSearchProvider` | RunView already evaluates `UserRowLevelSecurity` for `ContextCurrentUser`. The providers thread `contextUser` through to RunView — nothing extra required. In a scoped search both search only the scope's entity lanes; an empty entity list returns nothing. The entity provider applies each lane's `ExtraFilter` in its RunView; full-text hits are held to the same filter by the engine (below). | None: the hits are rows read from the labelled entity (`ResultsAreRowsOfLabelledEntity`). |
| `TagSearchProvider` | Restricted to the scope's entity lanes (none → nothing); its hits are held to each lane's `ExtraFilter` by the engine. | Verified: one `PK IN (...)` read per labelled entity. |
| `VectorSearchProvider` | Each embedded record must carry permission metadata (role IDs, owner ID, tenant ID) at ingest time. At query time, translate `contextUser`'s roles into a native metadata filter and merge it with the scope's rendered `MetadataFilter` via `$and`. In a scoped search it queries only the scope's `Vector` index rows — none means no query, never every index. | One `PK IN (...)` read per labelled entity. |
| `StorageSearchProvider` | Folder-path bounded by the scope, and account-permission bounded by `MJ: File Storage Account Permissions`, **evaluated per call** for the searching user by `StorageAccessEvaluator` (`@memberjunction/storage`): nothing is snapshotted at startup, so a grant or revocation applies to the next search. The rows are read as the MJ system user and decided for the caller (Everyone, Role or User rows; `CanRead`); an account with no rows is open (the current product rule); a failed evaluation searches nothing. The searchable accounts themselves are read per search from `FileStorageEngine`'s live cache. **Storage hits are then re-checked in the late filter**: `SearchEngine.filterByPermissions` keeps a `storage-file` result only when its engine-stamped `ProviderId` is a `StorageSearchProvider` entry and its `RawMetadata.accountId` is readable by the user now — a `storage-file` hit from any other provider is dropped. The storage GraphQL routes (`FileResolver`) run the same evaluator before any driver call. | Not an entity row: re-checked against the account instead (above). |
| 3rd-party index providers (Azure AI Search, Typesense, Elasticsearch, OpenSearch, custom) | Use the engine's native permission/ACL filter, through the scope's `MetadataFilter`. In a scoped search each queries only the scope's rows of its own `IndexType`; with none it queries nothing. The configured `defaultIndex` / `defaultCollection` is used **only** by an unscoped search. | One `PK IN (...)` read per labelled entity. A hit whose document id is not the entity's primary key is dropped. |
| **Every provider, lane `ExtraFilter`** | After the providers return and before per-scope fusion, `SearchEngine` keeps a hit for an entity that has a lane `ExtraFilter` in the scope only when its record satisfies that filter: one RunView per filtered entity per scope, as the user, with the lane's rendered filter ANDed to `PK IN (...)`. Only hits whose engine-stamped `ProviderId` is an `EntitySearchProvider` entry are exempt (that provider applied the filter itself) — the declared `SourceType` is not trusted. Storage files pass. A failed read drops that entity's hits. | — |

### Which results are verified as rows of the entity they name

`EntityName` and `RecordID` are provider output. For the vector and external-index lanes they come from the index: vector metadata's `Entity` key, or the index name, and the document's own id. Admitting a hit on its label alone would let whoever writes an index choose which entity's permissions are evaluated — a document in an index named after an entity the user can read would pass as that entity's row.

So the late check (`filterByPermissions`) verifies a result with one `PK IN (...)` RunView per labelled entity, as the user, unless the result came from a provider that reads the labelled entity through `RunView` itself. That is decided by the provider the engine **stamped** on the result (`ProviderId`, overwritten on every hit before fusion) and its `BaseSearchProvider.ResultsAreRowsOfLabelledEntity` flag — set only by `EntitySearchProvider` and `FullTextSearchProvider` — and never by the `SourceType` label. Every shipped external-index provider labels its hits `'fulltext'`, and `SearchSource` is a closed union, so a third-party provider must pick one of its values and can pick `'entity'`; neither is trusted for it. A result with no `ProviderId` (a fusion fallback) or one naming no configured provider is verified. Fusion and dedup never move a `ProviderId` off the item it was stamped on: a merged result is one provider's item, with only scores, tags and a generic snippet borrowed from a duplicate of the same `EntityName` + `RecordID`.

When a row filter applies to the user, every result is verified regardless — ownership is checked as a side effect of filtering.

**Cost and consequence for external indexes.** Each search that returns external-index hits pays one `PK IN (...)` read per labelled entity. Hits are kept only when their document id **is** the MJ primary key of the entity the index is named after (bare value, or a `Field|value` segment for a composite key); an index keyed by anything else returns nothing through this lane. The entity and full-text lanes cost nothing extra.

### The origin-record gate for derived content

A content item or chunk is a row of its own entity, but it was *derived* from another record — the file, task or conversation it was extracted from — and the right to read it belongs to that origin. Row-level security on `MJ: Content Items` / `MJ: Content Item Chunks` can only say who may read the content table; it cannot see the origin's own row filters.

So after a content result passes the entity-level ownership and row-filter check, `SearchEngine.VerifyOriginRecords` follows chunk → item (→ root item, for a split child) → `MJ: Entity Record Documents` → the origin record, and keeps the result only when the origin is a row the user may read, verified exactly as the result's own entity was (`PK IN (...)` under the origin entity's row filter, as the user). Content with no Entity Record Document has no origin and passes unchanged; non-content entities are untouched. The hook is `protected`, so a host can extend the rule to another derived-content family (reusing the protected `ReadableOriginRecordIDs` for the origin check), and it fails closed.

Consequences for an app that indexes documents behind its own permissions:
- **Every lookup runs as the user, and that adds grants a chunk reader did not need before.** Anyone who should see chunk hits needs read on the base `MJ: Content Items` (the chunk → item hop reads it, through the base entity even for IS-A subtypes, because `RootParentID` is a view-computed column a subtype's view does not project). Anyone who should see hits derived from a record needs read on `MJ: Entity Record Documents`. Grant both under the app's row filters. Without the item grant, every chunk hit is dropped; without the document grant, the document-bearing hits are, and crawled content still passes.
- **Field-level security on a link column counts as a failed hop, never as "no origin".** If the user's roles deny `ContentItemID`, `ParentID`, `RootParentID`, `EntityRecordDocumentID`, or a document's `Entity` / `RecordID`, the lookup comes back without that column and the rows that depended on it are dropped.
- A split child (an item with a `ParentID`) is judged by its own document first, and by its root's only when it has none. A root is its own `RootParentID` in the view and is never re-read. A child whose root the view cannot resolve (`RootParentID` null, or its own id) is dropped.
- An origin's `RecordID` is read as a key segment: a bare value, or `Field|value` pairs. A composite-key segment is used only when it names exactly the origin entity's primary-key fields; any other is dropped and never reaches the SQL.
- Changing who may read the *origin* record takes effect on the next uncached search (the result cache holds entries up to 30 s); nothing in the index needs to change. Push-down (the scope's `MetadataFilter`) stays the recall mechanism; this gate is the truth.
- Cost: the hops are sequential `PK IN (...)` reads. A chunk group does up to four (chunks → items → root items when any hit is a split child without its own document → documents when any item has one), plus one view per origin entity, issued together in one `RunViews` batch. An item group does up to three plus the origin batch; crawled chunk content (no documents) costs two. Groups run in parallel.

**Prefixed record ids — a fix for every entity, not only content.** The late check reads each result's `RecordID` as a key segment, so a result written with the prefixed encoding (`ID|<value>`, what `CompositeKey.ToRecordID()` writes) is now checked against its value and kept when readable. Before, `ID IN ('ID|<value>')` could never match, so such results were dropped as unauthorized. The same parsing applies to composite keys, with the same rule: a segment naming a field that is not a primary key is dropped.

### Searching for an audience

Everything above is about one person: the caller. When the results will be shown to **several** people — an agent answering in a shared conversation — the caller's reach is the ceiling, not the floor: a document one participant can't open must not be quoted to the room because another participant could.

`SearchParams.Audience.Readers` names the other people who will see the results. The engine runs its permission safety net (entity read, row filters, ownership, and the origin-record gate above) once for the caller and once per reader (concurrently), and keeps the intersection. Readers can only remove results, never add them. The audience is part of the result-cache key, so a search the caller ran alone is never served to a room, nor the reverse. The GraphQL surface does not expose this today — it is for server-side callers such as a host's conversation turn handler.

Four rules for callers:
1. **Pass hydrated `UserInfo` objects** (e.g. from `UserCache`): every reader needs a non-empty `ID` and a `UserRoles` array. A malformed audience — `Readers` not an array, a `null` reader, a reader with no `ID` or with no `UserRoles` array — fails the search (`Success: false`, an error starting "SearchEngine: invalid Audience"); the engine never skips a reader it cannot check, because a skipped reader would restrict nothing. `UserRoles: []` is legitimate: that reader reads nothing, and the room gets an empty result.
2. **Expect no storage hits.** `MJ: File Storage Account Permissions` are re-checked for the caller in the late filter, but the audience pass does not yet combine per-reader storage answers, so a `storage-file` result is dropped rather than shown on the caller's permission alone. Per-reader storage checks are a follow-up.
3. **Show the room `fused`/`final` results.** `streamSearch`'s `provider` events never carry results — only `providerName`, `durationMs` and `resultCount`, for progress — because they arrive before any permission pass. This is true with or without an audience.
4. **Check each reader's scope entitlement yourself.** Scope entitlement (`SearchScopePermission`), `ServerDerived` dimensions, scope `ExtraFilter`/`MetadataFilter` templates and vector push-down are all evaluated for the **caller only**. Before passing `ScopeIDs` for a room, confirm every reader may use those scopes, and don't rely on dimension-only bounds to keep a room inside its reach.

Two further limits:
- **`SourceCounts`, and a streamed `provider` event's `resultCount`, are counted before the permission and audience passes**, so they reveal the caller's unfiltered reach to anyone shown them. Don't show them to a room.
- **The result cache keys on reader IDs.** Within the 30 s TTL, a reader object with the same `ID` but different hydration (roles changed, say) gets the cached verdict.

Audience filtering raises the residual-filter rate, so a host serving rooms should raise the over-fetch factor (below). Carrying the audience into push-down is achievable today only through an expansion query keyed on the conversation's `PrimaryScopeRecordID`; a resolver that sees the audience is a follow-up. The audience pass is the truth; push-down is the recall.

#### A whole agent run for an audience

`SearchParams.Audience` bounds one search. `ExecuteAgentParams.Audience` bounds a whole agent run — every path in it that reads data on the caller's behalf — and is what a host sets when an agent answers in a shared conversation:

```typescript
const result = await new AgentRunner().RunAgent({
    agent,
    conversationMessages,
    contextUser: asker,                       // the person who asked; their reach is the ceiling
    // Everyone else in the room, from the host's own participant list — never from client input.
    Audience: { Mode: 'Intersection', UserIDs: otherParticipantIDs },
});
```

It is a typed, server-only field: it is never read from `data`, and the GraphQL, MCP and A2A agent runners pass named fields (client JSON lands in `data`), so no client can set or clear it. `Mode` is `'Caller'` (no readers — the same as omitting it) or `'Intersection'` (only what the caller **and** every listed user may see). Every gate below fires only when the audience adds a reader **other than the caller**, so an `'Intersection'` whose only ID is the caller behaves exactly as `'Caller'`.

**The run fails before any prompt** — marked Failed like a refused permission — when the audience is malformed (an unknown `Mode`, an `'Intersection'` with no IDs or a blank one, a `'Caller'` with IDs) or names an ID no user has. `BaseAgent` hydrates the IDs from the server's `UserCache` (each reader with its roles), refreshing the cache once for an unknown ID, and refuses rather than skips one it still cannot find: a skipped reader would restrict nothing. Each sub-agent run, and a realtime delegation target, inherits the audience and hydrates it again. `BaseAgent.ResolveAudienceUsers` is the override point for a host with its own user directory.

What the run then does:

| Path | Under an audience |
|---|---|
| Pre-execution RAG | Each reader must pass the same scope gate as the caller (`ResolveEffectivePermission` with the reader as `User`, the caller as `ContextUser`, the same agent, skill and tenant; the bar is above `Read`). A refused reader skips that scope and writes a `Forbidden` search-log row naming them. The searches carry `Audience: { Readers }`. |
| Agent notes and examples | Only shared ones (`UserID` empty) are injected, on both the cache and the semantic path; scope matching still applies. |
| Agent data-source preload | Skipped (it loads with the caller's rights alone), logged. |
| The previous turn's tool results | Not carried forward (they were fetched for whoever ran that turn). |
| Actions | Each dispatch carries `RunActionParams.Audience`. The engine refuses (`AUDIENCE_UNSUPPORTED`, without running it or writing an execution log row) every action whose class does not declare `BaseAction.SupportsAudience`, and every runtime-defined or deferred action; the agent locks a refused action out for the run and the model is told it is unavailable. Only **Search** and **Scoped Search** declare support: they pass the audience to the search, Scoped Search runs the per-reader scope gate, and both leave `SourceCounts` out of their output. An agent whose work needs other actions is therefore limited to search in a shared room — by design. |
| Task graphs | Not offered (`enableTaskGraphs` off for the run, on a copy of the cached prompt params), and a graph the model writes anyway is refused: its action nodes run outside the run's gates. |
| Realtime / voice / bridge sessions | Refused; a live session acts outside the gates above. |

**Limits, by design for now:**
- **Per-reader scope expansion.** `ScopeDimensionResolver` binds one `UserID` (the caller's), so expansion queries and `ServerDerived` dimensions resolve for the caller only. The per-reader result filter covers scopes whose lanes carry per-user row filters; don't rely on dimension-only bounds for a room (rule 4 above).
- **No `Union`, and no anchor or narrowing modes.** A run bounded by a shared record or tenant uses `PrimaryScopeEntityName` / `PrimaryScopeRecordID` / `SecondaryScopes`.
- **Resume.** A run paused for a human answer and resumed (`MJAIAgentRequestEntityServer.resumeAgent`) resumes as the responder with **no** audience: the audience is not persisted on the run. Persisting it needs a column — an open design point shared with bound action parameters.
- **Conversation history and artifacts** are what the host passes in; choosing what a room may see of them is the host's job.

### Overfetch factor tuning

`effectiveTopK = userTopK * permissionOverfetchFactor` compensates for residual filtering. Default 2. Tune higher for corpora where permission sparsity is high (>50% of matches filtered).

The factor is resolved per search, in this order: the caller's `SearchParams.PermissionOverfetchFactor`; else the **largest** `permissionOverfetchFactor` declared by any resolved scope's `ScopeConfig`; else the engine default (`SearchEngineConfig.DefaultPermissionOverfetchFactor`, 2). Whatever the source, the value is held to **1–20** (a value below 1 means no over-fetch; above 20 is clamped and logged, since one metadata edit would otherwise multiply every provider call for every caller of the scope). The largest wins across scopes because a lane trimmed heavily by late permission checks needs the extra candidates whichever scope it belongs to; a scope that declares nothing counts as the default, so one scope's low factor never lowers a neighbour's. A larger factor never changes which results a caller gets (the final list is still trimmed to `MaxResults`), but it costs more than provider work: dedup, the content exclusion and the permission passes handle more candidates, a re-ranker is fed up to its `inputTopN` from a bigger pool, and `streamSearch`'s per-provider `resultCount` is counted from the larger pool (each count is capped to the caller's `MaxResults`). Declare it on the scope when its author knows the lanes are sparse after permissions — for example a scope whose hits are re-checked per participant of a shared conversation — so every caller doesn't have to know to pass it.

### Observability

The engine logs `lateFilteredCount` per search whenever the residual safety net (the entity-level and row-filter steps of `filterByPermissions`) trims anything. If this is consistently non-zero for a provider, that provider's push-down is incomplete and should be fixed.

The origin-record gate drops by design — no provider can push an origin record's own row filters into a content index — so its removals are counted separately and logged as `SearchEngine: origin-record gate removed N result(s) …`. They do not count toward `lateFilteredCount`. A steady non-zero origin-gate count is not a push-down defect; it means users are matching content they may not open, which costs `topK` recall (raise `permissionOverfetchFactor`, or narrow the scope).

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
| **Agent-invoked Scoped Search** | Inside an agent run, the run's own scope, stamped by `BaseAgent` on every dispatch as `RunActionParams.RunScope`; the action's `PrimaryScopeRecordID` / `SecondaryScopes` inputs may only restate it (or add a secondary key the run does not set). Outside a run, the inputs as supplied on each `__Scoped_Search` call | `ScopedSearchAction` resolves the tenant ([§3](#inside-an-agent-run-the-runs-scope-is-authoritative)), builds `SearchContext`, and passes it via `SearchParams.SearchContext` to `SearchEngine.Search()` — and the same tenant to the permission decision |

Inside an agent run the two paths therefore search the same tenant: the one the host gave the run. The explicit inputs remain for callers other than `BaseAgent` — manual GraphQL invocations, workflows, external orchestrators — which drive the action with per-call tenant info. A run that must cover several tenants is several runs.

### Nunjucks rendering of scope config

The engine renders these fields at search time with `context.PrimaryScopeRecordID` and `context.SecondaryScopes.*` available:
- `SearchScopeExternalIndex.MetadataFilter` (rendered + JSON-parsed → native vector/ES filter)
- `SearchScopeEntity.ExtraFilter` (rendered → RunView `ExtraFilter`)
- `SearchScopeEntity.UserSearchString` (rendered → RunView `UserSearchString`)
- `SearchScopeStorageAccount.FolderPath` (rendered → path prefix filter). It **restricts**, so it is guarded like a filter: a render that is empty, has an empty segment, contains a `..` segment, or interpolates a value containing `..`, `/` or `\` refuses the scope rather than widening it. The `path` escaper refuses such a value outright — it used to strip it, which turned `..` into nothing and `../other` into `other`.

Available filters in scope templates (matching `@memberjunction/templates`): `json`, `jsoninline`, `jsonparse`.

### Inheritance modes

Configured per dimension in `SearchScope.SearchContextConfig.dimensions[].inheritanceMode`:
- **Strict**: only exact matches. Content must be tagged with the queried dimension value.
- **Cascading**: broader — content without a dimension tag is treated as "applies to all". Use for soft hierarchies (e.g., org-wide policies visible to every department, but department-specific content only within that department).

A **cascading template must carry an `{% else %}<column> IS NULL` branch.** The engine never renders `inheritanceMode`; the mode lives in the author's template. Under the `{% if x | length %}` idiom an empty set removes the clause, and without an `{% else %}` a reader who reaches no tagged value sees every tagged row instead of only the untagged ones. Declare `RequiredMetadataKeys` on the lane as well, so a dropped clause is caught at render time.

**`required`** on a dimension refuses the search (`ScopeDimensionError`) when the dimension does not resolve or resolves to nothing (`null`, an empty set, a blank string), instead of letting the lane run with its clause dropped. A dimension declared `inheritanceMode: 'cascading'` is exempt, because there empty is meaningful (see above). The message names the scope and the dimension and says whether the caller sent an empty value, the declared `defaultValue` is empty, or nothing is reachable for the user. One refused scope fails a multi-scope search; the Scoped Search action and pre-execution RAG search one scope per call.

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
- `SearchEngine: origin-record gate removed X result(s) …` — content derived from records the user may not read. Expected, and not counted in the residual figure above.
- `SearchEngine: Re-ranker "DriverClass" returned N result(s) (input=I, outputTopN=O)` — re-rank stage telemetry.
- `SearchEngine: search refused — scope "ID" could not be resolved …` (LogError) — a named scope is inactive, expired, or missing; the search returned `Success: false` and a `Failure` row was logged.
- `AgentPreExecutionRAG: Exception searching scope "NAME"` — per-scope search failures.
- `AgentPreExecutionRAG: Template "ID" render failed` — template-rendering failures fall back to `lastUserMessage`.
- `AgentPreExecutionRAG: permission for scope "NAME" could not be resolved` — the resolver threw; that scope was skipped. Refused scopes log only at verbose level; read them from the `Forbidden` rows in `MJ: Search Execution Logs`.

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
- **Phase 2C** (streaming) — `SearchEngine.streamSearch` async iterable, `StreamScopedSearch` mutation + `SearchStreamEvents` subscription, `AgentPreExecutionRAG` per-provider progress, `ScopedSearchAction.streamingMode`, Angular UI with per-provider chip strip (opt-in via `?stream=1`) — shipped.
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
returned and fusion + reranking complete. `streamSearch()` yields a progress
event as each provider reports, so agents and the UI can show progress before
the result set is ready.

**Progress events carry counts, not results.** A `provider` event arrives
before the permission pass, so it carries `providerName`, `durationMs` and
`resultCount` (that provider's hit count, capped at `MaxResults`) — and
`results: []`, always. Results arrive in `fused` and `final`, which carry
exactly what `Search()` returns. Before, a `provider` event carried the
provider's hits, including rows the caller's row filters would drop and
unverified external-index hits.

### GraphQL surface

Two-step protocol:

1. **`StreamScopedSearch` mutation** — kicks off the run, returns
   `{ Success, StreamID, ErrorMessage }`. The server starts the search in
   the background, keyed by StreamID.
2. **`SearchStreamEvents(streamID)` subscription** — delivers events:
   `{ phase: 'provider', providerName, resultCount, durationMs }` (wire fields
   `ProviderName`, `ResultCount`, `DurationMs`; `Results` is always empty),
   `{ phase: 'fused', results }`, `{ phase: 'reranked', results }`,
   `{ phase: 'final', results }`, `{ phase: 'error', errorMessage }`.

The Angular `GraphQLSearchClient.StreamSearch(params)` returns an `Observable`
that wraps the two steps so component code only sees a single subscribe point.

### Angular consumer (P2C.5)

`SearchOverlayComponent` and `SearchResultsResource` both opt in via
`EnableStreaming` (Input on the overlay; URL query param `?stream=1` on the
resource page during rollout). On opt-in, both components subscribe to
`SearchService.StreamSearch(request)`, add each provider's name and
`ResultCount` to a status chip strip as 'provider' events arrive, and render
the result list from 'final'. The chip strip shows each provider's name +
count + latency (or error message).

Defaulting `EnableStreaming` to `false` preserves Phase 1 request-response UX.
When the team is ready to flip the default, change the `false` to `true`
in the consuming component.

### Agent consumer

`AgentPreExecutionRAG` consumes `streamSearch` and appends each provider's
count (`resultCount`) and latency to the agent's scratchpad as markdown (not JSON — markdown's lower token cost +
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
`IndexType` — and in a scoped search, only those: a scope with no row of the
provider's type gets nothing from it (the configured default index or collection
serves unscoped searches only). The scope's rendered `MetadataFilter` (a JSON object or string in
the engine's native filter DSL — already-rendered with SearchContext via
Nunjucks) composes into the engine's filter clause for permission / tenant
push-down. Per-engine connection options live on `SearchProvider.ProviderConfig`.

Each hit is labelled with the index name as `EntityName` and the document's
own id as `RecordID`, and the engine verifies it as a row of that entity (one
`PK IN (...)` read per labelled entity, as the user) — see [Which results are
verified](#which-results-are-verified-as-rows-of-the-entity-they-name). Name
the index after the MJ entity it mirrors and key its documents by that
entity's primary key, or its hits are dropped.

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
        // 1. If scopeConstraints?.ExternalIndexes is set, filter to your IndexType — this.ScopedExternalIndexRows(scopeConstraints, 'MyIndexType').
        //    A DEFINED but empty result means the scope gives you nothing: return [] without querying.
        //    Fall back to a configured default index only when it is undefined (an unscoped search).
        // 2. If scopeConstraints?.QueryTransforms?.[this.SourceType] is set, use that as the query
        // 3. Push permission predicate (scope.MetadataFilter / equivalent) into your engine's WHERE clause
        // 4. Map results to SearchResultItem[]
        return [];
    }
}
```

Leave `ResultsAreRowsOfLabelledEntity` at its default (`false`) unless every
hit is a row you read from the labelled entity through `RunView` as
`contextUser`; with `false`, the engine verifies your hits against that entity.

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
`MJ: Queries`) maintain `EmbeddingVector` + `EmbeddingVectorBinary` +
`EmbeddingModelID` columns that the Vector search provider consumes (the
binary column holds the same vector as float32 bytes; see the
[Binary Fields Guide](BINARY_FIELDS_GUIDE.md)). Embeddings are regenerated
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
saves — will produce records whose `EmbeddingVector` / `EmbeddingVectorBinary`
are stale, missing, or out of step with each other (readers prefer the
binary column). Vector search will then return outdated matches (or skip the
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

Several core entities ship with `EmbeddingVector` + `EmbeddingVectorBinary` + `EmbeddingModelID`
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
        "binaryVectorField": "EmbeddingVectorBinary",
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
| `vectorField` | The JSON vector column (JSON-stringified `number[]`). |
| `binaryVectorField` | Optional binary companion (float32 bytes). When set, the driver fetches it and prefers it over `vectorField` — a copy instead of a JSON parse — falling back to JSON for rows with no valid binary value. |
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
- **Metadata filters are evaluated in memory.** The scope's
  `MetadataFilter` and the `Entity` push-down are applied to each row
  (`Entity` / `EntityName`, `RecordID` and `SourceType` resolve as on
  the remote drivers; anything else reads the row's column). A filter
  using an operator outside `$eq $ne $gt $gte $lt $lte $in $nin $exists
  $and $or` fails the query instead of running unfiltered.

- Re-ranker catalog entity + visual configuration UI.
