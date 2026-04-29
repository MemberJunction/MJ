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

### The two surfaces

There are **two** UI surfaces for SearchScopes and you need to know about
both:

- **Dashboard view** at `/app/knowledge-hub/Configuration` → **Search Scopes**
  tab. A master-detail page: scopes listed in a left sidebar, the selected
  scope's editor in the right pane. The right pane has six tabs (Definition,
  Providers, External Indexes, Entities, Storage, Permissions) plus a tab-strip
  toolbar with **Open Full Form**, **Save**, and **Delete** buttons. Good for
  quick authoring of the metadata fields.
- **Full custom form** at `/resource/record/MJ: Search Scopes/{id}`. The
  full BaseForm-derived custom form. This is where every Phase 2D / Phase 4
  feature lives — Fusion Weights sliders, Reranker dropdown, Reranker Budget
  Cents, Live Preview, Export tuning data, Search Scope Test Queries panel,
  Search Execution Logs panel. Click the **Open Full Form** button on the
  dashboard tab strip (or navigate by URL using the scope's ID).

### The tour

1. Open `http://localhost:4200/app/knowledge-hub/Configuration`. Click the
   **Search Scopes** tab. You see a left sidebar labeled "Scopes (N)" with
   one or more existing scopes plus a **+ New** button. Click an existing
   scope (e.g. `P4 Verify Scope` if the workbench seed is present). The
   right pane populates with the Definition tab: Name, Icon, Description,
   Status, Start at, End at, Default checkbox, Global checkbox, Scope Config
   (JSON), Search Context Config (JSON), and Save / Delete scope buttons.
2. Switch tabs (Providers / External Indexes / Entities / Storage /
   Permissions) to see each child collection. Each tab is its own grid with
   its own add affordance.
3. Now open the full custom form by clicking **Open Full Form** in the
   right-pane tab strip (the icon-with-text button to the left of Save).
   A new MJExplorer tab opens at
   `/app/home/record/MJ: Search Scopes/ID|{scope-id}`.
4. The full form renders ~18 collapsible panels. In top-to-bottom order:
   Scope Definition, Scope Configuration, Access Control, Lifecycle
   Management, Technical Configuration, **Fusion Weights** (4 sliders),
   **Reranker** (dropdown + Reranker Budget Cents + **Export tuning data
   (CSV)** button), **Live Preview** (text input + Run), Details, System
   Metadata, then related-entity panels: Search Scope Test Queries, Search
   Scope Storage Accounts, Search Scope Entities, Search Scope External
   Indexes, Search Scope Providers, AI Agent Search Scopes, Search Scope
   Permissions, Search Execution Logs.
5. Type `agent` into the Live Preview textbox and click **Run**. Within ~1s
   the result area below the Run button populates with the top 10 results,
   each with a relevance score (e.g. `80%`), a record name, and the entity
   it came from. A footer line reads "X result(s) in Yms".
6. Run the same query again. The footer of the second run reads
   "X result(s) in Yms · 100% similar to last run" — that's the Kendall-tau
   comparison against the previous run.
7. Switch back to the Knowledge Hub Configuration page (browser back) and
   click the **Search Analytics** tab. The page renders six KPI cards (Total
   Runs, Success Rate, Hit Rate, Avg Latency, P95 Latency, Reranker Spend)
   plus three tables (Top scopes by volume, Reranker spend by driver, Top
   failure reasons). Your two runs from step 5–6 appear in Top scopes by
   volume against the scope you used.
8. Back on the full custom form, in the **Reranker** section, click
   **Export tuning data (CSV)**. Your browser downloads
   `searchscope-tuning-{scope-name}-{YYYY-MM-DD}.csv` with one row per
   recent search invocation against this scope.

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
3. In the left sidebar, click **+ New**. The right pane immediately
   populates with a template: Name=`New Search Scope`, Icon=`fa-solid
   fa-filter`, Description=`New scope — configure providers, entities, or
   storage below.`
4. Edit **Name** (e.g. `My Demo Scope`) and **Description** to your liking.
   Leave **Status** at `Active`. Leave the **Default scope — picked when
   users/agents don't specify one** checkbox unchecked. The **Global**
   checkbox is disabled (reserved for the built-in Global scope).
5. The **Scope Config (JSON)** field accepts an object with optional keys:
   - `fusionWeights` — per-source weight overrides
   - `reRanker.driverClass` — registered reranker class name (the Reranker
     dropdown on the full form writes this for you)
   Leave it as `{}` for now.
6. Click **Save**. The scope appears in the left sidebar.

**What you should see:** the new scope is selected in the sidebar with its
form populated. Switch to the full custom form
(`/resource/record/MJ: Search Scopes/{new id}`) to see the related-entity
panels — all zero counts.

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
4. A new tab opens with four collapsible sections, each containing one or
   two fields:
   - **Search Configuration**: **Search Scope Name** (pre-populated with
     your scope's name) and **Search Provider Name** (lookup).
   - **Operational Settings**: **Enabled** (checkbox, on by default),
     **Max Results Override** (numeric), **Provider Configuration
     Override** (JSON textarea).
   - **Query Processing**: **Query Transform Template** (FK lookup to a
     Nunjucks template; optional).
   - **System Metadata** (read-only after first save).
5. Click into **Search Provider Name** and type a partial provider name
   (e.g. `Data` for "Database" or "Database Full-Text"). A small dropdown
   appears below the input listing matching SearchProvider records. The
   dropdown is case-sensitive and only opens after at least one event-firing
   keystroke into the focused field — if it doesn't appear, click the input
   first, then type.
6. Click `Database` in the dropdown. The input value changes to `Database`
   and a **Clear** button appears next to it (this is the visual signal
   that the FK is bound). Leave Enabled checked. Optionally set **Max
   Results Override** or **Provider Configuration Override** (JSON).
7. Click **Save Changes**.
8. Return to the SearchScope form. The Providers panel count is `1` and the
   new row appears in the grid.

**What you should see:** the panel's count badge updated from 0 to 1; the row
shows the SearchProvider's name (e.g. `Database`) and `Enabled=true`.

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
2. Click **New** on the panel toolbar.
3. The new tab opens with these labelled fields: **Search Scope Name**
   (pre-populated), **Entity Name** (FK lookup), **Extra Filter**, **User
   Search String**.
4. Click into **Entity Name**, type a partial name (e.g. `Actions` resolves
   `MJ: Actions`), and click the matched option in the dropdown — the
   input value updates and a Clear button appears.
5. Optionally fill **Extra Filter** (extra SQL `WHERE` predicate AND-ed
   into the EntitySearchProvider's query) or **User Search String**
   (a Nunjucks template the provider uses for the user-facing match string).
6. Save Changes.
7. Return to the parent scope. The Entities panel count is `1`.

**What you should see:** count badge 1; row visible.

**Cross-reference:** RAG_plan §1.1 Phase 1. Schema columns are in
`__mj.SearchScopeEntity` — `EntityID`, `ExtraFilter`, `UserSearchString`.

### 3.4 Wire up external indexes

External-index providers (Elasticsearch, Typesense, etc.) consume scope rows
in the **Search Scope External Indexes** panel.

**Steps:**
1. On the SearchScope record form, scroll to **Search Scope External
   Indexes**.
2. Click **New**.
3. The form's labelled fields: **Search Scope** (pre-populated), **Index
   Type** (lookup; pick e.g. `Elasticsearch`), **Vector Index Name**
   (optional FK to an MJ Vector Index record), **External Index Name**
   (e.g. `prod-knowledge`), **External Index Config** (JSON the provider
   parses for query-time options), **Metadata Filter** (JSON filter DSL
   pushed into the provider's query for permission / tenant scoping).
4. Save.

**Display vs schema names:** the form labels follow the entity's
DisplayName metadata, which differs from the underlying column names. For
SQL audits the column names are `IndexType`, `VectorIndexID`,
`ExternalIndexName`, `ExternalIndexConfig`, `MetadataFilter`.

**Note:** without the matching peer dep installed and a real cluster
configured (see Section 8), the external provider self-disables at runtime.
The row stays valid metadata; it's just inert.

**Cross-reference:** RAG_plan §1.1 Phase 1, P5.x. Schema columns are in
`__mj.SearchScopeExternalIndex`.

### 3.5 Wire up storage accounts

The **Search Scope Storage Accounts** panel lets the StorageSearchProvider
limit which File Storage accounts (Box / Google Drive / SharePoint /
Dropbox / etc.) participate in this scope.

**Steps:**
1. Scroll to **Search Scope Storage Accounts**.
2. Click **New**.
3. The form's labelled fields: **Search Scope** (pre-populated), **File
   Storage Account** (FK lookup), **Folder Path** (optional, e.g.
   `/policies` to scope to one subtree).
4. Save.

**Cross-reference:** Schema columns are in `__mj.SearchScopeStorageAccount`
(`FileStorageAccountID`, `FolderPath`).

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
1. On the SearchScope record form, click the **Edit this Record** icon
   button in the toolbar at the top of the page (a pen-to-square icon —
   hover to confirm the title is "Edit this Record").
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
1. On the SearchScope record form, scroll to the **Reranker** section. The
   **Export tuning data (CSV)** button sits below the Reranker dropdown
   and Reranker Budget Cents field, with a small caption "Last 500 search
   invocations against this scope."
2. Click the button.
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

There are two audit surfaces:

- **Per-scope, on the full custom form:** the **Search Scope Permissions**
  related panel at the bottom of the form lists every permission row keyed
  to that scope. Use this when investigating "who can use this one scope."
- **Per-scope, on the Knowledge Hub Configuration page:** under the **Search
  Scopes** tab, with a scope selected, the right pane has a **Permissions**
  sub-tab. Same data as above, just the dashboard rendering.

There is no cross-scope permissions audit page in this branch. To query
"every permission row across all scopes," run the SQL in the optional audit
block of §5.1 without the `WHERE` clause.

---

## 6. Agent integration

Agents use SearchScopes via two surfaces: an `AIAgent.SearchScopeAccess`
column (None/All/Assigned), and an `MJ: AI Agent Search Scopes` child grid
that lists the scopes the agent uses for pre-execution RAG.

### 6.1 SearchScopeAccess on the AIAgent form

**What you're demonstrating:** the per-agent access policy. Setting
SearchScopeAccess to `None` on an agent prevents it from invoking
`ScopedSearchAction` regardless of any user-side grants.

**Steps:**
1. Navigate to `/resource/record/MJ: AI Agents/{agent-id}` (e.g.
   `/resource/record/MJ: AI Agents/a1575099-1576-45e9-a6fd-88102fb7e510` for
   the Memory Manager agent on the workbench).
2. Find and click the **Search** expandable section on the agent form (it
   sits between Notes and Payload Management — the agent form's section
   list reads roughly: Execution History, Actions, Sub-Agents, Prompts,
   Learning Cycles, Notes, **Search**, Payload Management, Execution
   Guardrails, Configuration).
3. The Search section shows a description ("Control this agent's access to
   Scoped Search and assign the scopes it can use for pre-execution RAG or
   agent-invoked search.") followed by three radio-button cards:
   - **All** — Can use any scope including Global. No scope restriction.
   - **Assigned** — Can use ONLY scopes listed below. Other scopes are
     rejected with ACCESS_DENIED.
   - **None** — No search capability. The Scoped Search action is disabled
     for this agent.
4. Click **Edit this Record** in the toolbar at the top, then pick one of
   the three cards. Click **Save Changes**.

**What you should see:** the chosen card persists across reloads. With
`None`, any call to `StreamScopedSearch` or `SearchKnowledge` that includes
this agent's `agentID` returns
`Forbidden: Agent '<name>' has SearchScopeAccess='None'; refused without
consulting per-scope grants.`

**Optional audit:**
```sql
SELECT Name, SearchScopeAccess FROM __mj.AIAgent WHERE ID = '{agent ID}';
```

**Cross-reference:** RAG_plan P2A.1.

### 6.2 Wiring an agent to a scope

There are two paths to create an `MJ: AI Agent Search Scopes` row. Both
write to the same table.

**Path A — from the SearchScope full form (most fields exposed):**
1. Open the scope at `/resource/record/MJ: Search Scopes/{id}`.
2. Scroll to **AI Agent Search Scopes** related panel.
3. Click **New** on the panel toolbar.
4. The new tab opens with **Search Scope Name** pre-populated. The
   labelled fields (display names) are: **Agent Name** (FK lookup),
   **Search Scope Name** (pre-populated), **Execution Phase** (combobox:
   PreExecution, AgentInvoked, Both), **Status**, **Start Date**, **End
   Date**, **Priority** (lower = runs first), **Max Results**, **Minimum
   Score**, **Query Template Name** (FK lookup), **Fusion Weights
   Override** (JSON textarea), **Is Default**.
5. Click **Save Changes**.

**Path B — from the AIAgent form's Search section (compact in-form grid):**
1. On the AIAgent form, expand **Search** and click **Edit this Record**.
2. Pick the **Assigned** card. The form reveals an "Assigned Scopes" grid
   with columns SCOPE, PHASE, PRIORITY, MAX RESULTS, MIN SCORE, QUERY
   TEMPLATE, FUSION WEIGHTS OVERRIDE, DEFAULT, plus a **+ Assign another
   scope** button.
3. Click **+ Assign another scope** and fill the row.
4. Click **Save Changes**.

**What you should see (either path):** a new row in
`__mj.AIAgentSearchScope`. Confirm via
```sql
SELECT * FROM __mj.AIAgentSearchScope
WHERE AgentID = '{agent ID}' AND SearchScopeID = '{scope ID}';
```

**Cross-reference:** RAG_plan §1.1 Phase 1 (the entity itself), §3 Phase 2A
(the integration).

### 6.3 Phase = PreExecution / AgentInvoked / Both

| Phase | Effect |
|---|---|
| `PreExecution` | `AgentPreExecutionRAG.Execute` runs this scope automatically before each agent turn and injects the markdown-formatted results into the agent's prompt. |
| `AgentInvoked` | The agent must explicitly call `ScopedSearchAction` (or the streaming variant) and pass this scope's ID. |
| `Both` | All of the above. |

The AIAgent form's Search section also exposes an **Effective scope
permissions** rollup directly under the Assigned Scopes grid. This shows
which users and roles can actually use the scopes you've assigned (per
the SearchScopePermission rules from §5). Empty state text: "No scopes
assigned yet — permissions will appear here once you add scopes above."
The rollup says explicitly that you edit grants in
"Knowledge Hub Config → Search Scopes → Permissions" — i.e. it's a
read-only view, not an editor.

### 6.4 Watching a Forbidden agent rejection in the log

There is no GraphQL playground UI on MJAPI — the server returns JSON only
with `{"error":"Authentication failed"}` for unauthenticated browser
visits to `/`. Use a tool like Postman, `curl`, or DevTools' fetch to
post mutations against `http://localhost:4001/`.

**Steps:**
1. Set the agent's SearchScopeAccess to `None` (Section 6.1).
2. Get an auth token: open DevTools on a working MJExplorer tab, copy the
   `Authorization: Bearer ...` header from any GraphQL request in the
   Network panel.
3. Run the following from your terminal (replace placeholders):
   ```bash
   curl -X POST http://localhost:4001/ \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{"query":"mutation { StreamScopedSearch(query: \"test\", scopeIDs: [\"{scope ID}\"], agentID: \"{agent ID}\") { Success ErrorMessage } }"}'
   ```
4. The response body is
   ```json
   {"data":{"StreamScopedSearch":{
     "Success":false,
     "ErrorMessage":"Forbidden: Agent '<name>' has SearchScopeAccess='None'; refused without consulting per-scope grants."
   }}}
   ```
5. Query the log:
   ```sql
   SELECT TOP 1 Status, AIAgentID, FailureReason
   FROM __mj.SearchExecutionLog
   ORDER BY __mj_CreatedAt DESC;
   ```
6. The row's AIAgentID is the agent you used and Status='Forbidden'.

**What you should see:** the AIAgentID column is populated (commit
`2e4d1e18a3` plumbed it through from the GraphQL agentID arg into the log
write).

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

Columns: **Scope**, **Runs**, **Avg latency**. Aggregates by
`SearchScopeID`. Scope name `— unscoped —` represents searches with no
scope ID (callers passing `scopeIDs: undefined`).

### 7.4 Top failure reasons

Columns: **Reason**, **Count**. Aggregates `FailureReason` strings on rows
where Status='Forbidden' or 'Failure'. This is the canonical surface for
spotting users / agents trying to access scopes they shouldn't. Empty
state: "No failures in the window."

### 7.5 Reranker spend by driver

Columns: **Reranker**, **Calls**, **Total cents**. Aggregates
RerankerCostCents grouped by RerankerName. Empty state: "No rerank
invocations in the window." A workbench with the Cohere reranker
configured and one preview run shows e.g. `CohereReRanker / 1 / 0.2¢`.

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
3. In the new SearchScopeProvider tab, click into **Search Provider Name**
   and type `elast`.
4. The autocomplete resolves `Elasticsearch` (DriverClass=`ElasticsearchSearchProvider`).
5. Clear and type `type`, `azure`, `open` to confirm the other three are
   also discoverable.

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

The Live Preview consumes `StreamScopedSearch` via a GraphQL subscription,
so results stream in as each provider returns rather than blocking on the
slowest one.

### 9.1 What streaming looks like

**Steps:**
1. On the SearchScope record form, type a query into Live Preview.
2. Click **Run**.
3. Watch the area between the input row and the results.

**What you should see, in order:**

- The **Run** button is replaced by a red **Cancel** button (stop icon)
  while the search is in flight.
- A row of **provider chips** appears below the input. Initially: a single
  pending chip reading `🔄 Streaming…` (spinner). As each provider returns,
  a green-checkmark chip replaces or joins it: e.g.
  `✓ Entity 19 0ms`. Each chip shows the provider name, its result count,
  and how long it took.
- The **results list** populates once results are available. Each row
  shows the percent score, the matched record's title, and the entity it
  came from.
- The **header above the results** reads `X result(s) in Yms` and, on the
  second and later runs, also `· Z% similar to last run` (the Kendall-tau
  similarity to the previous run; bold red when the percentage drops below
  70%).
- The list is capped at the top 10 visually; below row 10 you see
  `…and N more (preview shows top 10).`

On the workbench with only fast providers (Database, Database Full-Text)
enabled, the whole sequence completes in <100ms and the chips may flash
by faster than you can see. To deliberately slow it down for a demo,
configure the Semantic provider on the scope without an active embedding
endpoint, or add an artificial delay in a forked provider's `Search`
implementation.

### 9.2 No skeleton rows

There are no skeleton-row placeholders in the current implementation. Until
results arrive the area is empty. The provider chips (above) are the
only "in flight" cue.

### 9.3 Cancel mid-stream

While a search is in flight, the Run button is replaced by a red **Cancel**
button. Clicking it unsubscribes the client from the GraphQL subscription
and the UI returns to its idle state with whatever provider chips had
already arrived left in place. The server-side stream may have already
written a log row by the time the client cancels — check the per-scope
`Search Execution Logs` panel to see what was recorded.

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
# Required args: agentId, messages (a JSON-stringified array), sessionId.
mutation {
  RunAIAgent(
    agentId: "..."
    messages: "[{\"role\":\"user\",\"content\":\"Find me agents\"}]"
    sessionId: "demo-session-1"
  ) {
    Success ErrorMessage
  }
}
```

The full mutation signature has additional optional args (`data`,
`payload`, `templateData`, `lastRunId`, etc.) — see
`packages/MJServer/src/resolvers/RunAIAgentResolver.ts` for the exact
definition.

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
