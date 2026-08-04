# Entity Search via EntityDocument

## Overview

MemberJunction already has the building blocks for generic semantic search across any entity — `EntityDocument` templates, `EntityRecordDocument` records (which persist `VectorJSON` on the source-of-truth row), the vector-sync pipeline, the `EntityDocumentSuggester` with a first-class `'search'` use case, and the `VectorDBBase` provider abstraction. What's missing is the glue that turns "we have all the pieces" into "an agent or developer can call one method, on any entity, and get ranked relevant records out — with the entity catalog itself working out of the box."

This plan ships that glue:

1. A `SimpleVectorService` adapter implementing `VectorDBBase`, so the existing in-memory vector primitive can be used wherever a vector provider is expected. No external vector DB required for the common case.
2. A lazy `Map<EntityDocumentID, AdapterInstance>` so the first search against a given `EntityDocument` rehydrates the in-memory index from `EntityRecordDocument.VectorJSON` rows — fast warmup, zero re-embedding when vectors haven't drifted.
3. A `SearchEntities` method on `IMetadataProvider` / `ProviderBase` that runs lexical and/or semantic ranking against a single entity, filters by permissions, and returns ranked `EntityRecordDocument`-pointed results. Mode (`lexical` | `semantic` | `hybrid`) and weights are caller options.
4. Weighted RRF: extend the existing `ComputeRRF` in `@memberjunction/core` to accept optional per-list weights, and update the GraphQL search client's cross-scope fusion to expose the same option. One canonical implementation, used everywhere.
5. Seed `EntityDocument` + `ScheduledJob` metadata for `MJ: Entities` under `/metadata/` so the entity-catalog use case (the original Query Builder / Database Research Agent prompt-seeding problem) works on a fresh install with zero configuration.
6. A small enhancement on `ScheduledJob` — `RunImmediatelyIfNeverRun: bit` — so the seeded sync job runs on first poll instead of waiting up to a full cron interval. Generally useful well beyond this feature.
7. A `Search Entities` Action wrapper exposing `SearchEntities` to agents and workflows.

The agent prompt-seeding use case (swap a 1500-entity dump for "here are the 10 most likely candidates + tools to dig deeper") falls out for free once the above is in place: it's just `SearchEntities('MJ: Entities', userText, { topK: 10 })`.

## Background — What Already Exists

### EntityDocument / EntityRecordDocument

- `EntityDocument` defines a Nunjucks template for rendering a record into text, plus its embedding-model configuration.
- `EntityRecordDocument` is one row per (entity-record, entity-document) pair, storing the rendered document text **and** the embedding vector in `VectorJSON nvarchar(MAX)`. Confirmed in `migrations/v2/V202407171600__v2.0.x.sql:3648`. **This means vectors are already persisted at the source of truth — we don't need a new column or sidecar.**
- The sync pipeline (`@memberjunction/ai-vectors-sync`) handles batch generation, incremental sync, and caching.
- `EntityDocumentSuggester` (`packages/AI/Vectors/Sync/src/models/EntityDocumentSuggester.ts`) already enumerates `'duplicate detection' | 'search' | 'classification'` as first-class use cases. The "search" template category is real and built in.

### VectorDBBase Abstraction

`packages/AI/Vectors/Database/src/generic/VectorDBBase.ts` defines `QueryIndex()` and `HybridQuery()` — provider-agnostic semantic and hybrid search contracts. Pinecone, etc., implement against this. No in-memory provider exists today; that's the gap component (1) closes.

### SimpleVectorService (SVS)

`@memberjunction/ai-vectors-memory` provides `SimpleVectorService` and `SimpleVectorDatabase` — in-memory, embedding-model-agnostic vector primitives already consumed by `QueryGen/SimilaritySearch.ts` and `AIEngine`. They don't currently implement `VectorDBBase`. Bridging them in is component (1).

### ComputeRRF

