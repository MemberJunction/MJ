---
"@memberjunction/core": minor
"@memberjunction/codegen-lib": minor
---

Layered base views: an entity can now have BOTH a generated base view and a custom one over it

`BaseViewGenerated = 0` was all-or-nothing. To add one computed column an application inherited the
entire generated view — every related-entity display join, the geo join, the recursive root-ID
`OUTER APPLY`, the soft-delete predicate — and had to hand-maintain it from then on. Add a foreign
key later and its display field simply never appeared, because nothing regenerated the join: the
column was absent rather than wrong, so nothing errored and no test noticed. It also froze the entity
at whatever CodeGen produced the day the view was copied.

New `Entity.GeneratedBaseViewName`: when set, CodeGen writes its full generated view under THAT name
and the application owns `BaseView`, wrapping it —

```sql
CREATE VIEW vwOrderHeaders AS
SELECT g.*, CASE WHEN ... END AS IsOverdue
FROM   vwOrderHeadersGenerated g;
```

Everything underneath keeps regenerating, so a new foreign key appears on its own, and the custom
layer stays a few reviewable lines. Columns it adds become first-class virtual `EntityField` rows and
are returned by `spCreate`/`spUpdate`/`spDelete`, which read `BaseView`.

Additive: `NULL` — every existing entity — reproduces the previous behaviour exactly. No install
changes unless it opts in.

Also adds `EntityInfo.GeneratedViewName` (the single resolution of "which view does CodeGen write")
and `EntityInfo.HasLayeredBaseView`; orders `sp_refreshview` inner-before-outer, since the custom
layer's `SELECT g.*` caches its column list and refreshing the outer against a stale inner leaves new
columns missing; and refuses a self-referencing name via a CHECK constraint and a case-insensitive
comparison.
