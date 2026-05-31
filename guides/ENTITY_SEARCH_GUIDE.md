# Entity Search Guide (`SearchEntity` / `SearchEntities`)

A focused guide to MJ's per-entity ranked search API. For the broader picture of which search API to use when, start with **[SEARCH_OVERVIEW_GUIDE.md](./SEARCH_OVERVIEW_GUIDE.md)**.

## What this API does

> "Give me the N records of entity X most relevant to this free-text query."

`SearchEntity` blends two signals against the records of one entity:

1. **Lexical** — substring / prefix matching on the entity's name field and any field marked `IncludeInUserSearchAPI`. A `RunView` with `LIKE` filters.
2. **Semantic** — vector cosine against embeddings stored on `MJ: Entity Record Documents.VectorJSON`. Embeddings are produced from a Nunjucks-rendered template tied to the entity via an `EntityDocument` of type `Search`.

The two ranked lists fuse via canonical weighted Reciprocal Rank Fusion (`ComputeRRF`), permission filtering drops records the caller can't read, and the top-K slice is returned. All modes (lexical-only, semantic-only, hybrid) are first-class via the `mode` option.

## API surface

Declared on `IMetadataProvider`, implemented on every concrete provider:

```typescript
SearchEntity(params: SearchEntityParams): Promise<EntitySearchResult[]>
SearchEntities(params: SearchEntityParams[]): Promise<EntitySearchResult[][]>

type SearchEntityParams = {
    entityName: string;
    searchText: string;
    options?: SearchEntitiesOptions;
};

type SearchEntitiesOptions = {
    mode?: 'lexical' | 'semantic' | 'hybrid';   // default 'hybrid'
    rrfK?: number;                              // default 60
    weights?: { lexical?: number; semantic?: number };  // default 1.0 each
    topK?: number;                              // default 10
    minScore?: number;                          // default 0
    entityDocumentId?: string;                  // override which EntityDocument
    contextUser?: UserInfo;
};

type EntitySearchResult = {
    entityRecordDocumentId: string | null;
    recordId: string;
    score: number;
    matchType: 'lexical' | 'semantic' | 'hybrid';
    components: { lexical?: number; semantic?: number };
};
```

### Singular vs. plural

- `SearchEntity({ ... })` — one entity, returns `EntitySearchResult[]`.
- `SearchEntities([{...}, {...}, ...])` — many entities. Returns `EntitySearchResult[][]` aligned by input order: `result[i]` is the ranked list for `params[i]`.

**Use the plural form** whenever you want results from more than one entity for the same request. On the client (`GraphQLDataProvider`), the plural form is **one** GraphQL round-trip regardless of how many entities you list. On the server (`GenericDatabaseProvider`), the plural form fans out via `Promise.all`, so per-entity passes run concurrently.

Even the singular form on the client uses the plural transport under the hood — a single-element batch — so there's no network penalty for calling the singular variant.

## Quick examples

### Agent prompt seeding (the original motivation)

```typescript
import { Metadata } from '@memberjunction/core';

const md = new Metadata();
const candidates = await md.SearchEntity({
    entityName: 'MJ: Entities',
    searchText: userPrompt,
    options: { topK: 10, contextUser },
});

// Bake candidates into the system prompt as the "likely relevant entities" hint.
const promptHint = candidates
    .map(c => `- ${c.recordId} (score ${c.score.toFixed(3)})`)
    .join('\n');
```

### Cross-entity "find anything relevant to X"

```typescript
const groups = await md.SearchEntities([
    { entityName: 'Invoices',  searchText: query, options: { topK: 5, contextUser } },
    { entityName: 'Customers', searchText: query, options: { topK: 5, contextUser } },
    { entityName: 'Notes',     searchText: query, options: { topK: 5, contextUser } },
]);

const [invoices, customers, notes] = groups;
```

### From an Action (agent-friendly)

```typescript
await runAction({
    ActionName: 'Search Entity',
    Params: [
        { Name: 'EntityName', Value: 'Accounts' },
        { Name: 'SearchText', Value: 'enterprise contracts in NA region' },
        { Name: 'TopK', Value: 20 },
        { Name: 'Mode', Value: 'hybrid' },
        { Name: 'SemanticWeight', Value: 1.5 },  // bias toward semantic relevance
    ],
});
```

### Mode tuning

| Goal | Recommended options |
|---|---|
| Exact name lookups dominate (e.g. user typed "Invoices") | `mode: 'hybrid'`, default weights — lexical wins ties via score |
| Semantic intent dominates (vague descriptive queries) | `mode: 'hybrid'`, `weights: { semantic: 1.5 }` |
| Skip embedding round-trip / EntityDocument not configured | `mode: 'lexical'` |
| Pure embedding similarity, no name bias | `mode: 'semantic'` |

## Provider implementation (how it works under the hood)

Polymorphism, not registration. No startup wiring required.

