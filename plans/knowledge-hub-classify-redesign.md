# Knowledge Hub — "Classify" Sub-App Redesign

**Branch:** `knowledge-hub-classify-redesign` (tracks `origin/knowledge-hub-classify-redesign`, cut from `next`)
**Status:** Plan → Mockup (awaiting feedback) → Full implementation
**Owner:** Amith / Claude
**Created:** 2026-05-31

---

## 1. Goal

Make the Classify sub-app **easier to configure** and **more powerful** by:

1. **Decomposing the 11k-line monolith** into a host shell + per-tab + per-dialog child components, plus a reactive data engine.
2. **Bringing dashboard configuration to 100% parity** with the Content Source form panels (no more "Open advanced settings →" hop out of the app).
3. **Surfacing backend capabilities that today have no UI**: Tag Suggestions inbox, Synonyms, Tag Scope, per-tag Governance editing, true Tag Health.
4. **Adding a dry-run / preview** so operators can see what a run *would* tag before spending budget.

The classifier's engine is already more capable than its cockpit. Most of this work is **exposing what exists**, not building new backend power.

---

## 2. Current State (ground truth)

- **One component**: [autotagging-pipeline-resource.component.ts](../packages/Angular/Explorer/dashboards/src/AI/components/autotagging/autotagging-pipeline-resource.component.ts) — 5,147 TS + 2,044 HTML + 3,744 CSS. Six tabs (Pipeline · Sources · Types · Tags · Taxonomy · History) and ~12 dialogs in a single class. Raw `RunView`/`RunQuery` inline; no data engine.
- **Config is split-brained**: the slide-in source form is a deliberate subset. Taxonomy mode, match/suggest thresholds, tag root, and budgets live in the `Configuration` JSON blob, surfaced only on the Content Sources **entity form** via [tag-pipeline-configuration.panel.ts](../packages/Angular/Explorer/core-entity-forms/src/lib/panels/content-sources/tag-pipeline-configuration.panel.ts), reached by navigating *out* of the dashboard.
- **Backend ahead of UI**: `TagEngine` (4+1-tier resolution), `TagGovernanceEngine` (merge/split/move/deprecate + audit), suggestion queue, synonyms, scope, co-occurrence — mostly unexposed. The Tags tab's health is a naive `itemCount + avgWeight` heuristic ([computeTagHealth](../packages/Angular/Explorer/dashboards/src/AI/components/autotagging/autotagging-pipeline-resource.component.ts)).
- **Good bones**: chrome trio + `mj-left-nav` + `mj-page-header-interior`, agent context/tools wired, `UserInfoEngine` for prefs, **0 hardcoded hex** (all design tokens), live pipeline progress via GraphQL subscription.

---

## 3. Schema Audit & Decisions

Ground-truth audit of `packages/MJCoreEntities/src/generated/entity_subclasses.ts`:

| Capability | Current schema support | Decision |
|---|---|---|
| **Suggestions Inbox** | `MJTagSuggestion`: ProposedName, ProposedParentID, BestMatchTagID, BestMatchScore, Reason, SourceContentItemID, Status, ResolvedTagID, **ReviewedByUserID, ReviewedAt, ReviewerNotes** all present | **No change.** Schema fully sufficient. |
| **Per-tag governance** | `MJTag`: IsFrozen, AllowAutoGrow, MinWeight, MaxChildren, MaxDescendantDepth, RequiresReview, IsGlobal all present | **No change.** |
| **Tag scope / multi-tenancy** | `MJTagScope`: (ScopeEntityID, ScopeRecordID) + `MJTag.IsGlobal` | **No change.** |
| **Synonyms with provenance** | `MJTagSynonym`: TagID, Synonym, **Source** (Manual/LLM/Imported/Merged). **No approval status.** | **CHANGE — add `Status` column** (`Active`/`Pending`/`Rejected`, default `Active`) so LLM/imported synonyms can be reviewed before going live. One additive column. |
| **True Tag Health** | `MJTagCoOccurrence` (TagAID, TagBID, CoOccurrenceCount, LastComputedAt) materialized; tag embeddings on `MJTag.EmbeddingVector` | **No change initially.** Compute merge-candidates / low-usage / wide-node on-the-fly from CoOccurrence + usage counts. Persisted `MJTagHealthSignal` table deferred until perf demands it. |
| **Dry-run / preview** | None | **No schema change.** Implement as an in-memory/ephemeral classify path that returns proposed tags + suggestions **without** persisting `ContentItemTag`/`Tag`/`TaggedItem`. (Optional future `IsDryRun` flag on `ContentProcessRun` only if we want dry-runs in run history.) |
| **Per-source classify config** | In `MJContentSource.Configuration` JSON (`IContentSourceConfiguration`): TagTaxonomyMode, TagRootID, TagMatchThreshold, SuggestThreshold, Max*PerRun/PerItem, ShareTaxonomyWithLLM, EnableVectorization | **DECISION POINT (see §3.1).** Default plan: **keep JSON**, reach parity by binding the dashboard to the same typed interface the panel uses. Optional stretch: promote to real columns. |

