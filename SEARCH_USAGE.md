# Search Scopes & RAG+ — User Walkthrough

A hands-on guide to every Search Scopes / RAG+ feature shipped on the
`amith-nagarajan/search-scopes-rag-plus` branch. Every demo runs inside MJExplorer.
SQL is shown only for after-the-fact auditing, not setup — clicking the controls
in the UI is the point.

If a step says "you should see X," that's the literal observable result. If the
running system shows something different, file an issue or update this doc.

Companion docs:
- `RAG_plan.md` — the canonical implementation plan (Phase 2A through Phase 6)
- `guides/SEARCH_SCOPES_AND_RAG_GUIDE.md` — developer-facing concept guide
- `plans/search-scopes-rag-plus.md` — original feature spec

---

## 1. Overview & prerequisites

### What this guide covers

The Search Scopes & RAG+ initiative ships a configurable, permissioned, fused,
rerankable search system that humans use through MJExplorer's UI and agents
use through `ScopedSearchAction` / `AgentPreExecutionRAG`. The features fall
into seven groups:

1. **Authoring scopes** — defining which providers, entities, indexes, and
   storage participate in a scoped search
2. **Tuning** — fusion weights, reranker selection, budget caps, live preview
3. **Permissions** — per-user, per-role, and per-agent gating
4. **Observability** — execution logs, analytics dashboards, CSV export
5. **Agent integration** — agents using scopes for pre-execution RAG
6. **Streaming** — partial results from each provider as they return
7. **External providers** — Elasticsearch / Typesense / Azure AI Search / OpenSearch
   driver classes (peer-dep-gated)

### Prerequisites

- MJAPI running on `localhost:4001` (`cd packages/MJAPI && npm run start`)
- MJExplorer running on `localhost:4200` (`cd packages/MJExplorer && npm run start`)
- Workbench DB at `localhost:1444` populated via `mj migrate --dir ./migrations/v5`
- Logged in to MJExplorer at least once with a user that has at least one role
- For the Cohere reranker live demo (4.2): `AI_VENDOR_API_KEY__CohereLLM` set in
  `packages/MJAPI/.env` (without it the reranker silently no-ops)

### Where the features live

| Feature | UI surface |
|---|---|
| Knowledge Hub Configuration (top-level) | `/app/knowledge-hub/Configuration` |
| Search Scopes section | Knowledge Hub → Configuration → Search Scopes tab |
| SearchScope record (full custom form) | `/resource/record/MJ: Search Scopes/{id}` |
| Search Analytics dashboard | Knowledge Hub → Configuration → Search Analytics tab |
| AIAgent record | `/resource/record/MJ: AI Agents/{id}` |
| GraphQL playground (for ad-hoc testing) | `/` on MJAPI host |

---

## 2. 5-minute tour

Follow this if you want to see the whole feature in one sitting. Each later
section drills into the same controls.

1. Open `http://localhost:4200/app/knowledge-hub/Configuration`. Click the
   **Search Scopes** tab. You see a left sidebar with one or more existing
   scopes plus a **+ New** button.
2. Click an existing scope (e.g. `P4 Verify Scope` if the workbench seed is
   present). The right pane shows a definition form with Status, Scope Config
   JSON, and other fields.
3. Click "Open Full Form" or copy the scope ID and navigate to
   `/resource/record/MJ: Search Scopes/{id}` to see the full custom form.
4. Scroll the right-side panel list. You'll see, in order: Scope Definition,
   Scope Configuration, Access Control, Lifecycle Management, Technical
   Configuration, **Fusion Weights** (4 sliders), **Reranker** (dropdown +
   budget), Export tuning data button, **Live Preview** (text input + Run),
   Details, System Metadata, then related panels (Test Queries, Storage
   Accounts, Entities, External Indexes, Providers, AI Agent Search Scopes,
   Permissions, Search Execution Logs).
5. Type `agent` into the Live Preview textbox and click **Run**. Within ~1s you
   see top results with relevance scores and a "X result(s) in Yms" footer.
6. Run the same query again. The second run shows "100% similar to last run"
   thanks to Kendall-tau ranking comparison.
7. Switch to the **Search Analytics** tab on the Knowledge Hub Config page.
   You see KPI cards (Total Runs, Success Rate, Avg Latency, etc.) and three
   tables (Top scopes by volume, Reranker spend by driver, Top failure reasons).
   Your two runs from step 5–6 should appear in Top scopes.
8. Back on the SearchScope form, click **Export tuning data (CSV)**. A
   `searchscope-tuning-{name}-{date}.csv` file downloads with one row per
   recent search.

That's it. The rest of this doc walks each feature in detail.

---

## 3. Authoring a Search Scope

A Search Scope is a named, configurable bundle: which providers participate
(database, full-text, vector, storage, external indexes), which entities the
scope covers, what reranker and fusion weights to apply, and who's allowed to
use it.

