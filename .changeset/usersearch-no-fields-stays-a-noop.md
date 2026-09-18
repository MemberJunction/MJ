---
"@memberjunction/generic-database-provider": patch
---

`RunView`'s `UserSearchString` is a no-op again on an entity that declares no searchable field.

`9cf55b750e` made an empty per-field predicate emit `(1=0)`, so a search term against **any** entity with no `IncludeInUserSearchAPI` field returned zero rows instead of being ignored. That blanks a generic grid whose search box sits over an entity nobody configured search fields for, and it broke the pinned integration check `runview-matrix.RVM9`.

The `(1=0)` fallback is now gated on the entity actually declaring searchable fields, which preserves what that change was for — a term whose candidate fields all dropped out (denied by field-level security, or not sensible text-search targets) still returns zero rows rather than the whole table. An entity with no search surface at all goes back to ignoring the term.

Fixes #4581.