`packages/MJCore/src/generic/scoring/ReciprocalRankFusion.ts` is the canonical RRF implementation. Currently unweighted (`Score += 1 / (k + rank + 1)`). Used by `@memberjunction/ai-vector-dupe` (`duplicateRecordDetector.ts`) and referenced for cross-scope fusion in `packages/GraphQLDataProvider/src/graphQLSearchClient.ts`. Component (4) extends it.

### ScheduledJob

`migrations/v2/V202510141423__v2.107.x__Scheduled_Jobs.sql` defines the table. `ScheduledJobEngine.initializeNextRunAt` (`packages/Scheduling/engine/src/ScheduledJobEngine.ts:813-824`) currently sets `NextRunAt = CronExpressionHelper.GetNextRunTime(...)` for newly-seeded jobs — i.e., the next cron tick, not "now". So a freshly seeded daily job waits up to 24h before its first run. Component (6) closes that gap.

## API Surface

### Provider Method

```typescript
/**
 * Search a single entity's records using lexical, semantic, or hybrid (RRF-fused) ranking.
 *
 * Backed by an EntityDocument of category 'Search' configured against the target entity.
 * The first call for a given EntityDocument lazily rehydrates an in-memory index from
 * EntityRecordDocument.VectorJSON rows; subsequent calls reuse the cached index.
 *
 * Results are filtered by the contextUser's read permissions on the target entity
 * before return.
 */
SearchEntities(
    entityName: string,
    searchText: string,
    options?: SearchEntitiesOptions
): Promise<EntitySearchResult[]>;
```

### Types

```typescript
export type SearchEntitiesOptions = {
    /** 'lexical' = name/text-field substring + prefix only.
     *  'semantic' = vector cosine only.
     *  'hybrid'   = weighted RRF blend of the two. (default) */
    mode?: 'lexical' | 'semantic' | 'hybrid';

    /** RRF smoothing constant. Default: 60 (paper standard). */
    rrfK?: number;

    /** Per-list weights for hybrid mode. Default: { lexical: 1.0, semantic: 1.0 }. */
    weights?: { lexical?: number; semantic?: number };

    /** Maximum number of results to return. Default: 10. */
    topK?: number;

    /** Drop results with a final score below this threshold. Default: 0. */
    minScore?: number;

    /** Optional override: which EntityDocument to use. Defaults to the first
     *  Search-category EntityDocument registered for the entity. */
    entityDocumentId?: string;

    /** Context user for permission filtering. Required on server. */
    contextUser?: UserInfo;
};

export type EntitySearchResult = {
    /** Pointer to the matching EntityRecordDocument row. */
    entityRecordDocumentId: string;

    /** The record ID within the target entity. */
    recordId: string;

    /** Final blended/single-mode score. */
    score: number;

    /** Which signal(s) contributed. */
    matchType: 'lexical' | 'semantic' | 'hybrid';

    /** Raw component scores, exposed for callers that want to audit or re-rank. */
    components: {
        lexical?: number;
        semantic?: number;
    };
};
```

### Naming

`SearchEntities` reads cleanly as a verb-form operation against the target entity, and is honest about the fact that the operation supports more than just semantic search. We considered `EntitiesByRelevance` (preserves the `EntityByName` convention) — both are reasonable. Going with `SearchEntities` because it's shorter and signals the multi-mode nature better.

(`EntitySemanticSearch` was deliberately rejected — would understate the surface since lexical and hybrid modes are first-class.)

## Component 1 — SimpleVectorService as a `VectorDBBase` Provider

### Goal

Wrap `SimpleVectorService` / `SimpleVectorDatabase` in an adapter that implements `VectorDBBase`. This lets every consumer of the vector-sync / EntityDocument infrastructure use SVS as a backing store without writing SVS-specific code.

### Sketch

New class in `@memberjunction/ai-vectors-memory` (or a new sibling package `@memberjunction/ai-vectors-memory-provider`):

