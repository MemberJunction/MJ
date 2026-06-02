# Classify (Content Autotagging) — Knowledge Hub Sub-App

The **Classify** sub-app is the Knowledge Hub's content-classification cockpit: ingest sources, run the autotagging pipeline, curate the tag taxonomy, review ambiguous classifications, and monitor taxonomy health. It is registered as the Knowledge Hub's default nav item via `@RegisterClass(BaseResourceComponent, 'AutotaggingPipelineResource')`.

> **History:** this directory was a single 5,147-line component. It is now a thin host shell (~1,640 lines) that delegates each tab to a self-contained sub-page component. The classifier's engine has always been more capable than its UI exposed — much of the recent work is *surfacing* existing backend capability (suggestions, governance, synonyms, scope, health) that previously had no UI.

## Directory layout

```
autotagging/
  autotagging-pipeline-resource.component.{ts,html,css}   Host shell: left-nav, @switch tab routing,
                                                          pipeline run orchestration (RunPipeline + GraphQL
                                                          subscription), the source/type form host, deep-linking
                                                          (NavigationService), prefs (UserInfoEngine), agent context/tools.
  tabs/
    pipeline-tab.component.*      Pipeline monitor (presentational; host owns run orchestration)
    sources-tab.component.*       Source cards + source-detail panel + schedule dialog + dry-run launch
    types-tab.component.*         Content type cards
    tags-tab.component.*          Tag library, word cloud, drill-down
    taxonomy-tab.component.*      Tree / duplicates / orphans / treemap / audit + Governance/Synonyms/Scope editors
                                  + Split/Move/Merge/Create/Confirm dialogs
    inbox-tab.component.*         Suggestions Inbox (human-in-the-loop review queue)            [NEW]
    health-tab.component.*        Tag Health signals                                            [NEW]
    history-tab.component.*       Run history + per-run detail
  dialogs/
    source-type-form.dialog.component.*   Add/edit Source + Content Type slide-in form (+ full classifier config)
    item-detail.dialog.component.*        Content item detail slide-in (shared by tags/sources/pipeline)
    no-content-type-warning.dialog.component.*
    dry-run-preview.dialog.component.*    In-memory classification disposition preview            [NEW]
  shared/
    classify.types.ts            All view-model interfaces + the TabName union
    classify.format.ts           Pure formatters/mappers (unit-tested)
    classify.dryrun.ts           Pure disposition logic for the dry-run preview (unit-tested)
```

## Component contract

Each **tab** is a full sub-page: it owns its `<mj-page-header-interior>` (title + toolbar/actions) and `<mj-page-body-interior>`, extends `BaseAngularComponent` (so it gets `@Input() Provider` + `ProviderToUse`/`RunViewToUse`), and is declared in `ai-dashboards.module.ts` (`standalone: false`). Data flows **down** via `@Input()` from the host orchestrator; user intents bubble **up** via `@Output()` (e.g. the Sources tab emits `AddSourceRequested`/`EditSourceRequested`/`RunSourceRequested` and the host opens its form / runs the pipeline). The host renders them through a single `@switch (ActiveTab)` inside `<mj-left-nav-content>`.

The host retains everything genuinely cross-cutting: pipeline run orchestration (`RunPipeline`/`Pause`/`Resume`/`Cancel` + the GraphQL progress subscription, shared by the header button and the Sources tab), the source/type form dialog, the item-detail dialog, deep-linking, prefs, and the agent context/tools.

## Data layer — reuse engines, never cache high-volume rows

| Data | Source |
|---|---|
| Content Sources / Types / Source Types / File Types / Entity Documents / Vector Indexes | `KnowledgeHubMetadataEngine` (`@memberjunction/core-entities`) |
| Tags / Tag Scopes / Tag Synonyms (incl. governance flags) | `TagEngineBase` (`@memberjunction/tag-engine-base`) |
| AI Models | `AIEngineBase` |
| Content Items · Item Tags · Tagged Items · Process Runs · **Tag Suggestions** · Audit · Co-occurrence · Duplicates | **`RunView`, uncached** (high-volume / transactional) |

Tag Health signals are not a separate data path — the server-side `TagHealthJob` writes `MJ: Tag Suggestions` rows with `Reason ∈ {MergeCandidate, LowUsage, WideNode}`. The **Inbox** tab shows the human-review reasons (and excludes those three by default); the **Health** tab owns exactly those three.

## Features

- **Suggestions Inbox** — reviews `MJ: Tag Suggestions`. Approve-as-new-tag (creates an `MJ: Tags` record), Merge-into-existing (`ResolvedTagID`), or Reject; stamps `ReviewedByUserID`/`ReviewedAt`/`ReviewerNotes`. Nav badge shows the pending count. *Full content-item-tag re-pointing remains the server-side promotion job's responsibility; this UI performs the core promotion.*
- **Tag Health** — three signal cards (merge candidates / low usage / wide nodes) with triage actions (Merge, Deprecate, Review-in-Taxonomy / Dismiss).
- **Governance / Synonyms / Scope** — on the Taxonomy tab's selected-tag editor. Governance edits the typed `MJTag` flags (`IsFrozen`, `AllowAutoGrow`, `RequiresReview`, `MaxChildren`, `MaxDescendantDepth`, `MinWeight`). Synonyms list/add/delete with Source pills. Scope toggles `IsGlobal` and manages `(Entity, Record)` scopes.
- **Config parity** — the Sources form exposes the full `IContentSourceConfiguration` inline (taxonomy-mode cards, match/suggest threshold band, tag root, per-run budgets, `ShareTaxonomyWithLLM`/`EnableVectorization`) with an effective-values aside — no more navigating out to the entity form.
- **Dry-run preview** — `dialogs/dry-run-preview.dialog`: samples a source's existing extracted tags, resolves them client-side over `TagEngineBase` (synonym/exact/fuzzy tiers), and shows how each would be dispositioned (auto-apply / route-to-inbox / create-new) under the source's current mode + thresholds. Pure in-memory, nothing persisted, no LLM call.

## Schema dependency (post-CodeGen)

The migration `migrations/v5/V202606010800__v5.39.x__TagSynonym_Status.sql` adds `TagSynonym.Status` (`Active`/`Pending`/`Rejected`, default `Active`). With CodeGen run, the Synonyms panel uses it: manually-added synonyms are `Active` (resolve immediately); machine-proposed synonyms (`Source` = LLM/Imported) arrive as `Pending` and show an Approve/Reject affordance — only `Active` synonyms resolve, in both the panel and the dry-run preview's client-side resolver.

## Tests

Pure logic is unit-tested in `src/__tests__/`: `classify-format.test.ts` (formatters/mappers), `classify.dryrun.test.ts` (disposition rules across all modes + threshold boundaries), and `scheduling.test.ts` (the `CronToHumanReadable` helper). Angular components are not unit-tested here — the package's vitest runs in node-env where the compiled `BaseAngularComponent` decorator can't initialize, so all test files target the pure layer.

## Conventions

Design tokens only (no hardcoded hex), `mjButton` directive (no `.mj-btn` overrides), confirm/primary buttons left of cancel, `@if`/`@for` with `track`, `inject()` DI, strong typing throughout (no `any`, no `.Get()/.Set()` for fields with generated typed properties), and multi-provider-safe (`this.ProviderToUse` / `RunView.FromMetadataProvider`). See the root and Angular `CLAUDE.md` files for the full rulebook.
