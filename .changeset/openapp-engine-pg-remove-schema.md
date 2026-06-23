---
"@memberjunction/open-app-engine": patch
---

fix(open-app): make Open App removal work on PostgreSQL (`__` schema + case-folding)

Two issues prevented cleanly removing a schema-backed Open App on PostgreSQL:

1. **`__`-prefixed schema couldn't be dropped on remove.** Install can opt into a `__`-prefixed app schema via `--dangerously-ignore-dbl-underscore-schema-rule`, but `remove` had no equivalent, so `DropAppSchema` hit the `'__' reserved for MJ internals` guard and removal failed (leaving the app `Error` and the schema orphaned). Removal of a *recorded* app's own schema is always legitimate (the name comes from its persisted install record, not arbitrary input), so the remove path now bypasses the `__` guard. Exact-match reserved names (e.g. `__mj`) stay blocked via `RESERVED_SCHEMAS`.

2. **PostgreSQL identifier case-folding orphaned the real tables.** PG folds unquoted identifiers to lowercase, so an app declaring a mixed-case schema (`__mj_BizAppsCommon`) ends up with its tables in the folded schema (`__mj_bizappscommon`, created by its unquoted migration DDL) while Skyway's quoted history table lands in the mixed-case schema. Dropping only the declared name orphaned one of them. `DropAppSchema` now resolves every schema whose name matches case-insensitively on PostgreSQL and `CASCADE`-drops each, so teardown is complete. SQL Server (case-insensitive identifiers) is unchanged.

Proven live: `bizapps-common v5.31.1` removes cleanly on a PostgreSQL MJ instance — both schemas dropped, entity metadata retired, app status `Removed` (was failing pre-fix).