### 3.1 Config: JSON blob vs real columns

- **Keep JSON (default, lower risk):** the panel already reads/writes `Configuration` via the typed `IContentSourceConfiguration` interface. Dashboard parity just means binding the same interface in the dashboard dialogs. No migration, no `PUBLISH_NO_BREAK` exposure. Con: no CodeGen form fields, weaker discoverability.
- **Promote to columns (stretch):** strong typing, `TagRootID` FK integrity, CodeGen forms. Con: migration + dual-read/back-compat for existing JSON, and Content Sources may be in a published OpenApp (additive columns are fine; *removing* the JSON later is the breaking part). **Recommendation: keep JSON for this pass; revisit promotion as a follow-up once the UI stabilizes.**

### 3.2 Migration scope for this pass

- **One migration** in `migrations/v5/`: add `MJTagSynonym.Status` (NVARCHAR(20) NOT NULL DEFAULT 'Active') with a CHECK/value-list (`Active`,`Pending`,`Rejected`) + `sp_addextendedproperty`. Run migration + CodeGen → use generated typed property (no `.Get()/.Set()`).

---

## 4. Workstreams

### Phase 0 — Schema (small)
- Migration: `MJTagSynonym.Status`. Run migration + CodeGen. Verify generated `Status` getter/setter typed union.

### Data layer — REUSE existing engines (no new engine)
Audited MJCoreEntities + AI/Knowledge. The cacheable metadata already has client-safe, BaseEngine-reactive engines — **do not build a new one.** Caching boundary (per user): cache infrequently-changed metadata; **never** cache high-volume rows (Content Items can be millions).

| Data | Source | Cached |
|---|---|---|
| Content Sources / Types / Source Types / File Types / Entity Documents / Vector Indexes | `KnowledgeHubMetadataEngine` (`@memberjunction/core-entities`) | ✅ exists; component already imports it |
| Tags / Tag Scopes / Tag Synonyms (governance flags strongly typed on `MJTagEntity`) | `TagEngineBase` (`@memberjunction/tag-engine-base`, client+server safe; **add as ng-dashboards dep**) | ✅ exists |
| AI Models | `AIEngineBase` (already imported) | ✅ exists |
| Content Items · Content Item Tags · Tagged Items · Process Runs · Process Run Details · **Tag Suggestions (Inbox + Health)** · Tag Audit Logs · Co-occurrence · Duplicates | **`RunView`, no caching** — high-volume or transactional; filter/paginate | ❌ by design |

**Key reuse:** Tag Health signals are already `MJTagSuggestion` rows — server-side `TagHealthJob` writes `Reason ∈ {MergeCandidate, LowUsage, WideNode}`. Inbox and Health are two filtered views over one table; no new data path. The component's redundant private `contentSourcesRaw`/`contentTypesRaw`/`contentSourceTypesRaw`/`contentFileTypesRaw`/`tagsRaw` arrays are replaced by reads from `KnowledgeHubMetadataEngine` / `TagEngineBase` (typed entities, reactive via `ObserveProperty`).

### Phase 1 — Decompose the monolith (mechanical, CLI-driven)
Directory layout (the component already lives in `.../autotagging/`):

```
autotagging/
  autotagging-pipeline-resource.component.{ts,html,css}   ← host shell: left-nav, tab routing, engine wiring, agent context
  shared/
    classify.types.ts                                     ← all interfaces (NavItem, SourceCard, TagRow, TaxTreeNode, …)
  tabs/
    pipeline-tab.component.{ts,html,css}
    sources-tab.component.{ts,html,css}
    types-tab.component.{ts,html,css}
    tags-tab.component.{ts,html,css}
    taxonomy-tab.component.{ts,html,css}
    history-tab.component.{ts,html,css}
  dialogs/
    source-form.dialog.{ts,html,css}
    content-type-form.dialog.{ts,html,css}
    schedule.dialog.{ts,html,css}
    create-tag.dialog.{ts,html,css}
    split-tag.dialog.{ts,html,css}
    move-tag.dialog.{ts,html,css}
    merge-into.dialog.{ts,html,css}
    confirm.dialog.{ts,html,css}
    item-detail.dialog.{ts,html,css}
    source-detail.dialog.{ts,html,css}
    run-detail.dialog.{ts,html,css}
```