```typescript
export class SimpleVectorServiceProvider extends VectorDBBase {
    private _indexes = new Map<string, SimpleVectorDatabase>();

    public async QueryIndex(options: QueryOptions): Promise<QueryResponse> { /* ... */ }
    public async HybridQuery(options: HybridQueryOptions): Promise<QueryResponse> {
        // Delegate to QueryIndex for vector path; caller (or SearchEntities)
        // is responsible for the lexical path + RRF fusion.
        // (See "Component 3" — fusion lives at the provider helper layer, not
        // inside SVSProvider, because SVS has no native text index.)
    }
    public async UpsertVectors(indexName: string, vectors: VectorRecord[]): Promise<void> { /* ... */ }
    public async DeleteVectors(indexName: string, ids: string[]): Promise<void> { /* ... */ }
    /* ...other VectorDBBase methods... */
}
```

### Lazy Per-EntityDocument Index Loading

The `_indexes` map is keyed by `EntityDocumentID`. On first access:

1. Read all `EntityRecordDocument` rows for the EntityDocument via `RunView`.
2. Parse `VectorJSON` into Float32Array.
3. Bulk-load into a new `SimpleVectorDatabase`.
4. Cache.

```typescript
private async getOrLoadIndex(entityDocumentId: string, contextUser?: UserInfo): Promise<SimpleVectorDatabase> {
    const existing = this._indexes.get(entityDocumentId);
    if (existing) return existing;

    const db = new SimpleVectorDatabase();
    const rv = new RunView();
    const result = await rv.RunView<MJEntityRecordDocumentEntity>({
        EntityName: 'MJ: Entity Record Documents',
        ExtraFilter: `EntityDocumentID='${entityDocumentId}' AND VectorJSON IS NOT NULL`,
        ResultType: 'entity_object'
    }, contextUser);

    if (!result.Success) throw new Error(`Failed to load index: ${result.ErrorMessage}`);

    for (const row of result.Results) {
        const vector = JSON.parse(row.VectorJSON!) as number[];
        db.addVector(row.ID, new Float32Array(vector), { recordId: row.RecordID });
    }

    this._indexes.set(entityDocumentId, db);
    return db;
}
```

### Cache Invalidation

The sync pipeline (running as a scheduled job — see component 5) writes back to `EntityRecordDocument.VectorJSON` whenever underlying records change. **The in-memory SVS index becomes stale at that point.** Two invalidation strategies, both in v1:

1. **TTL** — drop indexes older than N minutes (configurable; default 15). Next query re-hydrates.
2. **Explicit invalidation** — the sync pipeline calls `SimpleVectorServiceProvider.Instance.InvalidateIndex(entityDocumentId)` after successful sync. Fast path, deterministic.

TTL is the safety net; explicit invalidation is the primary mechanism.

## Component 2 — Lazy Index Cache (covered above)

The `Map<EntityDocumentID, SimpleVectorDatabase>` lives inside `SimpleVectorServiceProvider`. Listed as its own component here so it's not lost — the lazy-load pattern is the thing that makes SVS-backed search practical without re-embedding everything at server start.

Memory cost is bounded by the largest active EntityDocument's record count × embedding dimension × 4 bytes (Float32). For `MJ: Entities` at ~1500 rows × 384-dim → ~2.3MB. Trivially fine.

## Component 3 — `SearchEntities` Helper

### Where It Lives

On `IMetadataProvider` (interface) and `ProviderBase` (implementation). Mirrors the `EntityByName` placement — entity-metadata-layer concern, consumable by both client and server.

### Server Implementation Sketch

