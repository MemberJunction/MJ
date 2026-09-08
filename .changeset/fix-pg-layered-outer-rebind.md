---
"@memberjunction/open-app-engine": patch
---

Fix `spRebindLayeredOuterView` on PostgreSQL, which could never restar a layered outer view. It shipped with an undeclared `v_starred` variable — PL/pgSQL compiles the whole body on first call, so every invocation failed, including the `spRebindLayeredOuterViewsInSchema` call Open App's metadata refresh issues first in its batch (aborting the field-heal statements behind it). Removing that dead write exposed a second defect: single-argument `btrim()` strips spaces but not newlines, and `pg_get_viewdef` pretty-prints, so the SELECT-item scan stopped after one column and rebuilt the view as `SELECT g.*, <every inner column again>` — rejected as `column ... specified more than once`. Both are corrected in a new pg-only migration. Also makes integration checks LBV2–LBV5 run on PostgreSQL instead of silently skipping while still scoring as passed.
