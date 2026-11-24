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

The first thing applied is the **v5.30 baseline** (`B202604301800__v5.30__PG_Baseline.pg.sql`). The baseline contains:
- ✅ Every v5.0–v5.30 **schema** change (tables, columns, views, functions, indexes, constraints)
- ✅ Every metadata sync **through v5.29**
- ❌ Does **not** contain the v5.30 metadata sync — that's the 964k-line `V202604271430__v5.30.x__Metadata_Sync.sql` whose PG conversion has a known string-escape bug. **Run step 5 (`mj sync push --dir metadata`) after `mj migrate` to bring metadata to true v5.30 state.** Without that step, you'll have v5.30 schema but stale (v5.29) metadata for new agents/prompts/entity descriptions.

After the baseline, every committed `V*.pg.sql` is applied — but ones with timestamps before the baseline's `202604301800` are auto-skipped (their content is in the baseline). Future v5.31+ migrations will land normally.

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

## 5. Seed metadata (REQUIRED for true v5.30 state)

```bash
mj sync push --dir metadata
```

Every `metadata/*/` directory with a `.mj-sync.json` gets pushed into the live DB via `PostgreSQLDataProvider`. This is the same push/pull flow as SQL Server — there is no PG-specific invocation.

**Why this is required for fresh PG installs at v5.30**: the baseline contains schema + metadata syncs through v5.29. The 964k-line v5.30 metadata sync (`V202604271430__v5.30.x__Metadata_Sync.sql`) is deferred to v5.30.1 — its PG conversion hits a string-escape bug at the `${formatted}` template literal pattern in stored Query SQL. The right fix isn't to repair generated content but to regenerate from canonical sources via `mj sync push` — which is exactly what this step does. After this step, your DB is at true v5.30 metadata state.

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
- `scripts/snapshot-ss.sh` and `scripts/snapshot-pg.sh` — Capture sorted lists of tables/columns/constraints/indexes/routines/views from each platform; diffing per-platform deltas across platforms verifies that a hand-fixed PG migration produces the same logical schema state as its SQL Server source. See `scripts/README-migration-equivalence.md` for the workflow.
- `packages/CodeGenLib/src/__tests__/integration/` — 59+ integration tests covering CodeGen sprocs, view regeneration safety, `pg_depend`/`pg_rewrite` capture functions, the fallback orchestrator, and phased execution. Gated on `MJ_TEST_PG_URL`; run locally to audit any change to the PG CodeGen provider.

---

## Managed PostgreSQL (RDS / Aurora / Cloud SQL / Azure)

As of v5.30, MJ migrations run on managed PG without superuser privileges. The previous `pg_cast` dependency has been removed, and all BOOLEAN-column INSERT VALUES, WHERE/UPDATE comparisons, CHECK constraints, and DEFAULT clauses now use `TRUE/FALSE` directly.

### What changed in v5.30
The converter previously emitted a header containing `UPDATE pg_cast SET castcontext = 'i'` to make the implicit `INT → BOOLEAN` cast available. Customer accounts on managed PG don't have catalog-modify privileges (RDS provides `rds_superuser` which has restricted access), so the migration would fail on first apply. The fix:

- **All `pg_cast` UPDATE statements stripped** from the 50 affected `.pg.sql` files
- **10,967 INSERT VALUES tuples** had their `0`/`1` BOOLEAN-column literals rewritten to `FALSE`/`TRUE`
- **3,510 WHERE/UPDATE/SET comparisons** of the form `"BoolCol" = 0/1` rewritten to `= TRUE/FALSE`
- **9 CHECK constraint expressions** repaired (pre-existing converter bug that wrote `>=TRUE` for INTEGER columns)
- **3 hand-fixes** for specific BOOLEAN constructs (one DEFAULT clause, two view/function predicates)

See `migrations-pg/V5_30_NOTES.md` for details. The tooling lives in `scripts/fix-pg-cast-and-booleans.mjs`, `scripts/fix-bool-comparisons.mjs`, and `scripts/fix-bool-constraint-bug.mjs`.

### Operational note for existing PG dev environments
Because we modified Flyway-tracked migration files, existing PG dev environments need a one-time `flyway repair` after pulling these changes — the file checksums have changed but the actual schema effects are identical (the previous `pg_cast` UPDATE was a no-op on environments that already had it).

### Settings for a managed PostgreSQL host
- **TLS** (every MJ client: MJAPI, CodeGen, `mj migrate`, MetadataSync, pgvector): `PG_SSL_MODE` = `disable` | `require` | `verify-ca` | `verify-full`. Default: `disable` for `localhost` or a bare service name, `verify-full` for any other host. Point `PG_SSL_CA_FILE` at the provider's CA bundle when Node does not trust it (RDS: the region bundle; Azure's DigiCert/Microsoft roots are normally already in Node's store). `PG_SSL_SERVERNAME` overrides the name checked, e.g. behind Private Link. MJAPI also accepts `databaseSettings.postgres.ssl` in `mj.config.cjs`.
- **Passwordless logins**: `PG_AUTH_MODE=azure-entra` (Azure Database for PostgreSQL, Azure HorizonDB; the login is the Entra principal created with `pgaadauth_create_principal`) or `aws-rds-iam` (RDS/Aurora; the login needs `rds_iam`). Install `@azure/identity` or `@aws-sdk/rds-signer` alongside. Token modes require `verify-ca` or `verify-full`.
- **Before the first `mj migrate`**: run `mj doctor --db`. It checks the server version, the group roles and extensions the pending migrations need (and Azure's `azure.extensions` allowlist), the login's `CREATE` on the database, the schema owner, and TLS, and prints the SQL an administrator must run. `mj migrate` runs the same check first; `--skip-preflight` turns it off.
- **Connections**: MJAPI opens an API pool (`connectionPool.max`, default 50), two read-only pools when a read-only login is set, and a CodeGen pool of 10. It warns at startup when that could exceed 80% of `max_connections`; set `connectionPool.expectedInstances` for a fleet.
- **Read replicas**: `PG_READ_REPLICA_HOST` (and `PG_READ_REPLICA_PORT`) sends the ad-hoc read-only pool to a replica; `PG_READ_REPLICA_POOLS=all-read-only` sends application reads too, at the cost of read-your-writes.
- **Role hierarchy**: the migrations GRANT to `cdp_Developer`, `cdp_Integration` and `cdp_UI`; create them (NOLOGIN) as an administrator. Never grant `SUPERUSER`; managed PG won't allow it.
- **Performance tuning**: `work_mem`, `shared_buffers`, `effective_cache_size` etc. need parameter-group adjustments for production workloads.
- **PG version**: 14 or later (16 and 18 are tested).

### What's known to work on managed PG today
- Application-level PG (everything past `mj migrate` finishing) — the runtime, MJAPI, MJExplorer, CodeGen — uses only application-grade SQL that managed PG accepts.
- Schema introspection, view regeneration, function compilation, GRANT statements — all standard operations.

So once the `pg_cast` blocker lifts, the runtime should "just work" against RDS modulo standard ops hardening.
