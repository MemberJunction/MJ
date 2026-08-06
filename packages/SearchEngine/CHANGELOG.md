# @memberjunction/search-engine

## 6.1.0-edge.0

### Patch Changes

- 0acf96e: Make the SearchScope permission resolver replaceable.

  `SearchEngine` authorizes every search through `SearchScopePermissionResolver`, which answers from `__mj.SearchScopePermission` rows keyed by `UserID` or by one of the user's MJ Roles. That covers MJ's own permission model completely — but it is not the only shape a permission model can take, and until now it was the only one the search path could consult.

  A consumer whose entitlements are neither a user nor an MJ Role has no row that can express them. Its grants are therefore invisible to the check that actually runs, and the failure is silent in the worst way: the grant is configured, an administrator can see it, and the search simply returns nothing. The resolver was a module-level singleton imported directly by `SearchEngine`, so the only remedies were to project the consumer's model into `SearchScopePermission` as derived per-user rows — permission state that can drift from its source — or to fork the search path.

  This adds the seam that was missing:
  - **`SearchScopePermissionResolverBase`** — the abstract contract registrations bind to.
  - **`SEARCH_SCOPE_PERMISSION_RESOLVER_KEY`** — the ClassFactory key. There is exactly one resolver per deployment (a consumer _replaces_ the policy rather than selecting among several), so a single shared key is the right shape, and it keeps the registry free of the keyless-registration warning.
  - **`GetSearchScopePermissionResolver()`** — returns the highest-priority registration, falling back to MJ's own.

  **Every path that authorizes a scope now goes through the seam**, not just `SearchEngine`. This matters more than it sounds: a seam honoured on some paths and not others is worse than no seam, because the resulting behaviour is inconsistent rather than merely absent — the same grant authorizes a search issued one way and silently denies it issued another. The five call sites are `SearchEngine.searchOneScope`, `SearchKnowledgeResolver` (both the single-scope check and the visible-scope-list filter), `SearchKnowledgeStreamResolver`, and the `__Scoped_Search` core action. The last is the agent-facing path, so an override that did not reach it would be invisible to exactly the callers most likely to need it.

  Resolution happens per call rather than being cached at module load. A registration made during application startup would otherwise be missed depending on import order — a failure mode that presents as "my resolver works in tests but not in the server", which is expensive to diagnose. The class is stateless and construction is trivial, so there is nothing to gain by caching.

  The intended shape for an override is to subclass the stock resolver and compose with it, **passing no priority**:

  ```ts
  @RegisterClass(
    SearchScopePermissionResolverBase,
    SEARCH_SCOPE_PERMISSION_RESOLVER_KEY,
  )
  export class MyResolver extends SearchScopePermissionResolver {
    public override async ResolveEffectivePermission(
      input: ResolvePermissionInput,
    ) {
      const stock = await super.ResolveEffectivePermission(input);
      if (stock.Allowed) return stock; // never narrow what MJ already granted
      return this.myOwnGrantCheck(input); // only ever widen
    }
  }
  ```

  Subclassing is what orders the registration, and it does so more reliably than a number can. `ClassFactory.Register` treats an omitted priority as _one higher than the highest already registered for this (base, key)_, and a subclass cannot be defined without its parent module having loaded first — so MJ's registration always runs before the consumer's, and the consumer always lands above it. The ordering is a side effect of the language rather than a convention anyone has to remember.

  A hardcoded priority forfeits that. Two consumers that pick the same number collide, `Register` warns, and resolution degrades to whichever was registered last — a load-order bug wearing the costume of a configuration value. The priority argument stays for cases where subclassing is genuinely impossible.

  **Nothing changes for existing consumers.** MJ's resolver registers itself as the default, so behaviour is identical when nothing else is registered. `DefaultSearchScopePermissionResolver` is retained and still exported so existing imports keep compiling; it is marked `@deprecated` because it always yields MJ's own implementation and therefore bypasses any registered override.

  The failure posture is unchanged and worth restating for anyone writing an override: `SearchEngine` treats a resolver throw as **denied**, never as allowed. An override that cannot reach its own store must not accidentally open a scope.

  7 tests covering the default, the fallback, an honoured registration, late registration (imperative, because `@RegisterClass` evaluates at module load and so cannot demonstrate lateness), composition with `super`, the deprecated constant, and that a subclass of the stock resolver satisfies the base contract.

- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
- Updated dependencies [1100077]
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/aiengine@6.1.0-edge.0
  - @memberjunction/storage@6.1.0-edge.0
  - @memberjunction/ai-vectordb@6.1.0-edge.0
  - @memberjunction/ai@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/aiengine@6.0.0
  - @memberjunction/ai-vectordb@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/storage@6.0.0
  - @memberjunction/ai@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/aiengine@5.51.0
  - @memberjunction/ai-vectordb@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/storage@5.51.0
  - @memberjunction/ai@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Minor Changes

- 0686d52: Add content cleaning, adaptive-boundary and paged segmentation, and chunk-aware external search mapping — all from PR review feedback.

  **Cleaning is now its own plug-in stage** (`@memberjunction/ai-segmentation`). Segmenting dirty content produces well-bounded garbage: navigation, sidebars, cookie banners, and advertising usually outweigh the article, and because that chrome repeats across every page of a site it yields many near-identical chunks that crowd out real answers.
  - `BaseContentCleaner` — resolved through the class factory like segmenters, via `ResolveContentCleaner` / `SuggestCleanerKey`.
  - `HtmlContentCleaner` (`Html`) — CSS-selector-driven extraction. `IncludeSelectors` is the high-leverage knob: naming the element that holds the content discards everything else without enumerating what to drop. `ExcludeSelectors` handles what survives inside it. An invalid selector is skipped rather than failing the clean, and if cleaning would remove everything the original is returned with a warning.
  - `PlainTextContentCleaner` (`PlainText`) — whitespace normalization and truncation, preserving the paragraph breaks segmenters use as boundaries.

  **`AdaptiveBoundarySegmenter` (`AdaptiveBoundary`)** targets a size and closes on the nearest natural break, escalating through boundary quality: paragraph → sentence → word → hard ceiling. Segment sizes vary on purpose — a slightly short segment ending at a paragraph beats an exactly-sized one ending mid-clause. It also declines to split when the whole text is only modestly over target, avoiding one full chunk plus a context-free runt. `TargetTokens` should be sized to your **queries**, not to the embedding model's context window, which is an upper bound rather than a goal.

  **`PagedContentSegmenter` (`PagedContent`)** emits one segment per page of a paginated source via the new `SegmentationParams.Pages`, preserving `PageNumber` for citation-grade provenance. A page may carry text, a rendered-page media reference, or both — the both case is what allows embedding a PDF page _as an image_ (preserving tables and charts that text extraction flattens) while its text rides along for lexical search. Pages carrying media are never merged, so their provenance stays true.

  **`@memberjunction/search-engine`** gains `ExternalHitMapper`, a shared field mapping now used by all four external providers (Azure AI Search, Elasticsearch, OpenSearch, Typesense) instead of four inline copies. It resolves snippets from `description` and `transcript` in addition to the conventional `content`/`body`/`text`, so a media chunk returns readable text rather than an empty snippet, and recovers chunk provenance (`chunkId`, `modality`, `startMs`/`endMs`, `pageNumber`) into the result's `RawMetadata` — which is what lets a hit deep-link to a moment in a recording or a page in a PDF. Field names are matched across camelCase, PascalCase, and snake_case, and numeric strings are coerced, since external indexes are populated outside MJ.

  Also fixes `BaseSegmenter` rejecting a params object that carried only `Pages`.

