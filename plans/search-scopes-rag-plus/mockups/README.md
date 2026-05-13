# Search Scopes &amp; RAG+ — UX Mockups

Phase 1H of [`plans/search-scopes-rag-plus.md`](../../search-scopes-rag-plus.md). Every mockup here is a self-contained HTML file you can open directly in a browser. Shared design tokens live in [`_tokens.css`](_tokens.css) and mirror the semantic layer from `packages/Angular/Generic/shared/src/lib/_tokens.scss`.

## Audits

- [`_audit-search-ux.md`](_audit-search-ux.md) — inventory of every search surface in MJExplorer and where the scope selector lands (task 1H.1).
- [`_audit-agent-admin-ux.md`](_audit-agent-admin-ux.md) — inventory of the AI Agent form and the new "Search" tab design (task 1H.2).

## Mockups

| # | File | What it shows | Relevant Phase tasks | Angular components that will be built |
|---|---|---|---|---|
| 1 | [`01-global-search-with-scope-selector.html`](01-global-search-with-scope-selector.html) | Shell search bar with the new `SearchScopeSelector` chip + dropdown (default / org / personal sections; time-windowed badge) | 1H.4, 1E.4, 1E.5 | `SearchScopeSelectorComponent`, `SearchInputComponent` |
| 2 | [`02-scope-filtered-results.html`](02-scope-filtered-results.html) | Full results page — per-scope grouping, provider source chips, re-rank indicator, "Save as artifact" action, facet sidebar | 1H.5, 1E.3, 1E.6 | `SearchCompositeComponent`, `SearchResultsComponent`, `SearchFilterComponent` |
| 3 | [`03-searchscope-admin-form.html`](03-searchscope-admin-form.html) | `MJ: Search Scope` admin form — definition fields, time window, ScopeConfig JSON editor, SearchContextConfig JSON editor | 1H.6, 1A.1–1A.9 | `core-entity-forms` — `MJSearchScopeFormComponent` (generated) + extended custom form |
| 4 | [`04-searchscope-children-grids.html`](04-searchscope-children-grids.html) | Inline grids for `Search Scope Providers` / `External Indexes` / `Entities` / `Storage Accounts` with Nunjucks template values | 1H.7 | `core-entity-forms` — child grids on the scope form |
| 5 | [`05-ai-agent-search-tab.html`](05-ai-agent-search-tab.html) | New "Search" tab on the AI Agent form — `SearchScopeAccess` radio cards + `MJ: AI Agent Search Scopes` grid | 1H.8, 1D.7 | `MJAIAgentFormComponentExtended` — new tab |
| 6 | [`06-chat-rag-context-badge.html`](06-chat-rag-context-badge.html) | Conversation view — collapsible `<retrieved_context>` badge above the first assistant reply + mid-turn `Scoped Search` tool-call strip | 1H.9, 1C.6, 1C.7 | `ng-skip-chat` — new badge component |
| 7 | [`07-search-result-set-artifact.html`](07-search-result-set-artifact.html) | Artifact viewer for a persisted `Search Result Set` — Data-Snapshot–shaped table with filter/sort/pagination | 1H.10, 1A.11, 1C.10, 6.3 of the plan | `JsonArtifactViewerPlugin` (today) → `DataArtifactViewerPlugin` (post-#2237) |
| 8 | [`08-global-search-dark.html`](08-global-search-dark.html) | Dark-mode variant of mockup 1 — same markup, `data-theme="dark"` on `<html>` flips every token | 1H.11 | Verifies `--mj-*` token fidelity |
| 9 | [`09-ai-agent-search-tab-dark.html`](09-ai-agent-search-tab-dark.html) | Dark-mode variant of mockup 5 | 1H.11 | Same |

## How to review

Open `01-global-search-with-scope-selector.html` first. Then walk through in order — each file is self-contained, no build step required. The end of each mockup has an inline callout explaining intent.

## Design system compliance

- **No hardcoded colors.** Every `color` / `background` / `border-color` routes through a `--mj-*` semantic token. Primitive tokens (`--mj-color-neutral-*`, etc.) are never referenced directly from component-level styles.
- **Icons: Font Awesome only.** No Kendo icon classes (`k-i-*`, `k-icon`).
- **`@if` / `@for` syntax** in every new Angular template.
- **Standalone mockup HTML** = dev speed; actual components in `@memberjunction/ng-search` (and the agent form) will use `NgModule` declarations and the existing module patterns to stay consistent with neighboring code.

## Follow-up items (task 1H.13)

- **Chat attach** — currently uses a file picker; future enhancement routes through the scope selector for knowledge-base attachment.
- **Preview RAG** on the Agent Search tab — "send a sample query, see what the agent would receive." Quality-of-life for admins.
- **Scope permissions UI** — Phase 2 (`SearchScopePermission`) admin screen for who can search which scope. Not in Phase 1.
- **Re-ranker catalog** — Phase 2 visual configuration UI for scope-level re-rankers. Not in Phase 1.
- **Copy scope assignments** — convenience action on the Agent Search tab.
