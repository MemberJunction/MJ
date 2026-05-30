# Autotagger Scope & Governance — Unified Implementation Plan

**Status:** ✅ **COMPLETE** — schema + engine + autotag pipeline integration + Tag Health + governance resolvers + unified Tags dashboard (Overview / Taxonomy / Suggestions / Health) + ContentSource form + tests. Shipped on PR #2500 across the commit range `a9b2db342a..b3ae2534c9`.
**Branch:** `claude/autotagger-scope-and-governance-plan`
**Owner:** unassigned
**Estimated total work:** 8–12 dev-days for engine; UI parallelizable after schema lands

## Final scope shipped beyond the original plan

The plan called for an Suggestion Inbox component and deferred the deeper UX. Final delivery exceeded that:
- Standalone `TagGovernanceResourceComponent` was built first as a separate Knowledge Hub dashboard, then — after UX review with mockups in `mockups/knowledge-hub-classify-redesign/` — folded into a unified **`TagsResourceComponent`** that absorbs Tag Library + Taxonomy from the existing Classify dashboard plus adds Suggestions + Health.
- Existing Classify dashboard slimmed to its run-management surface only (Pipeline / Sources / Content Types / Run History). Tag Library + Taxonomy nav items removed.
- Duplicates and Orphans sub-tabs in Taxonomy switched from client-side string-similarity / zero-usage detection to **server-driven** data flowing from `MJ:Tag Suggestions` populated by `TagHealthJob` (Reason='MergeCandidate' / Reason='LowUsage'). Same UI; better signal.
- ContentSource form gained an Option-B dense Tag Pipeline Configuration panel for the typed JSON knobs (mode picker, threshold sliders with auto-pin, scope+root, budgets).
- Two new guides shipped: `guides/TAXONOMY_TAGGING_GUIDE.md` (~730 lines, 7 Mermaid diagrams) and `guides/BASE_ENTITY_SERVER_PATTERNS.md` (captures the persisted-embedding + ValidateAsync invariant + FK-cleanup-before-delete patterns this PR introduced).

## Implementation status (2026-05-01)

| Phase | Status | Notes |
|---|---|---|
| 1a — Schema migration + CodeGen | ✅ done | `V202605010846__v5.31.x__Autotagger_Scope_And_Governance.sql` applied; CodeGen produced entity classes for `MJ:Tags` (governance + embedding fields), `MJ:Tag Scopes`, `MJ:Tag Synonyms`, `MJ:Tag Suggestions`. |
| 1b — IContentSourceConfiguration extensions | ✅ done | Added `SuggestThreshold`, `MaxNewTagsPerRun`, `MaxNewTagsPerItem`, `MaxTokensPerRun`, `MaxCostPerRun` to the typed JSON interface. |
| 1c.1 — Save() invariant + persisted embeddings | ✅ done | `MJTagEntityServer.ValidateAsync` enforces IsGlobal⊕TagScope; `MJTagScopeEntityServer` enforces inverse. Embedding refresh via `EmbedTextLocal` + persisted `EmbeddingVector` / `EmbeddingModelID`. `RebuildTagEmbeddings` utility added; `refreshTagEmbeddings` hydrates from persisted cache. |
| 1c.2 — TagScopeContext + TagScopeFilterBuilder | ✅ done | BaseSingleton in TagEngineBase; SQL + in-memory predicates + child-scope subset validator. |
| 1c.3 — TagEngineBase scope-aware accessors | ✅ done | `GetVisibleTags`, scope-overload of `GetTagByName`/`GetTaxonomyTree`, `GetScopesForTag`. |
| 1c.4 — Synonym lookup | ✅ done | `GetTagBySynonym`, lazy synonym index loaded in `Config()` from `MJ:Tag Synonyms`. |
| 1c.5 — Governance methods | ✅ done | `ValidateAutoGrow`, `EnqueueSuggestion`, `PromoteSuggestion`, `RejectSuggestion`. `MergeTags` carries source synonyms (Source='Merged'). |
| 1c.6 — ResolveTag extensions | ✅ done | Synonym tier added before exact; scope threaded through every tier; tiered confidence routing (`SuggestThreshold` band → enqueue suggestion, return null); `handleNoMatch` calls `ValidateAutoGrow`; `createAndEmbedTag` inherits parent scope. |
| 1d — Autotag engine integration | ✅ done | `ScopeContextResolver` derives per-source scope; `RunBudget` enforces per-run + per-item caps; `OnAfterBatch` hook pauses run via `CancellationRequested`. |
| 1e — Tag Health emitters | ✅ done | `TagHealthJob` with merge / low-usage / wide-node passes; gated by `MJ_AUTOTAG_RUN_TAG_HEALTH=1` env. |
| 1f — UI — Suggestion Inbox | ✅ done (minimal) | `TagSuggestionInboxResourceComponent` registered as `'TagSuggestionInbox'`. Lists pending suggestions, supports Accept-as-new / Merge / Reject, single + bulk. Note: UI marks suggestions as Approved/Merged/Rejected directly; full server-side `PromoteSuggestion` GraphQL resolver is the natural next step (TagGovernanceEngine is ready). |
| 1f — UI — KH facet scope filter | ⏭ deferred | Defer to UX redesign (mockups produced separately). |
| 1f — UI — Taxonomy admin governance/scope/synonym editors + badges | ⏭ deferred | Defer to UX redesign (mockups produced separately). |
| 1f — UI — ContentSource custom form for typed JSON knobs | ⏭ deferred | CodeGen-generated JSON-blob form already shows the new fields; a structured custom override (sliders, mode radios, scope picker) is part of the UX redesign. |
| Unit tests | ✅ done | 12 new tests for `TagScopeFilterBuilder` (TagEngineBase), 8 for `ValidateAutoGrow`, 4 for `TagHealthJob`, 7 for `RunBudget`, 8 for `ScopeContextResolver`. All target packages green. |
| Full repo build | ✅ green for impacted packages | TagEngineBase, TagEngine, ContentAutotagging, MJCoreEntitiesServer all build cleanly. Pre-existing failures in DatabaseDesigner/actions and dashboards/DataExplorer are unrelated to this work. |
| Full repo unit tests | ✅ green for impacted packages | TagEngineBase 34/34, TagEngine 64/64, ContentAutotagging 114/114. Pre-existing GITHUB_TOKEN test in `@memberjunction/installer` is environmental and unrelated. |
| UX mockup set | 🟡 in progress | Background sub-agent producing `mockups/knowledge-hub-classify-redesign/` with 3 options per major surface for human review. Will commit/push only that directory. |

---

## 1. Goal

Add per-tenant / per-context customization to the autotagger pipeline so customers can pick any of these postures along a spectrum:

