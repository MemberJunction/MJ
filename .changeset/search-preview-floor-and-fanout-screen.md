---
"@memberjunction/search-engine": patch
"@memberjunction/ng-search": patch
---

The omnibar dropdown and the Search Results page now apply the same relevance floor, and the entity fan-out stops querying entities that have no search surface.

**The two surfaces disagreed.** `SearchEngine.PreviewSearch` sent no `MinScore`, and `Search` defaults an absent one to `0`, so the dropdown applied no relevance floor at all. The full results page sends its `MinScorePercent` default of 30 as `0.30`. Any record scoring in between appeared in the dropdown and was gone from the page the dropdown's own "See all results" link opens — a record the scorer gives `0.15 + (1/5 × 0.45) = 0.24` (one non-name field matched out of five searchable ones) is a real example. `PreviewSearch` now applies the new `DEFAULT_SEARCH_MIN_SCORE`, which is that same `0.30`.

`SearchParams.MinScore` still defaults to `0` inside `Search` itself — a caller that omits it there is asking for everything the providers returned, which agents, MCP and the system-user client rely on. The new constant is the default for the *interactive* surfaces, applied by them.

`@memberjunction/ng-search`'s own `DEFAULT_MIN_SCORE` was a third value, `0.35`, making it stricter than the page it feeds; it is now `0.30`. That default is live — the search-scope preview in `searchscope-form.component.ts` uses it — so scope previews become slightly more permissive. It cannot import the server constant across the browser/server boundary, so the two are kept equal by hand and each points at the other.

**The fan-out queried entities that could never match.** `getSearchableEntities` filtered on `AllowUserSearchAPI` alone. An entity can carry that flag while declaring no `IncludeInUserSearchAPI` field — CodeGen defaults the entity flag to true, but the field flags are only set when smart-field analysis runs. For those, `UserSearchString` is a documented no-op (#4581/#4582): the provider ignores the term and returns the unfiltered table, and the scorer then discards every row because none of them matched. The round-trip could only ever produce load. The fan-out now also requires `EntityInfo.HasSearchFields`.

Full-text-search entities are exempt from the screen: an FTS entity is searchable through its index, and `createViewUserSearchSQL` takes the FTS branch before it ever reads `IncludeInUserSearchAPI`, so the fan-out requires `HasSearchFields || FullTextSearchEnabled`.

This is a screen, not a substitute for the metadata being right — such entities belong in `metadata/entities/.entity-search-exclusions.json`, and the ones known today are already there. It is the backstop that keeps the next one from silently costing every keystroke a round-trip. Entities whose candidate fields all drop out at runtime (denied by field-level security, or not text-search targets) are still queried: they return `(1=0)` cheaply, which is a real if empty answer.
