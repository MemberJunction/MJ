# Autotagger Scope & Governance — Unified Implementation Plan

**Status:** Ready for implementation
**Branch:** `claude/autotagger-scope-and-governance`
**Owner:** unassigned
**Estimated total work:** 10–15 dev-days for schema + engine; UI parallelizable after Phase 1a lands

---

## 1. Goal

Add per-tenant / per-context customization to the autotagger pipeline so customers can pick any of these postures along a spectrum:

- Totally static curated taxonomy (no auto-creation)
- Totally free-form (auto-create at will)
- Auto-match-when-similar with configurable thresholds
- Frozen subtrees inside an otherwise open taxonomy
- Bounded breadth/depth on auto-grow
- Volume / cost budgets per run
- Per-customer narrowing of the visible taxonomy (multi-tenant scope)

All of the above must be configurable per ContentSource and per Tag, with a human-in-the-loop suggestion queue for ambiguous or governance-blocked tags.

---

## 2. Scope

**In scope (this plan):**
- Schema (5 migrations, all additive)
- Tag engine extensions (persisted embeddings, scope-filtered visibility, per-node governance enforcement)
- Autotag engine governance hook + budget enforcement + tiered confidence routing
- Tag Health emitter that writes to the suggestion queue
- UI consumer updates (filter facet, taxonomy admin, suggestion inbox)

**Out of scope (separate work):**
- Multi-tenant authentication beyond what already exists
- New AI model integrations
- Net-new Knowledge Hub features unrelated to scoping

---

## 3. Background — what already exists in MJ

The autotagger is more mature than a casual reading suggests. Verified in this investigation:

- **Dual storage on `MJ:Content Item Tags`:** `Tag` (free text) + `TagID` (nullable FK to `MJ:Tags`) is already present (`entity_subclasses.ts`). The dual-storage mechanism the plan needs is already in place.
- **Taxonomy mode is enforced** at `packages/ContentAutotagging/src/Entity/generic/AutotagEntity.ts:168`. Reads `MJContentSourceEntity_IContentSourceConfiguration.TagTaxonomyMode` from the `Configuration` JSON blob, branches on `'constrained' | 'auto-grow' | 'free-flow'`.
- **4-tier match pipeline exists** in `packages/AI/Knowledge/TagEngine/src/TagEngine.ts:385-647`: exact (`GetTagByName`) → fuzzy (plural/hyphen normalization) → semantic (`SimpleVectorService.FindNearest` cosine + threshold + optional `subtreeFilter` at line 541) → mode-based creation via `handleNoMatch` (line 612) and `createAndEmbedTag` (line 636).
- **Tag embeddings are computed on startup** via `refreshTagEmbeddings` (`TagEngine.ts:186-215`) into an in-memory `SimpleVectorService<TagEmbeddingMetadata>`. Not persisted — recomputed every cold start.
- **Governance ops exist** in `packages/AI/Knowledge/TagEngine/src/TagGovernanceEngine.ts`: `MergeTags`, `SplitTag`, `MoveTag`, `RenameTag`, `DeprecateTag`, `ReactivateTag`, `DeleteTag`. All wired to `MJ:Tag Audit Logs` via `createAuditEntry()` (line 409).
- **Co-occurrence is populated** by `packages/AI/Knowledge/TagEngine/src/TagCoOccurrenceEngine.ts`, invoked from the autotag pipeline post-run at `AutotagBaseEngine.ts:218` (`recomputeCoOccurrenceIfAvailable`, impl at line 1728). Discovered via ClassFactory so the autotag engine has no hard dep.
- **Plugin point for governance hooks** is the `OnContentItemTagSaved` callback (`AutotagBaseEngine.ts:384-401`, declared at line 766, invoked at line 807-809). Already used to bridge `ContentItemTag` → `Tag` + `TaggedItem`.
- **AI Agent Notes scoping precedent**: `PrimaryScopeEntityID` + `PrimaryScopeRecordID` + `SecondaryScopes`. Scope filter assembly lives in `packages/AI/Agents/src/agent-context-injector.ts:282-401` (`buildNotesScopingFilter`, `buildSecondaryScopeFilter`). Tightly coupled to notes today; we will pattern, not extract, in this phase.
- **Embedding storage precedent**: `MJAIAgentNoteEntity.EmbeddingVector` is `nvarchar(MAX)` JSON-encoded array + `EmbeddingModelID` FK, refreshed in a `Save()` hook at `packages/MJCoreEntitiesServer/src/custom/MJAIAgentNoteEntityServer.server.ts:25-59`. We mirror this for `MJ:Tags` exactly.
- **Migration conventions**: `V[YYYYMMDDHHMM]__v5.XX.x_[Description].sql`, `${flyway:defaultSchema}` placeholder, no `__mj_CreatedAt/UpdatedAt` columns or FK indexes in hand-written migrations (CodeGen adds them), `sp_addextendedproperty` for every new column. Latest migration: `V202604292210__v5.31.x__Create_UDT_Schema.sql`.

**Implication:** What looked like "implement" is mostly "extend." The schema plan is net-new; the engine plan is mostly hooking governance + scope filtering into existing infrastructure.

---

## 4. Design decisions (locked)

1. **Polymorphic `MJ:TagScope` junction table** — M2M between Tag and any (EntityID, RecordID) scope record. Same shape as the polymorphic `MJ:Tagged Items` table.
2. **`Tag.IsGlobal` is exclusive of `TagScope` rows** — enforced by triggers on both sides. Migration seeds existing tags as `IsGlobal=1` (zero behavior change).
3. **Children inherit parent scope by default**; cannot widen past parent. Promotion to global is admin-only.
4. **Promote `taxonomyMode` / `tagRootId` / `matchThreshold` from `Configuration` JSON to typed columns** on `MJ:Content Sources`. JSON kept only for genuinely experimental knobs.
5. **Per-Tag governance fields:** `IsGlobal`, `AllowAutoGrow`, `IsFrozen`, `MaxChildren`, `MaxDescendantDepth`, `MinWeight`, `RequiresReview`.
6. **`MJ:Tag Suggestions` is the single human-in-the-loop surface** — fed by classifier governance failures, ambiguous similarity, and Tag Health analytics.
7. **`MJ:Tag Synonyms` consulted before any new-tag creation.**
8. **Tiered thresholds**: `MatchThreshold` for auto-match, `SuggestThreshold` for review-queue routing.
9. **Per-tag embedding cache** modeled on `MJ:AI Agent Notes.EmbeddingVector`: `nvarchar(MAX)` JSON-encoded array + `EmbeddingModelID` FK + Save() hook.
10. **Volume budgets pause runs, do not fail them.** Reuse existing `CancellationRequested` / `LastProcessedOffset` resume machinery.
11. **Scope-builder lives in `TagEngineBase` for now**, NOT extracted to shared infra. After both AI Agent Notes and Tags ship and stabilize, refactor into `packages/MJCore/src/scoping/` in a separate PR.