- c7b6710: Make Scoped Search dimensions enforceable so a dimension can carry an access decision rather than being a narrowing convenience any caller — including an LLM writing a tool call — could author. `SearchScope.SearchContextConfig` documented `dimensions[]`, `inheritanceMode` and `strictValidation` but no runtime code read any of it.

  A `restricts: true` dimension is now server-derived: a caller-supplied value is discarded, not merged, and the attempt is recorded in provenance. Values are grammar-checked, `freetext` is prohibited in filter positions, and every interpolated value is escaped automatically for its lane's dialect (SQL / OData / JSON / Typesense / path), keyed off the existing `IndexType`. `narrowingOf` is a lattice meet, so a caller may narrow a server bound but never widen it.

  A Skill becomes a search principal alongside an Agent, and scope grants gain a time window plus a tenant key. `RequiredMetadataKeys` catches a filter that rendered _partially_ — the case no other guard can see, where an optional clause vanishes because its dimension was absent or discarded and the lane silently searches wider than intended. Supersession (`advisory` + ordered rules) composes by subtraction and fails soft, deliberately outside the boundary. `ExplainScope()` reports what a search would be able to reach without running one, and the same structure is written to `SearchExecutionLog.ScopeDecisionJSON`.

  Fixes four security bugs, two live on `next`: the result-cache key omitted `ScopeIDs` and `SearchContext` (cross-tenant result leak within the 30s TTL); six provider call sites silently dropped a filter whose rendered value had the wrong shape and then queried unfiltered; a restricting template that rendered to nothing was indistinguishable from one never authored; and `inheritanceMode` was itself declared-and-unread.

  Additive throughout — a scope with no declaration behaves exactly as before, and no existing filter template needs an edit.

### Patch Changes

- 764d6f6: Fix three client-reported issues (search coverage, Configure App dialog, default-app provisioning):
  - **C3 — Search coverage:** decouple the per-entity fetch depth from the global `topK` budget in both `EntitySearchProvider` and `FullTextSearchProvider` (new tunable `PerEntityFetchDepth`, default 15), so multi-entity searches no longer starve individual entities of results. Also lower `MIN_TERM_LENGTH` from 3 to 2 across the engine and both providers so short queries (e.g. "US", "AI") are searchable.
  - **F1 — Configure App dialog glitch:** the `[(ShowDialog)]` setter now emits `ShowDialogChange`, so the app-switcher's flag round-trips correctly; the dialog resets its app lists on open/close and reloads the user's applications on a deferred microtask (avoids `ExpressionChangedAfterItHasBeenCheckedError`). Removed the redundant double-drive in the app switcher.
  - **F2 — Default-app provisioning (`Status = 'Active'` filter):** the JWT new-user provisioning path selected default applications with `DefaultForNewUser` but **without** the `Status = 'Active'` check that the client self-heal path already applied, so an inactive app flagged `DefaultForNewUser` could be provisioned onto new users there. Both paths now use a single shared selector, `UserInfoEngine.GetDefaultApplicationsForNewUser`, which filters to Active + `DefaultForNewUser` in `DefaultSequence` order — eliminating the drift.

- 408e4bf: Use `UUIDsEqual` instead of `===` when matching rendered constraints to their scope rows in `SearchEngine.buildLaneExplanations` (external-index, entity and storage-account lanes).

  PostgreSQL returns UUIDs lowercased where SQL Server returns them uppercased, so on a case mismatch the `find` returned `undefined` and the lane reported `RenderedFilter: null` — `ExplainScope` telling an admin a lane carries no filter when it does. Silent, and a wrong answer from the one feature whose purpose is answering that question. Also unbreaks the `Unit Tests` job on `next`, where the repo's `UUIDCompliance` gate flagged the three comparisons.

- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [c221553]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ai@5.50.0
  - @memberjunction/storage@5.50.0
  - @memberjunction/aiengine@5.50.0
  - @memberjunction/ai-vectordb@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- 15e3017: Add optional embedding dimensions, per-record Pinecone namespace routing, and scope-level provider config support.

  **`@memberjunction/ai`** — Add optional `dimensions` field to `EmbedTextParams`, `EmbedTextsParams`, and `EmbedContentParams`. When provided, overrides the model's native output dimension (only effective on models that support it, e.g. OpenAI `text-embedding-3-*`).

  **`@memberjunction/ai-openai`** — `OpenAIEmbedding.EmbedText` and `embedBatch` now forward `params.dimensions` to the OpenAI embeddings API when set.

  **`@memberjunction/ai-vectordb`** — Three additive changes to the vector DB abstraction layer:
  - `VectorRecord` gains an optional `providerTemporaryDirectives` field — an MJ-internal routing map set by ingestion and stripped before any external upsert.
  - `QueryParamsBase` gains an optional `providerConfig` field — an opaque blob sourced from the scope's rendered `ExternalIndexConfig`, threaded through to the driver at query time.
  - `VectorDBBase` gains a `BuildProviderDirectives(sourceRecord, providerConfig)` hook (default: returns `{}`) that drivers override to extract per-record routing values (e.g. namespace) from the raw source row.
  - `CreateRecord` and `CreateRecords` signatures gain an optional `providerConfig` parameter.

  **`@memberjunction/ai-vectors-pinecone`** — Full namespace routing support:
  - `BuildProviderDirectives` reads `providerConfig.namespaceField`, looks up that field on each source record, and returns `{ namespace: '<value>' }` so records are routed to the correct Pinecone namespace during ingestion.
  - `CreateRecords` groups a mixed batch by namespace and issues one `upsert` per distinct namespace; falls back to a single-namespace path when no per-record directives are present.
  - `QueryIndex` extracts `providerConfig.namespace`, calls `index.namespace(ns)` when present, and strips the field before passing params to the Pinecone SDK.
  - `providerTemporaryDirectives` is stripped from each `VectorRecord` before any upsert call.

  **`@memberjunction/ai-vector-sync`** — Sync pipeline now reads `VectorIndex.Dimensions` and `VectorIndex.ProviderConfig` and threads them through:
  - `Dimensions` is forwarded to `EmbedTexts` so the embedding model produces vectors at the configured size.
  - `ProviderConfig` (parsed from JSON) is forwarded to `upsertBatchToVectorDB`, which passes it to `BuildProviderDirectives` per record and to `CreateRecords`.
  - Metadata value storage is now type-aware: SQL numeric types (`int`, `float`, `decimal`, etc.) are stored as JS numbers; a new `storeAs` field config supports `'epochSeconds'` and `'epochMilliseconds'` for datetime columns, `'number'`, and `'boolean'`.

  **`@memberjunction/search-engine`** — `ExternalIndexConfig` on scope external-index rows is now treated as a Nunjucks template: it is rendered against the caller's `SearchContext` before being JSON-parsed. The rendered object (e.g. `{ namespace: '<orgId>' }`) is forwarded as `providerConfig` through `VectorSearchProvider.queryOneIndex` to the vector DB driver. `VectorIndex.Dimensions` is also forwarded to the query-time embedding call.

- 78a5e44: Vector sync: portable record IDs, minimal-metadata mode, and explicit-inclusion field fixes
  - **New `vectorIdStrategy` on `EntityDocumentConfiguration`** — `'hash'` (default, unchanged SHA-1 behavior) or `'recordId'`, which uses the source record's primary key value directly as the vector database ID. UUIDs are normalized to lowercase for SQL Server / PostgreSQL portability; composite PK values are joined with `||`; empty keys and IDs over the 512-byte provider limit fail loudly.
  - **New `fieldStrategy: 'explicit'`** — vector metadata contains EXACTLY the configured fields: the system-injected keys (`RecordID`, `Entity`, `TemplateID`) are omitted and `includeEntityIcon` / `includeUpdatedAt` flip to opt-in. Existing `'all'` / `'include'` / `'exclude'` strategies are byte-for-byte unchanged.
  - **Explicit inclusion now wins over type heuristics** — under `'include'` / `'explicit'`, fields listed with `included: true` are honored even when the implicit-eligibility filter would skip them (uniqueidentifiers, PKs, `__mj_*` fields). Only genuinely unstorable binary column types are refused, with a logged warning instead of a silent drop. Uniqueidentifier metadata values are normalized to lowercase so metadata filters behave identically across database platforms.
  - **SearchEngine `VectorSearchProvider`** — when a match's metadata omits the `Entity` key (e.g. indexes populated with `fieldStrategy: 'explicit'`), the provider now resolves a fallback entity name from the index's entity documents (cached per index, only when unambiguous) instead of labeling results `Unknown`. Record identity already falls back to the vector ID when `RecordID` metadata is absent.

  Note: switching an already-populated index to `vectorIdStrategy: 'recordId'` orphans vectors written under the old hashed IDs — purge or re-create the index (or use a fresh namespace) when changing strategy.

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [a9ec419]
- Updated dependencies [42a680a]
- Updated dependencies [1a15bd2]
- Updated dependencies [b52ffa8]
- Updated dependencies [85575cf]
- Updated dependencies [bc388e3]
- Updated dependencies [42fc86b]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [15e3017]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/ai@5.49.0
  - @memberjunction/ai-vectordb@5.49.0
  - @memberjunction/aiengine@5.49.0
  - @memberjunction/storage@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [c20723a]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/ai@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/aiengine@5.48.0
  - @memberjunction/ai-vectordb@5.48.0
  - @memberjunction/storage@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/aiengine@5.47.0
  - @memberjunction/ai-vectordb@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/storage@5.47.0
  - @memberjunction/ai@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/aiengine@5.46.0
  - @memberjunction/ai-vectordb@5.46.0
  - @memberjunction/storage@5.46.0
  - @memberjunction/ai@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/aiengine@5.45.1