### 3.1 Create a new scope

**What you're demonstrating:** the basic create flow.
**Why it matters:** every other demo assumes a scope exists.

**Steps:**
1. Navigate to `/app/knowledge-hub/Configuration`.
2. Click the **Search Scopes** tab.
3. In the left sidebar, click **+ New**.
4. Fill **Name** (e.g. `My Demo Scope`), **Description** (free text). Leave
   **Status** at `Active` and **Is Default** unchecked.
5. The **Scope Config (JSON)** field accepts an object with optional keys:
   - `fusionWeights` — per-source weight overrides
   - `reRanker.driverClass` — registered reranker class name (filled by the
     Reranker dropdown on the full form)
   - `searchContext` — multi-tenant context defaults
   Leave it as `{}` for now.
6. Click **Save**. The scope appears in the left sidebar.

**What you should see:** the new scope is selected in the sidebar with its
form populated. Scroll to the bottom to see related-entity panels with all
zero counts.

**Optional audit:**
```sql
SELECT TOP 1 ID, Name, Status, ScopeConfig
FROM __mj.SearchScope
WHERE Name = 'My Demo Scope'
ORDER BY __mj_CreatedAt DESC;
```

**Cross-reference:** RAG_plan §3.1 Phase 1 (the SearchScope entity itself was
delivered in PR #2374; this guide just demonstrates the existing form).

### 3.2 Configure providers

**What you're demonstrating:** restricting which search providers participate
in this scope.
**Why it matters:** an unconfigured scope falls back to the Global behavior;
explicit provider rows give you weight-per-provider control plus per-provider
ProviderConfigOverride.

**Steps:**
1. Open the scope in its full form: `/resource/record/MJ: Search Scopes/{id}`.
2. Scroll to the **Search Scope Providers** panel near the bottom.
3. Click the **New** button on the panel toolbar.
4. A new tab opens. The **Search Scope Name** field is pre-populated with
   your scope's name.
5. Click into **Search Provider Name** and type a partial provider name
   (e.g. `data` for "Database" or "Database Full-Text"). The lookup shows
   matching SearchProvider records.
6. Pick `Database`. Leave Enabled checked. Optionally set **Max Results
   Override** or **Provider Configuration Override** (JSON).
7. Click **Save Changes**.
8. Navigate back to the parent scope's record form. The Providers panel now
   shows count `1` and the new row appears.

**What you should see:** the panel's count badge updated from 0 to 1; the row
shows `Database` with `EntitySearchProvider` (visible if you reveal the
DriverClass column via the grid's column controls) and Enabled=true.

**Optional audit:**
```sql
SELECT sp.Name, ssp.Enabled, ssp.MaxResultsOverride
FROM __mj.SearchScopeProvider ssp
JOIN __mj.SearchProvider sp ON ssp.SearchProviderID = sp.ID
WHERE ssp.SearchScopeID = '{your scope ID}';
```

**Cross-reference:** RAG_plan §1.1 Phase 1, P5.5 (provider dropdown).

### 3.3 Restrict to specific entities

**What you're demonstrating:** narrowing the EntitySearchProvider's reach to
named entities so the scope only matches `MJ: Actions`, for example.

**Steps:**
1. On the SearchScope record form, scroll to **Search Scope Entities**.
2. Click **New**.
3. The new tab opens with the parent scope pre-set. Type into **Entity** and
   pick `MJ: Actions` (or any entity in your DB).
4. Optionally fill **MetadataFilter** (JSON-shaped scope template fragment).
5. Save Changes.
6. Return to the parent scope. The Entities panel count is `1`.

**What you should see:** count badge 1; row visible.

**Cross-reference:** RAG_plan §1.1 Phase 1.

### 3.4 Wire up external indexes

External-index providers (Elasticsearch, Typesense, etc.) consume scope rows
in the **Search Scope External Indexes** panel. This panel is the same
shape as 3.3 — click New on the panel toolbar, pick an IndexType, fill the
ExternalIndexName, save.

**Note:** without the matching peer dep installed and a real cluster
configured (see Section 8), the external provider self-disables at runtime.
The row stays valid metadata; it's just inert.

### 3.5 Wire up storage accounts

**Search Scope Storage Accounts** panel (same shape) lets the
StorageSearchProvider scope to specific File Storage accounts.

---

## 4. Tuning a Search Scope

After a scope is authored, tune its behavior with sliders, reranker
selection, and live preview.

### 4.1 Fusion weight sliders

**What you're demonstrating:** per-provider weight overrides for Reciprocal
Rank Fusion.
**Why it matters:** raise the vector slider and semantic results dominate;
lower it and full-text wins.

**Steps:**
1. On the SearchScope record form, click **Edit this Record** at the top
   (icon in the toolbar — pencil with title "Edit this Record").
2. Scroll to the **Fusion Weights** section.
3. Drag the `vector` slider from 1.0 to 2.5. The Scope Config JSON above
   updates to `{"fusionWeights": {"vector": 2.5}}`.
4. Click **Save Changes**.
5. Reload the page (Ctrl/Cmd-R). The slider's new position persists.

**What you should see:** the four sliders (vector, fulltext, entity,
storage) are draggable in edit mode; their values write into
`ScopeConfig.fusionWeights` and are visible in the JSON above.

**Optional audit:**
```sql
SELECT ScopeConfig FROM __mj.SearchScope WHERE ID = '{your scope ID}';
```

**Cross-reference:** RAG_plan P4.2.

### 4.2 Reranker selection

**What you're demonstrating:** picking which reranker class re-orders the
fused candidate list.
**Why it matters:** cheap fusion gives breadth; a real reranker (Cohere /
Voyage / OpenAI / BGE) gives precision.

**Steps:**
1. Click **Edit this Record**.
2. Scroll to **Reranker**. The dropdown shows:
   - `— None (use NoopReRanker) —` (default; pass-through)
   - `NoopReRanker (pass-through) — free`
   - `Cohere (rerank-v3.5) — paid`
   - `Voyage (rerank-2) — paid`
   - `OpenAI (gpt-4o-mini judge) — paid`
   - `BGE (local, free) — free`
3. Pick `Cohere (rerank-v3.5) — paid`. The setter writes
   `ScopeConfig.reRanker.driverClass = "CohereReRanker"`.
4. Click **Save Changes**.
5. Confirm the env var is set in `packages/MJAPI/.env`:
   ```
   AI_VENDOR_API_KEY__CohereLLM=your-key-here
   ```
   If MJAPI was started before this was set, restart it.
6. Run a Live Preview (Section 4.4) with query `agent`. Watch MJAPI's
   stdout for a line like:
   ```
   SearchEngine: Re-ranker "CohereReRanker" returned 20 result(s)
     (input=26, outputTopN=20, spent=0.2000¢)
   ```

**What you should see:** the dropdown lists all 6 options. After running the
preview with Cohere selected, the SearchExecutionLog row gets
`RerankerName=CohereReRanker` and `RerankerCostCents>0` (typically `0.2000`
for one search of <100 docs).

**If `RerankerCostCents=0` after a Cohere selection:**
- The API key isn't set or isn't being read. Run `grep CohereLLM
  packages/MJAPI/.env` and verify the key is present and the MJAPI process
  picked it up (restart MJAPI after editing `.env`).
- The reranker classes weren't loaded. Confirm `packages/SearchEngine/src/index.ts`
  exports `CohereReRanker` (this was a real bug; fixed in commit `6b24f82fa7`).

**Optional audit:**
```sql
SELECT TOP 1 RerankerName, RerankerCostCents, ResultCount, Query
FROM __mj.SearchExecutionLog
WHERE Query='agent'
ORDER BY __mj_CreatedAt DESC;
```

**Cross-reference:** RAG_plan P2D.2-7.

### 4.3 Reranker budget cap

**What you're demonstrating:** the per-invocation circuit breaker that
aborts reranking when projected cost would exceed the scope's budget.

**Steps:**
1. Click **Edit this Record**.
2. In the Reranker section, set **Reranker Budget Cents** to a small number
   that won't cover Cohere's per-search cost (e.g. `0`).
3. Save Changes.
4. Run a Live Preview with Cohere selected.
5. Watch MJAPI stdout. You should see a line like:
   ```
   SearchEngine: Re-ranker "CohereReRanker" skipped — projected cost 0.2000¢
     exceeds remaining budget 0.0000¢ (Spent 0.0000¢ / Budget 0¢).
   ```

**What you should see:** the search still returns results (the unranked
candidates), but the reranker is bypassed. SearchExecutionLog row records
`RerankerCostCents=0` because no rerank fired.

**Cross-reference:** RAG_plan P2D.6.

### 4.4 Live Preview panel

**What you're demonstrating:** running a real search end-to-end against the
scope, with streaming results.

**Steps:**
1. On the SearchScope record form (in view mode), scroll to **Live Preview**.
2. Type a query into the textbox (e.g. `agent`).
3. Click **Run**.
4. Within ~1s the preview area populates with the top 10 results, each
   with:
   - A relevance score (`80%`, `77%`, etc.)
   - The matched record's primary name field
   - The entity name
   - A "X result(s) in Yms" footer

**What you should see:** for a workbench DB with the standard MJ entities,
query `agent` returns ~16-20 results in under 100ms. If the scope is
configured with no providers or no permissions, you see "0 result(s)" or a
Forbidden message.

**Cross-reference:** RAG_plan P4.1.

### 4.5 A/B reranker comparison via Kendall-tau

**What you're demonstrating:** how similar two consecutive preview runs are.
This is the core of the reranker-tuning workflow: change the reranker, re-run
the same query, see how much the order changed.

**Steps:**
1. Run a Live Preview with query `agent`.
2. Run it again immediately (same scope, same reranker, same query).
3. The second run's footer shows: `19 result(s) in 66ms · 100% similar to
   last run`.
4. Now click **Edit this Record**, change the Reranker dropdown to a
   different value (e.g. switch from Noop to Cohere), Save.
5. Run the preview again with the same query.
6. The footer updates: `20 result(s) in 312ms · 87% similar to last run`
   (numbers will vary).

**What you should see:** the percentage drops below 100% when the
ordering changes between runs. 100% means identical ordering.

**Cross-reference:** RAG_plan P4.3. The Kendall-tau implementation is in
`packages/Angular/Explorer/core-entity-forms/src/lib/custom/SearchScopes/searchscope-form.component.ts`
(`kendallTauOnSharedItems` static method).

### 4.6 Saved test queries

**What you're demonstrating:** the per-scope canonical-query catalog. Save
representative queries; re-run them after a config change to spot regressions.

**Steps:**
1. On the SearchScope record form, scroll to **Search Scope Test Queries**.
2. Click the **New** button on the toolbar.
3. A new tab opens with the scope pre-populated.
4. Fill **Label** (e.g. `Smoke test`), **Query** (e.g. `agent settings`).
   Optional: **Notes**, **Expected Top Result Entity**, **Expected Top
   Result Record ID**.
5. Click **Save Changes**.
6. Return to the parent scope. The Test Queries panel count is `1` and the
   row appears.

**What you should see:** the panel updates from `0` to `1`; the row shows
your Label, Query, and the foreign key columns.

**Optional audit:**
```sql
SELECT Label, Query, Notes
FROM __mj.SearchScopeTestQuery
WHERE SearchScopeID = '{your scope ID}';
```

**Cross-reference:** RAG_plan P4.4.

### 4.7 Tuning-data CSV export

**What you're demonstrating:** offline analysis of recent search activity for
a single scope.

**Steps:**
1. On the SearchScope record form, scroll to find the **Export tuning data
   (CSV)** button (just above the Live Preview section).
2. Click it.
3. Your browser downloads a file named
   `searchscope-tuning-{scope-name}-{YYYY-MM-DD}.csv`.

**What you should see:** the CSV has a header row with the columns
`CreatedAt, Status, Query, ResultCount, TotalDurationMs, RerankerName,
RerankerCostCents, FailureReason, UserID, AIAgentID`. Each subsequent row
is one search invocation against this scope (most recent 500). Forbidden
rows include the resolver's reason in the FailureReason column.

**Cross-reference:** RAG_plan P3.4.

---

## 5. Permissions

Search Scope permissions are evaluated by `SearchScopePermissionResolver` in
this order:

1. **Direct user grant.** A SearchScopePermission row keyed by `UserID = current
   user` short-circuits everything. PermissionLevel='None' is an explicit deny.
2. **Role grants.** Any of the user's roles that has a SearchScopePermission row
   on this scope contributes. The highest non-None level wins.
3. **Agent fallback.** When an agent is the caller, `AIAgent.SearchScopeAccess
   = 'All'` lets it through; `'None'` is an explicit deny that overrides
   everything; `'Assigned'` requires an `MJ: AI Agent Search Scopes` row.
4. **No grant.** Reject with `Forbidden`.

### 5.1 Direct user grants

**What you're demonstrating:** the simplest permission case — granting a
specific user `Search` access to a specific scope.

**Steps:**
1. On the SearchScope record form, scroll to **Search Scope Permissions**.
2. Click **New** on the toolbar.
3. The new tab opens with the scope pre-populated.
4. Click into **User** and pick yourself or another user.
5. Leave **Role** empty (the XOR check constraint requires exactly one).
6. Click into **Permission Level** and pick `Search`.
7. Click **Save Changes**.
8. Return to the scope form. The Permissions panel count is `1`.

**What you should see:** the row in the grid shows the user's email,
permission level `Search`, and the foreign-key columns. The Role column
shows `—`.

**Optional audit:**
```sql
SELECT UserID, RoleID, PermissionLevel
FROM __mj.SearchScopePermission
WHERE SearchScopeID = '{your scope ID}';
```

**Cross-reference:** RAG_plan P2A.2, P2A.6.

### 5.2 Role grants

Same flow as 5.1 but pick a Role instead of a User. Useful for granting
"all developers can search this scope" rather than enumerating users.

### 5.3 Permission levels

The four levels (in increasing privilege):

| Level | Effect |
|---|---|
| `None` | Explicit deny. Direct-user None overrides everything; role-level None is ignored (so a role gone wrong doesn't accidentally lock everyone out). |
| `Read` | Can see the scope's metadata but not run searches. |
| `Search` | Can invoke `ScopedSearchAction` against the scope and get results. |
| `Manage` | Search + can edit the scope's definition. |

**Demonstrating None as deny:** open the user's permission row, change
PermissionLevel to `None`, Save. Run a Live Preview. The result block
shows: `Forbidden: User '<name>' has an explicit None grant on this scope;
refused.`

### 5.4 Forbidden response

**What you're demonstrating:** the end-to-end denial path: resolver → GraphQL
→ Live Preview → SearchExecutionLog row.

**Steps:**
1. Open the user's permission row (Section 5.3 procedure).
2. Set **Permission Level** to `None`. Save.
3. Run a Live Preview with any query.
4. The preview area shows the Forbidden message.
5. Scroll down to the **Search Execution Logs** panel on the same SearchScope
   form. The newest row's Status column shows `Forbidden` and FailureReason
   contains the resolver's reason.
6. Open the Search Analytics tab on the Knowledge Hub Config dashboard. The
   "Top failure reasons" table should show the just-rejected reason with
   count incremented.

**What you should see:** end-to-end the denial visibly: in the preview UI,
in the form's child grid, and in the analytics dashboard.

**Cross-reference:** RAG_plan P2A.4 (resolver), commit `b0a2938ed8` (logging
fix), commit `ed4180d466` (streaming-resolver logging fix).

### 5.5 Auditing permissions

The Permissions panel on the SearchScope form is the audit surface — a single
grid with all permission rows for this scope. The Knowledge Hub
Configuration → Permissions subtab (when present) provides a cross-scope view.

---

## 6. Agent integration

Agents use SearchScopes via two surfaces: an `AIAgent.SearchScopeAccess`
column (None/All/Assigned), and an `MJ: AI Agent Search Scopes` child grid
that lists the scopes the agent uses for pre-execution RAG.

### 6.1 SearchScopeAccess on AIAgent

**What you're demonstrating:** the per-agent access policy. Setting
`SearchScopeAccess='None'` on an agent prevents it from invoking
`ScopedSearchAction` regardless of any user-side grants.

**Steps:**
1. Navigate to `/resource/record/MJ: AI Agents/{agent-id}` (e.g.
   `/resource/record/MJ: AI Agents/a1575099-1576-45e9-a6fd-88102fb7e510` for
   the Memory Manager agent on the workbench).
2. Click **Edit this Record**.
3. Find the **SearchScopeAccess** dropdown in the Details section. The three
   options are:
   - `None` — agent cannot invoke search at all (default for existing agents)
   - `All` — agent can search any scope without per-scope membership (use for
     trusted system agents)
   - `Assigned` — agent can only search scopes it has an
     `AI Agent Search Scopes` row for
4. Pick a value. Save.

**What you should see:** the field saves and is reflected in subsequent
search invocations. With `None`, calling `StreamScopedSearch` with this
agent's ID returns `Forbidden: Agent '<name>' has SearchScopeAccess='None';
refused without consulting per-scope grants.`

**Optional audit:**
```sql
SELECT Name, SearchScopeAccess FROM __mj.AIAgent WHERE ID = '{agent ID}';
```

**Cross-reference:** RAG_plan P2A.1.

### 6.2 Wiring an agent to a scope

**What you're demonstrating:** assigning specific scopes to an agent so it
can use them with `SearchScopeAccess='Assigned'` or for pre-execution RAG.

**Steps:**
1. On the SearchScope record form, scroll to **AI Agent Search Scopes**.
2. Click **New** on the toolbar.
3. The new tab opens with the parent scope pre-populated.
4. Click into **Agent** and pick the agent (e.g. Memory Manager).
5. Set **Phase** to `Both` (agent can invoke + pre-execution RAG fires).
   Other options: `PreExecution`, `AgentInvoked`.
6. Optional: set **Priority** (lower = runs first), **MaxResults**,
   **MinScore**, **FusionWeightsOverride**.
7. Save Changes.

**What you should see:** the AI Agent Search Scopes panel count is `1`.

**Cross-reference:** RAG_plan §1.1 Phase 1 (the entity itself), §3 Phase 2A
(the integration).

### 6.3 Phase = PreExecution / AgentInvoked / Both

| Phase | Effect |
|---|---|
| `PreExecution` | `AgentPreExecutionRAG.Execute` runs this scope automatically before each agent turn and injects the markdown-formatted results into the agent's prompt. |
| `AgentInvoked` | The agent must explicitly call `ScopedSearchAction` (or the streaming variant) and pass this scope's ID. |
| `Both` | All of the above. |

### 6.4 Watching a Forbidden agent rejection in the log

**Steps:**
1. Set the agent's `SearchScopeAccess` to `None` (Section 6.1).
2. Open the GraphQL playground at `http://localhost:4001/`.
3. Run:
   ```graphql
   mutation {
     StreamScopedSearch(
       query: "test"
       scopeIDs: ["{your scope ID}"]
       agentID: "{your agent ID}"
     ) {
       Success StreamID ErrorMessage
     }
   }
   ```
   (You'll need an `Authorization: Bearer <token>` header — easiest is to
   copy from a network request in MJExplorer's DevTools.)
4. The response is `Success: false, ErrorMessage: "Forbidden: Agent
   '...' has SearchScopeAccess='None'; refused..."`.
5. Query the log:
   ```sql
   SELECT TOP 1 Status, AIAgentID, FailureReason
   FROM __mj.SearchExecutionLog
   ORDER BY __mj_CreatedAt DESC;
   ```
6. The row's `AIAgentID` is the agent you used and `Status='Forbidden'`.

**What you should see:** the AIAgentID column is populated (this was a real
fix in commit `2e4d1e18a3` — the column had been hardcoded to NULL pending a
"Phase 3 follow-up" that never landed).

**Cross-reference:** RAG_plan §3 Phase 2A, commit `2e4d1e18a3`.

---

## 7. Observability

Every search invocation writes one `MJ: Search Execution Logs` row regardless
of outcome. Two surfaces consume those rows:

### 7.1 SearchExecutionLog panel on the SearchScope form

**What you're demonstrating:** per-scope drilldown of recent searches.

**Steps:**
1. On the SearchScope record form, scroll to the **Search Execution Logs**
   panel at the bottom.
2. The grid shows columns: Status, Reranker Name, Search Scope ID, User ID,
   AI Agent ID, Total Duration Ms, Result Count, Reranker Cost Cents.
3. Sort by created-at descending to see your latest runs first.

### 7.2 Search Analytics dashboard tab

**What you're demonstrating:** the global cross-scope view.

**Steps:**
1. Navigate to `/app/knowledge-hub/Configuration`.
2. Click the **Search Analytics** tab.
3. The page renders six KPI cards across the top: Total Runs, Success Rate,
   Hit Rate, Avg Latency, P95 Latency, Reranker Spend.
4. Below the KPIs, three tables: Top scopes by volume, Reranker spend by
   driver, Top failure reasons.
5. Click **Refresh** to re-aggregate after running new searches.

**What you should see:** all three tables populate from the most recent 5,000
SearchExecutionLog rows. If you have no recent activity, run a few Live
Previews and refresh.

**Cross-reference:** RAG_plan P3.3.

### 7.3 Top scopes by volume

The first table aggregates by `SearchScopeID`, showing scope name + run count
+ avg latency. Scope name `— unscoped —` represents searches with no scope
(callers passing `scopeIDs: undefined`).

### 7.4 Top failure reasons

The third table aggregates `FailureReason` strings on rows where
`Status='Forbidden'` or `'Failure'`. This is the canonical surface for
spotting users / agents trying to access scopes they shouldn't.

### 7.5 Reranker spend by driver

The middle table aggregates `RerankerCostCents` by `RerankerName`. Empty when
no scope on the workbench has a paid reranker configured.

---

## 8. External providers

The branch ships four external SearchProvider classes (Phase 5):

| Driver class | Search backend | Optional peer dep |
|---|---|---|
| `ElasticsearchSearchProvider` | Elasticsearch | `@elastic/elasticsearch` |
| `TypesenseSearchProvider` | Typesense | `typesense` |
| `AzureAISearchProvider` | Azure AI Search | `@azure/search-documents` |
| `OpenSearchSearchProvider` | OpenSearch (AWS) | `@opensearch-project/opensearch` |

**What you're demonstrating:** the registration plumbing — these classes
appear in the SearchScope Providers dropdown and can be selected.

**Steps:**
1. On a SearchScope record form, scroll to **Search Scope Providers**.
2. Click **New**.
3. In the new permission tab's **Search Provider Name** lookup, type `elast`.
4. The autocomplete resolves `Elasticsearch` (DriverClass=`ElasticsearchSearchProvider`).
5. Type `type`, `azure`, `open` to confirm the other three are also discoverable.

**What you should see:** all four external provider records resolve via
typeahead. Selecting and saving one adds it to the scope's Providers list.

**The peer-dep gap:** at runtime, when MJAPI evaluates the scope, the engine
calls `Initialize` on each provider. The external providers attempt
`await import('@elastic/elasticsearch')` (or equivalent). On a workbench with
no peer dep installed, this throws and the provider's `IsAvailable()` returns
false. The engine logs `Provider "Elasticsearch" (ElasticsearchSearchProvider)
not available` and skips it for the run. **The scope still works** — it just
doesn't include the external index.

To actually use one of these providers:
1. `npm install @elastic/elasticsearch` (or the relevant package) into your
   host application — not into `packages/SearchEngine` itself.
2. Configure the SearchProvider's **ProviderConfig** field with the
   connection JSON (e.g.
   `{"node": "https://es.internal:9200", "apiKey": "..."}`).
3. Restart MJAPI.
4. Re-run a Live Preview against a scope using that provider; the engine
   should now include it in the active list.

**Cross-reference:** RAG_plan P5.1-5.5, commit `6b24f82fa7` (the export fix
that made the registrations actually run), `metadata/search-providers/.search-providers.json`
(the seed records), commit `cfa2b723fb` (seeding).

---

## 9. Streaming results behavior

The Live Preview consumes `StreamScopedSearch` via a GraphQL subscription, so
results stream in as each provider returns rather than blocking on the
slowest one.

### 9.1 What streaming looks like

**Steps:**
1. On the SearchScope record form, type a query into Live Preview.
2. Click **Run**.
3. Watch the result area carefully.

**What you should see:**
- A small per-provider status row appears at the top showing each enabled
  provider's name and a tiny progress indicator.
- Each provider's results pop in as it returns — usually the entity
  provider first, then full-text, then any external indexes.
- Once all providers have reported, the fused list re-orders.
- If a reranker is configured, the list re-orders one more time.
- Final state: top 10 results sorted by post-rerank score, with a footer
  showing total count and elapsed milliseconds.

On a workbench with only fast providers (Database, Database Full-Text), the
streaming completes in <100ms — the UI may render only the final state.
To see clear streaming, configure a slow provider (e.g. `VectorSearchProvider`
with a misconfigured embedding endpoint that times out) or add an artificial
delay in dev.

### 9.2 Skeleton rows

Before any provider returns, the result area shows skeleton placeholders so
the UI doesn't jump when content arrives. These are pure presentation; they
don't represent real candidates.

### 9.3 Final fused/reranked results

The footer changes through the search:
- During streaming: `Searching...` or per-provider progress
- After fusion: `X result(s) — fusing...`
- After reranking (if configured): `X result(s) — reranking...`
- Final: `X result(s) in Yms[ · Z% similar to last run]`

**Cross-reference:** RAG_plan P2C.0-5. The streaming mechanism choice
(GraphQL subscriptions over WebSocket) is documented in
`plans/search-scopes-rag-plus/streaming-mechanism-decision.md`.

---

## 10. Appendix

### 10.1 Schema reference

Tables backing each feature:

| Feature | Table |
|---|---|
| Scope definition | `__mj.SearchScope` |
| Provider catalog | `__mj.SearchProvider` |
| Per-scope provider rows | `__mj.SearchScopeProvider` |
| Per-scope entity rows | `__mj.SearchScopeEntity` |
| Per-scope external-index rows | `__mj.SearchScopeExternalIndex` |
| Per-scope storage rows | `__mj.SearchScopeStorageAccount` |
| Permissions | `__mj.SearchScopePermission` |
| Agent → scope assignment | `__mj.AIAgentSearchScope` |
| Agent-side access policy | `__mj.AIAgent.SearchScopeAccess` (column) |
| Saved test queries | `__mj.SearchScopeTestQuery` |
| Execution log | `__mj.SearchExecutionLog` |
| Reranker budget | `__mj.SearchScope.RerankerBudgetCents` (column) |
| Reranker selection | `__mj.SearchScope.ScopeConfig.reRanker.driverClass` (JSON path) |

### 10.2 GraphQL operations cheat sheet

```graphql
# Synchronous search (blocks until fusion + rerank done)
mutation {
  SearchKnowledge(
    query: "agent"
    scopeIDs: ["..."]
    agentID: "..."
    maxResults: 25
  ) {
    Success
    Results { ID Score Title Snippet EntityName }
    ErrorMessage
  }
}

# Streaming search (returns immediately, subscribe for events)
mutation {
  StreamScopedSearch(
    query: "agent"
    scopeIDs: ["..."]
    agentID: "..."
  ) {
    Success StreamID ErrorMessage
  }
}

subscription($streamID: ID!) {
  SearchStreamEvents(streamID: $streamID) {
    StreamID Phase ProviderName Results { ... } ErrorMessage
  }
}

# Run an agent (which may use scope-based pre-execution RAG)
mutation {
  RunAIAgent(input: { AgentID: "..." Message: "Find me agents" }) {
    Success Result
  }
}
```

### 10.3 Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Preview returns 0 results | Scope has no active providers, or all providers crashed | Check MJAPI stdout for `Provider X not available`; fix peer-dep / config; ensure at least Database + Database Full-Text are Active and enabled on the scope |
| `Forbidden: User ...` on every search | Direct user grant is `None`, or no grant exists | Open the SearchScope form → Permissions panel; check or create a row for your user with level `Search` or higher |
| Cohere selected but `RerankerCostCents=0` | API key not loaded, or the reranker class wasn't registered | (a) Ensure `AI_VENDOR_API_KEY__CohereLLM` is in `packages/MJAPI/.env`; restart MJAPI. (b) Confirm `packages/SearchEngine/src/index.ts` exports `CohereReRanker` (commit `6b24f82fa7`). |
| `entry.Provider.Search is not a function` | A provider class was registered but its source file wasn't imported | Re-export the provider class from `packages/SearchEngine/src/index.ts` and rebuild |
| Search Analytics dashboard shows nothing | No recent SearchExecutionLog rows in the 5000-row window, or RunView cache is stale | Run a Live Preview, click Refresh; if still empty, restart MJAPI to clear the RunView cache |
| Live Preview disabled (Run button greyed out) | Textbox is empty, or the form is in edit mode | Type a query; if in edit mode, Save or Discard first |
| Permission row's User clear didn't save | Foreign-key lookup component has a binding gap on clear-then-set | Workaround: delete the row entirely (right-click → Delete in the grid) and create a new one with the desired Role only |
| Migration fails on `V202604221600` with "spUpdateAIAgent expects parameter '@SearchScopeAccess'" | Pre-fix migration sequence | Pull commit `ff44a5eabf` which makes the proc param NULL-safe via COALESCE |
| Migration checksum mismatch on existing DBs after pulling commit `ff44a5eabf` | Skyway/Flyway recorded the old V202604182034 checksum | Run `mj migrate --repair` (Skyway equivalent) once to update the recorded checksum, then `mj migrate` |

### 10.4 Cross-reference to RAG_plan.md tasks

| Task ID | What it ships | Demo section here |
|---|---|---|
| P2A.1 | `AIAgent.SearchScopeAccess` column | §6.1 |
| P2A.2 | `SearchScopePermission` table | §5.1 |
| P2A.3 | `SearchScopePermissionResolver` class | §5.4 (live) + unit tests |
| P2A.4 | GraphQL resolver enforcement | §5.4 |
| P2A.5 | `ScopedSearchAction` enforcement | §6.4 (via agentID GraphQL call) |
| P2A.6 | Permission management UI | §5.1 |
| P2A.7 | Knowledge Hub Permissions surface | §5.5 |
| P2A.8 | RLS PM-10 + integration test | Unit tests only (no UI) |
| P2B.1-8 | `SearchResultSetToolLibrary` | Agent-internal; verified via `packages/AI/Agents/src/__tests__/SearchResultSetToolLibrary.test.ts` |
| P2C.0-5 | Streaming search | §9 |
| P2D.1-7 | Reranker catalog | §4.2, §4.3 |
| P3.1-2 | SearchExecutionLog + hook | §7.1 |
| P3.3 | Search Analytics dashboard | §7.2-5 |
| P3.4 | Per-scope CSV export | §4.7 |
| P4.1 | Live Preview panel | §4.4 |
| P4.2 | Fusion weight sliders | §4.1 |
| P4.3 | Kendall-tau A/B | §4.5 |
| P4.4 | Saved test queries | §4.6 |
| P5.1-5 | External providers | §8 |
| P6.1-6 | Cleanup / docs | Developer-internal; no user demos |

### 10.5 Bug fixes shipped on this branch beyond the original plan

| Commit | Fix |
|---|---|
| `c8804751b8` | Permission resolver bypasses RunView cache (security correctness — a freshly-revoked grant takes effect immediately) |
| `b0a2938ed8` | `SearchKnowledge` resolver logs Forbidden rows to SearchExecutionLog |
| `ed4180d466` | `StreamScopedSearch` resolver also logs Forbidden (the path Live Preview uses) |
| `dd87e6a02d` | Wired the New-record toolbar through `ExplorerEntityDataGridComponent` so any related-entity grid in any custom form opens a pre-populated new-record tab |
| `ad7d7af375` | Enabled the New toolbar on every user-managed related panel of the SearchScope form |
| `cfa2b723fb` | Seeded SearchProvider records for the four external providers |
| `6b24f82fa7` | Exported reranker + external-provider classes from `packages/SearchEngine/src/index.ts` so their `@RegisterClass` decorators actually run (the cause of "Cohere selected but cost=0" and "entry.Provider.Search is not a function") |
| `2e4d1e18a3` | Plumbed `AIAgentID` through `SearchExecutionLog` (it was hardcoded to NULL with a "Phase 3 follow-up" TODO) |
| `ff44a5eabf` | Fresh-DB migration replay fix — `spUpdateAIAgent.@SearchScopeAccess` defaulted to NULL with COALESCE so the `V202604221600__v5.29.x__Metadata_Sync.sql` calls succeed |
