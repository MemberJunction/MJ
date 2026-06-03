# Knowledge Hub — Unified Redesign Plan (Classify + Clustering)

**Branch:** `knowledge-hub-classify-redesign` (work continues on the active feature branch)
**Status:** Plan — in progress (see Progress Log at bottom)
**Author:** Jordan Fanapour / Amith / Claude
**Created:** 2026-06-02
**Supersedes:** `classify-audit-and-analytics.md`, `classify-setup-and-onboarding.md`, `classify-ux-fixes-and-polish.md` (these three are folded into Phases 1/3/4 below and have been deleted)
**Baseline (already merged):** [`knowledge-hub-classify-redesign.md`](./knowledge-hub-classify-redesign.md) — decomposition of the Classify monolith + config parity. This plan builds on that.

---

## 0. How to use this plan (READ FIRST — execution protocol)

This is a single, large, multi-session project broken into **7 phases** (Phase 0–6). **Phases 0–5 are committed work; Phase 6 is optional/exploratory** (the cross-cutting UserView visualization plug-in architecture — we may or may not implement it). It is designed to be executed by an AI agent across **multiple sessions**, surviving session death. Follow this protocol exactly:

1. **Orient before acting.** At the start of every session, read this entire file, then find the **first unchecked task** (`- [ ]`) in the lowest-numbered incomplete phase. That is your starting point. Do **not** skip ahead to a later phase — phases are ordered by dependency.
2. **Work stepwise, one task at a time.** Each task has an ID (e.g. `T2.3`) and a checkbox. Complete a task fully — including its sub-steps, a successful package build, and tests (per CLAUDE.md rule #6) — before moving to the next.
3. **Check off as you go.** The moment a task is done **and verified**, edit *this file*: flip its `- [ ]` to `- [x]` and append a dated one-line note under it (what changed, package(s) touched, commit SHA if one was made). This is the durable record that lets a future session resume cleanly.
4. **In-progress / blocked.** If you start a task but can't finish it, mark it `- [~]` and add a note explaining the current state and the blocker. Never leave a half-done task looking complete.
5. **Never check off unverified work.** A box is only `- [x]` after the affected package builds and its tests pass. If you couldn't build/test (e.g. environment limitation), say so explicitly in the note and leave it `- [~]`.
6. **Respect the architecture.** Every task must conform to the Architectural Principles in §1. If a task seems to require violating them, stop and flag it in the Progress Log rather than working around them.
7. **Commits require explicit user approval** (CLAUDE.md critical rule #1). Do the work and stage it; do not `git commit` until the user asks. When authorized, record the SHA in the task note.
8. **Update the Progress Log** (bottom of file) at the end of each working session with date, phase/tasks touched, and any decisions or open questions raised.

**Checkbox legend:** `- [ ]` not started · `- [~]` in progress / blocked · `- [x]` done & verified.

---

## 1. Architectural Principles (the doctrine for all phases)

The defect this plan corrects — across Classify *and* Clustering — is **logic trapped in the Angular/UI tier**. New capability has been built as components and `@Injectable` services that cannot run server-side, cannot be reused, and cannot be invoked programmatically or by an agent. Every phase below moves logic *down* into the correct layer. The canonical layering, top to bottom:

```
┌──────────────────────────────────────────────────────────────────┐
│ Angular UI (thin)                                                   │
│   components render + bind; NO business logic, NO transport detail. │
│   Consume the transport helper (below). Reactive via BaseEngine     │
│   ObserveProperty / BaseEntityEvent — never manual reload loops.    │
└───────────────▲─────────────────────────────────────▲──────────────┘
                │ calls                                 │ (agent path)
┌───────────────┴─────────────────────┐   ┌────────────┴──────────────┐
│ Transport Helper (client)            │   │ Actions (agent-facing)     │
│   A GraphQLDataProvider-wrapping      │   │   THIN wrappers over engine│
│   class with ONE public method per    │   │   methods. For agent /     │
│   capability. First-class, typed,     │   │   workflow / low-code      │
│   reusable. Model: GraphQLAIClient.   │   │   invocation ONLY.         │
└───────────────▲──────────────────────┘   └────────────▲──────────────┘
                │ GraphQL                                 │ direct import
┌───────────────┴─────────────────────────────────────────┴───────────┐
│ Server Resolvers (thin)                                               │
│   expose engine methods over GraphQL. No business logic of their own. │
└───────────────────────────────▲──────────────────────────────────────┘
                                 │ direct calls
┌────────────────────────────────┴─────────────────────────────────────┐
│ Engine / Service methods (framework-agnostic CORE)                     │
│   ALL business logic lives here. Runs server-side AND (where it has no  │
│   server-only deps) client-side. Pure compute lives even lower         │
│   (SimpleVectorService in @memberjunction/ai-vectors-memory).          │
└────────────────────────────────────────────────────────────────────────┘
```

### The non-negotiable rules

1. **Engine first.** Business logic is a method on a framework-agnostic engine/service (e.g. `TagEngine`, a new `ClusteringEngine`), never on an Angular component or `@Injectable`. The engine knows nothing about Angular, GraphQL, or HTTP.
2. **Resolvers are thin.** A server resolver does auth + arg marshalling, then calls one engine method and returns. No logic. (Model: `FetchEntityVectorsResolver` should shrink to delegating into the engine.)
3. **A first-class transport helper is required.** For each capability surface we need a client-side `GraphQLDataProvider` helper class — one public, typed, async method per capability — that encapsulates the GraphQL transport. **This is the layer the UI talks to.** This is *not* optional and *not* the same as an Action. Model: `GraphQLAIClient` (`@memberjunction/graphql-dataprovider`). The UI must never hand-roll GraphQL or call resolvers ad hoc.
4. **Actions sit ON TOP of engine methods, for agents.** Actions are desirable and we will add them — but as a thin agent/workflow/low-code invocation layer that calls the **engine** directly (per CLAUDE.md Actions philosophy: code-to-code uses the engine, never Action→Action). Actions are never where logic lives, and the UI never goes through an Action.
5. **UI is thin and reactive.** Components consume the transport helper for I/O and a `BaseEngine` subclass for cached/reactive data (`ObserveProperty`, `BaseEntityEvent`). No `localStorage` for user prefs (rule #9) — use `UserInfoEngine`. No manual "reload after mutation" loops.
6. **Persisted state is a real entity model**, not a JSON blob in user settings, when it needs to be shared, queried, re-run, or referenced by an agent.
7. **Multi-provider correctness.** New Angular code threads `Provider` (`BaseAngularComponent` + `ProviderToUse`); engine/helper code accepts the provider/contextUser explicitly. Use `EntityByName`, never `Entities.find(e => e.Name === …)`.

### How each phase applies the doctrine

| Phase | Capability | Engine | Resolver | Transport helper | Action(s) | UI |
|---|---|---|---|---|---|---|
| 1 | UX + reactivity | (reuse `TagEngine`/`KnowledgeHubMetadataEngine`) | — | — | — | thin, reactive |
| 2 | Clustering | **new `ClusteringEngine`** | extend cluster resolver | **new cluster transport helper** | **Run Cluster Analysis** | shrink resource component |
| 3 | Setup/onboarding + seed taxonomy | `TagEngine.generateSeedTaxonomy()` (reuses Phase 2 engine) | extend | extend helper | **Generate Seed Taxonomy** | wizard (thin) |
| 4 | Audit/analytics | analytics methods on engine | extend | extend helper | **Get Classification Analytics** | grids/charts (thin) |
| 5 | Tag clouds + Visualize surface | **`TagCloudEngine`** (reuse `TagCoOccurrenceEngine`) | — | extend helper | **Build/Modify Visualization** | thin Visualize tab |
| 6 *(optional)* | UserView viz plug-in arch | viz plug-in registry (core) | — | — | viz client tools | view-mode host on any UserView |

---

## Phase 0 — Repo Hygiene: remove dead Kendo references

**Why first:** small, low-risk, and clears confusion before the real work. Kendo was removed as a dependency a while back — **no `@progress/kendo` appears in any `package.json`**. What remains is ~86 stray references across ~25 files: misleading comments, dead `::ng-deep .k-*` CSS overrides, and badly-named CSS classes (`.mj-kendo-icon-card`, `.mj-kendo-dropdown`, etc.) some of which are still referenced by live templates. This phase removes the cruft so "Kendo" stops appearing in greps and nobody mistakes it for a live dependency. **Scope note:** this is repo-wide hygiene, not KH-specific; it may be split into its own PR.

- [ ] **T0.1 — Inventory & categorize every Kendo reference.** Run `grep -rinE "kendo|k-icon|k-i-|@progress/kendo" packages --include="*.ts" --include="*.html" --include="*.scss" --include="*.css"` (exclude node_modules/dist). Produce a categorized list in the Progress Log: (a) pure comments, (b) dead `.k-*` `::ng-deep` overrides with no matching markup, (c) `.mj-kendo-*` class names still used by templates, (d) anything else. Confirm again there are zero `@progress/kendo` package.json deps.
- [ ] **T0.2 — Delete dead `.k-*` CSS overrides.** Remove `::ng-deep .k-window-*`, `.k-expander-*`, `.k-panelbar*`, `.k-icon`, `.k-chip`, etc. selectors that no longer match any rendered element (verify each has no corresponding markup). Build each touched package.
- [ ] **T0.3 — Rename `.mj-kendo-*` classes to neutral names.** Coordinated rename across CSS/SCSS **and** the templates that consume them (e.g. `.mj-kendo-icon-card` → `.mj-icon-card`). Grep for each class name to find all template usages before renaming. Build + smoke-test the affected components.
- [ ] **T0.4 — Scrub stale comments & bundle docs.** Fix comments/JSDoc that reference "Kendo modules/theme/bundle" (`explorer-modules.module.ts`, `explorer-app` styles, `app.module.ts`, etc.) to reflect the MJ UI components reality. No code change, just accurate docs.
- [ ] **T0.5 — Verify clean.** Re-run the grep; the only acceptable remaining hits are in historical plan/markdown files. Build the full Angular set (`explorer-app`, `ui-components`, `dashboards`, `core-entity-forms`) and confirm no regressions.

---

## Phase 1 — UX Fixes & Reactivity Foundation (Classify)

**Why second:** highest value-to-risk ratio and it establishes the reactive patterns (`BaseEntityEvent` / `ObserveProperty`) and shared utilities that later phases lean on. Folds in the former `classify-ux-fixes-and-polish.md`.

### Ground truth (carried from the deleted UX plan)
- 7 of 8 Classify tab containers have no scroll overflow; Inbox has `overflow:auto` (OK); Tag Health has `overflow:hidden` (actively broken).
- **Zero** `MJGlobal` / `BaseEntityEvent` / engine-observable subscriptions exist anywhere in the autotagging component tree — data goes stale after mutations.
- Refresh buttons exist only on Pipeline, Inbox, Health, Taxonomy. Missing on Sources, Tags, History, Content Types.
- `ContentItem.Name` is set to the entity name (e.g. "Member Engagement Logs") → every feed row looks identical.
- Content items capped at `MaxRows:200`, process runs at `MaxRows:100`, silently truncating with no pagination.

### Tasks

- [ ] **T1.1 — Fix scroll on all tab containers.** Add `overflow-y:auto` to the primary content container of each broken tab (Pipeline, Sources, Content Types, Tag Library, Taxonomy, Run History). Change Tag Health from `overflow:hidden` → `overflow-y:auto`. Prefer `<mj-page-body-interior>` as the scroll boundary where it applies. Verify each tab scrolls when content overflows.
- [ ] **T1.2 — Centralized display-name derivation (UI fallback).** Create `deriveDisplayName(item)` in `shared/classify.format.ts` (Description → first meaningful line of Text → `Name + created date`). Apply in the feed and every item listing. This is the immediate band-aid; the real fix is T1.3.
- [ ] **T1.3 — Pipeline writes meaningful `ContentItem.Name` (backend, the real fix).** In `TagEngine` / the content ingestion path, populate `ContentItem.Name` at ingest time from a configurable "title field" on the Entity Document config (fallback: first `IsNameField`). This is engine-layer work (per §1 rule 1). Add the title-field selection to the Entity Document config interface. Once this ships, T1.2's fallback rarely fires but stays as a safety net.
- [ ] **T1.4 — Add missing refresh buttons.** Add a Refresh button to the `<mj-page-header-interior>` actions slot on Sources, Tags, History, and Content Types tabs, wired to each tab's reload method, following the Inbox tab pattern. Use `<mj-refresh-button>` if available.
- [ ] **T1.5 — Reactive data via engine observables / BaseEntityEvent.** Wire reactivity so the UI updates without manual refresh: subscribe to `TagEngineBase` / `KnowledgeHubMetadataEngine` observables (`ObserveProperty`) where they cache the data; for entities not engine-cached (`MJ: Content Items`, `MJ: Content Item Tags`, `MJ: Tag Suggestions`, `MJ: Content Process Runs`), subscribe to `BaseEntityEvent` save/delete. Debounce reloads ~300ms to batch pipeline-run bursts. Unsubscribe via `destroy$` + `takeUntil`. **Prefer extending an engine over polling.**
- [ ] **T1.6 — Pagination & accurate counts.** Replace hardcoded `MaxRows` caps with AG Grid pagination (page size 50) using server-side `MaxRows`+`StartRow`. Show "Showing X–Y of Z". **Sub-step:** verify whether `RunView` returns a usable total-row count; if not, use a dedicated count query / `RunQuery` aggregate (do not leave this as an unverified "if available"). For the Pipeline feed, keep "most recent N" with a clear label + "View all in History" link.
- [ ] **T1.7 — Consistent loading + empty states.** Standardize `<mj-loading>` on every tab during initial load and refresh; ensure no blank screens on empty data. Verify at multiple viewport sizes.
- [ ] **T1.8 — Build, test, and verify the testing checklist.** Build all touched packages; run their vitest suites; update/author tests for new utilities (`deriveDisplayName`, pagination helpers). Walk the testing checklist: every tab scrolls, feed items distinguishable, every tab refreshes, post-run auto-update works, counts accurate, pagination works, loading indicators present, no console subscription errors.

---

## Phase 2 — Clustering Object Model (reference architecture)

**Why third:** Clustering is the cleanest, most self-contained place to **establish the full §1 layering end-to-end**, and it produces a reusable vector-analysis engine that Phase 3's seed-taxonomy generation consumes. It is also currently the most UI-trapped feature in the Hub.

### Ground truth (current clustering stack)
- ✅ `SimpleVectorService` (`@memberjunction/ai-vectors-memory`) — pure TS compute, already client+server: `KMeansCluster`, `DBSCANCluster`, `SilhouetteScore`, **`ElbowMethod`** (unsurfaced), distance metrics.
- ✅ `FetchEntityVectorsResolver` (MJServer) — server path: EntityDocument → VectorIndex → VectorDB → vectors. **But contains logic that belongs in an engine.**
- ❌ `ClusteringService` (`@memberjunction/ng-clustering`) — orchestration (cluster + UMAP/PCA reduce + build result) trapped in an Angular `@Injectable`. Not server- or agent-usable.
- ❌ `ClusterVisualizationResourceComponent` (~728 lines) — fetch + orchestrate + LLM-name + persist + render all in one component.
- ❌ Persistence — saved visualizations are a JSON blob in `MJ: User Settings`, and "last session" uses **`localStorage`** (violates CLAUDE.md rule #9). Not shareable, queryable, re-runnable, or agent-referenceable.

### Target architecture (applies §1 exactly)
- **Engine:** new framework-agnostic `ClusteringEngine` owning the pipeline: fetch (via injected vector-source strategy) → cluster (`SimpleVectorService`) → reduce (UMAP/PCA, pure JS, runs in node) → optional LLM-name (via `AIPromptRunner` **directly**) → result. Lives in a non-Angular package.
- **Vector-source strategy:** `IClusterVectorSource.FetchVectors(config)` with two adapters — server (talks to `VectorDBBase` directly, the code the resolver uses today) and client (calls the transport helper). Same engine, both sides.
- **Resolver:** shrink `FetchEntityVectorsResolver` to delegate into the engine; add a `RunClusterAnalysis` resolver method that runs the whole pipeline server-side and returns only 2D points + assignments + metrics (massively less data on the wire; the only way clustering scales past a few hundred records).
- **Transport helper:** new first-class `GraphQLDataProvider` helper (cluster client, modeled on `GraphQLAIClient`) with typed methods: `FetchEntityVectors`, `RunClusterAnalysis`, `SaveClusterAnalysis`, `ListClusterAnalyses`, `GetClusterAnalysis`. **The UI talks only to this.**
- **Entity model:** new `MJ: Cluster Analyses` (+ child `MJ: Cluster Analysis Clusters` for named clusters) replacing the user-settings/localStorage blob. Persist the 2D projected points + labels (UMAP is stochastic; re-run won't reproduce a layout, so store the result).
- **Action:** "Run Cluster Analysis" — thin wrapper over `ClusteringEngine` for agentic invocation.
- **UI:** `ClusteringService` becomes a thin pass-through (or is removed in favor of the engine + transport helper); the resource component shrinks to orchestrate + render; the saved-analyses sidebar reads from `MJ: Cluster Analyses` with `ObserveProperty` reactivity.

### Tasks

- [ ] **T2.1 — Schema: `MJ: Cluster Analyses` (+ child clusters).** Author a migration in the highest `migrations/v*/` folder for a `ClusterAnalysis` table (config snapshot, algorithm, entity/doc refs, metrics, projected-points JSON, viewport, owner/sharing) and a child `ClusterAnalysisCluster` table (analysis FK, cluster index, label, member count, color, IsUserEdited). Follow migration rules: hardcoded UUIDs, `sp_addextendedproperty` per column, no `__mj_` timestamps/FK indexes (CodeGen handles those), consolidated `ALTER`/`CREATE`. Then run migration + CodeGen; do not write dependent TS until generated types exist (rule 2b).
- [ ] **T2.2 — `ClusteringEngine` (framework-agnostic core).** New non-Angular package (e.g. `@memberjunction/clustering-engine`). Move the orchestration out of `ng-clustering`'s `ClusteringService`: `RunPipeline(config, vectorSource, contextUser)` → fetch → cluster (`SimpleVectorService`) → reduce (UMAP w/ PCA fallback) → build `ClusterVisualizationResult`. Add `SuggestK` using the existing `ElbowMethod`. No Angular, no GraphQL imports. Unit-test with in-memory vectors.
- [ ] **T2.3 — `IClusterVectorSource` + server & client adapters.** Define the strategy interface in the engine package. Server adapter wraps `VectorDBBase` (lift the fetch logic out of `FetchEntityVectorsResolver`). Client adapter calls the transport helper (T2.5). Engine depends only on the interface.
- [ ] **T2.4 — Server resolver: delegate + `RunClusterAnalysis`.** Refactor `FetchEntityVectorsResolver` to call the engine's server vector-source (no logic in the resolver). Add a `RunClusterAnalysis` query/mutation that runs the full server-side pipeline (cluster + reduce server-side) and returns points/clusters/metrics. Add resolvers for persistence CRUD if not covered by generated entity resolvers.
- [ ] **T2.5 — Transport helper (client first-class transport).** New `GraphQLDataProvider` helper class (model: `GraphQLAIClient`). Public typed methods: `FetchEntityVectors`, `RunClusterAnalysis`, plus thin wrappers for persisting/listing/loading `MJ: Cluster Analyses`. This becomes the only I/O surface the cluster UI uses.
- [ ] **T2.6 — "Run Cluster Analysis" Action.** Thin Action over `ClusteringEngine` for agent/workflow invocation. Params: Entity/EntityDocument, Algorithm, K/Epsilon/MinPoints, DistanceMetric, MaxRecords, Filter, NameClusters flag, PersistAs (optional name). Returns cluster summaries + metrics + persisted analysis ID. Register per Actions conventions; seed metadata via the metadata-file system (not SQL inserts).
- [ ] **T2.7 — Move LLM cluster naming into the engine.** Relocate `requestClusterLabelsFromLLM` / `buildClusterDataForPrompt` from the resource component into `ClusteringEngine` (calling `AIPromptRunner` directly, looking up the existing "Cluster Naming" prompt). UI just triggers and renders.
- [ ] **T2.8 — Persistence as entity model (replace blob + localStorage).** Replace the `MJ: User Settings` JSON blob and the `localStorage` "last session" with `MJ: Cluster Analyses` reads/writes via the transport helper. Build a small `ClusteringMetadataEngine` (BaseEngine subclass) caching the user's analyses with `ObserveProperty` so the sidebar is reactive. Remove all `localStorage` usage from the clustering component.
- [ ] **T2.9 — Thin the UI.** Refactor `ClusterVisualizationResourceComponent` to: call the transport helper for runs, bind the engine for the saved-analyses sidebar, and render. Reduce `ng-clustering`'s `ClusteringService` to a thin shim over the engine (or remove it and re-export engine types). Fix `Entities.find(e => e.Name === …)` → `EntityByName`; thread `Provider`/`ProviderToUse` throughout per the Angular multi-provider rule.
- [ ] **T2.10 — Wire cluster→agent context + (new) client tools.** Keep `SetAgentContext`; add `SetAgentClientTools` so the agent can trigger a clustering run from the UI (the dashboards table currently lists Clusters as context-only). Tools call the transport helper.
- [ ] **T2.11 — Build, test, verify.** Build the new engine package, the transport helper, MJServer, the Action package, and the Angular packages. Unit tests: engine pipeline, `SuggestK`, vector-source adapters (mocked), transport helper (mocked GraphQL). Manual: run a clustering analysis end-to-end client-side; run one server-side via `RunClusterAnalysis`; save/load/share an analysis; invoke the Action with a mock agent/context.

#### Cluster feature extensions (from Amith's KH-visualization bullets)
> Source-bullet mapping: 2D/3D → T2.12 · multi-entity → T2.13 · save/edit/regenerate labels → T2.14 (+ existing edit/save) · build & modify client tools → T2.15. (The "view type showing those records only / for a given entity" bullets are realized in **Phase 6**.)

- [ ] **T2.12 — 2D & 3D projection + renderer.** Engine supports `nComponents: 2|3`; add a WebGL 3D scatter renderer beside the existing SVG 2D one. `ClusterConfig.Dimensions: 2|3`, persisted on `MJ: Cluster Analyses`. Default stays 2D. Renderer choice = decision D6.
- [ ] **T2.13 — Multi-entity-doc clustering.** Replace/augment the single `EntityDocumentID` with `ClusterConfig.EntityDocumentIDs: string[]`; the engine fetches + merges vectors across the chosen docs, tags each point with its source entity, and supports legend/color by entity *or* by cluster. **Validate that all selected docs share the same embedding model + dimensionality** (decision D9 / risk R7) — refuse incompatible combinations rather than produce a meaningless layout. Update the schema (T2.1) + Action params (T2.6) to arrays.
- [ ] **T2.14 — Per-cluster label management.** Add an engine method to (re)generate the label for a *single* cluster (not just the whole result), plus UI to regenerate / edit / save one cluster's label independently. Extends T2.7 (whole-result naming) and the existing inline-edit/save.
- [ ] **T2.15 — Cluster build/modify client tools.** Expand T2.10 beyond "trigger a run": agent tools to relabel, regenerate a single cluster's label, adjust K / re-run, and save — all routed through the transport helper / engine.

---

## Phase 3 — Setup & Onboarding (Classify) + seed taxonomy via clustering

**Why fourth:** depends on Phase 2's `ClusteringEngine` (seed taxonomy = cluster embeddings → name clusters → propose tags) and on Phase 1's reactivity foundation. Folds in the former `classify-setup-and-onboarding.md`.

### Ground truth (carried from the deleted onboarding plan)
- Entity Document creation lives on the Vectors tab, disconnected from Classify; users get stuck on "No documents found".
- Setup order (Content Source Types → Content Types → Entity Documents → Content Sources → vectorize → run) is opaque and unguided.
- Tag extraction prompt (`metadata/prompts/templates/knowledge-hub/content-autotagging.template.md`) has **no domain-context variable** — tags come back nonsensical without business framing.
- No seed-taxonomy capability; taxonomy grows organically via `auto-grow`/`free-flow` in `TagEngine.ResolveTag()`.

### Tasks

- [ ] **T3.1 — Contextual prompt injection (highest impact, lowest effort — do first).** Add a `ClassificationContext` field to the `IContentSourceConfiguration` JSON interface (no migration). Add `{{ classificationContext }}` to the autotagging prompt template. Assemble the effective context in the **engine** (`TagEngine`) walking the scope hierarchy (org → content type → source) with an additive (default) / substitutive aggregation mode, and inject it. Add a context text area + aggregation toggle + effective-context preview to the source form.
- [ ] **T3.2 — Org-wide & content-type context storage.** Resolve Open Decision D2 (below). Implement the chosen storage for org-level context (likely a new single-row settings entity — `MJ: User Settings` is per-user and cannot hold org context). Add content-type-level context (decide: reuse `Description` vs new column). Wire both into the T3.1 aggregation in the engine.
- [ ] **T3.3 — Inline Entity Document creation.** In the source form, when an Entity-type source's selected entity has no Entity Document, show a callout + inline create sub-form: auto-filled entity name, field-selector checkboxes (default: string/text fields; deselect IDs/timestamps/system fields), serialized preview for one record, Create button that auto-selects the new doc. Use `GetEntityObject<MJEntityDocumentEntity>` and `EntityByName(...).Fields` for the field list. Include the "title field" selection from T1.3.
- [ ] **T3.4 — Seed taxonomy via clustering (engine).** Add `TagEngine.generateSeedTaxonomy(sourceID, sampleSize, contextUser)` that **reuses the Phase 2 `ClusteringEngine`**: cluster the source's embeddings, name the clusters (LLM, reusing T2.7), and propose those names as a hierarchical taxonomy (top-level = clusters; optional sub-clustering for children). Falls back to a single-prompt-over-samples approach only if vectors are unavailable. Returns proposed tags without persisting. Author any new prompt template needed.
- [ ] **T3.5 — Seed taxonomy review UI (thin).** `ClassifySeedTaxonomyComponent`: tree of proposed tags with checkboxes, inline edit, drag-rearrange, "Generate Again", "Accept All/Selected". Accepting creates `MJ: Tags` under the configured `TagRootID` via the engine/transport — no logic in the component. Embed in the Taxonomy tab and the wizard (T3.6).
- [ ] **T3.6 — Guided Setup Wizard (thin).** `ClassifySetupWizardComponent` (dialog) walking the 7 steps (Source Type → Entity → Entity Document [inline create] → Content Type → Taxonomy Strategy [+ seed taxonomy] → Domain Context → Review & Create). Auto-skip steps whose prerequisites already exist. The wizard creates intermediate records via engine/transport calls; it holds no business logic. Trigger from an empty Sources tab and an Overview "Get Started" card.
- [ ] **T3.7 — Build, test, verify.** Build TagEngine, the prompt metadata, MJServer, and Angular packages. Unit-test `generateSeedTaxonomy` (mock clustering engine + prompt runner) and context aggregation. Manual: set domain context and confirm improved tags; create a source end-to-end via the wizard with inline Entity Document + generated seed taxonomy.

---

## Phase 4 — Audit & Analytics (Classify)

**Why last:** most build-heavy, least blocking, and it benefits from a deliberate lineage decision plus the analytics-as-engine-methods pattern. Folds in the former `classify-audit-and-analytics.md`.

### Ground truth (carried from the deleted audit plan)
- No per-run item inspection, no cross-run analytics, no per-item audit trail.
- `ContentItemTag` has **no reasoning field and no direct `AIPromptRunID`** — per-tag reasoning currently only exists inside `AIPromptRun.Result` JSON, and item→prompt-run lineage is an indirect, time-correlated join (fragile).
- `ContentItem.Name` indistinguishable (addressed in Phase 1).
- KPIs/analytics, if built in components, can't be reached by an agent.

### Tasks

- [ ] **T4.1 — Decide & implement tag→prompt-run lineage (schema, up front).** Resolve Open Decision D1. Recommended: add a direct `AIPromptRunID` (nullable FK) and a `Reasoning` field to `MJ: Content Item Tags` (or a `ContentItemTagDetail` child), populated by the pipeline at tag-creation time. This replaces the time-correlation heuristic with a real edge. Migration + CodeGen, then update `TagEngine` to populate it. **Do this before building the drilldown** so the drilldown reads a real FK, not a parser.
- [ ] **T4.2 — Analytics as engine methods (not component logic).** Add aggregation methods (tag distribution, items-over-time, confidence histogram, coverage gaps, KPIs) to an engine, backed by `RunQuery`/aggregate queries — so an agent can ask "tag distribution for source X". UI binds to these; it does not compute them. Expose via the transport helper; add a "Get Classification Analytics" Action over the engine method.
- [ ] **T4.3 — `ClassifyItemGridComponent` (reusable, thin).** AG Grid of content items in two modes: scoped to a `RunID`, or all-items. `ResultType:'simple'` + explicit `Fields`; server pagination (reuse T1.6); batched tag load (one grid query + one tag query per page). Emits `ItemSelected`. Pure presentation over transport-helper data.
- [ ] **T4.4 — `ClassifyItemDrilldownComponent` (replaces item detail dialog).** Four sections: (A) source-type-aware rendered content (Entity Document → source record fields via `mjSafeRichHtml`; file/PDF → text/link; default → plain), (B) tags with weight + reasoning (now read from the T4.1 field/FK, not parsed), (C) provenance links (source, entity doc, source record, prompt run, pipeline run), (D) audit trail (runs that processed the item, tag diffs via Record Changes if enabled, prompt run per extraction). All data via the transport helper / engine.
- [ ] **T4.5 — Cross-run analytics UI (`ClassifyAnalyticsComponent`).** KPI cards + charts (tag distribution, items-over-time, confidence histogram) + the all-items grid (T4.3 in all-items mode) embedded in the renamed **Overview** tab. **Charts: follow the established hand-rolled-SVG precedent already used by the KH Analytics tab and the cluster scatter — do NOT pull in a charting library, and specifically not Kendo (removed; see Phase 0).** If a real charting lib is ever warranted, that is a separate, deliberate decision.
- [ ] **T4.6 — History tab + Overview integration.** Add the per-run `ClassifyItemGridComponent` under an expanded run in the History tab. Rename "Pipeline" tab → "Overview"; arrange: active-run progress/feed → analytics → all-items grid. Update any stored tab-name preference key.
- [ ] **T4.7 — Build, test, verify.** Build engine, MJServer, Action, and Angular packages. Unit-test analytics aggregation methods and the lineage population. Manual: drill from a run into items into a single-item view with real reasoning + provenance + audit trail; confirm analytics match DB counts; invoke the analytics Action via agent.

---

## Phase 5 — Tag Clouds & the "Visualize" surface (KH)

**Why fifth:** turns the existing one-off tag cloud into a first-class visualization and reframes the KH "Clusters" tab as a broader **Visualize** surface (clusters + tag clouds + room for more). Reuses the Phase 2 clustering engine/UI and the existing `@memberjunction/ng-word-cloud` component. KH-scoped and concrete.

### Ground truth
- A reusable word-cloud component already exists: `@memberjunction/ng-word-cloud` (`MJWordCloudComponent` / `WordCloudItem`), today consumed only by the Classify Tags tab.
- A `CreateSVGWordCloud` Action (d3-cloud) and a `TagCoOccurrenceEngine` already exist — engine-side tag/word aggregation is largely solved.
- The KH Clusters tab is the only home for vector visualization today.

### Source-bullet mapping
"New section / rename Cluster → Visualize" → T5.1 · tag-cloud as first-class + reuse → T5.2/T5.3 · "same drilldown as clusters" → T5.4.

### Tasks

- [ ] **T5.1 — Rename KH "Clusters" tab → "Visualize" (host surface).** Rebrand the tab/resource as "Visualize" with an internal mode switch (Clusters | Tag Cloud | …). Update nav label, icon, agent context, and any stored tab-name preference key. Keep cluster functionality intact under the new surface.
- [ ] **T5.2 — `TagCloudEngine` (framework-agnostic).** A thin engine that produces `WordCloudItem[]` for a given entity / content source / tag scope, reusing `TagCoOccurrenceEngine`. Expose via the transport helper; no aggregation logic in the UI (per §1: engine → transport → thin UI).
- [ ] **T5.3 — Tag Cloud visualization in the Visualize surface.** Mount `MJWordCloudComponent` driven by `TagCloudEngine` output; scope picker (entity / content source / tag root); weight + co-occurrence sizing; reactive via the engine.
- [ ] **T5.4 — Shared record drilldown.** Generalize the cluster point-drilldown into one reusable panel consumed by both cluster and tag-cloud selections (click a tag → records carrying that tag; click a point → that record). Same provenance/detail layout as the Phase 2/Phase 4 drilldown.
- [ ] **T5.5 — Build/modify client tools for the Visualize surface.** Agent tools to switch mode, build a tag cloud for a scope, and open drilldowns — via the transport helper.
- [ ] **T5.6 — Build, test, verify.** Build `TagCloudEngine`, the transport helper, and KH dashboards. Unit-test the engine; manual: switch modes, render a tag cloud for an entity, drill from a tag into records and from a cluster point into a record.

> **Forward-compat note:** keep the cluster and tag-cloud components *thin and self-describing* (clear inputs + an availability check) so Phase 6 can adopt them as plug-ins without a rewrite.

---

## Phase 6 — UserView Visualization Plug-in Architecture (OPTIONAL / exploratory)

> **Status: may-or-may-not implement.** Phases 0–5 are committed; this phase generalizes the KH Visualize surface into a **core, app-wide UserView capability**. Captured with enough detail to estimate and decide later (decision D7). Nothing here is required for Phases 0–5 to ship.

**Idea:** any saved `UserView` (or entity) can expose additional visualization "modes" beyond the grid — cluster, tag cloud, timeline, map, etc. — each contributed by a **plug-in class** that declares *whether it's available* for a given view/entity. Visualization becomes a pluggable, metadata-driven extension point rather than bespoke per-feature UI.

### Proposed architecture (applies the §1 doctrine)
- **Schema:**
  - `UserView.AdditionalVisualizationsConfig` — a new **JSONType** column (fits the existing `GridState` / `FilterState` / `SortState` JSON pattern on UserView) holding an array of per-view visualization *instances* (visualization type + that instance's config).
  - `MJ: User View Visualizations` — a new entity for persisted visualization instances where a real record is warranted (sharing, ownership), parallel to how `MJ: Cluster Analyses` persists.
- **Plug-in registry (core, framework-agnostic):** each visualization *type* is a class registered via `@RegisterClass` (consistent with MJ's ClassFactory plug-in model), exposing:
  1. **`IsAvailableFor(entity / view): boolean`** — the availability predicate. Examples: **cluster** → entity has vectors + an Entity Document; **tag cloud** → entity has a tag/text field or co-occurrence data; **timeline** → entity has ≥1 date field; **map** → entity has geo fields.
  2. display metadata (name, icon, description).
  3. the Angular component to mount (thin, consuming its own engine/transport).
- **View-mode host UI:** a UserView gains a mode switch (Grid | Cluster | Tag Cloud | …) populated by the registry, **filtered by each plug-in's predicate**, and configured from `AdditionalVisualizationsConfig`. "Show those records only" falls out naturally — the active view's result set is the plug-in's input.
- **Re-home Phase 2/5 components as the first two plug-ins:** the cluster scatter and tag cloud become registry plug-ins (no rewrite if Phase 5's forward-compat note is honored), instantly available on any compatible entity/view — realizing the "view type for a given entity" bullets.
- **Shared drilldown** (Phase 5 T5.4) is reused across all plug-ins.

### Tasks (high-level; refine if/when greenlit)

- [ ] **T6.1 — Schema:** `UserView.AdditionalVisualizationsConfig` (JSONType) + `MJ: User View Visualizations` entity. Migration + CodeGen.
- [ ] **T6.2 — Plug-in registry + base class** with the `IsAvailableFor` predicate contract (core package).
- [ ] **T6.3 — View-mode host UI** on UserView — registry-driven and predicate-gated.
- [ ] **T6.4 — Adopt cluster + tag cloud as plug-ins** (from Phases 2/5).
- [ ] **T6.5 — Reference third plug-in (timeline)** to prove the predicate pattern (requires ≥1 date field).
- [ ] **T6.6 — Client tools + tests.**

---

## 7. Open Decisions (resolve before the dependent task)

- **D1 (blocks T4.1) — Tag→prompt-run lineage & reasoning.** Add direct `AIPromptRunID` + `Reasoning` to `MJ: Content Item Tags` (recommended), add a `ContentItemTagDetail` child, or keep parsing `AIPromptRun.Result`? Recommendation: direct FK + reasoning field — cheapest correct option, kills the time-correlation heuristic.
- **D2 (blocks T3.2) — Org-wide classification-context storage.** New single-row `MJ: Knowledge Hub Settings` entity (recommended, needs migration+CodeGen), reuse a Content-Type column, or a Knowledge-Hub-app-scoped config record? `MJ: User Settings` is per-user and disqualified.
- **D3 (T3.4) — Seed taxonomy model.** Use the Content Type's configured model, or a separate (more capable) "taxonomy generation" model config? Taxonomy generation likely benefits from a stronger model.
- **D4 (T2.1) — Cluster analysis sharing scope.** Owner-private with explicit share, app-wide, or role-scoped? Affects the `MJ: Cluster Analyses` schema (owner/sharing columns).
- **D5 (phase ordering) — Confirm Phase 2 (Clustering) before Phase 3 (Setup).** Rationale: seed taxonomy (T3.4) reuses the clustering engine, and clustering is the cleanest place to set the architecture. If the team would rather ship Classify onboarding first, swap Phases 2 and 3 — but then T3.4 must either wait for the engine or ship its fallback single-prompt path first.
- **D6 (T2.12) — 3D rendering tech.** SVG can't do 3D; pick a renderer (three.js / `regl-scatterplot` / other WebGL). New dependency decision. Keep the 2D SVG path for 2D mode.
- **D7 (Phase 6 go/no-go) — Generalize to core UserView?** Ship visualization only as the KH "Visualize" surface (Phases 1–5), or also build the app-wide UserView plug-in architecture (Phase 6)? Phase 6 is higher-leverage but larger and touches core. Decide after Phase 5.
- **D8 (T6.1) — Visualization config storage.** `MJ: User View Visualizations` entity vs. JSON-only on `UserView.AdditionalVisualizationsConfig` vs. hybrid (code `@RegisterClass` registry for *types* + JSON/entity for per-view *instances*). Recommendation: hybrid.
- **D9 (T2.13) — Multi-entity embedding compatibility.** Hard-block mixing entity docs with different embedding models/dimensions (recommended for v1, with a clear UI message), or attempt per-doc projection + alignment (harder, fuzzier)?

---

## 8. Risks

- **R1 — UMAP cost server-side.** UMAP/PCA on large vector sets is CPU-heavy; server-side runs (T2.4) may need a worker/queue to avoid blocking the event loop. Note thresholds; cap `MaxRecords` server-side.
- **R2 — Determinism.** UMAP is stochastic; persisting the projected result (T2.1) is required because re-runs won't reproduce a layout. "Re-run" creates a new analysis rather than mutating one.
- **R3 — Package layering / deps.** Keep the pure pipeline engine free of server-only deps (`VectorDBBase`, `AIPromptRunner` server bits) by injecting them via strategy interfaces, so the client bundle doesn't pull server code. Validate bundle composition.
- **R4 — Migration + CodeGen gating.** T2.1, T3.2, T4.1 add schema; dependent TS must wait for CodeGen-generated types (rule 2b). Sequence each: migration → CodeGen → code.
- **R5 — Kendo rename breakage (T0.3).** `.mj-kendo-*` classes are live in templates; renames must be coordinated CSS+HTML and smoke-tested, or styles silently drop.
- **R6 — 3D performance/deps (T2.12).** A WebGL 3D scatter adds a dependency and rendering complexity; large point counts need decimation/LOD. Keep the 2D SVG path as the default.
- **R7 — Multi-entity embedding mismatch (T2.13).** Vectors from different models/dimensions are not co-clusterable; the engine must validate and refuse incompatible combinations rather than produce meaningless layouts.
- **R8 — Phase 6 scope creep.** The UserView plug-in architecture is cross-cutting core work; keep it firewalled as optional (Phase 6) so it can't delay Phases 0–5. Honor the Phase 5 forward-compat note to avoid rework if greenlit.

---

## 9. Progress Log

> Append a dated entry each working session: phase/tasks touched, decisions, blockers, commit SHAs. Newest first.

- **2026-06-03** — Expanded scope from Amith's KH-visualization bullets. Added cluster feature extensions to Phase 2 (T2.12 2D/3D, T2.13 multi-entity-doc clustering, T2.14 per-cluster label management, T2.15 build/modify client tools). Added **Phase 5 — Tag Clouds & the "Visualize" surface** (committed) reusing the existing `ng-word-cloud` + `TagCoOccurrenceEngine`. Added **Phase 6 — UserView Visualization Plug-in Architecture** as **optional/exploratory** (per-view `AdditionalVisualizationsConfig` JSONType + `MJ: User View Visualizations` entity + `@RegisterClass` plug-in registry with an `IsAvailableFor` predicate; cluster/tag-cloud/timeline as plug-ins). New decisions D6–D9 and risks R6–R8. Phase count now 0–6 (0–5 committed, 6 optional). No code changes yet.
- **2026-06-02** — Plan authored. Unified the three Classify plans (audit/analytics, setup/onboarding, UX fixes) plus a new Clustering object-model phase into this single WBS. Established the Architectural Principles (§1: engine → resolver → transport helper → thin UI; Actions on top of engine for agents). Scoped Phase 0 Kendo hygiene (no live deps; ~86 stray refs/dead CSS/comments across ~25 files). No code changes yet. Open decisions D1–D5 pending. The three superseded plan files were folded in and deleted.