- @memberjunction/ai@5.45.1
- @memberjunction/ai-vectordb@5.45.1
- @memberjunction/core@5.45.1
- @memberjunction/core-entities@5.45.1
- @memberjunction/global@5.45.1
- @memberjunction/storage@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/aiengine@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/ai-vectordb@5.45.0
  - @memberjunction/storage@5.45.0
  - @memberjunction/ai@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [3633fbb]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [89ea055]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [be5ab50]
- Updated dependencies [aa9102d]
- Updated dependencies [2f926df]
- Updated dependencies [863a10d]
- Updated dependencies [2f9b863]
  - @memberjunction/aiengine@5.44.0
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/ai@5.44.0
  - @memberjunction/ai-vectordb@5.44.0
  - @memberjunction/storage@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/ai@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/aiengine@5.43.0
  - @memberjunction/ai-vectordb@5.43.0
  - @memberjunction/storage@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [9b9b484]
- Updated dependencies [0c6bf61]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/core@5.42.0
  - @memberjunction/aiengine@5.42.0
  - @memberjunction/ai-vectordb@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/storage@5.42.0
  - @memberjunction/ai@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [2e48d1a]
- Updated dependencies [84089ae]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
- Updated dependencies [1568bae]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/ai@5.41.0
  - @memberjunction/aiengine@5.41.0
  - @memberjunction/ai-vectordb@5.41.0
  - @memberjunction/storage@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/ai@5.40.2
- @memberjunction/aiengine@5.40.2
- @memberjunction/ai-vectordb@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2
- @memberjunction/storage@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/aiengine@5.40.1
  - @memberjunction/ai-vectordb@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/storage@5.40.1
  - @memberjunction/ai@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/aiengine@5.40.0
  - @memberjunction/ai-vectordb@5.40.0
  - @memberjunction/storage@5.40.0
  - @memberjunction/ai@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- 7dfacc7: Add support for storing and querying embeddings inside the application's own database instead of a separate vector service. `VectorDBBase` gains an `IColocatedVectorHost` adapter (implemented by the PostgreSQL and SQL Server data providers) and a `ColocatedQuery` API; the new `PgVectorColocated` provider does vector + keyword (RRF) search in one statement, and the new `@memberjunction/ai-vectors-sqlserver` package adds a SQL Server 2025 native `VECTOR` provider with sibling-table and entity-column storage modes. `VectorSearchProvider` and `EntityVectorSyncer` route these indexes through the borrowed connection.
- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [7dfacc7]
- Updated dependencies [3c53858]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/ai-vectordb@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ai@5.39.0
  - @memberjunction/aiengine@5.39.0
  - @memberjunction/storage@5.39.0

## 5.38.0

### Patch Changes

- 6a3ac36: Fix AllowUpdateAPI clearing when EntityField transitions to virtual, use subqueries for organic key INSERTs for portable SQL, prevent permanent engine failure when MJAPI is temporarily unavailable, and centralize RLS exemption check in GetUserRowLevelSecurityWhereClause
- Updated dependencies [6b6c321]
- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/aiengine@5.38.0
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/ai-vectordb@5.38.0
  - @memberjunction/storage@5.38.0
  - @memberjunction/ai@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/aiengine@5.37.0
  - @memberjunction/ai-vectordb@5.37.0
  - @memberjunction/storage@5.37.0
  - @memberjunction/ai@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/aiengine@5.36.0
  - @memberjunction/storage@5.36.0
  - @memberjunction/ai-vectordb@5.36.0
  - @memberjunction/ai@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/aiengine@5.35.0
  - @memberjunction/ai-vectordb@5.35.0
  - @memberjunction/storage@5.35.0
  - @memberjunction/ai@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/aiengine@5.34.1
  - @memberjunction/ai-vectordb@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/storage@5.34.1
  - @memberjunction/ai@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Minor Changes

