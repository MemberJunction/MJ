---
"@memberjunction/codegen-lib": patch
"@memberjunction/sql-converter": patch
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/metadata-sync": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/core": patch
"@memberjunction/cli": patch
"@memberjunction/sql-dialect": patch
"@memberjunction/server": patch
---

PostgreSQL v5.33.x recovery pass — fresh-DB replay reaches green end-to-end.

Catch-up migrations (v5.33.x) that recover from chain-internal regressions exposed by clean-DB Aurora replay:

- **V202605051630 — Recreate 12 CRUD functions orphaned by V202605041500 cleanup.** The duplicate-overload cleanup CASCADE-dropped both sproc overloads when only one was duplicated, leaving 12 entities with no CRUD function on fresh installs. Recreated with view-independent signatures (`RETURNS SETOF __mj."<BaseTable>"`) so they don't fail at create time when the dependent view is regenerated later in the chain.
- **V202605052100 — Wave 2 catch-up: 22 more orphaned functions across 17 entities + EntityField Sequence renumber.** Same root cause as Wave 1; second-pass fresh-DB audit identified the remaining gap. Plus a renumber pass for any EntityField rows still parked in the staging band (Sequence ≥ 100000) from interrupted prior codegen runs — `spUpdateExistingEntityFieldsFromSchema` skipped these when `fromSQL.Sequence` was NULL.

Code fixes:

- **CodeGenLib** — `applyPermissions` inner catch was binding `e` and shadowing the outer `EntityInfo` loop variable, producing `Error executing permissions file ... for entity undefined` log lines. Renamed to `sqlError` with `instanceof Error` typed message extraction. Plus PG character/varchar/citext now map to GraphQL `String` (was emitting blank scalar refs that broke client-side type checking on a handful of legacy columns).
- **SQLConverter** — `CREATE OR REPLACE FUNCTION` output now emits a `DROP FUNCTION ... IF EXISTS` guard before recreate so re-runs don't trip "function ... is not unique" when overloads accumulated from prior partial runs. Also added: `ADD COLUMN IF NOT EXISTS` for idempotent column-add migrations, bit-parameter body coercion for `bit`-declared params used in boolean contexts, tagged dollar-quoting on `DO` blocks containing nested `$$`, and bracketed T-SQL type stripping in `CAST/CONVERT` rewrites.
- **PostgreSQLDataProvider** — RDS/managed-PG-compatible startup wrapper (no `pg_catalog` writes), serialized transaction mutex on the connection pool to fix interleaved BEGIN on shared connections during `mj sync` fan-out, filter-clause state machine for safe identifier quoting in user filters.
- **MetadataSync** — `mj sync push` now tolerates UUID case mismatches (PG returns lowercase, SS returns uppercase) on lookup resolution, and `@file:` JSON references serialize to `jsonb` correctly on PG (was double-stringifying via the SS path).
- **MJCoreEntitiesServer** — Template parameter extraction now wraps the AI enrichment call in a SAVEPOINT so an enrichment failure doesn't abort the outer sync transaction (PG's whole-tx-aborts-on-statement-error policy made this fatal where SS treated it as a per-statement skip).
- **MJCore** — `BaseEntity` / `EntityInfo` / `util` adjustments for cross-dialect identifier handling and field metadata sync.

All v5.33.x migrations validated against a fresh DROP-CASCADE-replay of the full v5 chain on Aurora; first-time `mj sync push` + `mj codegen` complete cleanly with 635 spCreate/spUpdate functions present.