---

## 5. Phase 1 — Unified Implementation

All sub-phases below are part of one phase, executed in dependency order. Sub-phases land in separate commits but in a single PR for atomicity.

### Phase 1a — Schema foundations *(low risk; ~1–2 days)*

Five migrations, all additive. Filename timestamps illustrative — pick `V[date +%Y%m%d%H%M]` at write time.

**Migration M1** — `V20260501NNNN__v5.31.x__Tag_Governance_Fields.sql`:
- Adds 7 governance columns + 2 embedding columns to `__mj.Tag`.
- Seeds `IsGlobal=1` on every existing row (zero behavior change).
- `sp_addextendedproperty` for each new column.

**Migration M2** — `V20260501NNNN__v5.31.x__Tag_Scope_Junction.sql`:
- Creates `__mj.TagScope` table.
- Composite index `IDX_TagScope_Scope_Tag (ScopeEntityID, ScopeRecordID, TagID)`.
- Standard `trgUpdateTagScope` timestamp trigger.
- Two cross-table validation triggers: `trgEnforceTagScopeInvariant` (on TagScope) + `trgEnforceTagIsGlobalInvariant` (on Tag).
- Order matters: M1 seed runs first, *then* M2 creates the invariant trigger. This is satisfied by the file timestamps.

**Migration M3** — `V20260501NNNN__v5.31.x__Tag_Synonyms.sql`:
- Creates `__mj.TagSynonym` table per design §2.8.

**Migration M4** — `V20260501NNNN__v5.31.x__Tag_Suggestions.sql`:
- Creates `__mj.TagSuggestion` table per design §2.7.
- CHECK constraints on `Status` and `Reason` enums.

**Migration M5** — `V20260501NNNN__v5.31.x__ContentSource_Typed_Config.sql`:
- Adds 8 typed columns to `__mj.ContentSource` (TaxonomyMode, TagRootID, MatchThreshold, SuggestThreshold, MaxNewTagsPerRun, MaxNewTagsPerItem, MaxTokensPerRun, MaxCostPerRun).
- Backfills from existing `Configuration` JSON via `JSON_VALUE` + `TRY_CAST`.

#### Phase 1a checklist

- [ ] **1a.1** Confirm latest migration timestamp in `migrations/v5/`. Pick monotonic timestamps for M1–M5 after the latest.
- [ ] **1a.2** Write M1 (`Tag_Governance_Fields.sql`):
  - [ ] Single `ALTER TABLE __mj.Tag ADD` with all 9 columns (7 governance + 2 embedding).
  - [ ] `UPDATE Tag SET IsGlobal = 1 WHERE IsGlobal = 0` seed.
  - [ ] `sp_addextendedproperty` for: `IsGlobal`, `AllowAutoGrow`, `IsFrozen`, `MaxChildren`, `MaxDescendantDepth`, `MinWeight`, `RequiresReview`, `EmbeddingVector`, `EmbeddingModelID`.
  - [ ] FK `FK_Tag_EmbeddingModel` → `__mj.AIModel(ID)`.
- [ ] **1a.3** Write M2 (`Tag_Scope_Junction.sql`):
  - [ ] `CREATE TABLE __mj.TagScope` with PK, FKs (Tag, Entity), `UQ_TagScope (TagID, ScopeEntityID, ScopeRecordID)`. No `__mj_CreatedAt`/`__mj_UpdatedAt` (CodeGen adds). No FK indexes (CodeGen adds).
  - [ ] Composite index `IDX_TagScope_Scope_Tag`.
  - [ ] `sp_addextendedproperty` for table + 3 business columns.
  - [ ] `trgUpdateTagScope` timestamp trigger.
  - [ ] `trgEnforceTagScopeInvariant` on TagScope (AFTER INSERT, UPDATE) — RAISERROR + ROLLBACK if `Tag.IsGlobal = 1`.
  - [ ] `trgEnforceTagIsGlobalInvariant` on Tag (AFTER UPDATE) — RAISERROR + ROLLBACK if any TagScope rows exist for the tag being globalized.
- [ ] **1a.4** Write M3 (`Tag_Synonyms.sql`):
  - [ ] `CREATE TABLE __mj.TagSynonym (ID, TagID FK→Tag, Synonym, Source CHECK IN ('Manual','LLM','Imported','Merged'))`.
  - [ ] `UQ_TagSynonym (TagID, Synonym)`.
  - [ ] `sp_addextendedproperty` for table + columns.
- [ ] **1a.5** Write M4 (`Tag_Suggestions.sql`):
  - [ ] `CREATE TABLE __mj.TagSuggestion` with all fields per design §2.7.
  - [ ] FKs: `ProposedParentID`, `BestMatchTagID`, `ResolvedTagID` → Tag; `SourceContentItemID` → ContentItem; `SourceContentSourceID` → ContentSource; `ReviewedByUserID` → User.
  - [ ] `CK_TagSuggestion_Status CHECK (Status IN ('Pending','Approved','Rejected','Merged'))`.
  - [ ] `sp_addextendedproperty` for table + every column.
- [ ] **1a.6** Write M5 (`ContentSource_Typed_Config.sql`):
  - [ ] Single `ALTER TABLE __mj.ContentSource ADD` with all 8 columns.
  - [ ] `CK_ContentSource_TaxonomyMode CHECK (TaxonomyMode IN ('Constrained','AutoGrow','FreeFlow','Hybrid'))`.
  - [ ] `FK_ContentSource_TagRoot → __mj.Tag(ID)`.
  - [ ] `UPDATE` backfill from `Configuration` JSON: `TagTaxonomyMode` (mapping `constrained/auto-grow/free-flow` → `Constrained/AutoGrow/FreeFlow`), `TagRootID`, `TagMatchThreshold`. Use `JSON_VALUE` + `TRY_CAST` and guard with `ISJSON(Configuration) = 1`.
  - [ ] `sp_addextendedproperty` for each of the 8 new columns.
- [ ] **1a.7** Apply migrations against a dev DB; confirm no errors and seed correctness:
  - [ ] `SELECT COUNT(*) FROM Tag WHERE IsGlobal = 1` equals total tag count.
  - [ ] `INSERT INTO TagScope` for an `IsGlobal=1` tag fails with the expected error.
  - [ ] `UPDATE Tag SET IsGlobal = 1` for a tag with TagScope rows fails.
  - [ ] `SELECT TaxonomyMode, TagRootID, MatchThreshold FROM ContentSource` shows backfilled values.
