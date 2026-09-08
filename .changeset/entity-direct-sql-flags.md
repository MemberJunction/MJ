---
"@memberjunction/core": minor
---

Entity: declare per-verb which entities may be written by SQL that bypasses `BaseEntity`

MJ's contract is that every mutation flows through `BaseEntity.Save()` / `.Delete()`, because that is
the only path where record-change tracking, cache invalidation, entity actions, validation and soft
delete actually run. SQL written outside that path skips all of it, and none of those failures are
loud — you get an audit trail that looks complete but isn't, and a server cache that serves stale
rows indefinitely.

Three new `Entity` columns make the exception explicit instead of tribal knowledge:

- `AllowDirectSQLInsert` — bulk loads, ETL/integration sync, rows created as a side effect of a proc
- `AllowDirectSQLUpdate` — bulk backfills, maintenance routines
- `AllowDirectSQLDelete` — purge/retention, integration reconciliation

All default to `0`, which is exactly today's behaviour. Split by verb because the risk differs: a
bulk `INSERT` on a staging-shaped entity is routine, a direct `DELETE` on a soft-delete entity
destroys rows the platform promised to keep.

These **declare** intent for the code paths and tooling that consult them — they enforce nothing, and
cannot; no constraint or trigger stops anyone executing SQL.

Two CHECK constraints enforce the invariants, since both failure modes are silent: any direct-SQL
flag requires `TrackRecordChanges = 0` **and** `TrustServerCacheCompletely = 0` (direct DML writes no
audit row and fires no invalidation event — note `TrustServerCacheCompletely` already documented
exactly this scenario), and `AllowDirectSQLDelete` additionally requires `DeleteType = 'Hard'`.

Surfaced on `EntityInfo` as `AllowDirectSQLInsert` / `AllowDirectSQLUpdate` / `AllowDirectSQLDelete`.