```typescript
public async SearchEntities(
    entityName: string,
    searchText: string,
    options: SearchEntitiesOptions = {}
): Promise<EntitySearchResult[]> {
    const entity = this.EntityByName(entityName);
    if (!entity) return [];

    const entityDocId = options.entityDocumentId
        ?? await this.resolveDefaultSearchEntityDocument(entityName, options.contextUser);
    if (!entityDocId) {
        throw new Error(`No 'Search' EntityDocument configured for entity '${entityName}'.`);
    }

    const mode = options.mode ?? 'hybrid';
    const overFetch = (options.topK ?? 10) * 2;  // for permission post-filter

    const [lexicalRanked, semanticRanked] = await Promise.all([
        mode === 'semantic'
            ? Promise.resolve([])
            : this.runLexicalPass(entity, searchText, overFetch, options.contextUser),
        mode === 'lexical'
            ? Promise.resolve([])
            : this.runSemanticPass(entityDocId, searchText, overFetch, options.contextUser),
    ]);

    let blended: ScoredCandidate[];
    if (mode === 'lexical')      blended = lexicalRanked;
    else if (mode === 'semantic') blended = semanticRanked;
    else                          blended = ComputeRRF(
        [lexicalRanked, semanticRanked],
        options.rrfK,
        [options.weights?.lexical ?? 1.0, options.weights?.semantic ?? 1.0]
    );

    const permissionFiltered = blended.filter(c => this.userCanReadEntityRecord(entity, c.ID, options.contextUser));
    return this.shapeResults(permissionFiltered, options.topK ?? 10, options.minScore ?? 0);
}
```

### Lexical Pass

For now: substring + prefix matching on the entity's name-field and any field marked `IncludeInUserSearchAPI`, scored as in the old plan (exact 1.0, prefix 0.85, substring 0.7). Implemented as a `RunView` with `ExtraFilter` LIKE clauses, capped at `overFetch` rows. Cheap and predictable.

A v2 enhancement would push lexical down to SQL Server full-text search where configured; out of scope for v1.

### Semantic Pass

