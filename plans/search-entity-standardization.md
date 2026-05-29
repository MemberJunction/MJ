# Search Entity Standardization Plan

**Status:** Draft
**Author:** Amith Nagarajan (with Claude)
**Base PR:** #2709 (`entity-search-via-entitydoc-plan`) — adds `Provider.SearchEntity` / `SearchEntities`, `SimpleVectorServiceProvider`, weighted RRF, `Search Entity` action, `ScheduledJob.RunImmediatelyIfNeverRun`, and the `Vectorize Entity` action's `EntityDocumentType=Search` mode.
**Goal:** Retire the three bespoke "find similar by description" code paths (in-memory AIEngine vector services, persistent column-stored vectors, ad-hoc backfill scripts) in favor of one uniform pattern: Search-typed EntityDocument + `Provider.SearchEntity` + the daily `Entity Vector Sync - Daily` scheduled job.

---

## Why this plan

PR #2709 introduces a uniform server- and client-side API for ranked, permission-filtered hybrid (lexical + semantic) search inside a single entity:

```typescript
md.SearchEntity({
  entityName: 'MJ: Actions',
  searchText: 'send a slack message',
  options: { topK: 10, mode: 'hybrid' }
});
```

Internally it:
1. Resolves the active Search-type `EntityDocument` for the entity.
2. Runs a lexical pass (RunView + `LIKE` with wildcard escaping) over string-typed `IncludeInUserSearchAPI`/`IsNameField` fields.
3. Runs a semantic pass — embed query with the EntityDocument's configured model, query `SimpleVectorServiceProvider` (which rehydrates the vector pool from `MJ: Entity Record Documents.VectorJSON`).
4. Blends with weighted RRF.
5. Permission-filters via a constrained RunView.
6. Returns `EntitySearchResult[]` with per-component scores.

Today, **three parallel implementations** of "find similar by description" exist for specific entities, each with different storage, refresh, and ranking semantics. They predate the unified pattern. Consolidating them onto the new pattern eliminates duplicate code, brings consistent ranking quality (RRF blend, lexical safety net), and gives every entity the same scheduled-sync lifecycle.

---

## Current bespoke patterns to retire

### Pattern A — In-memory AIEngine vector services (ephemeral)

Loaded into AIEngine's process memory at config time, rebuilt on refresh. **No persistence**; every MJAPI restart re-embeds.

| Service | File | Backs |
|---|---|---|
| `AgentEmbeddingService` | `packages/AI/Engine/src/services/AgentEmbeddingService.ts` | "Find Best Agent" action |
| `ActionEmbeddingService` | `packages/AI/Engine/src/services/ActionEmbeddingService.ts` | "Find Best Action" / "Find Candidate Actions" actions |

Storage: AIEngine's in-memory `SimpleVectorService`. Generated at startup via `GenerateAgentEmbeddings()` / `GenerateActionEmbeddings()` — re-embeds **every Agent / every Action** on every config load. With hundreds of agents/actions this is real startup cost.

### Pattern B — Persistent column-stored vectors (custom backfill)

Vectors written directly to a column on the entity table; cached in memory at startup.

| Entity | Column(s) | Server-side helper | Backed by |
|---|---|---|---|
| **MJ: Queries** | `EmbeddingVector` (string-serialized array), `EmbeddingModelID` | `QueryEngineServer.FindSimilarQueries()` | "Search Query Catalog" action; `scripts/backfill-query-embeddings.ts` |
| **MJ: AI Prompts** | `ExampleInputVector`, `NoteVector` (per-row JSON) | Inline cosine search in agent context-injection paths | Agent runtime note retrieval |
| **MJ: AI Memory Tags** | `EmbeddingVector` | Inline cosine search | Agent memory recall |

Storage: schema-attached embedding columns. Refresh: per-record on save (via custom server-side entity logic) or via backfill script.

### Pattern C — Existing Search-type EntityDocument (canonical, but only one entity)

