# Developing MemberJunction on PostgreSQL

End-to-end guide for running a MemberJunction instance against PostgreSQL instead of SQL Server. This is the reference flow exercised by `docker/workbench/`, but it works identically on a developer laptop.

Scope: fresh install → migrations → CodeGen → metadata push → MJAPI → Explorer. Assumes you already have the MJ repo cloned and `npm install` completed at the root.

---

## 1. Prerequisites

| Tool | Minimum | Purpose |
|---|---|---|
| PostgreSQL | 14+ | Target database |
| Node.js | 20+ | Build + runtime |
| `@memberjunction/cli` | 5.24+ | `mj migrate`, `mj codegen`, `mj sync` |

Create an empty PG database and a login with DDL privileges. The examples below assume:

```
Host:      localhost
Port:      5432
Database:  MJ_PG_Dev
User:      mj_dev
Password:  <your password>
Schema:    __mj (default)
```

## 2. Point the repo at PostgreSQL

Every MJ CLI entrypoint (migrate, codegen, sync) reads `mj.config.cjs` at the repo root. Add **`dbPlatform: 'postgresql'`** — that single switch propagates through every tool.

```js
// mj.config.cjs
module.exports = {
  dbPlatform: 'postgresql',
  dbHost: 'localhost',
  dbPort: 5432,
  dbDatabase: 'MJ_PG_Dev',
  dbUsername: 'mj_dev',          // used by mj sync
  dbPassword: '...',
  codeGenLogin: 'mj_dev',        // used by mj migrate / mj codegen
  codeGenPassword: '...',
  coreSchema: '__mj',
  migrationsLocation: 'filesystem:./migrations', // mj migrate swaps to migrations-pg automatically when dbPlatform=postgresql
};
```

**Why one flag is enough:**
- `mj migrate` — Skyway picks the `PostgresProvider` when `dbPlatform==='postgresql'` and swaps the source dir from `migrations/` to `migrations-pg/`.
- `mj codegen` — loads `PostgreSQLCodeGenProvider` for SQL object generation (views, CRUD functions, timestamp triggers).
- `mj sync` — `provider-utils.ts` lazy-loads `PostgreSQLDataProvider` with a `pg.Pool`.

## 3. Apply migrations

```bash
mj migrate --verbose
```

This walks `migrations-pg/v5/` in order, applying each to `MJ_PG_Dev`. Skyway records every applied migration in `__mj.skyway_schema_history` so reruns are idempotent.

**If migrations-pg/v5/ doesn't exist yet** (because you're developing on a branch that only has T-SQL migrations):

```bash
mj migrate convert           # Batch T-SQL → PG conversion
```

This calls SQLConverter against the full `migrations/v5/` set and writes `.pg.sql` files to `migrations-pg/v5/`. Review the output, commit, then run `mj migrate`.

## 4. Run CodeGen

```bash
mj codegen
```

CodeGen's PG path emits:
- PG `CREATE OR REPLACE VIEW` statements for each entity (`vw{EntityName}s`) — non-destructive by default
- `fn_create_*`, `fn_update_*`, `fn_delete_*` PL/pgSQL functions (equivalent to T-SQL sp{Create|Update|Delete}{Entity}). Runtime `PostgreSQLDataProvider` resolves these via `getCRUDFunctionName` returning `fn_create_<snake_table>`.
- `__mj_CreatedAt`/`__mj_UpdatedAt` triggers
- FK-column indexes
- `GRANT` statements wrapped in `DO $$ … EXCEPTION WHEN OTHERS THEN NULL; END $$` for install tolerance

The generated SQL is written to a timestamped file and applied to the database in the same run. Each entity is executed in three phases — view → CRUD functions → grants — with phase gating: a phase failure short-circuits later phases for that entity but does not affect other entities.

When a view's column shape changes (added/removed/retyped column), PG's `CREATE OR REPLACE VIEW` raises `SQLSTATE 42P16`. CodeGen handles this transparently: it captures dependent views, functions, grants, and the COMMENT, drops with CASCADE, recreates the target, then restores the dependents. If any restoration fails, you get a `ViewFallbackRestoreError` with the exact phase that failed (`capture` / `drop` / `recreate` / `restore-views` / `restore-functions` / `restore-grants` / `restore-metadata`).