Calls into `SimpleVectorServiceProvider.QueryIndex({ indexName: entityDocId, queryText: searchText, topK: overFetch })`. SVS embeds `searchText` via the configured embedding model (same one used to build the index — pulled from the `EntityDocument`'s model config). Cosine over the loaded vector pool.

### Permission Filter

Post-fusion, per-record. For most entities this is row-level evaluation against the entity's permission rules — already an in-memory check using metadata in `ProviderBase`. Slightly more involved than entity-level filtering in the original plan, but the over-fetch + filter pattern keeps it correct.

### Client Implementation

`GraphQLDataProvider.SearchEntities` round-trips to the server via a new GraphQL resolver `searchEntities(entityName, searchText, options)`. Same return shape. Client cannot maintain its own vector pool — it has neither the model nor the records — so it's a thin proxy.

## Component 4 — Weighted ComputeRRF

### Change

Extend `ComputeRRF` in `packages/MJCore/src/generic/scoring/ReciprocalRankFusion.ts`:

```typescript
export function ComputeRRF(
    rankedLists: ScoredCandidate[][],
    k: number = 60,
    weights?: number[]                    // NEW: optional per-list weights
): ScoredCandidate[] {
    // ...
    for (let listIdx = 0; listIdx < rankedLists.length; listIdx++) {
        const list = rankedLists[listIdx];
        const w = weights?.[listIdx] ?? 1.0;
        for (let rank = 0; rank < list.length; rank++) {
            const contribution = w * (1.0 / (k + rank + 1));
            // ...
        }
    }
    // ...
}
```

Weighted RRF formula: `FusedScore(d) = Σ_i w_i / (k + rank_i(d))`. Backwards-compatible — omitted `weights` gives the existing behavior.

### Propagating to Existing Callers

Two existing callers of `ComputeRRF`:

1. **`@memberjunction/ai-vector-dupe` — `duplicateRecordDetector.ts:50`**. Currently passes a single fused list of `[vectorResults, keywordResults]` with no weights. No change required — backwards-compatible — but worth exposing an optional `weights` parameter on the dupe detector's public API so callers can tune. Phase 4 doc-level update.

2. **`@memberjunction/graphql-data-provider` — `graphQLSearchClient.ts:26`**. The client doc-comment references "cross-scope RRF fusion" for unified search across scopes. Trace through and confirm `ComputeRRF` is being invoked via the search server resolver (likely in the `@memberjunction/ai-search` package — to verify in Phase 4). Expose `weights` (and `rrfK`) as optional search options on the same client API so consumers of unified search can also tune the blend. **This is the "broader search architecture" update the user asked for.**

### Tests

The existing `ReciprocalRankFusion.test.ts` covers the unweighted path. Add cases for: equal weights = identical to no weights (regression-protect the default), heavily-weighted list dominates, zero-weight list is suppressed, weight array shorter than list count falls back to 1.0 for the rest.

## Component 5 — Seed `EntityDocument` + `ScheduledJob` for `MJ: Entities`

### Files Added Under `/metadata/`

```
metadata/
  entity-documents/
    .mj-sync.json
    .entity-documents.json           # array containing the MJ: Entities Search doc
    templates/
      mj-entities-search.njk         # Nunjucks template
  scheduled-jobs/
    .mj-sync.json
    .scheduled-jobs.json             # array containing the entity-vector-sync job
```

### EntityDocument Record

- `EntityID` → `@lookup:Entities.Name=MJ: Entities`
- `Type` → `Search` (per `EntityDocumentSuggester`'s `'search'` use case)
- `Template` → `@file:templates/mj-entities-search.njk`
- `Status` → `Active`
- `AIModelID` → `@lookup:AIModel.Name=<configured-default-embedding-model>`
- `VectorDatabaseID` → `@lookup:VectorDatabase.Name=Simple Vector Service` (the new SVS provider registration — see component 1; we also need to seed a `VectorDatabase` row for it in this metadata batch)

### Template

```jinja
Entity: {{ SchemaName }}.{{ Name }}
{{ Description }}
```

(Matches the embedding template from the prior plan — name + description + schema, no field-level enrichment for v1.)

### ScheduledJob Record

- `JobTypeID` → the existing vector-sync job type (verify name in Phase 1; likely `'Vector Document Sync'` or similar — to confirm)
- `Name` → `Sync Entity Vectors`
- `CronExpression` → `0 4 * * *` (daily 04:00 UTC)
- `RunImmediatelyIfNeverRun` → `true` (per component 6)
- `Configuration` → JSON specifying which EntityDocuments to sync (or null = all active)
- `Status` → `Active`

This single seeded job covers `MJ: Entities` and any future user-enabled EntityDocuments — runs daily, plus immediately on first poll after install.

## Component 6 — `ScheduledJob.RunImmediatelyIfNeverRun`

### Migration

New `migrations/v5/V<timestamp>__v5.x.x_ScheduledJob_RunImmediatelyIfNeverRun.sql`:

```sql
ALTER TABLE ${flyway:defaultSchema}.ScheduledJob ADD
    RunImmediatelyIfNeverRun BIT NOT NULL CONSTRAINT DF_ScheduledJob_RunImmediately DEFAULT (0);

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true and LastRunAt IS NULL, the scheduler sets NextRunAt to now() instead of the next cron tick, ensuring the job runs immediately on first poll after seeding. Useful for newly-installed jobs that should not wait up to a full cron interval before their first run.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ScheduledJob',
    @level2type = N'COLUMN', @level2name = 'RunImmediatelyIfNeverRun';
```

### Engine Change

In `packages/Scheduling/engine/src/ScheduledJobEngine.ts`, update `initializeNextRunAt`:

```typescript
// existing:
if (!job.NextRunAt) {
    job.NextRunAt = CronExpressionHelper.GetNextRunTime(job.CronExpression, job.Timezone);
}

// new:
if (!job.NextRunAt) {
    if (job.RunImmediatelyIfNeverRun && !job.LastRunAt) {
        job.NextRunAt = new Date();   // due now
    } else {
        job.NextRunAt = CronExpressionHelper.GetNextRunTime(job.CronExpression, job.Timezone);
    }
}
```

### Test

Add unit tests covering: flag off → unchanged behavior; flag on + never run → `NextRunAt = now`; flag on + has run → cron tick as usual.

## Component 7 — `Search Entities` Action Wrapper

Thin action in `@memberjunction/core-actions` (or wherever entity-touching system actions live; confirm in Phase 5):

| Parameter | Type | Required | Description |
|---|---|---|---|
| `EntityName` | string | yes | Target entity. |
| `SearchText` | string | yes | Free-text query. |
| `Mode` | string | no | `lexical`, `semantic`, or `hybrid` (default `hybrid`). |
| `TopK` | int | no | Default 10. |
| `MinScore` | float | no | Default 0. |
| `LexicalWeight` | float | no | Default 1.0. |
| `SemanticWeight` | float | no | Default 1.0. |
| `EntityDocumentID` | uuid | no | Override the default search doc. |

Returns JSON array of `{ recordId, score, matchType, components }`. The Action calls `Metadata.Provider.SearchEntities()` with the action's `contextUser` — no logic in the Action itself.

## Implementation Phases

### Phase 1 — SVS Adapter + Cache

1. New `SimpleVectorServiceProvider` extending `VectorDBBase` in `@memberjunction/ai-vectors-memory` (or sibling package — decide based on circular-dep risk).
2. Lazy `Map<EntityDocumentID, SimpleVectorDatabase>` with rehydrate-from-VectorJSON loader.
3. TTL + explicit-invalidation cache eviction.
4. Register the provider in the `VectorDatabase` metadata catalog (a seed row added in Phase 4).
5. Unit tests: rehydrate correctness against canned VectorJSON, TTL eviction, explicit invalidation.

### Phase 2 — Weighted RRF + Search Architecture Update

1. Extend `ComputeRRF` in `@memberjunction/core` with optional `weights` parameter. Backwards-compatible.
2. Update existing tests; add weighted-path cases.
3. Trace `ComputeRRF` cross-scope-fusion usage in the search architecture (`graphQLSearchClient.ts` references it). Expose `rrfK` and `weights` as optional search options on the unified search API.
4. Update `@memberjunction/ai-vector-dupe`'s public API to pass through weights if callers want them.

### Phase 3 — `SearchEntities` on `IMetadataProvider`

1. Add method to `IMetadataProvider` interface.
2. Implement in `ProviderBase`: resolve default Search EntityDocument, dispatch lexical + semantic in parallel, fuse via weighted RRF, permission post-filter, slice to topK.
3. `runLexicalPass`: RunView with LIKE filters against name-field + `IncludeInUserSearchAPI` fields. Score by match strength.
4. `runSemanticPass`: delegate to `SimpleVectorServiceProvider.QueryIndex` (or whichever provider the EntityDocument is configured against).
5. Permission post-filter using existing in-memory entity permission rules.
6. `GraphQLDataProvider.SearchEntities` round-trips via new GraphQL resolver.
7. Tests: mode switches, weight effects, permission filtering correctness, `entityDocumentId` override.

### Phase 4 — Seed Metadata

1. `/metadata/vector-databases/.vector-databases.json` — seed the SVS provider as a `VectorDatabase` row.
2. `/metadata/entity-documents/` — Search-category `EntityDocument` for `MJ: Entities` + Nunjucks template file.
3. `/metadata/scheduled-jobs/` — daily vector-sync job with `RunImmediatelyIfNeverRun = true`.
4. Push via `npx mj sync push --dir=metadata --include=vector-databases,entity-documents,scheduled-jobs`.
5. Verify on a fresh DB: install → start MJAPI → first scheduled-job poll runs the sync → first `SearchEntities('MJ: Entities', ...)` call returns ranked results.

### Phase 5 — `RunImmediatelyIfNeverRun` + Action Wrapper

1. Migration adding `RunImmediatelyIfNeverRun` column to `ScheduledJob` (under `migrations/v5/`).
2. Update `ScheduledJobEngine.initializeNextRunAt` with the new branch.
3. Run CodeGen, commit generated entity changes.
4. Unit tests for the new branch.
5. `Search Entities` Action — thin wrapper, register, smoke test through the agent metadata path.

### Phase 6 — Quality Measurement and Tuning

1. Curate a validation set of `(user query, expected top entity)` pairs covering realistic Query Builder / Database Research Agent scenarios against `MJ: Entities`.
2. Run validation: measure top-1 and top-5 hit rate under each mode and at a few weight combinations.
3. Pick the default `weights` and document the empirical justification.
4. Write a short recipe doc: "How to enable semantic search on your entity" — create an EntityDocument of type Search, ensure the vector-sync job is active, call `SearchEntities`.

## What's Explicitly Out of Scope (v1)

- **Pinecone / external vector DB as the default backing store.** SVS via the new adapter is the default; users who need a hosted vector DB at scale already have the Pinecone provider.
- **Field-level enrichment of the search template** — same rationale as the prior plan; deferred until measurement shows it's worth it.
- **Embeddings for Views, Queries, Actions, Reports** — same pattern is applicable, separate work.
- **Multi-language / locale-aware templates.**
- **Full-text-search-backed lexical pass.** SQL `LIKE` is the v1 lexical strategy; FTS is a v2 optimization where configured.
- **Per-user vector subsets.** Permission post-filter is sufficient.
- **An admin UI for "enable semantic search on this entity."** Metadata + `mj sync` is the v1 surface; a UI button is a follow-up.

## Open Questions

1. **Which package owns `SimpleVectorServiceProvider`?** `@memberjunction/ai-vectors-memory` would let it sit next to SVS itself, but pulls a dependency on `@memberjunction/ai-vectors-database` (where `VectorDBBase` lives). If that creates a cycle, a sibling `@memberjunction/ai-vectors-memory-provider` package is the alternative. To resolve in Phase 1.

2. **Vector-sync job type.** Need to confirm the existing `ScheduledJobType` for vector sync — name and ID — before authoring the seed JSON. If no such job type exists yet, we add one in the metadata batch alongside the seeded `ScheduledJob`.

3. **Default embedding model for the seeded `EntityDocument`.** Pull from current MJ default (`AIEngine.EmbedTextLocal` already has this notion), or pin to a specific small model for predictability across installs? Probably the former.

4. **`minScore` default.** Stays 0 in the type signature, to be tuned empirically in Phase 6 against the validation set.

5. **GraphQL resolver naming and shape.** New `searchEntities(...)` resolver — confirm naming conventions and pagination expectations against existing resolvers in Phase 3.

6. **Cross-scope unified-search RRF callers.** Need to walk `graphQLSearchClient.ts` and its server-side counterpart in Phase 2 to identify every site that should expose the new `weights` option. The user explicitly asked us to update the broader search architecture to use the same weighted RRF; Phase 2 owns enumerating those sites.

## Why This Replaces the Prior Plan (PR #2680)

The original plan would have built a parallel embedding/storage stack on the `Entity` table specifically for the entity-catalog search use case. After review, three points pushed us to pivot:

1. **MJ already has the abstractions.** `EntityDocument` + `EntityRecordDocument` + the vector-sync pipeline + `VectorDBBase` cover everything we'd have built bespoke. Building parallel infrastructure would have duplicated proven code and left users without a path to enable semantic search on their *own* entities.

2. **`EntityRecordDocument.VectorJSON` already persists vectors.** The original plan would have added `EmbeddingJSON` to `Entity` — solving the same problem in a new place. We use the existing column instead.

3. **Generic > specific.** The same `SearchEntities(entityName, ...)` solves the catalog-search problem *and* unlocks the same capability for every other entity, with admins flipping it on via metadata.

The deltas vs. the existing infrastructure are: (a) an in-memory provider for the no-external-vector-DB case, (b) weighted RRF for tunable hybrid blending, (c) the `SearchEntities` helper that ties it together, (d) the seed metadata + scheduling polish that makes it work out of the box.
