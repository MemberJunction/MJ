---
"@memberjunction/search-engine": patch
---

The entity search fan-out no longer queries entities that have no search surface.

`getSearchableEntities` filtered on `AllowUserSearchAPI` alone. An entity can carry that flag while declaring no `IncludeInUserSearchAPI` field at all — CodeGen defaults the entity flag to true, but the per-field flags are only set when smart-field analysis runs, which is off by default. For those entities `UserSearchString` is a documented no-op (#4581/#4582): the provider ignores the term and returns the **unfiltered** table, and `convertResults` then discards every row because `matchedFields` is 0. The round-trip could only ever produce load, never a result — on every keystroke, for every such entity.

The fan-out now also requires `EntityInfo.HasSearchFields`, the same predicate #4582 added on the data-provider side, so the two layers answer the same question the same way.

Entities whose candidate fields all drop out *at runtime* — denied by field-level security, or not text-search targets — are still queried: they return `(1=0)` cheaply, which is a real if empty answer. Only the no-surface case is skipped, matching the (a)/(b) split #4582 established. A full-text entity with no per-field flags is deliberately not exempted either, because this provider could not use its rows; full-text coverage comes from `FullTextSearchProvider`, which calls the provider's `FullTextSearch` directly.

This is a screen, not a substitute for correct metadata — such entities belong in `.entity-search-exclusions.json`, and today's are already there. It is the backstop that keeps the next one from silently costing every keystroke a round-trip until someone notices.

**Known limitation:** the screen sits in `getSearchableEntities`, which the scoped path bypasses — `buildScopedEntityList` honours `scopeConstraints.Entities` verbatim. A search scope that names a no-search-surface entity still issues the wasted query. Left as-is deliberately: an admin picking entities explicitly is a different case from the unscoped default, and silently dropping one of their picks is a decision worth making on its own rather than inside this change.
