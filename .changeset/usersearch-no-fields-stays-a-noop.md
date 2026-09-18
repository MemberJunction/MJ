---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
---

`RunView`'s `UserSearchString` is a no-op again on an entity that declares no searchable field, and `EntityInfo` gains a cached `HasSearchFields`.

`9cf55b750e` made an empty per-field predicate emit `(1=0)`, so a search term against **any** entity with no `IncludeInUserSearchAPI` field returned zero rows instead of being ignored. That blanks a generic grid whose search box sits over an entity nobody configured search fields for, and it broke the pinned integration check `runview-matrix.RVM9`.

The `(1=0)` fallback is now gated on the entity actually declaring searchable fields, which preserves what that change was for — a term whose candidate fields all dropped out (denied by field-level security, or not sensible text-search targets) still returns zero rows rather than the whole table. An entity with no search surface at all goes back to ignoring the term.

`EntityInfo.HasSearchFields` answers "does this entity have a search surface at all", computed once per `EntityInfo` and cached like `HasInactiveFields`, so a hot search path never rescans the field list. It is reset wherever `_Fields` is (re)assigned.

That reset block also now clears `_hasInactiveFields`. `HasInactiveFields` was added three days after the block and never listed in it, so it served stale results after a `_Fields` reassignment — the exact staleness the block exists to prevent.

Fixes #4581.