| Provider | What it does |
|---|---|
| `ProviderBase` (MJCore) | Holds the **concrete orchestration**: resolve EntityDocument → parallel lexical + semantic passes → weighted RRF blend → permission post-filter → topK / minScore slice. |
| | The semantic pass is **`protected abstract`** — each concrete provider supplies its own. |
| `GenericDatabaseProvider` (server) | Implements `searchEntitiesSemanticPass`: `AIEngine.EmbedTextLocal` → `SimpleVectorServiceProvider.QueryIndex`. Direct calls, no indirection. |
| `GraphQLDataProvider` (client) | **Overrides both `SearchEntity` and `SearchEntities`** outright with a one-round-trip GraphQL proxy to the `SearchEntities` resolver. The abstract semantic pass is a no-op (unreachable). |
| `SearchEntitiesResolver` (MJServer) | Receives the batch, looks up the user via `UserCache`, calls `md.SearchEntities`, returns groups aligned by input order. |

Result: same one-line API call on the client and the server; the right work happens at the right tier.

## Configuration

Semantic and hybrid modes require an Active `EntityDocument` of type `Search` registered for the target entity. The MJ install seeds one for `MJ: Entities` (see `/metadata/entity-documents/`), so the entity catalog is searchable out of the box.

### Enabling on your own entity (3 steps)

1. **Register an `EntityDocument`** of type `Search` for your entity. Add an entry to `/metadata/entity-documents/.entity-documents.json` (or push via `mj sync` from a custom metadata folder):

   ```json
   {
     "fields": {
       "Name": "Accounts Search",
       "EntityID": "@lookup:Entities.Name=Accounts",
       "TypeID": "@lookup:MJ: Entity Document Types.Name=Search",
       "Status": "Active",
       "VectorDatabaseID": "@lookup:MJ: Vector Databases.Name=Simple Vector Service Provider",
       "AIModelID": "@lookup:MJ: AI Models.Name=gte-small (Local)",
       "Template": "@file:templates/accounts-search.njk",
       "PotentialMatchThreshold": 0.7,
       "AbsoluteMatchThreshold": 0.95
     }
   }
   ```

2. **Write the template** at `templates/accounts-search.njk`. A reasonable default:

   ```jinja
   {{ Name }}
   {{ Description }}
   {{ Industry }} - {{ Region }}
   ```

   Templates can reference any field on the record. Keep them focused on the text a user would actually phrase — descriptive fields, business-language tags, not internal IDs.

3. **Run the vector sync**. The seeded `Sync Entity Vectors` scheduled job (cron `0 0 4 * * *` daily, `RunImmediatelyIfNeverRun: true`) will pick up the new EntityDocument on its next poll, generate embeddings for every record, and write them to `EntityRecordDocument.VectorJSON`. No manual step required — though you can force a run from the Scheduling dashboard.

That's it. `Provider.SearchEntity({ entityName: 'Accounts', searchText: query })` now returns semantic results.

### Swapping to a remote vector DB

For high-scale corpora, set `VectorDatabaseID` on the EntityDocument to a Pinecone / Qdrant / pgvector provider row instead of `Simple Vector Service Provider`. The orchestration in `ProviderBase.SearchEntity` is provider-agnostic — the semantic pass in `GenericDatabaseProvider` calls whichever `VectorDBBase` driver the EntityDocument names.

## Weighted RRF — when and how to tune

The hybrid mode passes `[lexicalRanked, semanticRanked]` through `ComputeRRF(lists, k, weights)`. Defaults:

```typescript
options.weights = { lexical: 1.0, semantic: 1.0 }
options.rrfK = 60   // paper standard
```

Increase a weight to bias toward that signal. A weight of `0` suppresses the list entirely (equivalent to `mode: 'lexical'` or `mode: 'semantic'`).

The `weights` option is the same shape used everywhere RRF is invoked in MJ — `SearchEngine` cross-scope fusion, dupe detection, etc. — so tuning intuition transfers.

## Permissions

Results are post-filtered by row-level read permission on the target entity. The implementation over-fetches (typically `topK * 2`) before filtering so the final result count usually matches the requested `topK`. If your user can't read N of the top results, the next-best matches fill in.

Permission evaluation uses the existing `RunView` pipeline — no separate permission codepath to maintain.

## Common pitfalls

- **No EntityDocument configured** → semantic mode returns empty; hybrid degrades to lexical-only. Log: `SearchEntity: no active 'Search' EntityDocument for entity "..."`.
- **EntityDocument exists but vectors haven't synced yet** → semantic mode returns empty silently. Run the vector sync job or wait for the next poll.
- **Embedding model misconfigured** → `AIEngine.EmbedTextLocal` returns null; semantic pass returns empty. Check the configured local embedding model.
- **`searchText` is empty / whitespace** → returns `[]` immediately, no work done.
- **Caller forgets `contextUser`** on the server → permission filter has no user to evaluate against; behavior depends on the entity's permission rules. Always pass `contextUser` server-side.

## Out of scope (today)

- Field-level enrichment of the embedding template — only the EntityDocument's Nunjucks template feeds the embedding.
- Cross-process / distributed in-memory vector cache (the `SimpleVectorServiceProvider` cache is per-process).
- An admin UI for "enable search on this entity" — metadata + `mj sync` is the v1 surface.

See **[plans/entity-search-via-entity-document.md](../plans/entity-search-via-entity-document.md)** for the original design discussion and the deferred ideas.