- Totally static curated taxonomy (no auto-creation)
- Totally free-form (auto-create at will)
- Auto-match-when-similar with configurable thresholds
- Frozen subtrees inside an otherwise open taxonomy
- Bounded breadth/depth on auto-grow
- Volume / cost budgets per run
- Per-tenant narrowing of the visible taxonomy (multi-tenant scope)

All of the above must be configurable per ContentSource and per Tag, with a human-in-the-loop suggestion queue for ambiguous or governance-blocked tags.

---

## 2. Scope

**In scope (this plan):**
- One additive schema migration (Tag governance + embedding columns; new `TagScope`, `TagSynonym`, `TagSuggestion` tables).
- Strong-type extension of `IContentSourceConfiguration` for net-new autotagger knobs (taxonomy mode etc. stay in JSON; CodeGen emits the typed accessor).
- Tag engine extensions: persisted embeddings, scope-filtered visibility, per-node governance enforcement, synonym lookup.
- Autotag engine governance hook + budget enforcement + tiered confidence routing.
- Tag Health emitter that writes to the suggestion queue (merge / low-usage / wide-node candidates).
- UI consumer updates (filter facet, taxonomy admin, suggestion inbox).

**Out of scope:**
- Multi-tenant authentication beyond what already exists.
- New AI model integrations.
- Net-new Knowledge Hub features unrelated to scoping.

---

## 3. Background — what already exists in MJ

The autotagger is more mature than a casual reading suggests. Verified in this investigation:

