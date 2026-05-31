# @memberjunction/tag-engine-base

## 5.38.0

### Patch Changes

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
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
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

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/core-entities@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Minor Changes

- fc8b9b8: Autotagger scope & governance — per-tenant tag scoping, per-tag governance, persisted embeddings, suggestion queue, Tag Health, and a unified Tag Governance dashboard with full UI.

  **Schema (one additive migration `V202605010846`)** — 9 new columns on `__mj.Tag` (governance + persisted embedding cache), three new tables (`__mj.TagScope` polymorphic M2M, `__mj.TagSynonym`, `__mj.TagSuggestion` review queue). Existing rows default to `IsGlobal=1` so behavior is unchanged out of the box. `IContentSourceConfiguration` JSON type extended with five net-new optional knobs (`SuggestThreshold`, `MaxNewTagsPerRun`, `MaxNewTagsPerItem`, `MaxTokensPerRun`, `MaxCostPerRun`) — CodeGen emits the typed accessor.

  **Engine (`tag-engine` / `tag-engine-base` / `core-entities-server`)** — `MJTagEntityServer` + new `MJTagScopeEntityServer` enforce the `IsGlobal ⊕ TagScope` invariant via `ValidateAsync` (no DB triggers); persisted-embedding `Save()` hook + cold-start hydrate path replace the every-startup recompute. `TagEngineBase` eagerly loads scope + synonyms in `Config()` and exposes `GetVisibleTags / GetTagBySynonym / GetTagByName(name, ctx) / GetTaxonomyTree(rootID, ctx)`. New `TagScopeFilterBuilder` (`BaseSingleton`) produces SQL fragments + in-memory predicates + child-scope subset validator. `TagEngine.ResolveTag` widened with a `'hybrid'` mode and a `ResolveTagOptions` parameter — new 4+1-tier pipeline (synonym → exact → fuzzy → semantic with tiered confidence routing → governance-gated `handleNoMatch`). `SuggestThreshold` band routes to the suggestion queue; `createAndEmbedTag` snapshots parent scope onto new children when parent is non-global. `TagGovernanceEngine` adds `ValidateAutoGrow / EnqueueSuggestion / PromoteSuggestion / RejectSuggestion`; `MergeTags` carries source synonyms (`Source='Merged'`). New `TagHealthJob` with three idempotent emitters (merge / low-usage / wide-node), gated by `MJ_AUTOTAG_RUN_TAG_HEALTH=1` env or invokable on demand. New `TagEngine.RebuildTagEmbeddings(contextUser)` utility for post-model-change rebuilds.

  **Autotag pipeline (`content-autotagging`)** — `ScopeContextResolver` derives per-source scope from `TagRootID`, `RunBudget` enforces per-run + per-item caps, new `OnAfterBatch` hook on `AutotagBaseEngine` gracefully pauses runs via the existing `CancellationRequested` machinery. `BridgeContentItemTagToTaxonomy` threads `scopeContext`, `SuggestThreshold`, source traceability, and an `onTagCreated` callback into `ResolveTag`. Per-item budget exhaustion collapses the effective mode to `hybrid` so further new tags route to suggestions instead of being auto-created.

  **Server (`server` / `graphql-dataprovider`)** — new `TagGovernanceResolver` exposes `PromoteTagSuggestion` / `RejectTagSuggestion` / `RebuildTagEmbeddings` / `RunTagHealth` mutations so suggestion dispositions run transactionally on the server. Matching `GraphQLAIClient` methods + result interfaces.

  **UI (`ng-dashboards` / `ng-core-entity-forms`)** — new `TagGovernanceResourceComponent` (registered as `'TagGovernance'`) — single dashboard with **left-nav** (top nav stays with the MJExplorer shell). Three sections built to the picked mockup options: Taxonomy (Option A — tree + governance/scope/synonyms detail-form, scope dialog with parent-subset validation), Suggestions (Option C — table + drawer with bulk actions and "if approved" preview), Tag Health (Option A — three summary cards + threshold tuning + run history + Rebuild stale embeddings). `MJContentSourceFormComponentExtended` gains a "Tag Pipeline Configuration" panel (Option B dense form) with mode picker cards, threshold sliders that auto-keep `SuggestThreshold < MatchThreshold`, scope+root, and budget fields — the existing JSON code editor stays available collapsed below as the advanced override. Multi-provider safe + UUID-compliant throughout.

  **Tests** — 271 tests across the impacted packages, all green. New: 12 `TagScopeFilterBuilder`, 8 `ValidateAutoGrow`, 4 `TagHealthJob`, 7 `RunBudget`, 8 `ScopeContextResolver`, 18 `TagGovernanceResolver`, 18 `TagGovernance` dashboard, 23 `ContentSource` form (vitest newly enabled in `ng-core-entity-forms`).

  **Documentation** — `guides/TAXONOMY_TAGGING_GUIDE.md` (~730 lines, 7 Mermaid diagrams) covers the entity model, autotag pipeline, 4+1-tier resolver, taxonomy modes, governance gates, scope inheritance, suggestion lifecycle, worked implementation guides, seeding patterns, and ops guidance. `guides/BASE_ENTITY_SERVER_PATTERNS.md` captures the persisted-embedding + `ValidateAsync` invariant + FK-cleanup-before-delete patterns this PR introduces so future agents lift the recipe rather than re-discover it. `mockups/knowledge-hub-classify-redesign/` ships 12 polished HTML mockups (3 options each across the 3 high-priority surfaces) that drove the UX direction.

  Migration ordering: apply the SQL migration → run CodeGen → `mj sync push` for the JSON-type interface → build. The migration is additive and idempotent against `IsGlobal=1` defaults; existing customers see no behavior change until they opt in by setting per-tag governance flags or moving sources off the default `auto-grow` mode.

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Minor Changes

- c318a0c: metadata + migrations in this PR == minor

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/global@5.24.0
