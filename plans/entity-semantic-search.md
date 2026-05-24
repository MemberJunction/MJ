# Entity Semantic Search on IMetadataProvider

## Overview

MemberJunction has no generic semantic search over entities. Any caller that needs to find the right entity for a user request — agent loops, Query Builder, Database Research Agent — is forced to either dump the full entity catalog into a prompt or guess by name. At small entity counts this is wasteful; at thousands of entities it chokes agents and bloats round-trip cost on heavy system prompts.

This plan adds a single method to `IMetadataProvider` / `ProviderBase` that returns the top-N entities most relevant to a free-text query, backed by precomputed embeddings stored on the `Entity` row, blended with cheap lexical matching, and filtered by permissions. The infrastructure is metadata-layer concern — not agent-specific — so any consumer (Action wrapper, agent prompt builder, custom server-side code) can call it through the same async API.

The goal is to let agent system-prompt builders swap a 1500-entity dump for "here are 10 likely candidates + search tools to find more" without inventing per-agent semantic infrastructure.

## Current State

### What Exists

1. **`EmbedTextLocal`** — MJ already has a local embedding capability used by server-side entity subclasses (e.g., `MJAIAgentNoteEntityServer`). This is the embedding primitive we will reuse; no new model integration work.

2. **Entity metadata in RAM** — `ProviderBase` already maintains `_entityMapByName` for O(1) `EntityByName` lookup. Every `IMetadataProvider` instance has the full `EntityInfo[]` array, including `Name`, `Description`, `SchemaName`, and permission flags.

