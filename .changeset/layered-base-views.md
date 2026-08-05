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

SQL Server only. CodeGen throws on a layered entity under PostgreSQL, which expands `SELECT *` at
view creation and freezes it, has no `sp_refreshview` equivalent, and never recreates the
application-owned outer view — so a late-added column would silently never reach it, the exact
failure this feature exists to prevent. Fully custom base views are unaffected on both dialects.

Also adds `EntityInfo.GeneratedViewName` (the single resolution of "which view does CodeGen write",
derived from `HasLayeredBaseView` so the two cannot disagree) and `EntityInfo.HasLayeredBaseView`;
orders `sp_refreshview` inner-before-outer, since the custom layer's `SELECT g.*` caches its column
list and refreshing the outer against a stale inner leaves new columns missing; guards the refresh
and grants aimed at the application-owned outer view on its existence, so the first CodeGen pass —
which necessarily runs before that view can exist — bootstraps instead of failing; lets a layered
entity's inner view self-heal through the failed-refresh regeneration path; and refuses a
self-referencing name via a CHECK constraint and a case-insensitive comparison.