- [ ] **1a.8** Run CodeGen (`npm run codegen` or equivalent — confirm command in this repo).
  - [ ] Confirm a new `CodeGen_Run_*.sql` migration is generated with Entity / EntityField / EntityFieldValue rows.
  - [ ] Confirm `packages/MJCoreEntities/src/generated/entity_subclasses.ts` now contains `TagScopeEntity`, `TagSynonymEntity`, `TagSuggestionEntity` classes.
  - [ ] Confirm `TagEntity` has new fields: `IsGlobal`, `AllowAutoGrow`, `IsFrozen`, `MaxChildren`, `MaxDescendantDepth`, `MinWeight`, `RequiresReview`, `EmbeddingVector`, `EmbeddingModelID`.
  - [ ] Confirm `ContentSourceEntity` has new fields: `TaxonomyMode`, `TagRootID`, `MatchThreshold`, `SuggestThreshold`, `MaxNewTagsPerRun`, `MaxNewTagsPerItem`, `MaxTokensPerRun`, `MaxCostPerRun`.
- [ ] **1a.9** Build affected packages: `cd packages/MJCoreEntities && npm run build`, then `cd packages/MJCoreEntitiesServer && npm run build`, then `cd packages/MJServer && npm run build`. Fix any compilation errors.
- [ ] **1a.10** Run unit tests: `cd packages/MJCoreEntities && npm run test`. Fix any test drift.

### Phase 1b — ContentSource config promotion in the engine *(low risk; ~0.5–1 day)*

After Phase 1a's M5 promotes the JSON knobs to typed columns, the autotag engine needs to read from them. Engine reads `Configuration` JSON as a fallback for one release for backward compatibility, then JSON read is removed in v5.32.

**Files:**
- `packages/ContentAutotagging/src/Entity/generic/AutotagEntity.ts:115-191` — taxonomy share gate + `BridgeContentItemTagToTaxonomy` (line 146 onward).
- Anywhere else `MJContentSourceEntity_IContentSourceConfiguration` is destructured for taxonomy fields. Grep for `TagTaxonomyMode`, `TagRootID`, `TagMatchThreshold` across `packages/ContentAutotagging/`.

#### Phase 1b checklist

- [ ] **1b.1** Survey all reads of `MJContentSourceEntity_IContentSourceConfiguration` in `packages/ContentAutotagging/`. Grep: `TagTaxonomyMode`, `TagRootID`, `TagMatchThreshold`, `ShareTaxonomyWithLLM`, `EnableVectorization`. List each call site with file:line.
- [ ] **1b.2** At each call site, prefer the new typed column. Fallback to the JSON value only if the typed column is null/default. Pattern:
  ```typescript
  const mode = source.TaxonomyMode ?? config?.TagTaxonomyMode ?? 'AutoGrow';
  // Translate legacy lowercase JSON values to PascalCase if needed
  const normalizedMode = normalizeTaxonomyMode(mode);
  ```
- [ ] **1b.3** Add a small helper `normalizeTaxonomyMode(value: string): 'Constrained' | 'AutoGrow' | 'FreeFlow' | 'Hybrid'` that maps legacy `'constrained' | 'auto-grow' | 'free-flow'` to PascalCase. Place it next to where `TaxonomyMode` is read (likely a new file `packages/ContentAutotagging/src/Engine/generic/TaxonomyMode.ts`).
- [ ] **1b.4** Update `AutotagEntity.ts:115-129` taxonomy-share gate: read `source.TagRootID` directly instead of mapping over `sourceConfigMap`.
- [ ] **1b.5** Update `AutotagEntity.ts:168` mode read: prefer typed column.
- [ ] **1b.6** Pass `source.MatchThreshold` (typed column) to `TagEngine.ResolveTag` instead of the JSON value.
- [ ] **1b.7** Build: `cd packages/ContentAutotagging && npm run build`. Fix errors.
- [ ] **1b.8** Run tests: `cd packages/ContentAutotagging && npm run test`. Update tests that fixture `Configuration` JSON to also set typed columns.
- [ ] **1b.9** Add a regression test: a ContentSource with both JSON and typed values present prefers typed; a ContentSource with only JSON falls back to JSON.

### Phase 1c — Tag engine: persisted embeddings + scope filter + governance methods *(medium risk; ~4–5 days)*

This is the bulk of the engine work. Three concerns bundled because they all touch `TagEngine` and `TagEngineBase`:

1. **Persisted embeddings** — populate `Tag.EmbeddingVector` on Save, use it as the cache hydrate source instead of recomputing every cold start.
2. **Scope-filtered visibility** — new `TagScopeFilterBuilder` produces SQL fragments; thread `scopeContext` through tag lookup.
3. **Governance enforcement** — new methods on `TagGovernanceEngine` that gate auto-creation by per-tag flags + ancestor walk.

**Files:**
- New: `packages/MJCoreEntitiesServer/src/custom/MJTagEntityServer.server.ts` — Save() hook for embedding refresh + vector cache sync.
- New: `packages/AI/Knowledge/TagEngineBase/src/TagScopeFilterBuilder.ts` — scope predicate builder.
- Edit: `packages/AI/Knowledge/TagEngineBase/src/TagEngineBase.ts:31-284` — new scope-aware accessors.
- Edit: `packages/AI/Knowledge/TagEngine/src/TagEngine.ts:186-647` — `refreshTagEmbeddings`, `ResolveTag`, `handleNoMatch`, `createAndEmbedTag`, `buildSubtreeFilter`.
- Edit: `packages/AI/Knowledge/TagEngine/src/TagGovernanceEngine.ts` — new validation/enforcement methods.

#### Phase 1c.1 — Persisted embeddings

- [ ] **1c.1.1** Create `packages/MJCoreEntitiesServer/src/custom/MJTagEntityServer.server.ts`:
  - [ ] Mirror `MJAIAgentNoteEntityServer.server.ts:25-59` exactly.
  - [ ] Override `Save(options)`:
    - Detect when `Name` or `Description` field is dirty (or first save) and trigger embedding refresh.
    - Call `await this.GenerateEmbeddingByFieldName('Name', 'EmbeddingVector', 'EmbeddingModelID')`.
    - If `Name` empty/whitespace, null out `EmbeddingVector` and `EmbeddingModelID`.
    - Call `super.Save(options)`; check boolean return.
    - On success, sync `TagEngine.Instance` vector service: insert/update if `Status='Active'` and `EmbeddingVector` populated, otherwise remove.
- [ ] **1c.1.2** Register the server-side subclass with `@RegisterClass(BaseEntity, 'MJ: Tags')`. Confirm the override is picked up (CodeGen-generated entity class is replaced at runtime by ours).
- [ ] **1c.1.3** Add `AddOrUpdateSingleTagEmbedding(tag)` and `RemoveSingleTagEmbedding(id)` methods to `TagEngine` that update the in-memory `_tagVectorService` (mirroring `AIEngine.AddOrUpdateSingleNoteEmbedding`).
- [ ] **1c.1.4** Refactor `TagEngine.refreshTagEmbeddings` (`packages/AI/Knowledge/TagEngine/src/TagEngine.ts:186-215`):
  - For each tag with non-null `EmbeddingVector` AND `EmbeddingModelID` matching the configured model: parse JSON, push to vector service. Skip the LLM call.
  - For tags missing or mismatched: collect into a batch, call existing `AIModelRunner.RunEmbedding` path (line 218), write results back to the entity (`Save()`), and add to vector service.
  - Log how many were cache-hits vs. computed-fresh — useful telemetry for the perf gain.