| Entity | EntityDocument | Status |
|---|---|---|
| **MJ: Entities** | `MJ Entities Search` (seeded in PR #2709) | ✅ Working — vectorized by the daily job, queried by `Provider.SearchEntity` |

Pattern C is the target state.

---

## Migration tiers

Each tier groups entities by **likely migration risk** (existing behavior we must preserve) and **value** (frequency of agent / human lookup).

### Tier 1 — Ship in this plan's PR (Pattern A → C)

Highest agent-ergonomics value, lowest migration risk (these are pure ephemeral in-memory services with no schema/UX impact):

| Entity | Replaces | Notes |
|---|---|---|
| **MJ: Actions** | `ActionEmbeddingService`, "Find Best Action", "Find Candidate Actions" | Highest call volume from agents. Template embeds `Name` + `Description` + `Type`. Hundreds of rows. |
| **MJ: AI Agents** | `AgentEmbeddingService`, "Find Best Agent" | Sub-agent discovery. Template embeds `Name` + `Description` + `Type.Description`. Tens to hundreds. |
| **MJ: AI Prompts** | (no existing service — new capability) | Prompt re-use. Template embeds `Name` + `Description` + `TemplateText` (truncated). Already has `MJEntityDocumentEntityExtended.TemplateText` virtual prop from PR #2709. |
| **MJ: Queries** | `QueryEngineServer.FindSimilarQueries`, "Search Query Catalog" action, `backfill-query-embeddings.ts` script | Template embeds `Name` + `UserQuestion` + `Description`. Same composite text as today's backfill script. |

**Out of scope for Tier 1:** Pattern B's column-stored vectors on AI Prompts (`ExampleInputVector`, `NoteVector`) and AI Memory Tags (`EmbeddingVector`). Those serve a **per-record, per-call** retrieval pattern (agent context injection at run time), not the bulk-search pattern `SearchEntity` is designed for. Different problem; keep Pattern B for now. See [Out of scope](#out-of-scope-deferred).

### Tier 2 — Follow-up PR (broader UX value)

| Entity | Why |
|---|---|
| **MJ: Templates** | Reusable prompt/template discovery. `TemplateText` virtual already exists (PR #2709 added the same for `EntityDocument`; extending to other consumers is trivial). |
| **MJ: Components** | Discover interactive components and reports. Rich `Specification` text; bounded by org. |
| **MJ: Dashboards** | "Show me a dashboard about X". Tens to hundreds per org. |
| **MJ: User Views** | Re-discover saved searches. |

### Tier 3 — Opt-in only (don't seed by default)

Customer enables per their policy.

| Entity | Why opt-in |
|---|---|
| **MJ: Users** | PII concerns. Some orgs want, some don't. |
| **MJ: Roles**, **MJ: Applications** | Bounded but RBAC-sensitive. |
| **MJ: Reports** | Volume varies widely per org. |

### Out of scope (deferred)

- **AI Prompts.ExampleInputVector / NoteVector** and **AI Memory Tags.EmbeddingVector** (Pattern B's per-record vectors). Their access pattern — "given this single inbound message, find the top-k notes/examples relevant to *it*, embedded inline" — is per-call vector search against a parent-scoped subset, not bulk search across the entity. `SearchEntity` is the wrong tool. A future plan may unify these onto a "VectorJSON-on-the-parent-row + per-EntityDocument SVS index" pattern, but they should NOT be lumped into this consolidation.
- **High-volume transactional entities** (audit logs, telemetry events, run history). SVS is the wrong substrate for millions of rows.
- **`SearchEngine.Search`** (the cross-source unified search). That's a higher-level orchestrator that *uses* `SearchEntity` for single-entity hops. It stays.

---

## Implementation steps

### Phase 0 — Land PR #2709 first

This plan depends on:
- `Provider.SearchEntity` API
- `SimpleVectorServiceProvider` driver
- "Vectorize Entity" action with `EntityDocumentType` param
- "Entity Vector Sync - Daily" scheduled job
- `MJEntityDocumentEntityExtended.TemplateText` virtual

All from PR #2709. **Block this plan's PR until #2709 merges.**

### Phase 1 — Seed Tier 1 Search EntityDocuments

For each of Actions / AI Agents / AI Prompts / Queries:

1. Add a Search-type EntityDocument metadata file under `metadata/entity-documents/` with:
   - `EntityID: @lookup:MJ: Entities.Name=<entity>`
   - `TypeID: @lookup:MJ: Entity Document Types.Name=Search`
   - `VectorDatabaseID: @lookup:MJ: Vector Databases.Name=Simple Vector Service Provider`
   - `VectorIndexID: @lookup:MJ: Vector Indexes.Name=Default - SVS + gte-small (Local)`
   - `AIModelID: @lookup:MJ: AI Models.Name=gte-small (Local)`
   - `Status: Active`
   - `TemplateText: @file:templates/<entity-slug>-search.njk`
2. Author each `.njk` template to render the composite embedding text. For Queries, the template must match the current `backfill-query-embeddings.ts` composite (`Name | UserQuestion | Description`) so re-embedded vectors stay comparable to today's.
3. The existing daily sync job already fans out across all active Search-type EntityDocuments via `EntityVectorSyncer.GetActiveEntityDocuments(entityNames, 'Search')` — no scheduler changes needed.

### Phase 2 — Retire bespoke Pattern A services + actions

Order matters: ship the new Search EntityDocuments + run the sync to populate ERDs **before** deleting the old code paths.

For each retiring action, two options:

**Option A — Hard retire** (simpler; one-step migration):
- Delete the bespoke action class file.
- Delete the action metadata row (or mark `Status='Disabled'` for grace period).
- Document in changelog that agents calling the old action should switch to `Search Entity` with the relevant `EntityName`.

**Option B — Wrap-and-deprecate** (safer; allows ramp):
- Rewrite the bespoke action class as a thin wrapper that calls `params.Provider.SearchEntity({entityName: 'MJ: Actions', ...})`, preserving the old input/output param names.
- Mark `Description` field with "**Deprecated**: use Search Entity directly."
- Schedule removal in a later release.

Recommend **Option B for "Find Best Action" and "Find Best Agent"** (high agent-call volume — give consumers a release to migrate); **Option A for `backfill-query-embeddings.ts`** (script, no consumers).

Specifically:

| File / artifact | Action |
|---|---|
| `packages/Actions/CoreActions/src/custom/ai/find-best-agent.action.ts` | Rewrite to wrap `Provider.SearchEntity({entityName: 'MJ: AI Agents', ...})`. Preserve `SearchText` input + ranked output shape. |
| `packages/Actions/CoreActions/src/custom/ai/find-best-action.action.ts` | Rewrite to wrap `Provider.SearchEntity({entityName: 'MJ: Actions', ...})`. |
| `packages/Actions/CoreActions/src/custom/ai/find-candidate-actions.action.ts` | Same wrap-and-deprecate (or merge into Find Best Action — both currently reference the same driver class name, which is a separate bug to address). |
| `packages/Actions/CoreActions/src/custom/data/search-query-catalog.action.ts` | Rewrite to wrap `Provider.SearchEntity({entityName: 'Queries', ...})`. |
| `packages/AI/Engine/src/services/AgentEmbeddingService.ts` | Delete after wrap-actions migrate. Remove all AIEngine usages. |
| `packages/AI/Engine/src/services/ActionEmbeddingService.ts` | Same. |
| `AIEngine.GenerateAgentEmbeddings`, `AIEngine.GenerateActionEmbeddings` | Delete. Remove call sites from `AIEngine.Config()`. |
| `AIEngine.FindSimilarAgents`, `AIEngine.FindSimilarActions` | Delete or thin-wrap to `Provider.SearchEntity` for any remaining server-side callers. |
| `scripts/backfill-query-embeddings.ts` | Delete — the daily sync writes ERDs with VectorJSON for Queries automatically once the Search EntityDocument is seeded. |
| `Query.EmbeddingVector`, `Query.EmbeddingModelID` columns | **Drop in a separate follow-up migration** (not this PR). They're currently load-bearing for `QueryEngineServer.FindSimilarQueries` until that's removed. Step-down sequence: (1) ship this plan; (2) confirm `Provider.SearchEntity({entityName: 'Queries'})` matches today's quality; (3) remove `FindSimilarQueries`; (4) migration to drop the columns. |
| `QueryEngineServer.FindSimilarQueries` | Delete in the same step as the column drop. |

### Phase 3 — Backfill expectations on a fresh deploy

PR #2709 already ships the seeded `Entity Vector Sync - Daily` job with `RunImmediatelyIfNeverRun=1`. After this plan's PR:

- On first MJAPI startup post-deploy, the daily job runs once and embeds every active Search-type EntityDocument's records (now 5: MJ: Entities + Tier 1's 4).
- Subsequent startups: no-op until next 4 AM UTC.

Sync cost estimate (rough): per entity ≈ (rowCount × tokenizer + embedding time per record). With `gte-small (Local)` + batches of 50, a 500-row entity vectorizes in seconds; this is a one-time cost.

### Phase 4 — Tier 2 (follow-up PR)

Repeat Phase 1 for Templates, Components, Dashboards, User Views. No code retirement — these are net-new capabilities, not consolidations.

---

## Quality validation

For each Tier 1 entity, compare result quality vs. the existing bespoke search **before** retiring it:

```bash
# Reuse the smoke-test script (added in PR #2709)
npx tsx scripts/test-search-entity.ts --entity "MJ: Actions"   "send slack message" 10
npx tsx scripts/test-search-entity.ts --entity "MJ: AI Agents" "summarize documents"  10
npx tsx scripts/test-search-entity.ts --entity "MJ: AI Prompts" "extract entities"    10
npx tsx scripts/test-search-entity.ts --entity "Queries"        "active members"      10
```

Acceptance criteria per entity:
- Top-5 hybrid results include all top-5 from the bespoke service (recall parity).
- No false high-rankers from raw LIKE (the wildcard-escape fix in PR #2709 already prevents the `50%` style false matches).
- Embed time per record < 100ms with gte-small (it is — PR #2709's first run measured 4.3s wall time for 324 records).

If parity fails for a specific entity, the fallback is to tune the template (add more fields to the embed text) — **not** to keep the bespoke code path.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Existing agents calling "Find Best Action" hard-code the old result shape. | Wrap-and-deprecate (Option B above) preserves input/output param names. |
| Query embeddings re-generated with a different composite text → cache miss on first run for every consumer. | Author the Queries `.njk` template to match `backfill-query-embeddings.ts`'s `Name \| UserQuestion \| Description` composite exactly. |
| Customers running old MJAPI restart and lose AIEngine's in-memory agent/action vector pool before the daily sync runs. | The seeded Tier 1 EntityDocuments have `RunImmediatelyIfNeverRun=1`-style intent inherited from the existing daily job. On first startup post-deploy, the sync runs immediately and ERDs are populated within seconds. Wrap-actions return empty results during that <1-minute window — acceptable. |
| Removing `Query.EmbeddingVector` column is a published-schema break. | Per `packages/OpenApp/PUBLISH_NO_BREAK_POLICY.md`, this must wait for a major version bump and goes into a separate migration. Phase 2 leaves the columns in place; Phase 3 follow-up retires them once `FindSimilarQueries` consumers are gone. |
| Increased SQL Server memory for in-process `SimpleVectorIndexCache` (one Map per EntityDocument). | PR #2709's `SimpleVectorIndexCache` (BaseSingleton) shares one cache across all SVS instances per process; for the 5 EntityDocuments envisioned post-Tier 1, total in-memory footprint is `Σ(rows × 384 × 4 bytes)` per cached entity. For ~5000 total embeddable rows across all 5 docs, that's ~7.5 MB. Negligible. |

---

## Open questions

1. **Should Tier 1 ship with a richer template than "Name + Description"?** For Actions, including the `UserPrompt` (when present) would significantly improve recall for agent-driven discovery. Trade-off: longer embed texts → slower sync. Recommendation: ship the lean template first, iterate based on measured recall.
2. **Should we add a manual "force-sync" admin action** so customers don't have to wait 24h after enabling a new Search EntityDocument? PR #2709's `RunImmediatelyIfNeverRun` covers the seeded case, but enabling a new doc post-install needs operator action today (either wait for the cron tick or manually update `NextRunAt`).
3. **Wrap-action result shape** — should the deprecated "Find Best Action" return the new `EntitySearchResult[]` shape or stay bug-for-bug compatible with the old shape? Recommend new shape with a one-version deprecation note; old shape was undocumented.

---

## Acceptance criteria for THIS plan's PR

1. ✅ Four new Search EntityDocument metadata files seeded (Actions, AI Agents, AI Prompts, Queries) with templates.
2. ✅ On a clean MJAPI startup, all four entities vectorize successfully via the existing daily job.
3. ✅ `npx tsx scripts/test-search-entity.ts --entity "MJ: Actions" "<text>"` returns sensible hybrid results.
4. ✅ Bespoke "Find Best Action" / "Find Best Agent" / "Search Query Catalog" actions still exist but are thin wrappers around `Provider.SearchEntity`. Their unit tests pass with updated mocks.
5. ✅ `AgentEmbeddingService`, `ActionEmbeddingService`, `AIEngine.GenerateAgentEmbeddings`, `AIEngine.GenerateActionEmbeddings` deleted; AIEngine.Config no longer takes the embedding-generation startup cost.
6. ✅ `scripts/backfill-query-embeddings.ts` deleted.
7. ❌ `Query.EmbeddingVector` column, `QueryEngineServer.FindSimilarQueries` — **explicitly NOT in scope** (separate follow-up migration per Risks table).
8. ✅ AIEngine startup time visibly drops (no more per-record embed loop for agents/actions).
9. ✅ All affected packages' unit tests pass.
10. ✅ `SEARCH_OVERVIEW_GUIDE.md` updated to point at the four new entities as canonical examples.

---

## Out-of-PR follow-ups (separate plans)

- **Per-record vector retrieval** (PromptExampleInput / Note / Memory Tag) — a separate "per-row VectorJSON + parent-scoped SVS index" pattern. Different access shape; deserves its own plan.
- **`Query.EmbeddingVector` column drop** — migration after `FindSimilarQueries` consumers retire.
- **Tier 2 entities** — Templates, Components, Dashboards, User Views (this plan's Phase 4).
- **Tier 3 entities** — opt-in scripts/docs for customer self-enable.
- **Force-sync admin action** — operator UX for enabling new Search EntityDocuments post-install.