For CI runs, set `MJ_CODEGEN_STRICT_VIEW_REGEN=true` to make any view regeneration failure a hard error. Local dev defaults to non-strict — failures are summarized but don't halt the run.

## 5. Seed metadata

```bash
mj sync push --dir metadata
```

Every `metadata/*/` directory with a `.mj-sync.json` gets pushed into the live DB via `PostgreSQLDataProvider`. This is the same push/pull flow as SQL Server — there is no PG-specific invocation.

## 6. Start MJAPI

MJAPI auto-detects PG from `DB_TYPE=postgresql` (or `PG_*` env vars). Set:

```bash
DB_TYPE=postgresql
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=MJ_PG_Dev
PG_USERNAME=mj_dev
PG_PASSWORD=...
```

Then:

```bash
npm run start:api
```

Behind the scenes, MJAPI uses `PostgreSQLDataProvider` with a `pg.Pool`, plus a bracket-to-quote SQL translator so generated GraphQL resolvers (which emit T-SQL-style `[schema].[table]`) keep working without per-resolver rewrites.

## 7. Start Explorer

Explorer is dialect-agnostic — it talks to MJAPI over GraphQL. After switching the backend from SQL Server to PostgreSQL at the same URL, **clear browser cache** (or use incognito). UUID case differs between the platforms (SQL Server returns uppercase, PG returns lowercase) and cached metadata will produce subtle mismatches.

```bash
npm run start:explorer
```

## 8. Creating new PG migrations

```bash
mj migrate create "Add FooID to Bar"
```

With `dbPlatform: 'postgresql'`, this scaffolds `migrations-pg/v5/V{TS}__v{X.Y}.x__Add_FooID_To_Bar.pg.sql` with PG-idiomatic conventions (COMMENT ON, double-quoted identifiers, `${flyway:defaultSchema}` placeholder).

Override the platform with `--platform sqlserver` if you want to scaffold the T-SQL counterpart in the same session.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `mj migrate` can't find `PostgresProvider` | Missing workspace dep | Ensure `@memberjunction/skyway-postgres` is installed at the MJCLI package level |
| `mj sync push` fails with `System user not found` | UserCache not populated | Verify `__mj.vwUsers` / `__mj.vwUserRoles` exist and `System` user has Developer role |
| EntityField Sequence collision | Two migrations inserting at same Sequence for same entity | Auto-resolved by `SequenceDeduplicator` rule during `mj migrate convert` |
| `function fn_create_<table> does not exist` at runtime | CodeGen has not been run, or the function name in PG snake_case doesn't match | Run `mj codegen` to regenerate the CRUD functions; `PostgreSQLDataProvider.getCRUDFunctionName` resolves the PG snake_case name |
| `ViewFallbackRestoreError: phase=restore-functions` | Dependent function recreation failed during 42P16 fallback | Inspect the captured DDL in the error payload; usually indicates the dependent function references columns the regenerated view no longer has |
| `column "X" does not exist` during CodeGen | View's column snapshot is stale relative to the underlying table | Run `mj codegen` again; the second pass regenerates the view with the new column |
| Explorer shows stale metadata after dialect switch | Browser cache | Clear cache or incognito window; UUID case differs between platforms |
| Pagination on Explorer shows wrong rows | Old build of `@memberjunction/generic-database-provider` with SQL Server-implicit pagination math | Update to current version; PG `LIMIT/OFFSET` semantics are now explicit |

## Validation artifacts

- `scripts/validate-pg-codegen.mjs` — Provider-level PG syntax check for `PostgreSQLCodeGenProvider` (26 generation + 3 execution tests). Run against a local `mj_pg_codegen_test` DB to verify the CodeGen provider produces PG that actually parses and executes.
- `scripts/pg-install-fresh.mjs` — Full install pipeline: drop DB → migrate → CodeGen → seed → ready for `npm start`. Use this to reproduce the end-to-end flow on demand.
- `packages/CodeGenLib/src/__tests__/integration/` — 59+ integration tests covering CodeGen sprocs, view regeneration safety, `pg_depend`/`pg_rewrite` capture functions, the fallback orchestrator, and phased execution. Gated on `MJ_TEST_PG_URL`; run locally to audit any change to the PG CodeGen provider.