- [ ] **1c.1.5** Backfill plan — write a one-shot utility `RebuildTagEmbeddings(contextUser, options?)` on `TagEngine` that walks all `MJ:Tags` rows where `EmbeddingVector IS NULL OR EmbeddingModelID != configured`, computes embeddings, saves. Document running it post-deploy.
- [ ] **1c.1.6** Build + tests: `cd packages/MJCoreEntitiesServer && npm run build`, `cd packages/AI/Knowledge/TagEngineBase && npm run build`, `cd packages/AI/Knowledge/TagEngine && npm run build`. Run tests in each.

#### Phase 1c.2 — Scope filter builder

- [ ] **1c.2.1** Define the scope context type in `packages/AI/Knowledge/TagEngineBase/src/TagScopeContext.ts`:
  ```typescript
  export interface TagScopeContext {
      // (EntityName | EntityID, RecordID) pairs that resolve to a TagScope row match.
      scopes: Array<{ entityName?: string; entityId?: string; recordId: string }>;
      // If true, only IsGlobal tags are returned (no scope rows considered).
      globalOnly?: boolean;
  }
  ```
- [ ] **1c.2.2** Create `packages/AI/Knowledge/TagEngineBase/src/TagScopeFilterBuilder.ts`:
  - [ ] Class `TagScopeFilterBuilder` (extends `BaseSingleton<TagScopeFilterBuilder>`, per CLAUDE.md singleton rule).
  - [ ] Method `buildVisibilityFilter(ctx?: TagScopeContext): string` returns a SQL `WHERE`-suitable predicate:
    - `ctx == null` → `Status = 'Active'` (all tags).
    - `ctx.globalOnly` → `Status = 'Active' AND IsGlobal = 1`.
    - Otherwise → `Status = 'Active' AND (IsGlobal = 1 OR ID IN (subquery on TagScope))`.
  - [ ] Resolve `entityName` to `EntityID` via `Metadata.EntityByName(name)` (per CLAUDE.md — never use `Entities.find`).
  - [ ] All string interpolation must escape single quotes — use a small `escapeId()` helper.