3. **`BaseSingleton<T>`** — Standard pattern for cross-bundle-safe singletons via the Global Object Store. New engines must extend this (CLAUDE.md rule #7).

4. **`BaseEngine` pattern** — Existing engines (e.g., `AIEngine`) follow a `Config()` / `Load()` lifecycle with promise memoization so concurrent callers await the same load.

5. **Permission infrastructure** — `EntityInfo` carries per-role permission metadata already evaluated against the current user.

### What's Missing

- No way to retrieve entities ranked by relevance to free text.
- No storage column on `Entity` for embeddings or embedding provenance.
- No engine that warms entity embeddings at server boot.
- No `Action` exposing semantic entity search to agents.

## Proposed API

### Provider Method

Added to `IMetadataProvider` and implemented in `ProviderBase`:

```typescript
/**
 * Returns entities ranked by relevance to the given search text, using a
 * hybrid of lexical name matching and precomputed semantic embeddings.
 *
 * Results are filtered by the contextUser's read permissions before return.
 * If the embedding engine has not yet finished its initial warmup, this call
 * awaits readiness — typically a no-op once the server has been up briefly.
 *
 * @param searchText  Free-text query (typically the user's request or a derived task description)
 * @param options     Ranking and filtering options (see EntitiesByRelevanceOptions)
 */
EntitiesByRelevance(
    searchText: string,
    options?: EntitiesByRelevanceOptions
): Promise<EntityRelevanceResult[]>;
```

### Types

```typescript
export type EntitiesByRelevanceOptions = {
    /** Maximum number of results to return. Default: 10. */
    topK?: number;

    /** Drop results with a blended score below this threshold. Default: 0.5. */
    minScore?: number;

    /** Context user for permission filtering. Required on server, optional on client. */
    contextUser?: UserInfo;

    /** Optional schema name filter (e.g., only return entities in '__mj' or a specific app schema). */
    schemaName?: string;

    /** If true, returns entities even if their embedding is stale or missing (falls back to lexical-only). Default: false. */
    allowLexicalOnly?: boolean;
};

export type EntityRelevanceResult = {
    /** Pointer back into the existing in-memory metadata — callers do not need a second lookup. */
    entity: EntityInfo;

    /** Blended score in [0, 1] after hybrid ranking. */
    score: number;

    /** Which signal dominated the match. Useful for debugging and for callers that want to filter by match type. */
    matchType: 'exact' | 'prefix' | 'substring' | 'semantic' | 'hybrid';

    /** Raw component scores, exposed for callers that want to re-rank or audit. */
    components: {
        lexical: number;   // 0-1
        semantic: number;  // 0-1 (0 if no embedding available)
    };
};
```

### Naming Rationale

- **`EntitiesByRelevance`** mirrors the existing `EntityByName` convention (`<EntityNoun>By<Criterion>`). Plural because the method is inherently ranked/multi-result.
- `Relevance` reads more honestly than `Search` (the operation is a ranked lookup, not a text search), and avoids overloading "search" with the unrelated `SearchEntities` Action wrapper.
- Single method — no `Entity*SemanticSearch*` variants. Callers take `[0]` for best match or `slice(0, N)` for prompt seeding.

## What We Embed (The Template)

The embedding template — applied to every entity at warmup time — is intentionally minimal in v1:

```
Entity: {SchemaName}.{Name}
{Description}
```

### Why So Minimal

- Descriptions in MJ are generally well-written and business-oriented, which aligns naturally with how users phrase requests ("I need to see overdue invoices for active customers"). Name + description hits the high-value signal without dilution.
- **Field-level content is excluded in v1.** User business-language queries rarely reference field names directly, and stuffing 20+ field labels into the embedded text pulls the centroid toward technical terminology, hurting cosine similarity with natural-language queries. Empirically worth measuring before adding.
- Schema name disambiguates same-named entities across schemas (e.g., `crm.Account` vs `billing.Account`) and gives a small organizational signal without bloating the vector.

### Future Enrichment (Out of v1)

When we have measurement data, candidates for a v2 enrichment template:
- A curated subset of "key" field names (PK display field, name field, status fields).
- Value-list labels for enum fields (these are often user-language).
- A separate lightweight name-only embedding for fast first-pass ranking.

These are explicit Phase 4+ work, not v1.

## Persistence

Three new columns on the `Entity` table:

| Column | Type | Purpose |
|---|---|---|
| `EmbeddingJSON` | `NVARCHAR(MAX) NULL` | Serialized vector (JSON array of floats). |
| `EmbeddingModelID` | `UNIQUEIDENTIFIER NULL FK → MJ: AI Models(ID)` | Which model produced this embedding. |
| `EmbeddingContentHash` | `NVARCHAR(64) NULL` | SHA-256 of the rendered template text used to produce the embedding. |

### Migration

Single `ALTER TABLE` adding all three columns, with `sp_addextendedproperty` for each (per CLAUDE.md migration rules). Foreign key constraint on `EmbeddingModelID`. CodeGen handles `__mj_*` timestamp updates and FK indexes.

```sql
ALTER TABLE ${flyway:defaultSchema}.Entity ADD
    EmbeddingJSON NVARCHAR(MAX) NULL,
    EmbeddingModelID UNIQUEIDENTIFIER NULL,
    EmbeddingContentHash NVARCHAR(64) NULL,
    CONSTRAINT FK_Entity_EmbeddingModel
        FOREIGN KEY (EmbeddingModelID)
        REFERENCES ${flyway:defaultSchema}.AIModel(ID);
```

### Self-Healing Invalidation

The content hash is the invalidation key. On every engine load:

```
for each entity:
    expected_hash = sha256(render_template(entity))
    if entity.EmbeddingContentHash != expected_hash
       or entity.EmbeddingModelID != current_configured_model
       or entity.EmbeddingJSON is null:
            recompute_and_save(entity)
```

This means description edits via CodeGen, model swaps, or template tweaks all self-heal on next server start — no manual "regenerate embeddings" command needed. Only stale rows are recomputed; clean rows load straight from disk.

## When and Where Embeddings Are Computed

This is worth being explicit about because it's the question "what triggers a recompute" maps to in practice.

### Single Computation Path: Engine Warmup

**All embedding computation happens inside `EntityEmbeddingEngine.AdditionalLoading()` at server boot.** Nothing else writes to `EmbeddingJSON` / `EmbeddingModelID` / `EmbeddingContentHash` — not CodeGen, not migrations, not BaseEntity hooks.

### Why Not CodeGen

CodeGen runs at build/dev time as a Node script that emits SQL migrations. We could in principle have it call `EmbedTextLocal` and emit `UPDATE Entity SET EmbeddingJSON = '...'` statements. We're choosing not to:

- CodeGen would need an embedding model configured in the build environment. Many dev/CI environments don't have AI credentials wired up for build steps.
- Embeddings would land in committed migration SQL — large, opaque blobs that bloat diffs and would change every time the embedding model swapped.
- Two writers means coordination — and CodeGen has no good way to know which entities are stale; it'd have to recompute everything or duplicate the hash logic.

### Why Not a BaseEntity Save Hook

We considered putting `EmbedTextLocal` inside `EntityEntityServer.Save()` so any runtime Name/Description change recomputes immediately (mirrors how `MJAIAgentNoteEntityServer` embeds notes on save). We're choosing not to in v1:

- The `Entity` table is updated via CodeGen-generated SQL `INSERT`/`UPDATE` statements in migrations, **not** through `EntityEntity.Save()`. So the hook would almost never fire for the real-world path.
- Runtime edits to entity metadata are rare and don't need millisecond freshness — next server restart is fine.
- Adding the hook later is non-breaking if we find a need.

### How Self-Healing Works in Practice

1. CodeGen updates an entity's `Description` via migration SQL. `EmbeddingContentHash` is unchanged in the DB (or, if we want belt-and-suspenders, CodeGen could nullify it — see below).
2. Server restarts (or pulls fresh metadata).
3. `EntityEmbeddingEngine.AdditionalLoading()` runs. For each entity:
   - Render the template from current Name + Description + SchemaName.
   - Compute `sha256(template)`.
   - Compare against stored `EmbeddingContentHash` and check `EmbeddingModelID == currentConfiguredModel`.
   - If mismatch (or `EmbeddingJSON` is null), recompute via `EmbedTextLocal`, save back to the row.
4. Build the in-memory vector pool.

The only thing CodeGen could optionally do is set `EmbeddingContentHash = NULL` when it modifies a row's Name or Description — purely a perf optimization so the engine doesn't have to render-and-hash every row to find the stale ones. **Not required for correctness** and not in v1; the engine will detect drift regardless. We can add this later if warmup time on large catalogs becomes a concern.

### What This Means Operationally

- A fresh deployment after a description-heavy migration: first server start does N embedding calls (N = number of changed entities). Subsequent restarts: pure load-from-DB.
- An MJ upgrade that adds new entities: first start embeds the new ones only.
- A model swap (changing the configured embedding model): first start re-embeds everything. Rare event.
- Steady state: zero embedding calls at boot, just deserialize from `EmbeddingJSON`.

## Engine Lifecycle

### New Engine: `EntityEmbeddingEngine`

Lives in **`@memberjunction/core-entities-server`** (`MJCoreEntitiesServer`). Rationale:

- This is server-only — `EmbedTextLocal` requires `AIEngine` which is a server concern.
- Every MJ server process (MJAPI and any other host) already pulls in `MJCoreEntitiesServer`, so co-locating here means zero wiring at the host layer.
- Sits alongside `QueryEngineServer` and `ComponentMetadataEngineServer`, which follow the same `extends BaseEngine + @RegisterForStartup` pattern.

Extends `BaseEngine<EntityEmbeddingEngine>` (which extends `BaseSingleton<T>` under the hood — satisfies CLAUDE.md rule #7). Decorated with `@RegisterForStartup({ deferred: true, ... })` so it warms up at server boot **without** blocking the boot sequence — no need to add bespoke startup code in `MJServer`/`MJAPI`.

```typescript
import { BaseEngine, RegisterForStartup, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { AIEngine } from '@memberjunction/ai-engine';

@RegisterForStartup({
    deferred: true,
    priority: 200,
    severity: 'warn',
    description: 'EntityEmbeddingEngine — precomputed embeddings for EntitiesByRelevance()'
})
export class EntityEmbeddingEngine extends BaseEngine<EntityEmbeddingEngine> {
    public static get Instance(): EntityEmbeddingEngine {
        return EntityEmbeddingEngine.getInstance<EntityEmbeddingEngine>();
    }

    private _vectors: Float32Array[] = [];          // Index-aligned with _entityIds
    private _entityIds: string[] = [];
    private _vectorDim: number = 0;
    private _requestEmbeddingCache = new Map<string, Float32Array>();

    /**
     * Called by the @RegisterForStartup orchestrator during server boot.
     * Because `deferred: true`, this is invoked but NOT awaited at boot —
     * concurrent callers go through EnsureLoaded().
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        return super.Config(forceRefresh, contextUser, provider);
    }

    protected async AdditionalLoading(contextUser?: UserInfo): Promise<void> {
        // 1. Pull all Entity rows with embedding columns
        // 2. For each entity, render template, compute expected SHA-256
        // 3. Identify stale/missing rows (hash mismatch OR EmbeddingModelID changed OR EmbeddingJSON null)
        // 4. Batch-embed stale rows via AIEngine.Instance.EmbedTextLocal()
        // 5. Persist embeddings back via EntityEntity.Save() (one row per stale entity)
        // 6. Build in-memory vector pool + id map (Float32Array per entity)
    }

    /** Convenience wrapper — callers do not need to remember to pass forceRefresh=false. */
    public async EnsureLoaded(contextUser?: UserInfo): Promise<void> {
        await this.Config(false, contextUser);
    }

    /** Compute cosine ranking over the in-memory vector pool. */
    public async RankByText(
        searchText: string,
        topK: number
    ): Promise<{ entityId: string; score: number }[]> { /* ... */ }
}
```

### How the Decorator Handles Warmup

We use the **existing** `deferred: true` option on `RegisterForStartup` (defined in `packages/MJCore/src/generic/RegisterForStartup.ts`). It already does exactly what we want:

> *"When true, the engine's HandleStartup() is fired during startup but NOT awaited. Consumer contract: code that reads engine state MUST call `await Engine.Instance.EnsureLoaded()` first. BaseEngine load is idempotent — a concurrent caller waits for the in-flight load promise rather than re-loading."*

This is the canonical pre-warm pattern in MJ — no new decorator flag needed. `AIEngineBase` and `IntegrationEngineBase` already use it. `ProviderBase.EntitiesByRelevance` calls `EntityEmbeddingEngine.Instance.EnsureLoaded(contextUser)` before invoking `RankByText`, satisfying the consumer contract.

### Cold-Start Behavior

- Server boot is unaffected — `deferred: true` means warmup fires-and-forgets.
- First `EntitiesByRelevance` call after boot awaits the in-flight warmup promise (idempotent — won't trigger a second load).
- For a few thousand entities with only a small fraction stale, warmup is typically a few hundred milliseconds: cosine math is microseconds, the cost is the `EmbedTextLocal` calls for stale rows.
- A full cold rebuild (every entity stale, e.g., first deployment after migration) is bounded by `EmbedTextLocal` throughput. Batch where the underlying API supports it.

## Hybrid Ranking

For each `EntitiesByRelevance` call, the lexical pass and the query embedding are dispatched **in parallel**:

```typescript
const [lexicalScores, queryVector] = await Promise.all([
    this.computeLexicalScores(searchText),      // sync today, wrapped in Promise.resolve
    this.embeddingEngine.GetOrComputeQueryEmbedding(searchText)  // async — EmbedTextLocal call
]);
const semanticScores = this.embeddingEngine.CosineAgainstAll(queryVector);
const blended = this.blend(lexicalScores, semanticScores);
```

The lexical pass is microseconds today — synchronously walking the in-memory name map gives no real win from `Promise.all`. We use it anyway because (a) the future-proofing is free, and (b) if we ever swap the lexical implementation for something non-trivial (SQL Server full-text, an external lexical index, an LLM-judged re-rank), the parallel shape is already in place. No regret cost.

### Step 1: Lexical Pass

Walk the existing `_entityMapByName` once. For each entity, compute a lexical score against `searchText` (lowercased, trimmed):

| Match | Score |
|---|---|
| Exact name match | 1.00 |
| Name starts with query | 0.85 |
| Name contains query as substring | 0.70 |
| No match | 0.00 |

This is cheap (single map walk) and ensures literal user intent ("Invoices") always wins.

### Step 2: Semantic Pass

1. Embed `searchText`. Check `_requestEmbeddingCache` first (Map keyed by SHA-256 of normalized text) — avoids recompute on repeated queries within the process. This is the actual async work that justifies wrapping the whole thing in `Promise.all`.
2. Cosine similarity against all `_vectors`. For 1500 entities × 384-dim vectors this is microseconds in plain JS using `Float32Array`.
3. Normalize cosine `[-1, 1]` → `[0, 1]` via `(cos + 1) / 2`.

### Step 3: Blend

```
final = max(lexicalScore, semanticScore * 0.95)
matchType:
    lexicalScore == 1.00                       -> 'exact'
    lexicalScore == 0.85                       -> 'prefix'
    lexicalScore == 0.70                       -> 'substring'
    semanticScore wins AND lexicalScore == 0   -> 'semantic'
    semanticScore wins AND lexicalScore > 0    -> 'hybrid'
```

Lexical wins ties; semantic can only beat lexical by being substantially higher (the 0.95 dampener). This matches user intuition: if you typed "Invoices" verbatim, you expect the `Invoices` entity at the top regardless of how semantically close `BillingItems` might be.

### Step 4: Cutoff and Sort

- Drop entries below `options.minScore`.
- Sort descending by `score`.
- Take `topK`.

### No Vector Index

In-memory cosine over a few thousand 384-dim vectors is microseconds. No FAISS, no pgvector, no SQL Server vector type. If MJ catalogs ever cross ~50k entities per provider, we revisit. Until then, simplicity wins.

## Permission Filter

Applied **after** ranking, **before** returning:

```typescript
const ranked = await this.embeddingEngine.RankByText(searchText, topK * 2);
const filtered = ranked.filter(r => {
    const entity = this._entityMapByID.get(r.entityId);
    return entity && this.userCanReadEntity(entity, options.contextUser);
});
return filtered.slice(0, topK).map(r => ({
    entity: this._entityMapByID.get(r.entityId)!,
    score: r.score,
    matchType: r.matchType,
    components: r.components
}));
```

Notes:
- We over-fetch (`topK * 2`) before filtering so permission drops don't shrink the result set below the caller's request.
- Permission lookup is in-memory (no DB roundtrip) — uses the same metadata already in `ProviderBase`.
- We do **not** pre-filter the vector pool by permissions: per-user filtering would require per-user vector subsets, and the cost of post-filter is negligible at these volumes.

## Request Embedding Cache

In-process `Map<string, Float32Array>` keyed by SHA-256 of the normalized search text. Cache hit avoids `EmbedTextLocal` invocation entirely.

- **Scope**: per-process (no cross-process sharing in v1).
- **Eviction**: LRU with a sane default cap (e.g., 1000 entries). Embeddings are small (~1.5KB at 384-dim float32); memory is not a concern, but the cap prevents pathological unbounded growth.
- **Why this matters**: agent loops often re-query with the same or near-identical text across iterations. Even local embedding is not free.

## Action Wrapper

A thin Action exposes the provider method to agent frameworks and low-code consumers.

### Action: `Search Entities`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `SearchText` | string | yes | Free-text query. |
| `TopK` | int | no (default 10) | Max results. |
| `MinScore` | float | no (default 0.5) | Score cutoff. |
| `SchemaName` | string | no | Restrict to one schema. |

Returns a JSON array of `{ name, schemaName, description, score, matchType }`. Agents use this to drill in after seeing seeded candidates in the system prompt.

The Action itself is a few lines — it calls `Metadata.Provider.EntitiesByRelevance()` with the action's `contextUser` and serializes the result. All logic lives in the provider method; the Action is just the metadata-driven boundary (per the Actions design philosophy in CLAUDE.md).

## Agent Prompt Builder Integration

This plan does **not** modify any specific agent. The agent framework's prompt builder (or each agent's own system prompt logic) calls `provider.EntitiesByRelevance(userRequest, { topK: 10 })` directly when it decides the catalog is too large to dump.

The decision rule ("if entity count > N, swap full list for seeded candidates + Search Entities action description") lives in the agent framework, not in this infrastructure. This plan provides the capability; consumers decide the policy.

## What's Explicitly Out of Scope (v1)

- **Field-level enrichment of the embedding template** — defer until measured need.
- **Embeddings for Views, Queries, Actions, Reports** — same pattern is applicable but each is a separate body of work.
- **Multi-language / locale-aware templates** — single template assumed.
- **Cross-process / distributed embedding cache** — in-process Map only.
- **Vector index (FAISS / pgvector / SQL Server vector type)** — unnecessary at current scale.
- **Per-user vector subsets** — permission post-filter is sufficient.
- **Multi-tenant / per-org embedding stores** — orthogonal concern, not addressed here.
- **An admin UI for embedding status / regeneration** — invalidation is self-healing; no UI needed for v1.

## Implementation Phases

### Phase 1: Schema and CodeGen

1. Write migration adding `EmbeddingJSON`, `EmbeddingModelID`, `EmbeddingContentHash` to `Entity` table.
2. Add `sp_addextendedproperty` descriptions for each column.
3. Run migration locally, run CodeGen, verify generated `EntityEntity` subclass has the new typed properties.
4. Commit the generated entity changes alongside the migration.

### Phase 2: Embedding Engine

1. Create `EntityEmbeddingEngine` singleton extending `BaseSingleton<T>`.
2. Implement `loadInternal`: pull all `Entity` rows, render template, hash, identify stale rows, batch-embed via `EmbedTextLocal`, save back, build in-memory vector pool.
3. Implement `StartWarmup` (non-blocking) and `EnsureLoaded` (await-able).
4. Implement `RankByText` with the request embedding LRU cache.
5. Unit tests for: stale detection, hash-based invalidation, model-change invalidation, vector pool construction, cosine math correctness on known vectors.

### Phase 3: Provider Method

1. Add `EntitiesByRelevance` signature to `IMetadataProvider`.
2. Implement in `ProviderBase`: lexical pass over `_entityMapByName`, await `EntityEmbeddingEngine.EnsureLoaded`, call `RankByText`, blend scores, permission filter, sort, slice.
3. Add `EntityRelevanceResult` and `EntitiesByRelevanceOptions` types to the public API.
4. Unit tests for: blending logic (lexical wins ties, semantic dampening), match-type assignment, `topK` over-fetch with permission drops, `minScore` cutoff, `schemaName` filter.

### Phase 4: Startup Hook and Action

1. Hook `EntityEmbeddingEngine.Instance.StartWarmup(...)` into MJAPI startup (non-blocking, after metadata is loaded).
2. Create `Search Entities` Action that wraps the provider method.
3. Register the action in the appropriate Actions package.
4. End-to-end test: start MJAPI, call `EntitiesByRelevance` through the Action, confirm ranked results with permission filtering.

### Phase 5: Quality Measurement

1. Curate a small validation set of `(user query, expected top entity)` pairs covering realistic Query Builder / Database Research Agent scenarios.
2. Run the validation set, measure top-1 and top-5 hit rate.
3. Iterate on: minScore default, lexical score weights, semantic dampener (0.95).
4. Document the measured baseline so future template enrichments (Phase 4+ ideas) can be A/B compared.

## Open Questions

1. **Which model is "the configured embedding model"?** Should this be a server config setting, or read from a row in `MJ: AI Models` flagged as the default for entity embeddings? Probably the latter — consistent with how other AI defaults work in MJ. Same source `AIEngine.EmbedTextLocal()` already uses, so likely zero new config surface.

2. **What's the right `minScore` default?** 0.5 is a guess. Phase 5 measurement should set this empirically against the validation set.

3. **Embedding batch size for warmup?** Depends on `EmbedTextLocal` characteristics — needs to balance throughput against memory and avoid blocking the event loop for too long in any single batch. To be tuned in Phase 2.

4. **Should warmup also run on client providers (e.g., `GraphQLDataProvider`)?** Probably not — clients don't have local embedding capability and shouldn't recompute. Client-side `EntitiesByRelevance` should round-trip to the server via a new GraphQL resolver. Worth scoping in Phase 3 whether the client method goes in v1 or is deferred.

5. **Should CodeGen optionally null the `EmbeddingContentHash` when it edits Name/Description?** Pure perf optimization for warmup time on large catalogs — engine self-heals correctly without it. Defer until measurement says we need it.