- ae5cfbd: Search Scopes & RAG+ — multi-phase ship

  A bundled feature release across the search pipeline (Phases 2A–6 of
  the Search Scopes & RAG+ initiative). Highlights:

  **SearchEngine pipeline**
  - New `SimpleVectorDatabase` in-process driver — points
    `VectorDBBase` at any entity column with an `EmbeddingVector`
    field. Suitable for dev / agent-memory / small-medium corpora.
    Constructor accepts an empty/missing API key (in-process driver
    has no remote auth target).
  - `VectorDBBase.QueryIndex(params, contextUser?)` — `contextUser`
    is now a proper second parameter instead of being smuggled
    through `filter.__contextUser`. Pinecone/Qdrant/pgvector ignore
    it (they auth via API key); in-process drivers use it for
    RunView's server-side RLS guard. Method-level pattern matches
    MJ's `RunView(params, contextUser)` and `GetEntityObject(name,
contextUser)` conventions.
  - `SearchFusion` — multi-provider score evidence is now preserved
    through RRF. Previously the second provider's `ScoreBreakdown`
    contribution was silently dropped when the same RecordID
    appeared in two provider lists, causing the merged item to
    rank below single-provider hits. Records that match in
    Vector + Entity now carry both contributions and rank
    correctly.
  - Defensive sanitation in `Fuse()` — items with non-finite Score
    (NaN, Infinity), empty/non-string RecordID, or null payloads are
    filtered before fusion. Closes a class of failure modes from
    misbehaving 3rd-party providers.
  - Tier-1 input edge cases hardened — null/undefined/non-string
    Query no longer TypeErrors, surfaces a clean Failure result.
    `EntitySearchProvider` now strips SQL LIKE wildcards (`%`, `_`,
    `[`, `]`) from user input — `Query="%"` no longer matches every
    row through the LIKE-injection vector.
  - Streaming search — `SearchEngine.streamSearch()` v2 emits
    provider events as soon as each provider promise settles
    (concurrent emission), not in registration order.

  **Permission gate (Phase 2A)**
  - `SearchScopePermissionResolver` enforces a 6-step decision tree:
    AgentNone → AgentAssignedNotListed → DirectGrant → RoleGrant →
    AgentUnscopedAll → NoGrant.
  - `AIAgent.SearchScopeAccess` enum (`'None' | 'All' | 'Assigned'`)
    controls agent-side fallback when no per-user/per-role grant
    applies. `BypassCache` propagates through the dedup-linger cache
    so freshly-revoked grants take effect immediately.
  - New tests + agent scenarios cover all 13 permission-matrix cells
    (PM-01..PM-13).

  **Reranker catalog (Phase 2D)**
  - 4 reranker drivers — Cohere, Voyage, OpenAI judge, BGE local —
    all with `@RegisterClass(BaseReRanker, ...)`. Per-search
    `RerankerBudgetGuard` caps API spend; `EstimateCostCents` and
    `CostReporter` per driver. Graceful degradation when the
    upstream SDK rejects/times out/returns malformed responses.

  **Observability (Phase 3)**
  - `MJSearchExecutionLog` — every `Search()` invocation writes one
    row with Status / ResultCount / TotalDurationMs / RerankerCostCents
    / ProvidersJSON (per-source hit counts) / AIAgentID attribution.
    Forbidden gate decisions log `Status='Forbidden'` rows.
  - Knowledge Hub Config dashboard subtab visualizes the log:
    hit-rate, p50/p95 latency, top failure reasons, top users, total
    reranker cost.

  **External providers (Phase 5)**
  - 4 search providers — Elasticsearch, Typesense, Azure AI Search,
    OpenSearch — all with `@RegisterClass(BaseSearchProvider, ...)`.
  - New `AvailableSearchProviders` GraphQL query exposes the
    `BaseSearchProvider.GetAvailableProviders()` runtime catalog to
    the SearchScope form's provider dropdown (P5.5).

  **Angular / UI**
  - Custom `MJSearchScopeFormComponentExtended` (P2D.7 / P4) — fusion
    weights sliders, reranker dropdown, live-preview panel, A/B
    Kendall-tau similarity, CSV export of last 500 invocations.
  - Custom `MJSearchScopeProviderFormComponentExtended` (P5.5) —
    provider dropdown sourced from `MJ: Search Providers` rows,
    annotated with whether each provider's DriverClass is currently
    registered with the server's ClassFactory.
  - Streaming search consumer in `SearchService.StreamSearch()` —
    Angular Observable surface for the `StreamScopedSearch`
    mutation + `SearchStreamEvents` subscription.

  **Migration**
  - `V202605081416__v5.34.x__Search_Scopes_And_RAG_Plus.sql` —
    consolidated. Contains six DDL sections (Phase 1 baseline,
    `SearchScopePermission`, `SearchScope.RerankerBudgetCents`,
    `SearchExecutionLog`, `SearchScopeTestQuery`, unique-constraint
    fix) followed by five CodeGen runs that regenerate the entity
    metadata, sprocs, views, and permission grants for all of the
    above.

  **Test suite**
  - 17 end-to-end agent scenarios (s01–s17) under `agent-scenarios/`,
    driving real LLM tool-calls (Sage agent) against the SearchEngine
    - multi-provider RRF + reranker pipeline. 95 assertions; all PASS.
  - `@memberjunction/search-engine` vitest: 237 unit tests across 21
    files, all PASS. Covers fusion, providers (real + external),
    rerankers, scope template renderer, parent-ID metadata,
    streaming, permission resolver, edge cases, mid-flight failures.

  **Documentation**
  - `guides/SEARCH_SCOPES_AND_RAG_GUIDE.md` — comprehensive guide
    covering scope creation, agent integration, permission resolution,
    multi-scope fusion, reranker catalog, observability, external
    providers, how-to templates for adding a new provider /
    reranker / artifact tool library / vector index over an
    embedded entity column. Documents the embedding-regeneration
    contract for ops.

  See `RAG_plan.md` for the full multi-phase plan and `plans/
