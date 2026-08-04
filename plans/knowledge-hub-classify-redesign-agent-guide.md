# Classify Redesign — Sub-Agent Execution Guide

**READ THIS FIRST.** You are a sub-agent doing one scoped step of a larger refactor of the Knowledge Hub "Classify" sub-app. The orchestrator (parent) supervises, verifies builds, and handles all git. **You must NOT run git commit/push, must NOT open PRs, must NOT touch files outside your assigned scope.**

## Where things are
- Component dir: `packages/Angular/Explorer/dashboards/src/AI/components/autotagging/`
- Host (monolith being decomposed): `autotagging-pipeline-resource.component.{ts,html,css}` — registered `@RegisterClass(BaseResourceComponent, 'AutotaggingPipelineResource')`, `standalone: false`, `ViewEncapsulation.None`.
- Module: `packages/Angular/Explorer/dashboards/src/ai-dashboards.module.ts` (NgModule; declare new components here).
- Already created subfolders: `shared/`, `tabs/`, `dialogs/`, `engine/`.
- `shared/classify.types.ts` — all shared interfaces/types (import types from here).
- `shared/classify.format.ts` — pure helpers: `formatNumber, formatTokenCount, formatWeight, tagFontSize, formatShortDate, formatDate, computeDuration, displayStatus, getSourceTypeIcon, mapRunDetailRecords`. Use these instead of re-implementing.
- Plan: `plans/knowledge-hub-classify-redesign.md`.

## Architecture decisions (LOCKED — do not deviate)
1. **Reuse existing engines for cacheable metadata — build NO new engine:**
   - `KnowledgeHubMetadataEngine` (`@memberjunction/core-entities`): `.Instance.ContentSources / ContentTypes / ContentSourceTypes / ContentFileTypes / EntityDocuments / VectorIndexes` (typed entities). Call `await KnowledgeHubMetadataEngine.Instance.Config(false, user, provider)` before reading if not already loaded.
   - `TagEngineBase` (`@memberjunction/tag-engine-base`): `.Instance.Tags / TagScopes / TagSynonyms` (typed `MJTagEntity[]` etc., includes governance flags). Config the same way.
   - `AIEngineBase` (`@memberjunction/ai-engine-base`): AI models.
2. **NEVER cache high-volume/transactional rows** (Content Items — can be millions, Content Item Tags, Tagged Items, Process Runs, Tag Suggestions, Audit Logs, Co-occurrence, Duplicates). Use `RunView` with filters/pagination, `ResultType: 'simple'` for read-only, `'entity_object'` only when mutating.
3. **Component pattern** (the reference is the already-extracted **History tab** — `tabs/history-tab.component.ts` — STUDY IT):
   - Each TAB is a full sub-page component: owns `<mj-page-header-interior>` (title/subtitle + actions/toolbar) + `<mj-page-body-interior>` + its body + its own tab-local dialogs/panels + its view-model-building + tab-local state.
   - `standalone: false`, declared in `ai-dashboards.module.ts`.
   - Extends `BaseAngularComponent` (`@memberjunction/ng-base-types`) → gives `@Input() Provider`, `this.ProviderToUse`, `this.RunViewToUse`. Use `RunView.FromMetadataProvider(this.ProviderToUse)` for queries.
   - Receives shared raw data from the host via `@Input()` (host is the data orchestrator); emits cross-tab intents via `@Output()` (e.g. `OpenSourceRequested`, `EditSourceRequested`). Data DOWN, events UP — no reaching into host state.
   - Selector convention: `classify-<name>-tab` for tabs, `classify-<name>-dialog` for dialogs.
   - CSS: host uses `ViewEncapsulation.None`, so its `.at-*` rules are global and already style child markup while the child renders inside the host shell. New child CSS files can be minimal during transition; do NOT duplicate the host's shared `.at-*` utilities. Add only genuinely new rules.
4. **The shared slide-in form (source + type CRUD) STAYS IN THE HOST for now** (it's complex, cross-tab, and risky). Sources/Types tabs emit `(AddSourceRequested)/(EditSourceRequested)/(AddTypeRequested)/(EditTypeRequested)` and the host opens its existing form. Do NOT extract the slide-in form unless your step explicitly says so.
5. **Conventions:** PascalCase public members, camelCase private; `@if/@for/@switch` template syntax with `track`; `inject()` DI; design tokens only (no hardcoded hex) — check `_tokens.scss`; mjButton directive (don't override `.mj-btn`); confirm buttons LEFT of cancel; no `any`; no `.Get()/.Set()` for typed fields; strong typing throughout.

## Your obligations every step
1. Make the change for your assigned scope only.
2. **Build and report:** `cd packages/Angular/Explorer/dashboards && npm run build` — it MUST exit 0. If errors, fix them. Paste the final exit code and any error tail in your report.
3. Behavior-preserving: the decomposed UI must work exactly as before. Move code, don't rewrite logic, unless the step says to add features.
4. In your final message report: files created/modified, what moved where, build result (exit 0), and anything the orchestrator should know (follow-ups, risks, host edits still needed).
5. Do NOT git commit/push/PR. Do NOT edit unrelated components. Do NOT modify generated files.
