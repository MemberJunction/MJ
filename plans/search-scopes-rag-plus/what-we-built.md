# Search Scopes & RAG+ — What We Built and What You Can Do With It

## The 30-second pitch

We've built a system that lets administrators carve up the entire MJ data surface into named **Search Scopes** — bundles of searchable content with their own permissions, ranking rules, and AI-friendly metadata. Once defined, a scope can be queried by a person, an AI agent, an action, or any GraphQL client. Results stream back live, get reranked by a pluggable AI reranker, and every invocation is logged for analytics, cost tracking, and tuning.

---

## The four layers

### 1. The Search Scope itself
A Search Scope is a named slice of your knowledge base. It contains:
- **Entities** — which database tables (e.g., MJ Actions, AI Agent Notes, Conversation Artifacts) are in scope
- **Storage accounts** — which file-storage providers (S3, Azure Blob, etc.) and folder paths to search
- **External indexes** — optional handles to Elasticsearch / Typesense / Azure AI Search / OpenSearch clusters
- **Providers** — which of vector / full-text / entity / storage providers participate, with per-provider query transforms and max-results overrides
- **Fusion weights** — how to blend signals across providers (vector heavier, full-text lighter, etc.)
- **Reranker config** — which reranker class runs after fusion, plus a budget cap in cents
- **Permissions** — per-user and per-role grants at None / Read / Search / Manage levels
- **Test queries** — saved smoke tests for tuning sessions

### 2. The permission gate
Every search invocation passes through a 6-step resolver with three rings of defense:
- **Direct grants** — an explicit User-on-Scope or Role-on-Scope row
- **Agent SearchScopeAccess** — agents can be configured as `All` (see everything), `None` (no search), or `Assigned` (only the listed scopes)
- **Entity row-level security** — the existing MJ permission system layers on top, so even a permitted scope can't return rows the user can't see at the entity layer

The verdict carries a `Source` field (which rule fired) so you can audit "why was this denied?" at a glance.

### 3. The search engine
- **`SearchEngine.Search()`** — synchronous, returns the full ranked list
- **`SearchEngine.streamSearch()`** — emits `provider` events as each provider settles (true concurrent emission, in resolution order, not batched-after-the-fact), then `fused`, then `final`
- **Three orchestrated paths flow through both:**
  - GraphQL `SearchKnowledge` mutation + `StreamScopedSearch` subscription
  - `Scoped Search` action (agent-callable, with a `streamingMode` parameter)
  - `AgentPreExecutionRAG` (auto-runs before every agent invocation, streams hits into the prompt)

### 4. Observability
Every invocation writes one row to `MJSearchExecutionLog`:
- **Outcome**: `Success` / `Failure` / `Forbidden`
- Reason on failure or denial
- Calling user, calling agent, scope, query text
- Per-provider durations and counts
- Reranker name and cost (cents)
- Total elapsed time and result count

This drives the analytics dashboard, the per-scope volume / hit rate / p95 latency rollups, and the CSV export for offline tuning.

---

## What you can do with it

### As a data steward / admin
- Define a new Search Scope from the Search Scopes form. Pick entities, fusion weights, reranker, budget. Save.
- Grant permissions through the SearchScope's Permissions panel — mix users and roles freely.
- Open **Knowledge Hub → Configuration → Permissions** to see every grant across every scope, filterable by scope name, principal, or level.
- Open **Configuration → Search Analytics** to see volume, hit rate, p95 latency, and top failure reasons per scope.

### As a search engineer / tuner
- Drag the **fusion weight sliders** (vector / full-text / entity / storage) on a SearchScope form. Save and re-run a test query to see the new ranking.
- Run an **A/B reranker comparison** — pick scope, pick query, swap the reranker class, get back a Kendall-tau similarity score and side-by-side rankings.
- Use the **Live Preview** panel on the SearchScope form to test queries against the engine without going through any client app.
- Save **Test Queries** on a scope so you can re-run smoke tests after tuning changes.
- Export the last 500 invocations as CSV from the SearchScope form's "Export tuning data" button.

### As an AI agent builder
- Set the agent's `SearchScopeAccess` to `All`, `None`, or `Assigned` (with a child grid of specific scopes).
- Use the **Scoped Search** action as an agent tool. Pass `streamingMode: 'partials'` to get progress events the agent can react to.
- Wire **AgentPreExecutionRAG** so relevant search results land in the prompt automatically before each turn.
- The agent gets the **SearchResultSetToolLibrary** — five tools (`filterByScore`, `groupBySourceProvider`, `getMatchingChunks`, `followSourceLink`, `rerankInline`) for manipulating result sets as artifacts.

### As an end user (Knowledge Hub search)
- Type a query. Get reranked, scoped, permission-aware results across vectors, full-text, entities, and files in one unified ranked list.
- Watch results stream in live — no spinner-then-dump. Faster providers' hits appear first.

### As an auditor / security reviewer
- Every Forbidden invocation is logged with the reason and the calling identity.
- The Permissions audit dashboard answers "who has access to what" in one read-only view.
- Row-level security on the underlying entities layers on top — a scope cannot reveal rows the user couldn't see anyway.

### As a developer extending the system
- **New search provider**: extend `BaseSearchProvider`, add `@RegisterClass`. It appears in the SearchProvider dropdown automatically.
- **New reranker**: extend `BaseReRanker`. It appears in the SearchScope form's Reranker dropdown.
- **External providers shipping today**: Elasticsearch, Typesense, Azure AI Search, OpenSearch. Each has its own peer-dep package; install only the ones you use.

---

## What's intentionally not done (yet)

- **Mid-pipeline AbortSignal cancellation** — if a streaming consumer aborts, the underlying search keeps running in the background. Future work, not a defect.
- **Live external-cluster integration tests** — verified structurally and via mocked vitest specs, but not driven against real Elasticsearch / Typesense / Azure / OpenSearch clusters in this workbench.
- **DriverClass dropdown on the SearchProvider form** — runtime discovery works through ClassFactory + DB rows; the generated form just renders DriverClass as a textbox. A UX-level dropdown override would be a small follow-up.

---

## How we know it works

- **129 audit cells across all 8 phases**: 113 PASS / 0 FAIL / 16 SKIPPED. Every SKIPPED is environmental (no API keys for paid rerankers, no peer-dep clusters, no isolated GraphQL surface for the AgentPreExecutionRAG path) — none represent code defects.
- **678 unit tests pass** across the five packages we touched.
- **Phase 2A's 19-cell permission matrix** passes deterministically end-to-end against the live MJAPI on the workbench DB.
- **Chrome verification** for both the Permissions audit subtab and the + New tab-bar fix.

---

## Where the audit lives

- Per-phase test scripts: `/tmp/rag-audit/phase-{2a,2b,2c,2d,3,4,5,6}.sh` (workbench-only, not committed)
- Per-phase results: `/tmp/rag-audit/results-{2a,2b,2c,2d,3,4,5,6}.json`
- Original audit report (pre-fix-commits): `plans/search-scopes-rag-plus/audit-report-2026-04-29.md`
- Streaming-mechanism decision (incl. v2 concurrent emission): `plans/search-scopes-rag-plus/streaming-mechanism-decision.md`
- The plan we audited against: `RAG_plan.md`