search-scopes-rag-plus/what-we-built.md` for the customer-facing
  summary.

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/aiengine@5.34.0
  - @memberjunction/ai-vectordb@5.34.0
  - @memberjunction/storage@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0
  - @memberjunction/ai@5.34.0

## 5.33.0

### Minor Changes

- 7e4957d: Universal search performance + correctness fix: honor `EntityField.UserSearchPredicateAPI`, escape LIKE metacharacters, add resilience layer, and stop CodeGen from re-introducing invalid search flags.

  **Why:** `LIKE '%term%'` was the only SQL the data provider ever generated for non-FTX entities, regardless of the configured predicate. CodeGen has been populating `UserSearchPredicateAPI` (Exact / BeginsWith / EndsWith / Contains) for months, but the runtime was discarding it. Combined with primary keys, non-text columns, and `nvarchar(MAX)` columns being auto-flagged as searchable, every keystroke against the global search box produced unindexed scans across tables of arbitrary size.

  **`@memberjunction/generic-database-provider`** — `GenericDatabaseProvider.createViewUserSearchSQL` now:
  - Honors `UserSearchPredicateAPI`: `Exact` emits `= N'term'` (index-seekable), `BeginsWith` emits `LIKE N'term%' ESCAPE '\'` (index-seekable), `EndsWith` emits `LIKE N'%term' ESCAPE '\'`, and the default `Contains` emits `LIKE N'%term%' ESCAPE '\'`. `UserSearchParamFormatAPI` still wins when set.
  - Escapes LIKE metacharacters (`%`, `_`, `[`, `]`, `\`) in user input with `ESCAPE '\'`. Previously a query of `50%` was treated as a wildcard.
  - Skips fields that aren't sensible text-search targets (non-text types; unbounded text on non-FTX entities) so an OR'd OR-predicate isn't built around an implicit per-row CONVERT.
  - Emits `N''` Unicode literals throughout to avoid collation surprises.

  **`@memberjunction/core`** — adds `EntityFieldInfo.UserSearchPredicateAPI: string` so consumers see the value the runtime now honors. Default `'Contains'`.

  **`@memberjunction/search-engine`** — Resilience layer:
  - `EntitySearchProvider`, `FullTextSearchProvider`, and `SearchEngine.Search` reject queries shorter than 3 characters early — these always fan out to full-database scans across every searchable entity.
  - `EntitySearchProvider` wraps each per-entity RunView in a 5-second hard timeout. A slow entity no longer holds up the whole fan-out; the other entities' results still land for the user. The underlying SQL keeps running on the server until it finishes (Request cancellation is a follow-up).
  - `SearchEngine.Search` has an in-process LRU result cache keyed by `(userID, query, MaxResults, MinScore, Filters)` with a 30s TTL and 500-entry cap. Preview-mode searches skip the cache. New `ClearResultCache()` admin/test hook.

  **`@memberjunction/codegen-lib`** — CodeGen guardrails so the metadata stays clean:
  - `applySearchableFieldUpdates` now refuses to set `IncludeInUserSearchAPI = 1` on primary keys, non-text columns, or unbounded text columns whose parent entity has `FullTextSearchEnabled = 0`. The LLM can still propose them; CodeGen drops the proposal silently.
  - `applyEntitySearchConfig` refuses to flip `AllowUserSearchAPI` from `0` to `1` on entities whose names match log/audit/run-history patterns (`*Logs`, `*Audit*`, `*Record Changes`, `*Runs`, `*Run Steps/Messages/History`, `*Execution Logs`). It still allows the LLM to _disable_ search on any entity.

  **Migrations (run via Flyway in the same release):**
  - `migrations/v5/V202605041250__v5.33.x__Search_Hygiene_For_Mj_Schema_And_Field_Types.sql` — disables `AllowUserSearchAPI` on 40 `__mj` log / audit / run-history / snapshot entities (Record Changes, Audit Logs, AI Agent + Prompt Runs, Company Integration Runs/Details/API Logs, Error Logs, Action Execution Logs, Test/Workflow/Recommendation/Scheduled/Duplicate Runs, User View Runs/Details, Report Snapshots, Archive Runs/Details, etc.) and clears `IncludeInUserSearchAPI` on PKs, non-text columns, and non-FTX unbounded text columns system-wide. Freezes the corresponding `AutoUpdate*` flags so CodeGen doesn't re-promote any of these silently.
  - `migrations/v5/V202605041300__v5.33.x__EntityField_UserSearchPredicateAPI_Check_Constraint.sql` — adds a trusted CHECK constraint enforcing the four documented values. Defensively normalizes any out-of-band rows to `'Contains'` first.

  **Behavior change to call out:** any caller that previously relied on `%` or `_` in a `UserSearchString` being interpreted as a SQL wildcard will now match those characters literally. There were no such known callers in the MJ ecosystem; this aligns the runtime with the documented contract.

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/aiengine@5.33.0
  - @memberjunction/ai-vectordb@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/storage@5.33.0
  - @memberjunction/ai@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/aiengine@5.32.0
  - @memberjunction/ai-vectordb@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/storage@5.32.0
  - @memberjunction/ai@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [84494bb]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/ai@5.31.0
  - @memberjunction/aiengine@5.31.0
  - @memberjunction/ai-vectordb@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/storage@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai@5.30.1
- @memberjunction/aiengine@5.30.1
- @memberjunction/ai-vectordb@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/storage@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/aiengine@5.30.0
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/storage@5.30.0
  - @memberjunction/ai-vectordb@5.30.0
  - @memberjunction/ai@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/aiengine@5.29.0
  - @memberjunction/ai-vectordb@5.29.0
  - @memberjunction/storage@5.29.0
  - @memberjunction/ai@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/aiengine@5.28.0
  - @memberjunction/ai-vectordb@5.28.0
  - @memberjunction/storage@5.28.0
  - @memberjunction/ai@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ai@5.27.1
  - @memberjunction/aiengine@5.27.1
  - @memberjunction/ai-vectordb@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/storage@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/ai@5.27.0
- @memberjunction/aiengine@5.27.0
- @memberjunction/ai-vectordb@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/global@5.27.0
- @memberjunction/storage@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/aiengine@5.26.0
  - @memberjunction/storage@5.26.0
  - @memberjunction/ai-vectordb@5.26.0
  - @memberjunction/ai@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Minor Changes

- e96f683: migration/metadata

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/aiengine@5.25.0
  - @memberjunction/ai-vectordb@5.25.0
  - @memberjunction/storage@5.25.0
  - @memberjunction/ai@5.25.0
  - @memberjunction/global@5.25.0