- **Dual storage on `MJ:Content Item Tags`:** `Tag` (free text) + `TagID` (nullable FK to `MJ:Tags`) is already present. The dual-storage mechanism the plan needs is in place.
- **Taxonomy mode is enforced** at [packages/ContentAutotagging/src/Entity/generic/AutotagEntity.ts:168](../../packages/ContentAutotagging/src/Entity/generic/AutotagEntity.ts#L168). Reads `MJContentSourceEntity_IContentSourceConfiguration.TagTaxonomyMode` from the `Configuration` JSON blob, branches on `'constrained' | 'auto-grow' | 'free-flow'`.
- **4-tier match pipeline exists** in [packages/AI/Knowledge/TagEngine/src/TagEngine.ts](../../packages/AI/Knowledge/TagEngine/src/TagEngine.ts) lines 385–647: exact (`GetTagByName`) → fuzzy (plural/hyphen normalization) → semantic (`SimpleVectorService.FindNearest` cosine + threshold + optional `subtreeFilter` at line 541) → mode-based creation via `handleNoMatch` (612) and `createAndEmbedTag` (636).
- **Tag embeddings are computed on startup** via `refreshTagEmbeddings` ([TagEngine.ts:186-215](../../packages/AI/Knowledge/TagEngine/src/TagEngine.ts#L186-L215)) into an in-memory `SimpleVectorService<TagEmbeddingMetadata>`. Not persisted today — recomputed every cold start.
- **Governance ops exist** in [packages/AI/Knowledge/TagEngine/src/TagGovernanceEngine.ts](../../packages/AI/Knowledge/TagEngine/src/TagGovernanceEngine.ts): `MergeTags`, `SplitTag`, `MoveTag`, `RenameTag`, `DeprecateTag`, `ReactivateTag`, `DeleteTag`. All wired to `MJ:Tag Audit Logs` via `createAuditEntry()` (line 409).
- **Co-occurrence is populated** by [packages/AI/Knowledge/TagEngine/src/TagCoOccurrenceEngine.ts](../../packages/AI/Knowledge/TagEngine/src/TagCoOccurrenceEngine.ts), invoked from the autotag pipeline post-run at [AutotagBaseEngine.ts:218](../../packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts#L218) (`recomputeCoOccurrenceIfAvailable`, impl at line 1728). Discovered via ClassFactory so the autotag engine has no hard dep.
- **Plugin point for governance hooks** is the `OnContentItemTagSaved` callback ([AutotagBaseEngine.ts:384-401](../../packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts#L384-L401), declared at 766, invoked at 807-809). Already used to bridge `ContentItemTag` → `Tag` + `TaggedItem`.
- **AI Agent Notes scoping precedent**: `PrimaryScopeEntityID` + `PrimaryScopeRecordID` + `SecondaryScopes`. Scope filter assembly lives in [packages/AI/Agents/src/agent-context-injector.ts:282-401](../../packages/AI/Agents/src/agent-context-injector.ts#L282-L401). Tightly coupled to notes today; we will pattern, not extract, in this phase.
- **Embedding storage precedent**: `MJAIAgentNoteEntity.EmbeddingVector` is `nvarchar(MAX)` JSON-encoded array + `EmbeddingModelID` FK, refreshed in a `Save()` hook at [packages/MJCoreEntitiesServer/src/custom/MJAIAgentNoteEntityServer.server.ts:25-59](../../packages/MJCoreEntitiesServer/src/custom/MJAIAgentNoteEntityServer.server.ts#L25-L59). We mirror this for `MJ:Tags` exactly.
- **Strong-typed JSON config**: `IContentSourceConfiguration` lives at [metadata/entities/JSONType-interfaces/IContentSourceConfiguration.ts](../../metadata/entities/JSONType-interfaces/IContentSourceConfiguration.ts). CodeGen reads this and emits a typed getter on `MJContentSourceEntity` named `_IContentSourceConfiguration`. Net-new autotagger knobs go here, not into new SQL columns.
- **Migration conventions**: see [migrations/CLAUDE.md](migrations/CLAUDE.md). Latest pre-existing migration: `V202604292210__v5.31.x__Create_UDT_Schema.sql`.

**Implication:** What looked like "implement" is mostly "extend." The schema add is small and additive; the engine work is hooking governance + scope filtering + persisted embeddings into existing infrastructure.

---

## 4. Design decisions (locked)

1. **Polymorphic `MJ:Tag Scopes` junction table** — M2M between Tag and any (EntityID, RecordID) scope record. Same shape as the polymorphic `MJ:Tagged Items` table.
2. **`Tag.IsGlobal` is exclusive of `TagScope` rows** — enforced in `Save()` overrides on both entity classes (not via DB triggers). Existing rows default to `IsGlobal=1` via the column DEFAULT (zero behavior change).
3. **Children inherit parent scope by default**; cannot widen past parent. Promotion to global is admin-only.
4. **Autotagger configuration knobs stay in `ContentSource.Configuration` JSON.** Net-new fields (`SuggestThreshold`, `MaxNewTagsPerRun`, `MaxNewTagsPerItem`, `MaxTokensPerRun`, `MaxCostPerRun`) are added to the `IContentSourceConfiguration` TypeScript interface; CodeGen emits the typed accessor automatically. No SQL columns, no migration churn, no dual-read fallback path.
5. **Per-Tag governance fields:** `IsGlobal`, `AllowAutoGrow`, `IsFrozen`, `MaxChildren`, `MaxDescendantDepth`, `MinWeight`, `RequiresReview`.
6. **`MJ:Tag Suggestions` is the single human-in-the-loop surface** — fed by classifier governance failures, ambiguous similarity, and Tag Health analytics.
7. **`MJ:Tag Synonyms` consulted before any new-tag creation.**
8. **Tiered thresholds**: `MatchThreshold` for auto-match, `SuggestThreshold` for review-queue routing.
9. **Per-tag embedding cache** modeled on `MJ:AI Agent Notes.EmbeddingVector`: `nvarchar(MAX)` JSON-encoded array + `EmbeddingModelID` FK + `Save()` hook. Persisting (not recomputing every cold start) is what makes review-queue scores stable across server restarts — important once a reviewer is comparing the score that triggered a suggestion against the score they see today.
10. **Volume budgets pause runs, do not fail them.** Reuse existing `CancellationRequested` / `LastProcessedOffset` resume machinery.
11. **Scope-builder lives in `TagEngineBase` for now**, NOT extracted to shared infra. After both AI Agent Notes and Tags ship and stabilize, refactor into `packages/MJCore/src/scoping/` in a separate PR.
12. **Cross-table invariant enforcement uses entity `Save()` overrides, NOT DB triggers.** Cleaner errors, multi-provider safe, no SQL trigger debugging. The UNIQUE constraint on `TagScope (TagID, ScopeEntityID, ScopeRecordID)` is the only DB-level guard.

---

## 5. Phase 1 — Unified Implementation

Sub-phases are part of one PR, executed in dependency order. Sub-phases land in separate commits.

### Phase 1a — Schema + CodeGen (HUMAN-RUN STEP) *(low risk; ~0.5 day)*

A single migration is already drafted at `migrations/v5/V202605010846__v5.31.x__Autotagger_Scope_And_Governance.sql`. The human runs it + CodeGen before any further work proceeds, because every later sub-phase depends on the generated entity classes.

**What the migration does (no further code changes required for 1a):**

1. `ALTER TABLE __mj.Tag ADD` — 9 columns in one statement:
   - Governance (7): `IsGlobal` (BIT, DEFAULT 1 — sets all existing rows to global), `AllowAutoGrow` (BIT, DEFAULT 1), `IsFrozen` (BIT, DEFAULT 0), `MaxChildren` (INT NULL), `MaxDescendantDepth` (INT NULL), `MinWeight` (DECIMAL(3,2) NULL), `RequiresReview` (BIT, DEFAULT 0).
   - Embedding cache (2): `EmbeddingVector` (NVARCHAR(MAX) NULL), `EmbeddingModelID` (UNIQUEIDENTIFIER NULL FK → AIModel(ID)).
2. `CREATE TABLE __mj.TagScope` — polymorphic M2M with composite scope-lookup index.
3. `CREATE TABLE __mj.TagSynonym` — alternate names with `Source` CHECK.
4. `CREATE TABLE __mj.TagSuggestion` — review queue, `Status` CHECK, `Reason` left free-form for extensibility.
5. `sp_addextendedproperty` for the table + every new column.

No FK indexes, no `__mj_*` timestamp columns, no view/sproc/EntityField inserts — CodeGen owns all of those.

#### Phase 1a checklist

- [x] **1a.1** Confirm latest migration timestamp, draft monotonic timestamp `V202605010846`.
- [x] **1a.2** Write the consolidated migration.
- [ ] **1a.3** **HUMAN STEP**: apply migration to dev DB. Spot-check:
  - [ ] `SELECT COUNT(*) FROM __mj.Tag WHERE IsGlobal = 1` equals total tag count.
  - [ ] `SELECT * FROM sys.tables WHERE name IN ('TagScope','TagSynonym','TagSuggestion')` returns 3 rows.
  - [ ] `SELECT * FROM __mj.TagSuggestion` and the other new tables work without error.
- [ ] **1a.4** **HUMAN STEP**: run CodeGen.
  - [ ] Confirm a new `CodeGen_Run_*.sql` migration is generated with Entity / EntityField / EntityFieldValue rows.
  - [ ] Confirm `packages/MJCoreEntities/src/generated/entity_subclasses.ts` contains `TagScopeEntity`, `TagSynonymEntity`, `TagSuggestionEntity`.
  - [ ] Confirm `TagEntity` has new fields: `IsGlobal`, `AllowAutoGrow`, `IsFrozen`, `MaxChildren`, `MaxDescendantDepth`, `MinWeight`, `RequiresReview`, `EmbeddingVector`, `EmbeddingModelID`.

### Phase 1b — Strong-typed Configuration extensions *(trivial; ~0.25 day)*

Extend `IContentSourceConfiguration` so the autotagger can read the new knobs through the typed `_IContentSourceConfiguration` accessor that CodeGen emits.

**File:** `metadata/entities/JSONType-interfaces/IContentSourceConfiguration.ts`

#### Phase 1b checklist

- [ ] **1b.1** Add the following optional properties to `IContentSourceConfiguration` (with TSDoc on each):
  - `SuggestThreshold?: number` — score band below `TagMatchThreshold` and above this routes to the suggestion queue (default: 0.05 below `TagMatchThreshold`).
  - `MaxNewTagsPerRun?: number` — pause the run once this many new tags have been auto-created. NULL = unlimited.
  - `MaxNewTagsPerItem?: number` — once reached, route any further new free-text tags from this item to suggestions.
  - `MaxTokensPerRun?: number` — pause the run once cumulative LLM tokens exceed this. NULL = unlimited.
  - `MaxCostPerRun?: number` — pause the run once cumulative cost exceeds this (USD). NULL = unlimited.
- [ ] **1b.2** Run `mj sync push --dir=metadata --include="entities"` (or the appropriate scope) so CodeGen picks up the interface change and re-emits `MJContentSourceEntity_IContentSourceConfiguration`.
- [ ] **1b.3** Build `MJCoreEntities`, `MJCoreEntitiesServer`, `MJServer`. No code reads these knobs yet — that lands in Phase 1d.

### Phase 1c — Tag engine: persisted embeddings + scope filter + governance methods *(medium risk; ~4–5 days)*

Three concerns bundled because they all touch `TagEngine` and `TagEngineBase`:

1. **Persisted embeddings** — populate `Tag.EmbeddingVector` on Save, use it as the cache hydrate source instead of recomputing every cold start.
2. **Scope-filtered visibility** — new `TagScopeFilterBuilder` produces SQL fragments; thread `scopeContext` through tag lookup.
3. **Governance enforcement** — new methods on `TagGovernanceEngine` that gate auto-creation by per-tag flags + ancestor walk.

**Files:**
- New: `packages/MJCoreEntitiesServer/src/custom/MJTagEntityServer.server.ts` — `Save()` hook for embedding refresh + vector cache sync + IsGlobal⊕TagScope invariant check.
- New: `packages/MJCoreEntitiesServer/src/custom/MJTagScopeEntityServer.server.ts` — `Save()` hook enforcing the inverse half of the invariant (cannot insert TagScope row when Tag.IsGlobal=1).
- New: `packages/AI/Knowledge/TagEngineBase/src/TagScopeFilterBuilder.ts` — scope predicate builder.
- New: `packages/AI/Knowledge/TagEngineBase/src/TagScopeContext.ts` — context type.
- Edit: `packages/AI/Knowledge/TagEngineBase/src/TagEngineBase.ts` — new scope-aware accessors.
- Edit: `packages/AI/Knowledge/TagEngine/src/TagEngine.ts` lines 186–647 — `refreshTagEmbeddings`, `ResolveTag`, `handleNoMatch`, `createAndEmbedTag`, `buildSubtreeFilter`.
- Edit: `packages/AI/Knowledge/TagEngine/src/TagGovernanceEngine.ts` — new validation/enforcement methods.

#### Phase 1c.1 — Persisted embeddings + invariant enforcement

- [ ] **1c.1.1** Create `MJTagEntityServer.server.ts`:
  - Mirror `MJAIAgentNoteEntityServer.server.ts:25-59`.
  - Override `Save(options)`:
    - **Invariant check**: if `IsGlobal === 1` and any `TagScope` row exists for this tag (use a quick `RunView<TagScopeEntity>` count), reject with a clear error message via `LatestResult`. Return `false`.
    - **Embedding refresh**: detect when `Name` or `Description` is dirty (or first save) and call `await this.GenerateEmbeddingByFieldName('Name', 'EmbeddingVector', 'EmbeddingModelID')`. If `Name` empty/whitespace, null out `EmbeddingVector` and `EmbeddingModelID`.
    - Call `super.Save(options)`; check boolean return per CLAUDE.md.
    - On success, sync `TagEngine.Instance` vector service: insert/update if `Status='Active'` and `EmbeddingVector` populated, otherwise remove.
- [ ] **1c.1.2** Register with `@RegisterClass(BaseEntity, 'MJ: Tags')`. Confirm the override is picked up (CodeGen-generated entity is replaced at runtime by ours).
- [ ] **1c.1.3** Create `MJTagScopeEntityServer.server.ts`:
  - Override `Save(options)`: load the parent `TagEntity` via `Metadata.GetEntityObject<TagEntity>('MJ: Tags')` + `Load(this.TagID)`; if `IsGlobal === 1`, reject.
  - Register with `@RegisterClass(BaseEntity, 'MJ: Tag Scopes')` — replace with the actual entity name CodeGen produces.
- [ ] **1c.1.4** Add `AddOrUpdateSingleTagEmbedding(tag)` and `RemoveSingleTagEmbedding(id)` methods to `TagEngine` mirroring `AIEngine.AddOrUpdateSingleNoteEmbedding`.
- [ ] **1c.1.5** Refactor `TagEngine.refreshTagEmbeddings` (TagEngine.ts:186-215):
  - For each tag with non-null `EmbeddingVector` AND `EmbeddingModelID` matching the configured model: parse JSON, push to vector service. Skip the LLM call.
  - For tags missing or mismatched: collect into a batch, call existing `AIModelRunner.RunEmbedding` path, write results back via `Save()`, add to vector service.
  - Log cache-hits vs. computed-fresh for telemetry.
- [ ] **1c.1.6** One-shot utility `RebuildTagEmbeddings(contextUser, options?)` on `TagEngine` for admin use after a global model change. Documented in plan; wiring to a scheduled action is deferred.
- [ ] **1c.1.7** Build + tests: `cd packages/MJCoreEntitiesServer && npm run build`, `cd packages/AI/Knowledge/TagEngineBase && npm run build`, `cd packages/AI/Knowledge/TagEngine && npm run build`. Run tests in each.

#### Phase 1c.2 — Scope filter builder

- [ ] **1c.2.1** Define `TagScopeContext` in `packages/AI/Knowledge/TagEngineBase/src/TagScopeContext.ts`:
  ```typescript
  export interface TagScopeContext {
      scopes: Array<{ entityName?: string; entityId?: string; recordId: string }>;
      globalOnly?: boolean;
  }
  ```
- [ ] **1c.2.2** Create `TagScopeFilterBuilder` (extends `BaseSingleton<TagScopeFilterBuilder>` per CLAUDE.md):
  - `buildVisibilityFilter(ctx?: TagScopeContext): string` — returns SQL `WHERE`-suitable predicate. `ctx == null` → `Status='Active'`; `ctx.globalOnly` → `Status='Active' AND IsGlobal=1`; otherwise → `Status='Active' AND (IsGlobal=1 OR ID IN (subquery on TagScope))`.
  - Resolve `entityName` to `EntityID` via `Metadata.EntityByName(name)` (per CLAUDE.md — never `Entities.find`).
  - Single-quote-escape all string interpolation.
- [ ] **1c.2.3** `buildVisibleTagIDPredicate(ctx?: TagScopeContext): string` — sub-expression suitable for `subtreeFilter` in vector search.
- [ ] **1c.2.4** `validateChildScope(parentTag, proposedScopes): { ok: boolean; reason?: string }` — used during auto-grow to enforce "child scope ⊆ parent scope OR parent is global."
- [ ] **1c.2.5** Unit tests for each method against canned inputs.

#### Phase 1c.3 — TagEngineBase scope-aware accessors

- [ ] **1c.3.1** Add `GetVisibleTags(ctx?: TagScopeContext): MJTagEntity[]` to `TagEngineBase`.
- [ ] **1c.3.2** Add overload `GetTagByName(name, ctx?)` — case-insensitive name match scoped to the visible set.
- [ ] **1c.3.3** Add overload `GetTaxonomyTree(rootID?, ctx?)` — tree filtered by visibility. Used for prompt-context generation in Phase 1d.
- [ ] **1c.3.4** Build + tests.

#### Phase 1c.4 — Synonym lookup

- [ ] **1c.4.1** Add `GetTagBySynonym(synonym, ctx?)` to `TagEngineBase`. Loads `MJ: Tag Synonyms` once at `Config()` time into a `Map<lowercased synonym, TagID>`.
- [ ] **1c.4.2** Wire `Config()` to load synonyms alongside tags.
- [ ] **1c.4.3** Test: tag "AI" with synonym "Artificial Intelligence" — both names resolve to the same TagID.

#### Phase 1c.5 — Governance methods on TagGovernanceEngine

- [ ] **1c.5.1** `ValidateAutoGrow(parentID, weight, contextUser): { ok: boolean; reason?: TagSuggestionReason }`:
  - Fail with `'ParentFrozen'` if any ancestor `IsFrozen=1`.
  - Fail with `'AutoGrowDisabled'` if proposed parent `AllowAutoGrow=0`.
  - Fail with `'MaxChildrenExceeded'` if proposed parent `MaxChildren` set and at cap.
  - Fail with `'MaxDepthExceeded'` if any ancestor `MaxDescendantDepth` set and would exceed.
  - Fail with `'BelowMinWeight'` if proposed parent `MinWeight` set and `weight < MinWeight`.
- [ ] **1c.5.2** `EnqueueSuggestion(params): Promise<MJTagSuggestionEntity>` writes a `TagSuggestion` row.
- [ ] **1c.5.3** `PromoteSuggestion(suggestionID, contextUser): Promise<MJTagEntity>`:
  - If `BestMatchTagID` set + reviewer chose merge: re-point existing `ContentItemTag` rows where `Tag = ProposedName` to `TagID = BestMatchTagID`. Set suggestion `Status='Merged'`, `ResolvedTagID=BestMatchTagID`.
  - If accept-as-new: create a new `MJ:Tag` under `ProposedParentID` (subject to governance), inherit parent scope. Set `Status='Approved'`.
  - Re-pointing fans out via `RunView` over `ContentItemTag` filtered by `ItemID IN (...) AND Tag = '...'`.
- [ ] **1c.5.4** `RejectSuggestion(suggestionID, reviewerNotes, contextUser)`. Sets `Status='Rejected'`.
- [ ] **1c.5.5** Extend `MergeTags`: copy source `Name` + all source `TagSynonym` rows to target as `Source='Merged'`.
- [ ] **1c.5.6** Tests for each method against canned tag trees.

#### Phase 1c.6 — TagEngine.ResolveTag extensions

- [ ] **1c.6.1** Add `scopeContext?: TagScopeContext` parameter to `ResolveTag` (TagEngine.ts:385). Default null = no scope = existing behavior.
- [ ] **1c.6.2** Synonym tier — insert before exact match: `TagEngineBase.GetTagBySynonym(text, scopeContext)`.
- [ ] **1c.6.3** Exact + fuzzy tiers — thread `scopeContext` through.
- [ ] **1c.6.4** Semantic tier — extend `subtreeFilter` to AND `TagScopeFilterBuilder.buildVisibleTagIDPredicate(scopeContext)`.
- [ ] **1c.6.5** Tiered confidence routing in semantic match block:
  - `score >= MatchThreshold` → return matched tag.
  - `SuggestThreshold <= score < MatchThreshold` → enqueue suggestion with `Reason='BelowThreshold'`, return null.
  - `score < SuggestThreshold` → fall through to `handleNoMatch`.
- [ ] **1c.6.6** Update `handleNoMatch` (line 612):
  - `Constrained` → enqueue with `Reason='ConstrainedMode'`, return null.
  - `Hybrid` → enqueue suggestion (with reason from governance) — never auto-creates.
  - `AutoGrow` / `FreeFlow` → `ValidateAutoGrow`. If blocked → enqueue with that reason. If ok → `createAndEmbedTag`.
- [ ] **1c.6.7** Update `createAndEmbedTag` (line 636):
  - When parent non-global, copy parent's `TagScope` rows to child (snapshot, not link).
  - When parent global, set child `IsGlobal=1`.
- [ ] **1c.6.8** Unit tests: synonym hit, semantic above threshold, semantic in suggestion band, auto-grow blocked by IsFrozen, blocked by MaxChildren, scope inheritance on creation.

### Phase 1d — Autotag engine: governance hook + budget + scope-aware prompts *(medium risk; ~3–4 days)*

The autotag engine has a clean plugin point at `OnContentItemTagSaved` ([AutotagBaseEngine.ts:384-401](../../packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts#L384-L401)). Most Phase 1d work is hooking into this and adding budget enforcement around the per-batch loop.

**Files:**
- `packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts` — main plugin surface.
- `packages/ContentAutotagging/src/Entity/generic/AutotagEntity.ts:115-191` — taxonomy-share gate, `BridgeContentItemTagToTaxonomy`.
- New: `packages/ContentAutotagging/src/Engine/generic/ScopeContextResolver.ts`.
- New: `packages/ContentAutotagging/src/Engine/generic/RunBudget.ts`.

#### Phase 1d.1 — Scope context derivation per ContentSource

- [ ] **1d.1.1** `deriveScopeContext(source: MJContentSourceEntity): TagScopeContext` in `ScopeContextResolver.ts`:
  - Strategy: read scope from the source's `TagRootID` ancestry — if `TagRootID` set and root tag is non-global, derive from that root's `TagScope` rows.
  - If `TagRootID` null or root global, return `{ scopes: [], globalOnly: false }`.
  - Future extension point: per-source explicit scope override. Don't add now — TODO comment.
- [ ] **1d.1.2** Call `deriveScopeContext` once per source per run; cache on `sourceConfigMap`.

#### Phase 1d.2 — Wire scope into TaxonomyContext

- [ ] **1d.2.1** In `AutotagBaseEngine.ts:333` (`TaxonomyContext` setup), pass scope to `TagEngine.Instance.GetTaxonomyTree(rootID, scopeContext)`. When multiple sources with different scopes batch together, take the union.
- [ ] **1d.2.2** Verify the LLM prompt receives the scope-filtered taxonomy. Log tags shared.

#### Phase 1d.3 — Wire scope + tiered routing into BridgeContentItemTagToTaxonomy

- [ ] **1d.3.1** In `AutotagEntity.ts:182`, pass `scopeContext` and the source's `MatchThreshold` and `SuggestThreshold` to `TagEngine.Instance.ResolveTag(...)`. Read both via the typed `_IContentSourceConfiguration` accessor (per Phase 1b).
- [ ] **1d.3.2** When `ResolveTag` returns null (suggestion enqueued), do NOT set `ContentItemTag.TagID`. Leave the free-text `Tag` value in place; preserve dual-storage invariant.
- [ ] **1d.3.3** Stamp `SourceContentSourceID` and `SourceContentItemID` on the enqueued `TagSuggestion` for traceability.

#### Phase 1d.4 — Volume / cost / new-tag budgets

- [ ] **1d.4.1** `RunBudget` class:
  - Tracks `tagsCreatedThisRun`, `tagsCreatedThisItem`, `tokensUsedThisRun`, `costThisRun`.
  - `recordTagCreated(itemID)`, `recordTokens(n)`, `recordCost(c)`.
  - `checkBudgets(): { ok: boolean; reason?: string }` against `MaxNewTagsPerRun` / `MaxTokensPerRun` / `MaxCostPerRun` from typed Configuration.
  - `reset()`.
- [ ] **1d.4.2** One `RunBudget` per source per run; cache on `sourceConfigMap`.
- [ ] **1d.4.3** `RunBudget.recordTagCreated` from `TagEngine.createAndEmbedTag` — pass an `onTagCreated` callback into `ResolveTag`.
- [ ] **1d.4.4** Token + cost recording from existing `MJ:Content Process Run Prompt Runs` rollup (`ContentProcessRunDetail.TotalTokensUsed`).
- [ ] **1d.4.5** In the per-batch loop (`AutotagBaseEngine.ts` ~line 141), after each batch check `RunBudget.checkBudgets()`. If hit:
  - Set `ContentProcessRun.Status='Paused'`, `CancellationRequested=1` (existing graceful-stop machinery).
  - Set `ContentProcessRunDetail.ErrorMessage` with reason.
  - Log structured event.
- [ ] **1d.4.6** Per-item budget: at start of each `ContentItem`, reset `tagsCreatedThisItem`. Inside the bridge, if `>= MaxNewTagsPerItem`, route subsequent free-text tags to suggestions.

#### Phase 1d.5 — Co-occurrence trigger plumbing (already exists; verify)

- [ ] **1d.5.1** Confirm `recomputeCoOccurrenceIfAvailable` (lines 218 / 1728) still runs after these changes.
- [ ] **1d.5.2** No code change here — Phase 1e extends co-occurrence to emit suggestions; that emission also runs in the existing post-run hook.

#### Phase 1d.6 — Build + tests

- [ ] **1d.6.1** Build: `cd packages/ContentAutotagging && npm run build`.
- [ ] **1d.6.2** Tests: `cd packages/ContentAutotagging && npm run test`.
- [ ] **1d.6.3** Add new tests:
  - Constrained + no match → suggestion enqueued, no tag created, `ContentItemTag.TagID = NULL`.
  - Hybrid + ambiguous → suggestion enqueued.
  - AutoGrow + frozen ancestor → suggestion enqueued with `Reason='ParentFrozen'`.
  - AutoGrow + budget hit → run pauses, suggestion enqueued for remaining items.
  - Scope-filtered taxonomy: tag in scope A is not in TaxonomyContext for source in scope B.

### Phase 1e — Tag Health: extend co-occurrence into suggestion emission *(low risk; ~2–3 days)*

`TagCoOccurrenceEngine` already populates `MJ:Tag Co Occurrences`. Phase 1e adds three suggestion emitters: merge candidates, low-usage deprecation candidates, wide-node alerts.

**Files:**
- Edit: `packages/AI/Knowledge/TagEngine/src/TagCoOccurrenceEngine.ts` — `EmitMergeSuggestions`.
- New: `packages/AI/Knowledge/TagEngine/src/TagHealthJob.ts` — composes all three emitters.
- Edit: `packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts:1728` — extend post-run hook.

#### Phase 1e.1 — Merge candidate emitter

- [ ] **1e.1.1** `EmitMergeSuggestions({ minCoOccurrence, minNameSimilarity, minEmbeddingSimilarity }, contextUser): Promise<number>`.
- [ ] **1e.1.2** Walk `MJ:Tag Co Occurrences` where `CoOccurrenceCount >= minCoOccurrence`.
- [ ] **1e.1.3** For each pair: name similarity (existing fuzzy normalization) + embedding cosine.
- [ ] **1e.1.4** When both pass, enqueue with `ProposedName=TagA.Name`, `BestMatchTagID=TagB.ID`, `Reason='MergeCandidate'`.
- [ ] **1e.1.5** Idempotency: skip pairs with existing pending merge suggestions.

#### Phase 1e.2 — Low-usage deprecation emitter

- [ ] **1e.2.1** `EmitLowUsageSuggestions({ maxUsage, lookbackDays }, contextUser)`.
- [ ] **1e.2.2** Count `MJ:Tagged Items` + `MJ:Content Item Tags` per active tag in window.
- [ ] **1e.2.3** When `< maxUsage`, enqueue with `Reason='LowUsage'`, `ProposedParentID=tag.ParentID`.
- [ ] **1e.2.4** Idempotency.

#### Phase 1e.3 — Wide-node alert emitter

- [ ] **1e.3.1** `EmitWideNodeSuggestions({ maxImplicitChildren }, contextUser)`.
- [ ] **1e.3.2** Count direct children. If `> MaxChildren` (when set) OR `> maxImplicitChildren`, enqueue with `Reason='WideNode'`.
- [ ] **1e.3.3** Idempotency.

#### Phase 1e.4 — Job composition + wiring

- [ ] **1e.4.1** `TagHealthJob.Run(thresholds, contextUser): Promise<TagHealthSummary>` — calls all three emitters; aggregates counts.
- [ ] **1e.4.2** In `AutotagBaseEngine.ts:1728`, optionally invoke after the existing co-occurrence call. Gate behind a flag (env or future config field).
- [ ] **1e.4.3** Document scheduled-action invocation path; defer the metadata wiring to a follow-up.

#### Phase 1e.5 — Build + tests

- [ ] **1e.5.1** Build TagEngine.
- [ ] **1e.5.2** Tests with synthetic fixtures; verify idempotency.

### Phase 1f — UI consumers *(parallelizable after Phase 1a; ~3–6 days total)*

UI work depends on the new entities being CodeGen'd (1a). Each surface is independent.

**Files:**
- `packages/Angular/Explorer/dashboards/src/AI/components/autotagging/autotagging-pipeline-resource.component.ts:3257-3322` — taxonomy admin tree.
- `packages/Angular/Explorer/dashboards/src/KnowledgeHub/analytics-resource.component.ts:1224-1228` — Knowledge Hub tag facet.
- New: Suggestion Inbox component (~500 lines).
- Auto-generated forms for new entities (CodeGen owns).

#### Phase 1f.1 — Knowledge Hub tag facet scope filter

- [ ] **1f.1.1** In `analytics-resource.component.ts:1224-1228`, add `ExtraFilter` to the `MJ: Tags` RunView. Compute filter from already-loaded scope data, or hit `TagScopeFilterBuilder` server-side via a small resolver.
- [ ] **1f.1.2** "Show only my org's tags" toggle (default on) above the tag facet.

#### Phase 1f.2 — Taxonomy admin

- [ ] **1f.2.1** In `buildTaxTree` (line 3257-3322), filter `tagsRaw` by current user's scope before building.
- [ ] **1f.2.2** Per-node config panel (right sidebar) for governance fields, TagScope editor (locked when `IsGlobal=1`), TagSynonym editor.
- [ ] **1f.2.3** Validation feedback for: setting `IsGlobal=1` on a tag with TagScope rows; adding TagScope to a global tag; child scope wider than parent.
- [ ] **1f.2.4** Tree badges: green dot (`IsGlobal=1`), lock (`IsFrozen=1`), no-grow icon (`AllowAutoGrow=0`), scope badge with company count.

#### Phase 1f.3 — Suggestion Inbox

- [ ] **1f.3.1** New component: `tag-suggestion-inbox.component.ts`.
- [ ] **1f.3.2** Fetches `MJ:TagSuggestion WHERE Status='Pending'`. Filter by `Reason`, `SourceContentSourceID`, date range.
- [ ] **1f.3.3** Per-row actions: Accept-as-new, Merge-into-existing, Reject. All via `TagGovernanceEngine.PromoteSuggestion` / `RejectSuggestion`.
- [ ] **1f.3.4** Bulk: select-all + "approve all suggestions with score >= X" for the merge-candidate cohort.
- [ ] **1f.3.5** Drill into source `MJ:Content Item`.

#### Phase 1f.4 — ContentSource form: structured fields for Configuration knobs

- [ ] **1f.4.1** CodeGen does not auto-generate UI for JSON properties. Build a small custom override (per CLAUDE.md custom-form pattern) that surfaces the typed `_IContentSourceConfiguration` fields:
  - `TagTaxonomyMode` as a radio group with copy.
  - `TagRootID` as a tag-tree picker.
  - `TagMatchThreshold` / `SuggestThreshold` as paired sliders.
  - Budget fields as plain numeric inputs.
- [ ] **1f.4.2** Persist back via the typed setter (CodeGen emits an `_IContentSourceConfiguration` setter that marshals back to JSON).

#### Phase 1f.5 — Run Monitor (no schema changes needed)

- [ ] **1f.5.1** If a Run Monitor doesn't already exist, defer to a separate plan.

#### Phase 1f.6 — Generic record-tags tag picker (defer)

- [ ] **1f.6.1** No-op for this phase. `record-tags.component.ts` only displays existing tags. Adding a picker is a separate feature; when added, use `TagEngineBase.GetVisibleTags(scopeContext)`.

#### Phase 1f.7 — Build + tests + manual verification

- [ ] **1f.7.1** Build affected Angular packages.
- [ ] **1f.7.2** Component tests for inbox + per-node panel.
- [ ] **1f.7.3** Manual `playwright-cli` verification per CLAUDE.md workbench workflow:
  - Start MJAPI + MJExplorer.
  - Create a test tag, add a TagScope row, verify visibility filtering in Knowledge Hub.
  - Run autotagger on a small content source with `TagTaxonomyMode='constrained'` — verify no tags created and suggestions enqueued.
  - Approve a suggestion in the inbox — verify existing `ContentItemTag` rows for the proposed name get re-pointed.

---

## 6. Cross-cutting concerns

### 6.1 Backwards compatibility
- All schema additions are nullable or have safe defaults. Existing customers see no behavior change until they opt in.
- The `IContentSourceConfiguration` extensions are all optional. Existing JSON blobs remain valid.

### 6.2 Performance
- Biggest perf win is Phase 1c.1.5: load embeddings from cache instead of re-embedding every cold start. Log cache hit rate.
- Composite index `IDX_TagScope_Scope_Tag (ScopeEntityID, ScopeRecordID, TagID)` is the critical hot-path index.
- Visibility predicate uses `EXISTS` subquery; benchmark against flat `IN` for typical scope cardinalities.

### 6.3 Error handling (per CLAUDE.md)
- All new `BaseEntity.Save()` calls check the boolean return and use `LatestResult?.CompleteMessage`.
- All `RunView` calls check `Success`.
- Entity name lookups use `Metadata.EntityByName(name)` (case-insensitive O(1)).
- All new singletons extend `BaseSingleton<T>`.

### 6.4 Multi-provider safety
- Inside `BaseEngine` subclasses, use `this.ProviderToUse` rather than `new Metadata()`.
- `TagScopeFilterBuilder` accepts an optional `provider?: IMetadataProvider`.

### 6.5 Type safety
- No `any` types. New types: `TagScopeContext`, `TagSuggestionReason` (union string literal), `RunBudget`, `TagHealthSummary`.
- All `RunView` calls use generics + correct `ResultType` (per CLAUDE.md `simple` vs `entity_object` guidance).

### 6.6 Git / branching / PR
- All work in this PR lands on `claude/autotagger-scope-and-governance-plan`.
- Suggested commit groupings:
  1. **Phase 1a** — single migration file (this commit landed first; awaits human apply + CodeGen).
  2. **Phase 1a (cont)** — CodeGen output (entity classes, generated migration, generated forms).
  3. **Phase 1b** — IContentSourceConfiguration extensions.
  4. **Phase 1c.1** — persisted embeddings + invariant Save() overrides.
  5. **Phase 1c.2-1c.3** — scope filter + accessors.
  6. **Phase 1c.4** — synonyms.
  7. **Phase 1c.5-1c.6** — governance + ResolveTag extensions.
  8. **Phase 1d** — autotag engine hooks + budget.
  9. **Phase 1e** — tag health.
  10. **Phase 1f** — UI.

---

## 7. Open questions — resolved

1. **CDP versus MJ scope.** Pure MJ project. CDP migration is separate, future work — no CDP/BC references in this plan or the implementation.
2. **Cross-table validation.** Resolved: enforce `IsGlobal ⊕ TagScope` via entity `Save()` overrides on `MJ: Tags` and `MJ: Tag Scopes`. No DB triggers. The `UNIQUE` constraint on `TagScope (TagID, ScopeEntityID, ScopeRecordID)` is the only DB-level guard.
3. **Embedding model per tag.** Resolved: yes, persist `EmbeddingModelID` as an FK on `Tag`. It's the only safe way to detect "global tag-embedding-model changed → these cached vectors are stale" — without it, a model swap silently leaves stale vectors in place. Cheap insurance.
4. **`Content Item Tags.Tag_Virtual` field.** Leave alone — it's CodeGen-emitted from the `IsName` join and still in use.
5. **Per-source explicit scope override.** Defer. Phase 1d.1 derives scope from `TagRootID` ancestry; sufficient for v1.
6. **Hybrid mode + `RequiresReview` interaction.** Single suggestion row, `Reason='RequiresReview'` takes precedence over `Reason='AmbiguousMatch'`. Documented in code comment at the routing site.

---

## 8. Appendix A — Schema reference (final state after Phase 1a)

### `__mj.Tag` (existing, extended)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| ID | UNIQUEIDENTIFIER | NO | PK, default NEWSEQUENTIALID() |
| Name | NVARCHAR(255) | NO | |
| ParentID | UNIQUEIDENTIFIER | YES | self-FK |
| DisplayName | NVARCHAR(255) | NO | |
| Description | NVARCHAR(MAX) | YES | |
| Status | NVARCHAR(20) | NO | CHECK IN ('Active','Merged','Deprecated','Deleted') |
| MergedIntoTagID | UNIQUEIDENTIFIER | YES | self-FK |
| **IsGlobal** | BIT | NO | DEFAULT 1 (existing rows + new rows = global by default) |
| **AllowAutoGrow** | BIT | NO | DEFAULT 1 |
| **IsFrozen** | BIT | NO | DEFAULT 0 |
| **MaxChildren** | INT | YES | NULL = unlimited |
| **MaxDescendantDepth** | INT | YES | NULL = unlimited; 0 = leaf-only |
| **MinWeight** | DECIMAL(3,2) | YES | per-node confidence floor |
| **RequiresReview** | BIT | NO | DEFAULT 0 |
| **EmbeddingVector** | NVARCHAR(MAX) | YES | JSON-encoded number array |
| **EmbeddingModelID** | UNIQUEIDENTIFIER | YES | FK → AIModel |

### `__mj.TagScope` (new)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| ID | UNIQUEIDENTIFIER | NO | PK |
| TagID | UNIQUEIDENTIFIER | NO | FK → Tag |
| ScopeEntityID | UNIQUEIDENTIFIER | NO | FK → Entity |
| ScopeRecordID | NVARCHAR(450) | NO | matches `MJ: Tagged Items.RecordID` |

UNIQUE: `(TagID, ScopeEntityID, ScopeRecordID)`. Composite index: `(ScopeEntityID, ScopeRecordID, TagID)`.

### `__mj.TagSynonym` (new)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| ID | UNIQUEIDENTIFIER | NO | PK |
| TagID | UNIQUEIDENTIFIER | NO | FK → Tag |
| Synonym | NVARCHAR(255) | NO | |
| Source | NVARCHAR(20) | NO | DEFAULT 'Manual'; CHECK IN ('Manual','LLM','Imported','Merged') |

UNIQUE: `(TagID, Synonym)`.

### `__mj.TagSuggestion` (new)

| Column | Type | Nullable |
|---|---|---|
| ID | UNIQUEIDENTIFIER | NO |
| ProposedName | NVARCHAR(255) | NO |
| ProposedParentID | UNIQUEIDENTIFIER | YES |
| BestMatchTagID | UNIQUEIDENTIFIER | YES |
| BestMatchScore | DECIMAL(4,3) | YES |
| Reason | NVARCHAR(50) | NO |
| SourceContentItemID | UNIQUEIDENTIFIER | YES |
| SourceContentSourceID | UNIQUEIDENTIFIER | YES |
| SourceText | NVARCHAR(MAX) | YES |
| Status | NVARCHAR(20) | NO | DEFAULT 'Pending' |
| ResolvedTagID | UNIQUEIDENTIFIER | YES |
| ReviewedByUserID | UNIQUEIDENTIFIER | YES |
| ReviewedAt | DATETIMEOFFSET | YES |
| ReviewerNotes | NVARCHAR(MAX) | YES |

CHECK: `Status IN ('Pending','Approved','Rejected','Merged')`. `Reason` left free-form for forward compatibility — conventional values documented in the column's `MS_Description`.

### `IContentSourceConfiguration` (existing, extended)

Existing keys (unchanged): `TagTaxonomyMode`, `TagRootID`, `TagMatchThreshold`, `ShareTaxonomyWithLLM`, `EnableVectorization`, `SourceSpecificConfiguration`.

New keys (Phase 1b):
- `SuggestThreshold?: number`
- `MaxNewTagsPerRun?: number`
- `MaxNewTagsPerItem?: number`
- `MaxTokensPerRun?: number`
- `MaxCostPerRun?: number`

---

## 9. Appendix B — Plugin point map

| Concern | File | Line | Mechanism |
|---|---|---|---|
| Per-tag governance enforcement | `AutotagBaseEngine.ts` | 384-401 | `OnContentItemTagSaved` callback (set inside `setupTaxonomyAndBridge`) |
| Tag resolution scope filtering | `TagEngine.ts` | 541-549 | Existing `subtreeFilter` parameter to `_tagVectorService.FindNearest` |
| Tag auto-creation gate | `TagEngine.ts` | 612-647 | `handleNoMatch` + `createAndEmbedTag` |
| Embedding cache hydration | `TagEngine.ts` | 186-215 | `refreshTagEmbeddings` (refactor to load-from-DB-first) |
| Embedding refresh on Save | `MJTagEntityServer.server.ts` (NEW) | — | `Save()` override pattern from `MJAIAgentNoteEntityServer.server.ts:25-59` |
| Cross-table invariant | Entity `Save()` overrides | — | `MJTagEntityServer` rejects `IsGlobal=1` when scope rows exist; `MJTagScopeEntityServer` rejects new rows when parent is global |
| Co-occurrence post-run hook | `AutotagBaseEngine.ts` | 218, 1728 | `recomputeCoOccurrenceIfAvailable` (extend to also call TagHealthJob) |
| LLM taxonomy context | `AutotagBaseEngine.ts` | 333, 379, 586 | `TaxonomyContext` field → `existingTaxonomy` template variable |
| Mode branching | `AutotagEntity.ts` | 168-191 | Read `TagTaxonomyMode`; branch on constrained/auto-grow/free-flow |
| Run cancellation / pause | `MJ:Content Process Run` schema | — | `CancellationRequested`, `LastProcessedOffset` (existing fields) |

---

## 10. Definition of done for Phase 1

Phase 1 ships when ALL of the following are true:

- [ ] Migration applied; CodeGen run; generated entity classes and forms exist.
- [ ] All sub-phase checklists complete.
- [ ] All affected packages build cleanly: `MJCoreEntities`, `MJCoreEntitiesServer`, `MJServer`, `AI/Knowledge/TagEngineBase`, `AI/Knowledge/TagEngine`, `ContentAutotagging`, affected Angular packages.
- [ ] All affected packages' unit tests pass.
- [ ] Manual smoke test: end-to-end autotagger run in each of the four modes (constrained / auto-grow / free-flow / hybrid) against a small fixture content source. Suggestions appear in the inbox for the appropriate cases.
- [ ] PR description includes: design summary, list of new entities, before/after of `IContentSourceConfiguration`, known follow-ups.

---

*End of plan.*
