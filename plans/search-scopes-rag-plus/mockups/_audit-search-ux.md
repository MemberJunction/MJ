# UX Audit — Current Search Surfaces

Task 1H.1 · Inventory of every place in MJExplorer today that exposes search, and where the scope selector needs to land.

| # | Surface | Location | Current UI | Needs scope selector? | Notes |
|---|---|---|---|---|---|
| 1 | **Shell quick-search bar** | Top navigation header, `SearchCompositeComponent` | `SearchInputComponent` + autocomplete dropdown | ✅ yes | Inline to the left of the input — mockup 1. |
| 2 | **Full search results page** | `/search` route, `SearchCompositeComponent` wrapped with facets | Results grid + sidebar facets | ✅ yes | Scope tags in the toolbar — mockup 2. |
| 3 | **Data Explorer — entity quick find** | Per-entity grids, simple `UserSearchString` input | Plain text input on each entity's view | ➖ no | Stays entity-scoped; separate from universal search. |
| 4 | **Conversation / chat composer attach** | `@memberjunction/ng-conversations` | Modal file picker + URL input | ❓ follow-up | Consider a "Search knowledge base" affordance that uses the shell's scope selection. |
| 5 | **Dashboard "Add pin" panel** | Home dashboard pinning feature plan | Dashboard/View/Query picker (works via Data Explorer, not search) | ➖ no | Already uses entity-specific pickers. |
| 6 | **Knowledge Hub dashboard search** | KH dashboard main search input | `SearchInputComponent` pointed at KH corpus | ✅ yes | Needs scope selector for internal KH scopes (ingest batches, domains). |
| 7 | **Agent chat — in-turn search** | `ng-skip-chat` conversation view | No direct UI; agents invoke search via tool calls | ✅ indirect | Scope info surfaces in the RAG badge (mockup 6) and tool-call strip. |
| 8 | **Agent admin form** | `MJAIAgentFormComponent` | Existing Notes/Examples/Data Sources tabs | ✅ yes | New "Search" tab — mockup 5. |

## Gaps / follow-up items

- **(4)** Chat attach: defer to a future phase — current attach flow does not route through SearchEngine. When it does, the same `<mj-search-scope-selector>` component drops in next to the query field.
- **(6)** Knowledge Hub: scope selector reuses the generic component; the internal "scope" concept in KH overlaps but is distinct — we'll wire both together in a later pass (out of Phase 1 scope).

## Components we touch for Phase 1 UX

| Component | Change |
|---|---|
| `@memberjunction/ng-search` — `SearchScopeSelectorComponent` | NEW — built in Phase 1E. |
| `@memberjunction/ng-search` — `SearchService` | Add `LoadScopes()`, `Scopes$`, thread `ScopeIDs` through `ExecuteSearch`. |
| `@memberjunction/ng-search` — `SearchCompositeComponent` | No internal change in Phase 1; parent apps embed the selector next to the input. |
| `core-entity-forms` — `MJAIAgentFormComponent` extended | Add the new "Search" tab (mockup 5). |
| `ng-skip-chat` — conversation view | Add RAG badge (mockup 6) and tool-call chip styling. |
| Artifact viewer plugin registry | Register `application/vnd.mj.search-result-set` → `JsonArtifactViewerPlugin` until PR #2237 swaps it to `DataArtifactViewerPlugin`. |