**Mechanical extraction rules (CLI, not inference, to avoid regressions):**
- HTML sections are already contiguous and comment-delimited (`<!-- TAB 1: PIPELINE MONITOR -->`, dialog blocks). Use `sed -n 'A,Bp'` to **move** each block verbatim into the new template, then delete the source range. No re-typing.
- CSS: extract per-feature rule groups by selector prefix (`.at-kpi*`, `.at-tax*`, `.at-source*`, …) into the owning component's CSS via `grep -n`/`sed` ranges; shared tokens/utilities stay in a `shared` stylesheet or the host.
- TS: state + methods are interleaved, so per-block `sed` won't cleanly carve a tab. Approach: (a) move **cross-cutting data** (loads, raw arrays, derived cards) into `KnowledgeClassifyEngine`; (b) move **contiguous method groups** (already grouped by tab in the file — e.g. taxonomy methods ~3447–4900) into their component via `sed` ranges; (c) thin children take inputs from the engine/host and emit events up. Each move compiled immediately (`npm run build` in the dashboards package) before the next.
- Components: **follow the package's existing module/standalone pattern** (verify on first file); new leaf components prefer standalone per root rule #4. Thread `[Provider]` per Angular multi-provider rule.
- Acceptance: app builds, all six tabs + dialogs behave identically, no regressions. This phase is **behavior-preserving** — pure structure.

### Phase 2 — Config parity in the dashboard
- Upgrade the **source-form dialog** to expose **every** `IContentSourceConfiguration` knob the entity-form panel does: taxonomy mode (first-class card choice), match/suggest **threshold band**, tag root picker, all budgets (items/tags-per-run/tags-per-item/tokens/cost), ShareTaxonomyWithLLM, EnableVectorization, website-crawler settings.
- Show **effective (cascaded) values**: source override → content-type default → global, so users see what's actually in effect.
- Keep the entity-form panel working (shared interface); the "Open advanced settings" link becomes optional, not required.

### Phase 3 — New surfaces (backend capabilities, no UI today)
- **Suggestions Inbox** — review queue over `MJTagSuggestion` (filter by Reason/Status; Approve / Merge-into-existing / Reject; writes ReviewedBy/At/Notes/ResolvedTagID). Makes "hybrid" mode usable. *IA placement = mockup decision (Option A vs B).*
- **Synonyms editor** — on the tag editor: add/list synonyms with Source pills; pending (LLM/imported) vs active (gated by new `Status`).
- **Scope editor** — Global vs scoped (Entity, Record) tuples with inheritance preview.
- **Governance editor** — IsFrozen, AllowAutoGrow, MinWeight, MaxChildren, MaxDescendantDepth, RequiresReview on the tag editor, with subtree-impact hints.
- **True Tag Health** — replace the heuristic with real signals: merge candidates (co-occurrence + embedding cosine), low-usage deprecation, wide-node alerts; bulk actions route through the existing governance engine.

### Phase 4 — Dry-run / preview
- "Preview run" on a source: classify a small sample in-memory, render proposed tags + which would auto-apply vs route to inbox vs create-new, with token/cost estimate. No persistence. Backend: ephemeral path in the autotag engine returning results without `Save()`.

### Phase 5 — Polish, tests, build
- Per-package `npm run build` green; update/author unit tests; agent context/tools updated for new tabs; design-token + chrome-convention compliance check.

---

## 5. Sequence & gates

1. ✅ Branch cut from `next`, pushed, tracking its own remote.
2. ✅ Plan (this doc).
3. **→ Mockup** (current vs future; 2+ options) — **STOP for feedback.**
4. After feedback: Phase 0 → 5 end-to-end without stopping.

---

## 6. Open decisions for the user (resolve at mockup feedback)

- **A. IA for new surfaces** — Option A (new top-level tabs: Inbox, Health; governance/synonyms/scope as panels on tag editor) vs Option B (unified "Curate" cockpit merging taxonomy + inbox + health + synonyms + scope). *Shown in mockup.*
- **B. Config storage** — keep `Configuration` JSON (default) vs promote hot knobs to real columns (stretch).
- **C. Dry-run persistence** — pure in-memory (default) vs optional `ContentProcessRun.IsDryRun` for run-history visibility.

---

## 7. Risks

- **Decomposition regressions** — mitigated by behavior-preserving CLI moves + compile-after-each-move + manual parity pass per tab.
- **CSS bleed** — 3,744 lines of `.at-*` rules; ensure per-component encapsulation doesn't drop shared styles. Extract by selector prefix carefully.
- **Engine caching boundary** — `MJ: Tags` can be large; cache lookups but punt huge/text columns to targeted `RunView` (mirror `ComponentMetadataEngine` guidance).