- [ ] **1c.2.3** Method `buildVisibleTagIDPredicate(ctx?: TagScopeContext): string` returns a sub-expression suitable for `subtreeFilter` in vector search (matches a Tag row's ID against the visible set). This is what the vector service uses.
- [ ] **1c.2.4** Method `validateChildScope(parentTag: TagEntity, proposedScopes: Array<{...}>): { ok: boolean; reason?: string }` — used during auto-grow to enforce "child scope ⊆ parent scope OR parent is global."
- [ ] **1c.2.5** Unit tests for each method against canned inputs. Cover: null ctx, globalOnly, multi-scope context, name resolution failure.

#### Phase 1c.3 — TagEngineBase scope-aware accessors

- [ ] **1c.3.1** Add `GetVisibleTags(ctx?: TagScopeContext): MJTagEntity[]` to `TagEngineBase` — filters the `Tags` cache by the visibility predicate.
- [ ] **1c.3.2** Add overload to `GetTagByName(name, ctx?)` — case-insensitive name match scoped to the visible set. Existing `GetTagByName(name)` callers default to no scope.
- [ ] **1c.3.3** Add overload to `GetTaxonomyTree(rootID?, ctx?)` — tree filtered by visibility. Used for prompt-context generation in Phase 1d.
- [ ] **1c.3.4** Build + tests: `cd packages/AI/Knowledge/TagEngineBase && npm run build && npm run test`.

#### Phase 1c.4 — Synonym lookup helper

- [ ] **1c.4.1** Add `GetTagBySynonym(synonym, ctx?): MJTagEntity | undefined` to `TagEngineBase`. Loads `MJ: Tag Synonyms` rows once at `Config()` time into a `Map<lowercased synonym, TagID>`. Returns the Tag if synonym matches and tag is visible in scope.
- [ ] **1c.4.2** Wire `Config()` to load synonyms alongside tags.
- [ ] **1c.4.3** Add unit test: tag "AI" with synonym "Artificial Intelligence" — both names resolve to the same TagID.

#### Phase 1c.5 — Governance methods on TagGovernanceEngine

- [ ] **1c.5.1** Add `ValidateAutoGrow(parentID: string | null, weight: number, contextUser): { ok: boolean; reason?: TagSuggestionReason }` to `TagGovernanceEngine`:
  - Walk parent chain (use `TagEngineBase.GetTagByID` + `ParentID`).
  - Fail with `'ParentFrozen'` if any ancestor `IsFrozen = 1`.
  - Fail with `'AutoGrowDisabled'` if proposed parent `AllowAutoGrow = 0`.
  - Fail with `'MaxChildrenExceeded'` if proposed parent `MaxChildren` is set and current child count is at cap.
  - Fail with `'MaxDepthExceeded'` if any ancestor `MaxDescendantDepth` set and the new child would exceed it.
  - Fail with `'BelowMinWeight'` if proposed parent `MinWeight` set and `weight < MinWeight`.
  - Otherwise `{ ok: true }`.
- [ ] **1c.5.2** Add `EnqueueSuggestion(params): Promise<MJTagSuggestionEntity>` that writes a `TagSuggestion` row. Include `Reason`, `BestMatchTagID`/`BestMatchScore` if available, and source traceability.
- [ ] **1c.5.3** Add `PromoteSuggestion(suggestionID, contextUser): Promise<MJTagEntity>`:
  - Loads the `TagSuggestion` row.
  - If `BestMatchTagID` set and reviewer chose merge: re-points existing `ContentItemTag` rows where `Tag = ProposedName` to `TagID = BestMatchTagID`. Sets suggestion `Status='Merged'`, `ResolvedTagID=BestMatchTagID`.
  - If reviewer chose accept-as-new: creates a new `MJ:Tag` under `ProposedParentID` (subject to governance), inheriting parent scope. Sets suggestion `Status='Approved'`, `ResolvedTagID=newTag.ID`. Re-points `ContentItemTag` rows.
  - All re-pointing fans out via a `RunView` over `ContentItemTag` filtered by `ItemID IN (...) AND Tag = '...'`.
- [ ] **1c.5.4** Add `RejectSuggestion(suggestionID, reviewerNotes, contextUser): Promise<void>`. Sets `Status='Rejected'`.
- [ ] **1c.5.5** Add `MergeSourceSynonyms` extension to existing `MergeTags`: when a tag is merged, copy source's `Name` + all source's `TagSynonym` rows to target as `TagSynonym` rows with `Source='Merged'`.
- [ ] **1c.5.6** Tests for each governance method against canned tag trees.

#### Phase 1c.6 — TagEngine.ResolveTag extensions

- [ ] **1c.6.1** Add `scopeContext?: TagScopeContext` parameter to `ResolveTag` (`packages/AI/Knowledge/TagEngine/src/TagEngine.ts:385`). Default null = no scope = existing behavior.
- [ ] **1c.6.2** Synonym tier — insert before exact match: `TagEngineBase.GetTagBySynonym(text, scopeContext)`. If hit, return immediately.
- [ ] **1c.6.3** Exact + fuzzy tiers — already exist (lines 439-448), thread `scopeContext` through to filter results.
- [ ] **1c.6.4** Semantic tier (line 541-549) — extend `subtreeFilter` to AND the scope predicate from `TagScopeFilterBuilder.buildVisibleTagIDPredicate(scopeContext)`.
- [ ] **1c.6.5** Add tiered confidence routing in the semantic match block:
  - `score >= MatchThreshold` → return matched tag.
  - `SuggestThreshold <= score < MatchThreshold` → call `TagGovernanceEngine.EnqueueSuggestion` with `Reason='BelowThreshold'`, `BestMatchTagID=match.tag.ID`, `BestMatchScore=score`. Return null.
  - `score < SuggestThreshold` → fall through to `handleNoMatch`.
- [ ] **1c.6.6** Update `handleNoMatch` (line 612):
  - If `mode === 'Constrained'` → enqueue suggestion with `Reason='ConstrainedMode'`, return null.
  - If `mode === 'Hybrid'` → enqueue suggestion (with whatever reason from governance) — never auto-creates.
  - For `'AutoGrow'` and `'FreeFlow'`: call `TagGovernanceEngine.ValidateAutoGrow(parentID, weight, contextUser)`.
    - If `{ ok: false, reason }` → enqueue suggestion with that reason.
    - If `{ ok: true }` → proceed to `createAndEmbedTag`.
- [ ] **1c.6.7** Update `createAndEmbedTag` (line 636):
  - When parent is non-global, copy parent's `TagScope` rows to child (snapshot, not link).
  - When parent is global (`IsGlobal=1`), set child `IsGlobal=1`.
- [ ] **1c.6.8** Add unit tests for: synonym hit, semantic match above threshold, semantic in suggestion band, auto-grow blocked by IsFrozen, auto-grow blocked by MaxChildren, scope inheritance on creation.

### Phase 1d — Autotag engine: governance hook + budget + scope-aware prompts *(medium risk; ~3–4 days)*

The autotag engine has a clean plugin point at `OnContentItemTagSaved` (`AutotagBaseEngine.ts:384-401`). Most Phase 1d work is hooking into this and adding budget enforcement around the per-batch loop.

**Files:**
- `packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts` — main plugin surface (lines 218, 333, 384-401, 766, 807-809, 1728).
- `packages/ContentAutotagging/src/Entity/generic/AutotagEntity.ts:115-191` — taxonomy share gate, `BridgeContentItemTagToTaxonomy`.

#### Phase 1d.1 — Scope context derivation per ContentSource

- [ ] **1d.1.1** Add a method `deriveScopeContext(source: MJContentSourceEntity): TagScopeContext` to a new file `packages/ContentAutotagging/src/Engine/generic/ScopeContextResolver.ts`.
  - Strategy: read scope from the source's `TagRootID` ancestry — if `TagRootID` is set and the root tag is non-global, derive scope from that root's `TagScope` rows.
  - If `TagRootID` is null or root is global, return `{ scopes: [], globalOnly: false }` (no scope filter).
  - Future extension point: per-source explicit scope override (e.g. a `ContentSource.ScopeJSON` field). Don't add now — call out as TODO.
- [ ] **1d.1.2** Call `deriveScopeContext` once per source in the autotag run; cache on `this.sourceConfigMap` alongside the `Configuration` blob.

#### Phase 1d.2 — Wire scope into TaxonomyContext

- [ ] **1d.2.1** In `AutotagBaseEngine.ts:333` (`TaxonomyContext` setup, currently in `setupTaxonomyAndBridge` around line 379), pass scope context to `TagEngine.Instance.GetTaxonomyTree(rootID, scopeContext)`.
  - When multiple sources with different scopes are batched together, fall back to the union of their scopes (or skip taxonomy sharing if scopes diverge significantly — call out as a design choice; default to union).
- [ ] **1d.2.2** Verify the LLM prompt receives the scope-filtered taxonomy. Add a log line counting tags shared so we can see the effect.

#### Phase 1d.3 — Wire scope + tiered routing into BridgeContentItemTagToTaxonomy

- [ ] **1d.3.1** In `AutotagEntity.ts:182` (`BridgeContentItemTagToTaxonomy`), pass the derived `scopeContext` and the source's `MatchThreshold` and `SuggestThreshold` to `TagEngine.Instance.ResolveTag(...)`.
- [ ] **1d.3.2** When `ResolveTag` returns null (suggestion enqueued), do NOT set `ContentItemTag.TagID`. Leave the free-text `Tag` value in place; it will be resolved later when the suggestion is approved. This preserves the dual-storage invariant.
- [ ] **1d.3.3** Stamp `SourceContentSourceID` and `SourceContentItemID` on the enqueued `TagSuggestion` for traceability — pass these via `ResolveTag` parameters or via a side-channel `EnqueueSuggestion` call from the bridge.

#### Phase 1d.4 — Volume / cost / new-tag budgets

- [ ] **1d.4.1** Add a `RunBudget` class in `packages/ContentAutotagging/src/Engine/generic/RunBudget.ts`:
  - Tracks `tagsCreatedThisRun`, `tagsCreatedThisItem`, `tokensUsedThisRun`, `costThisRun`.
  - `recordTagCreated(itemID)`, `recordTokens(n)`, `recordCost(c)` methods.
  - `checkBudgets(): { ok: boolean; reason?: string }` — checks against limits from the `MJContentSourceEntity` (the new typed columns).
  - `reset()` for new run.
- [ ] **1d.4.2** Instantiate one `RunBudget` per source per run; cache on `sourceConfigMap`.
- [ ] **1d.4.3** Hook `RunBudget.recordTagCreated` from `TagEngine.createAndEmbedTag` callback. Cleanest: pass a `onTagCreated` callback into `ResolveTag` (no global state). Alternative: emit an event on `TagEngine` and have the bridge subscribe.
- [ ] **1d.4.4** Hook token + cost recording from the existing `MJ:Content Process Run Prompt Runs` rollup path. The autotag pipeline already tracks tokens in `ContentProcessRunDetail.TotalTokensUsed`; tap that flow.
- [ ] **1d.4.5** In the per-batch loop in `AutotagBaseEngine.ts` (around line 141 / `ExtractTextAndProcessWithLLM`), after each batch check `RunBudget.checkBudgets()`. If hit:
  - Set the `ContentProcessRun.Status='Paused'`.
  - Set `CancellationRequested=1` so the existing graceful-stop machinery handles continuation.
  - Set `ContentProcessRunDetail.ErrorMessage` (or a new "PauseReason" field if we want to be explicit — call out as future work).
  - Log structured event for monitoring.
- [ ] **1d.4.6** Add per-item budget check: at the start of each `ContentItem` processing, reset `tagsCreatedThisItem`. Inside `BridgeContentItemTagToTaxonomy`, if `tagsCreatedThisItem >= MaxNewTagsPerItem`, route subsequent free-text tags to suggestions instead of creating new ones.

#### Phase 1d.5 — Co-occurrence trigger plumbing (already exists, just verify)

- [ ] **1d.5.1** Confirm `recomputeCoOccurrenceIfAvailable` (line 218 / 1728) still runs at end of run after these changes.
- [ ] **1d.5.2** No code change here — Phase 1e extends the co-occurrence engine to emit suggestions; that emission also runs in the existing post-run hook.

#### Phase 1d.6 — Build + tests

- [ ] **1d.6.1** Build: `cd packages/ContentAutotagging && npm run build`. Fix errors.
- [ ] **1d.6.2** Tests: `cd packages/ContentAutotagging && npm run test`. Update fixtures to set typed columns alongside JSON.
- [ ] **1d.6.3** Add new tests:
  - Constrained mode + no match → suggestion enqueued, no tag created, `ContentItemTag.TagID = NULL`.
  - Hybrid mode + ambiguous match → suggestion enqueued.
  - AutoGrow + frozen ancestor → suggestion enqueued with `Reason='ParentFrozen'`.
  - AutoGrow + budget hit → run pauses, suggestion enqueued for remaining items.
  - Scope-filtered taxonomy: tag in scope A is not in TaxonomyContext for source in scope B.

### Phase 1e — Tag Health: extend co-occurrence into suggestion emission *(low risk; ~2–3 days)*

`TagCoOccurrenceEngine` already populates `MJ:Tag Co Occurrences`. Phase 1e adds three suggestion emitters on top: merge candidates (high co-occurrence + high name/embedding similarity), low-usage deprecation candidates, and wide-node alerts.

**Files:**
- Edit: `packages/AI/Knowledge/TagEngine/src/TagCoOccurrenceEngine.ts` — add `EmitMergeSuggestions(thresholds, contextUser)`.
- New: `packages/AI/Knowledge/TagEngine/src/TagHealthJob.ts` — composes all three emitters into a single job.
- Edit: `packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts:1728` — extend `recomputeCoOccurrenceIfAvailable` to also call the health job.

#### Phase 1e.1 — Merge candidate emitter

- [ ] **1e.1.1** Add method `EmitMergeSuggestions(thresholds: { minCoOccurrence: number; minNameSimilarity: number; minEmbeddingSimilarity: number }, contextUser): Promise<number>` to `TagCoOccurrenceEngine`. Returns count of suggestions emitted.
- [ ] **1e.1.2** Walk `MJ:Tag Co Occurrences` rows where `CoOccurrenceCount >= minCoOccurrence`.
- [ ] **1e.1.3** For each pair: check name similarity (use existing fuzzy normalization from `TagEngine`) and embedding cosine similarity (use the in-memory vector service).
- [ ] **1e.1.4** When both pass thresholds, enqueue a `TagSuggestion`:
  - `ProposedName = TagA.Name`
  - `BestMatchTagID = TagB.ID`
  - `BestMatchScore = embedding similarity`
  - `Reason = 'MergeCandidate'`
  - Source fields null (this is taxonomy-level, not item-level).
- [ ] **1e.1.5** Idempotency: skip pairs where a `TagSuggestion` with `(ProposedName=A.Name AND BestMatchTagID=B.ID)` already exists in `Status='Pending'`.

#### Phase 1e.2 — Low-usage deprecation emitter

- [ ] **1e.2.1** Add `EmitLowUsageSuggestions(thresholds: { maxUsage: number; lookbackDays: number }, contextUser): Promise<number>` to a new helper class or method.
- [ ] **1e.2.2** For each `Active` tag: count `MJ:Tagged Items` and `MJ:Content Item Tags` referencing it where `__mj_CreatedAt > NOW() - lookbackDays`.
- [ ] **1e.2.3** When total usage `< maxUsage`, enqueue suggestion with `Reason='LowUsage'`, `BestMatchTagID = null`, `ProposedParentID = tag.ParentID`. The reviewer's options will be: deprecate, delete, leave.
- [ ] **1e.2.4** Idempotency: skip tags with existing pending `LowUsage` suggestions.

#### Phase 1e.3 — Wide-node alert emitter

- [ ] **1e.3.1** Add `EmitWideNodeSuggestions(thresholds: { maxImplicitChildren: number }, contextUser)`.
- [ ] **1e.3.2** For each tag: count direct children. If exceeds `MaxChildren` (when set) OR exceeds `maxImplicitChildren` (default for nodes without explicit cap), enqueue suggestion with `Reason='WideNode'`, `ProposedParentID = tag.ID`.
- [ ] **1e.3.3** Idempotency check.

#### Phase 1e.4 — Job composition + wiring

- [ ] **1e.4.1** Create `packages/AI/Knowledge/TagEngine/src/TagHealthJob.ts`:
  - Class `TagHealthJob` with method `Run(thresholds, contextUser): Promise<TagHealthSummary>`.
  - Calls all three emitters; aggregates counts.
  - Returns summary `{ mergeCount, lowUsageCount, wideNodeCount, durationMs }`.
- [ ] **1e.4.2** In `AutotagBaseEngine.ts:1728` (`recomputeCoOccurrenceIfAvailable`), after the existing co-occurrence call, optionally invoke `TagHealthJob.Run(...)` based on a config flag (e.g., `RunBudget` or a new `MJ:Content Process Run.RunHealthJob` field — call out as future). For now, gate behind an environment variable or always-run.
- [ ] **1e.4.3** Add ability to invoke `TagHealthJob` via a `MJ:Scheduled Action` so it can run independently of any autotag run (nightly, etc.). Document in the plan but defer scheduled-action metadata to a follow-up if the hook is straightforward.

#### Phase 1e.5 — Build + tests

- [ ] **1e.5.1** Build: `cd packages/AI/Knowledge/TagEngine && npm run build`.
- [ ] **1e.5.2** Tests: synthetic `TagCoOccurrence` + `Tagged Items` fixtures → expected `TagSuggestion` rows. Idempotency: re-run produces zero new suggestions.

### Phase 1f — UI consumers *(parallelizable after Phase 1a; ~3–6 days total across surfaces)*

UI work depends on the new entities being CodeGen'd (Phase 1a). Each surface is independent and can ship in parallel branches if desired.

**Files:**
- `packages/Angular/Explorer/dashboards/src/AI/components/autotagging/autotagging-pipeline-resource.component.ts:3257-3322` — taxonomy admin tree (already exists).
- `packages/Angular/Explorer/dashboards/src/KnowledgeHub/analytics-resource.component.ts:1224-1228` — Knowledge Hub tag facet.
- `packages/Angular/Generic/record-tags/src/lib/record-tags.component.ts:98-103` — record-level tag display.
- New: a Suggestion Inbox component (~500 lines).
- Auto-generated forms for `MJ:TagScope`, `MJ:TagSynonym`, `MJ:TagSuggestion` (CodeGen — no hand-written code unless customizing).

#### Phase 1f.1 — Knowledge Hub tag facet scope filter

- [ ] **1f.1.1** In `analytics-resource.component.ts:1224-1228`, add `ExtraFilter` to the `MJ: Tags` RunView call. Filter expression should match what's visible to the current user/company (use `TagScopeFilterBuilder` server-side via a small resolver, or compute the filter client-side using already-loaded scope data).
- [ ] **1f.1.2** Add a "Show only my org's tags" toggle (default on) above the tag facet.

#### Phase 1f.2 — Taxonomy admin (`autotagging-pipeline-resource.component.ts`)

- [ ] **1f.2.1** In `buildTaxTree` (line 3257-3322), filter `tagsRaw` by the current user's scope before building the tree. Reuse the tag facet's scope query.
- [ ] **1f.2.2** Add per-node config panel (right sidebar) — when a tag is selected, show governance fields:
  - `IsGlobal`, `AllowAutoGrow`, `IsFrozen`, `MaxChildren`, `MaxDescendantDepth`, `MinWeight`, `RequiresReview`.
  - `TagScope` editor (M2M control to Companies / Agents / etc.). Lock if `IsGlobal=1` (per invariant).
  - `TagSynonym` editor (list with add/remove).
- [ ] **1f.2.3** Add validation feedback when an admin tries to:
  - Set `IsGlobal=1` on a tag with TagScope rows → block, show explanation.
  - Add TagScope row to an `IsGlobal=1` tag → block, show explanation.
  - Make a child's scope wider than its parent → block.
- [ ] **1f.2.4** Add visual badges in the tree:
  - Green dot: `IsGlobal=1`.
  - Lock icon: `IsFrozen=1`.
  - "No-grow" icon: `AllowAutoGrow=0`.
  - Scope badge with company count when not global.

#### Phase 1f.3 — Suggestion Inbox component

- [ ] **1f.3.1** New component: `packages/Angular/Explorer/dashboards/src/AI/components/autotagging/tag-suggestion-inbox.component.ts`.
- [ ] **1f.3.2** Fetches `MJ:TagSuggestion WHERE Status='Pending'` via `RunView`. Filterable by `Reason`, `SourceContentSourceID`, date range.
- [ ] **1f.3.3** Per-row actions:
  - **Accept as new** → calls `TagGovernanceEngine.PromoteSuggestion(id, { strategy: 'CreateNew' })`.
  - **Merge into existing** → reviewer picks an existing tag (`tag-tree` picker or autocomplete); calls `PromoteSuggestion(id, { strategy: 'Merge', targetTagID })`.
  - **Reject** → calls `RejectSuggestion(id, notes)`.
- [ ] **1f.3.4** Bulk actions: select-all + "approve all suggestions with score >= X" for the merge-candidate cohort.
- [ ] **1f.3.5** Drill into source: click a suggestion to see the `MJ:Content Item` it came from + a few neighboring items with the same tag.

#### Phase 1f.4 — ContentSource form: replace JSON editor with structured fields

- [ ] **1f.4.1** CodeGen will regenerate the `MJContentSource` form to include the new typed fields automatically. Confirm visually after Phase 1a.
- [ ] **1f.4.2** Optional polish (custom form override per CLAUDE.md custom-form pattern):
  - `TaxonomyMode` as a radio group with explanatory copy under each option.
  - `TagRootID` as a tag-tree picker (reuse the taxonomy admin tree component).
  - `MatchThreshold` / `SuggestThreshold` as paired sliders with a live histogram of last-run match distribution.

#### Phase 1f.5 — Run Monitor (no schema changes needed)

- [ ] **1f.5.1** If a Run Monitor doesn't already exist, defer to a separate plan. The existing `MJ:Content Process Run` schema fully supports it; it's a UI-only effort.

#### Phase 1f.6 — Generic record-tags tag picker (defer)

- [ ] **1f.6.1** No-op for this phase. Confirmed at investigation time that `record-tags.component.ts` only displays existing tags and does NOT include a candidate-list picker. Adding a picker is a separate feature.
- [ ] **1f.6.2** When a picker IS added (future): use `TagEngineBase.GetVisibleTags(scopeContext)` so it auto-respects scope.

#### Phase 1f.7 — Build + tests + manual verification

- [ ] **1f.7.1** Build affected Angular packages.
- [ ] **1f.7.2** Tests: component-level for the inbox + taxonomy admin per-node panel.
- [ ] **1f.7.3** Manual verification using `playwright-cli` per the workbench workflow in CLAUDE.md:
  - Start MJAPI + MJExplorer.
  - Create a test tag, add a TagScope row, verify visibility filtering in Knowledge Hub.
  - Run the autotagger on a small content source with `TaxonomyMode='Constrained'` — verify no tags created and suggestions enqueued.
  - Approve a suggestion in the inbox — verify the existing `ContentItemTag` rows for the proposed name get re-pointed.

---

## 6. Cross-cutting concerns

### 6.1 Backwards compatibility
- M5's typed columns coexist with the existing `Configuration` JSON. Phase 1b reads typed first, JSON fallback. Aim to remove the JSON-fallback path in v5.32 (next minor).
- All schema additions are nullable or have safe defaults. Existing customers see no behavior change until they opt in.

### 6.2 Performance
- The biggest perf improvement is Phase 1c.1.4: load embeddings from cache instead of re-embedding every cold start. Log the cache hit rate to confirm.
- The composite index on `TagScope (ScopeEntityID, ScopeRecordID, TagID)` is the critical hot-path index. Verify execution plans on a large fixture.
- The visibility predicate uses an `EXISTS` subquery; benchmark against a flat `IN` for typical scope cardinalities.

### 6.3 Error handling
- All new `BaseEntity.Save()` calls must check the boolean return and use `LatestResult?.CompleteMessage` per CLAUDE.md.
- All `RunView` calls must check `Success` per CLAUDE.md.
- Entity name lookups must use `Metadata.EntityByName(name)` per CLAUDE.md (case-insensitive O(1)).
- All new singletons must extend `BaseSingleton<T>` per CLAUDE.md.

### 6.4 Multi-provider safety
- Anywhere a per-provider `IMetadataProvider` is available (e.g., inside `BaseEngine` subclasses), use `this.ProviderToUse` rather than `new Metadata()`. Per CLAUDE.md.
- `TagScopeFilterBuilder` should accept an optional `provider?: IMetadataProvider` parameter.

### 6.5 Type safety
- No `any` types per CLAUDE.md. New types: `TagScopeContext`, `TagSuggestionReason` (union string literal), `RunBudget`, `TagHealthSummary`.
- All `RunView` calls use generics + correct `ResultType`.

### 6.6 Git / branching / PR
- All work in this PR lands on `claude/autotagger-scope-and-governance` branch.
- Sub-phases land in separate commits to make review tractable. Suggested commit groupings:
  1. Phase 1a (5 migrations + CodeGen output).
  2. Phase 1b (engine config promotion).
  3. Phase 1c.1 (persisted embeddings).
  4. Phase 1c.2-1c.3 (scope filter + accessors).
  5. Phase 1c.4 (synonyms).
  6. Phase 1c.5-1c.6 (governance + ResolveTag extensions).
  7. Phase 1d (autotag engine hooks + budget).
  8. Phase 1e (tag health).
  9. Phase 1f (UI).

---

## 7. Open questions for human decision

1. **CDP versus MJ migration strategy.** This plan was authored from CDP context (which consumes MJ as a transitive dep). Confirm the flow: ship migrations + engine in MJ → bump MJ to v5.32 → CDP picks up via dep update. If CDP has its own customizations to verify, list them up front.
2. **Cross-table validation triggers (M2).** Two new triggers enforce the `IsGlobal ⊕ TagScope` invariant. MJ has no precedent for cross-table validation triggers today (only `trgUpdate*` timestamp triggers). Acceptable, or prefer entity-class `Save()` enforcement only? Recommendation: keep triggers as defense-in-depth; add class-level pre-checks for nicer error messages.
3. **Embedding model change rebuild.** When `Tag.EmbeddingModelID` changes globally (admin reconfigures the tag embedding model), we need a one-shot rebuild. Phase 1c.1.5 adds the utility — confirm we want to wire it to a scheduled action vs. a manual CLI invocation.
4. **`Content Item Tags.Tag_Virtual` field.** Noticed in `entity_subclasses.ts` — appears to be a denormalized view of the matched `Tag.Name` when `TagID` is set. Confirm it's still used vs. deprecated; may simplify Phase 1c.6 if we can remove it.
5. **Per-source explicit scope override.** Phase 1d.1 derives scope from `TagRootID`'s ancestry. Sufficient for v1, or do we want a per-source scope JSON field too? Defer call until customers ask.
6. **Hybrid mode interaction with `RequiresReview`.** Both routes to suggestions. Confirm: when both apply, does the suggestion just get one row (with `Reason='RequiresReview'` taking precedence over `Reason='AmbiguousMatch'`)? Recommendation: precedence order documented in code comment.

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
| **IsGlobal** | BIT | NO | DEFAULT 0; seeded to 1 for existing rows |
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
| Status | NVARCHAR(20) | NO |
| ResolvedTagID | UNIQUEIDENTIFIER | YES |
| ReviewedByUserID | UNIQUEIDENTIFIER | YES |
| ReviewedAt | DATETIMEOFFSET | YES |
| ReviewerNotes | NVARCHAR(MAX) | YES |

CHECK: `Status IN ('Pending','Approved','Rejected','Merged')`.

### `__mj.ContentSource` (existing, extended)
New columns added by M5:
| Column | Type | Nullable | Default |
|---|---|---|---|
| TaxonomyMode | NVARCHAR(20) | NO | 'AutoGrow' |
| TagRootID | UNIQUEIDENTIFIER | YES | NULL |
| MatchThreshold | DECIMAL(3,2) | NO | 0.80 |
| SuggestThreshold | DECIMAL(3,2) | YES | NULL |
| MaxNewTagsPerRun | INT | YES | NULL |
| MaxNewTagsPerItem | INT | YES | NULL |
| MaxTokensPerRun | INT | YES | NULL |
| MaxCostPerRun | DECIMAL(10,4) | YES | NULL |

CHECK: `TaxonomyMode IN ('Constrained','AutoGrow','FreeFlow','Hybrid')`. FK: `TagRootID → Tag(ID)`.

---

## 9. Appendix B — Plugin point map

| Concern | File | Line | Mechanism |
|---|---|---|---|
| Per-tag governance enforcement | `AutotagBaseEngine.ts` | 384-401 | `OnContentItemTagSaved` callback (set inside `setupTaxonomyAndBridge`) |
| Tag resolution scope filtering | `TagEngine.ts` | 541-549 | Existing `subtreeFilter` parameter to `_tagVectorService.FindNearest` |
| Tag auto-creation gate | `TagEngine.ts` | 612-647 | `handleNoMatch` + `createAndEmbedTag` |
| Embedding cache hydration | `TagEngine.ts` | 186-215 | `refreshTagEmbeddings` (refactor to load-from-DB-first) |
| Embedding refresh on Save | `MJTagEntityServer.server.ts` (NEW) | — | `Save()` override pattern from `MJAIAgentNoteEntityServer.server.ts:25-59` |
| Cross-table invariant | DB triggers (M2) | — | `trgEnforceTagScopeInvariant`, `trgEnforceTagIsGlobalInvariant` |
| Co-occurrence post-run hook | `AutotagBaseEngine.ts` | 218, 1728 | `recomputeCoOccurrenceIfAvailable` (extend to also call TagHealthJob) |
| LLM taxonomy context | `AutotagBaseEngine.ts` | 333, 379, 586 | `TaxonomyContext` field → `existingTaxonomy` template variable |
| Mode branching | `AutotagEntity.ts` | 168-191 | Read `TaxonomyMode`; branch on Constrained/AutoGrow/FreeFlow/Hybrid |
| Run cancellation / pause | `MJ:Content Process Run` schema | — | `CancellationRequested`, `LastProcessedOffset` (existing fields) |

---

## 10. Definition of done for Phase 1

Phase 1 ships when ALL of the following are true:

- [ ] All 10 sub-phase checklists complete.
- [ ] All migrations apply cleanly to a fresh DB and to a DB with existing tag/content data.
- [ ] CodeGen has been run; generated entity classes and forms exist.
- [ ] All affected packages build cleanly: `MJCoreEntities`, `MJCoreEntitiesServer`, `MJServer`, `AI/Knowledge/TagEngineBase`, `AI/Knowledge/TagEngine`, `ContentAutotagging`.
- [ ] All affected packages' unit tests pass.
- [ ] Manual smoke test: end-to-end run of autotagger in each of the four modes against a small fixture content source. Suggestions appear in the inbox for the appropriate cases.
- [ ] PR description includes: design doc summary, list of new entities, before/after of `MJContentSourceEntity_IContentSourceConfiguration` (JSON → typed), known follow-ups for v5.32 (remove JSON fallback).
- [ ] Open questions in §7 above are resolved with the maintainer before merge.

---

*End of plan.*

