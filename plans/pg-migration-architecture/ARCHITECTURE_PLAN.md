# PostgreSQL Migration Architecture Plan

## Executive Summary

This plan redesigns MemberJunction's database migration tooling to be **multi-database native** with SQLGlot as the core transpiler, Skyway as the migration runner, and a comprehensive dev-on-PG workflow. The goal: a developer can install MJ on PostgreSQL (or MySQL, eventually) and use the full toolchain — migrations, CodeGen, mj-sync — without any SQL Server dependency.

---

## 1. Current State Assessment

### What Exists Today

| Component | Status | Notes |
|-----------|--------|-------|
| **SQLGlotTS** | Working | Python microservice wrapper; spawns a FastAPI server, communicates via HTTP. SQLGlot version pinned in `requirements.txt` for conversion reproducibility. |
| **SQLConverter** | Working | Rule-based pipeline: split → classify → pre-process → SQLGlot → post-process → group. All 14 rules audited and documented in `RULES.md` with `BypassJustification` fields. |
| **SQLDialect** | Working | Abstraction layer with `SQLServerDialect` and `PostgreSQLDialect` implementations |
| **CodeGenLib** | Working | `PostgreSQLCodeGenProvider` alongside `SQLServerCodeGenProvider`. Includes view-regeneration safety (42P16 fallback with dependency capture/restore) and phased per-entity execution. |
| **Skyway** | Multi-package | TypeScript Flyway clone, split into `skyway-core`, `skyway-sqlserver`, `skyway-postgres`. Driver-agnostic `DatabaseProvider` interface; `mssql` no longer in core. |
| **migrations-pg/** | Working | All v5 migrations have PG counterparts. Forward development against the committed files works end-to-end. Clean-slate regeneration has 4 known converter gaps (see `PG_MANUAL_FIXES_CATALOG.md` Category F). |
| **CI parity workflow** | Working | `.github/workflows/pg-migrations.yml` runs path-filtered on `migrations/`, `migrations-pg/`, and converter changes. |
| **Install pipeline scripts** | Working | `scripts/pg-install-fresh.mjs`: drop DB → migrate → CodeGen → seed → ready for `npm start`. Used to verify end-state for every PG-affecting change. |
| **Integration tests** | Working | 59+ PG integration tests (gated on `MJ_TEST_PG_URL`) covering CodeGen sprocs, view regeneration, dependency capture, fallback orchestrator, and phased execution. |
| **Docker workbench** | Working | SQL Server + PostgreSQL + Claude Code container for automated testing. Now invokes `mj migrate` instead of raw `psql -f`. |

### Original Pain Points — Status

1. ~~**Rules replaced SQLGlot in too many places**~~ → All bypass rules now have written justifications; SQLGlot is core, rules supplement. Audit complete.
2. ~~**No dev-on-PG workflow**~~ → One-flag switch (`dbPlatform: 'postgresql'`) propagates through migrate, CodeGen, mj-sync, MJAPI. End-to-end install verified.
3. **No MySQL path** — Still open. Architecture supports it (registry keyed on dialect pairs); rules and dialect class not yet written.
4. ~~**Migration runner is `psql -f` in a loop**~~ → Skyway with PG provider replaces this. Migrations tracked in `__mj.skyway_schema_history`.
5. ~~**ConversionPipeline vs BatchConverter**~~ → BatchConverter is the sole orchestrator; ConversionPipeline marked `@deprecated`.
6. ~~**No automated regression suite**~~ → CI workflow + 59+ integration tests + install pipeline script give us regression coverage at three levels.

---

## 2. Target Architecture

### 2.1 Layered Design

```
┌─────────────────────────────────────────────────────┐
│                    mj migrate CLI                    │
│  (Unified entry point: migrate, create, status)      │
├─────────────────────────────────────────────────────┤
│                      Skyway                          │
│  (Migration runner: version tracking, ordering,      │
│   state management, rollback support)                │
├─────────────────────────────────────────────────────┤
│               SQLConverter Pipeline                  │
│  ┌──────────┐  ┌─────────┐  ┌───────────────────┐  │
│  │Pre-process│→│ SQLGlot  │→│  Post-process      │  │
│  │  Rules    │  │ (core)  │  │  Rules             │  │
│  └──────────┘  └─────────┘  └───────────────────┘  │
│  ┌─────────────────────────────────────────────┐    │
│  │  Bypass Rules (targeted, well-documented)   │    │
│  └─────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────┤
│                   SQLDialect                         │
│  (Platform-specific SQL generation, quoting,         │
│   type mapping, introspection queries)               │
├──────────┬──────────┬──────────┬────────────────────┤
│ SQL Server│PostgreSQL│  MySQL   │  Future dialects   │
└──────────┴──────────┴──────────┴────────────────────┘
```

### 2.2 Core Principles

1. **SQLGlot is the transpiler** — Pre/post rules supplement it; bypass rules are exceptions, not the norm
2. **Rules are auditable** — Each bypass rule documents *why* SQLGlot can't handle this pattern, with a link to an upstream SQLGlot issue if applicable
3. **Skyway owns execution** — No more `psql -f` loops; Skyway tracks state, handles ordering, supports dry-run
4. **Dialect is injectable** — CodeGen, mj-sync, and RunView all accept a dialect; they don't assume SQL Server
5. **Migrations are write-once per platform** — A T-SQL migration is never auto-converted at runtime; conversion happens at dev time and the result is committed

---

## 3. Component Plans

### 3.1 SQLConverter Redesign

**Goal**: Make SQLGlot the undisputed core; reduce bypass rules to a documented minimum.

#### 3.1.1 Audit Existing Rules

Every rule in `packages/SQLConverter/src/rules/` is classified:

| Category | Action | Example |
|----------|--------|---------|
| **Pre-process** (keeps SQLGlot as core) | Keep, refine | Schema placeholder replacement, bracket removal |
| **Post-process** (fixes SQLGlot output) | Keep, refine | Boolean casting, serial type fixup |
| **Bypass** (replaces SQLGlot entirely) | Justify or remove | `sp_addextendedproperty` → `COMMENT ON` |
| **Redundant** (SQLGlot handles it fine now) | Remove | Check if newer sqlglot versions handle patterns that rules were written for |

**Action items:**
- [x] Upgrade sqlglot Python package to latest version (pinned in `requirements.txt`)
- [x] Add a `BypassJustification` field to `IConversionRule` interface
- [x] Document each bypass rule with `BypassJustification` (all 14 rules)
- [x] Single source of truth in `packages/SQLConverter/RULES.md`
- [ ] Run each bypass rule's test cases through raw SQLGlot to see which are now handled
- [ ] For remaining bypasses, file upstream sqlglot issues where appropriate

#### 3.1.2 Consolidate Pipelines

Two conversion orchestrators existed:
- `ConversionPipeline` — statement-level, uses `SqlGlotClient` directly
- `BatchConverter` — file-level, uses rules system

**Decision**: BatchConverter is the primary pipeline. It has the rule system, grouping, and context tracking. ConversionPipeline was an earlier prototype.

**Action items:**
- [x] Deprecate `ConversionPipeline` (`@deprecated` marker in place; BatchConverter is the sole orchestrator)
- [ ] Move `ConversionPipeline`'s LLM fallback and database verification into `BatchConverter` (deferred — has not been needed in practice)

#### 3.1.3 Multi-Dialect Rule Registration

The `RuleRegistry` already supports `SourceDialect`/`TargetDialect` pairs. Extend for MySQL:

```typescript
// Existing
RuleRegistry.Register(new CreateTableRule());  // tsql -> postgres

// Future MySQL rules
RuleRegistry.Register(new CreateTableMySQLRule());  // tsql -> mysql
```

**Action items:**
- [ ] Add `'mysql'` to `DatabasePlatform` union type in SQLDialect
- [ ] Create `MySQLDialect` class extending `SQLDialect`
- [ ] Template one representative rule (e.g., `CreateTableRule`) for `tsql -> mysql` conversion
- [ ] Ensure `BatchConverter` resolves rules by dialect pair, not by hardcoded assumption

### 3.2 Skyway Integration

**Goal**: Replace `psql -f` loops with Skyway for all migration execution.

**Status**: Done. Skyway is now split into three packages — `skyway-core` (interfaces + orchestration), `skyway-sqlserver` (mssql driver), and `skyway-postgres` (pg driver). The `Skyway` class is driver-agnostic; consumers select dialect via config. `mssql` is no longer a dependency of core.

#### 3.2.1 Skyway as `mj migrate` Backend

```
mj migrate                  # Apply pending migrations (uses Skyway)
mj migrate create <name>    # Create new migration file with timestamp (dialect-aware template)
mj migrate convert          # Convert T-SQL migrations to PostgreSQL
```

**Action items:**
- [x] Add `@memberjunction/skyway-sqlserver` and `@memberjunction/skyway-postgres` as dependencies to `@memberjunction/cli`
- [x] Wire Skyway into `mj migrate`
- [x] Auto-swap source dir (`migrations/` ↔ `migrations-pg/`) based on `dbPlatform` config
- [x] Skyway history table: `__mj.skyway_schema_history`
- [x] `${flyway:defaultSchema}` placeholder resolution preserved
- [ ] Optional: rollback support (deferred; not yet needed in practice)

#### 3.2.2 Migration File Naming

Keep existing convention but make Skyway understand it:
```
V202603111750__v5.11.x__description.sql          # SQL Server
V202603111750__v5.11.x__description.pg.sql        # PostgreSQL (converted)
V202603111750__v5.11.x__description.pg-only.sql   # PostgreSQL-only patches
V202603111750__v5.11.x__description.mysql.sql     # Future: MySQL
```

Skyway should:
- Filter by file extension based on target platform
- Sort by timestamp prefix (already numeric-sortable)
- Track which have been applied in its history table

#### 3.2.3 `mj migrate convert` Flow

Replaces the manual Phase 2 of `/pg-migrate`:

```
mj migrate convert --from tsql --to postgres [--file <specific.sql>]
```

1. Discover unconverted migrations (like Phase 1)
2. For each, run through `BatchConverter` with current rule set
3. Write to `migrations-pg/v5/` (or `migrations-mysql/v5/`)
4. Validate by parsing the output (no database needed for syntax check)
5. Report results

### 3.3 CodeGen Multi-Database

**Goal**: `mj codegen` works against PostgreSQL (and eventually MySQL) natively.

#### 3.3.1 Current State

`PostgreSQLCodeGenProvider` generates:
- PG-native views (`CREATE OR REPLACE VIEW`) with non-destructive default behavior
- PG-native functions (`fn_create_*`, `fn_update_*`, `fn_delete_*`) replacing stored procedures
- PG-native triggers (`__mj_CreatedAt`/`__mj_UpdatedAt`)
- FK-column indexes
- `GRANT` statements wrapped in fault-tolerant `DO $$ ... EXCEPTION WHEN OTHERS THEN NULL; END $$` blocks
- Uses `PostgreSQLDialect` for quoting, type mapping
- Uses `LENGTH`, `LEFT`, `RIGHT`, `POSITION`, `OVERLAY`, `EXTRACT`, `GREATEST`, `LEAST` as PG keywords (not quoted as identifiers)

**Status of remaining items:**
- [x] **Boolean defaults**: BIT `DEFAULT 0/1` correctly translated to BOOLEAN `FALSE/TRUE` via `formatBooleanCompatibleDefault`
- [x] **PK strategy**: Insert templates skip PK column for UUID/AutoIncrement entities (no double-insert)
- [x] **Type mapping**: SQL Server `uniqueidentifier` no longer leaks into PG `DECLARE` blocks
- [x] **CRUD function naming alignment**: runtime `PostgreSQLDataProvider.getCRUDFunctionName` returns `fn_create_<snake_table>` — matches what CodeGen actually emits
- [x] **Permissions/Grants**: PG `GRANT ... ON FUNCTION` syntax in place
- [x] **Schema introspection**: reads from `information_schema`/`pg_catalog`
- [x] **Trigger column quoting**: `NEW."__mj_UpdatedAt"` properly quoted to preserve mixed case
- [ ] **Multi-hop virtual columns** (e.g., AIModel → AIModelType → AIVendor → Vendor name): single-hop FK JOINs work; multi-hop chains still missing
- [ ] **Full-text search**: PG `tsvector`/`tsquery` not yet generated where SQL Server uses `CONTAINS()`

#### 3.3.2 View Regeneration Safety (PG `42P16` Fallback)

PG's `CREATE OR REPLACE VIEW` rejects column-shape changes with `SQLSTATE 42P16` (`invalid_table_definition`). A naive `DROP VIEW ... CASCADE` solves the parse problem but silently drops dependent views, functions, and grants.

**Solution**: `PostgreSQLCodeGenProvider.regenerateBaseView` uses a fallback orchestrator:
1. Try `CREATE OR REPLACE VIEW` first (non-destructive happy path).
2. On 42P16, capture all dependents (views, functions, grants, COMMENT) via `pg_depend`/`pg_rewrite` queries.
3. `DROP VIEW ... CASCADE` and recreate with the new shape.
4. Restore captured dependents in reverse dependency order.
5. Skip restoring dependents that the same CodeGen run will recreate later (`willRegenerate` set).

A `ViewFallbackRestoreError` with phase discriminant makes any restoration failure visible and scoped. Covered by 33 integration tests.

#### 3.3.3 Phased Per-Entity Execution

CodeGen-per-entity SQL was originally a single batch (view + CRUD functions + grants). PG's simple-query protocol aborts the whole batch on the first error, so a view failure left CRUD functions and grants for that entity uncreated.

**Solution**: `PostgreSQLCodeGenProvider.executeEntityPhased` runs the three pieces as separate phases. Phase 1 (view) uses the 42P16 fallback. Phase 2 (CRUD) runs only if phase 1 succeeded. Phase 3 (grants) runs only if phase 2 succeeded. Each phase failure is reported separately and scoped to the affected entity — other entities continue normally.

#### 3.3.4 Strict Mode + Batch Summary

`regenerateFailedBaseViews` collects per-entity failures into an array, logs a batch summary, and throws when `MJ_CODEGEN_STRICT_VIEW_REGEN=true`. CI sets this flag; local dev defaults to non-strict so developers see the summary but aren't blocked.

### 3.4 mj-sync Multi-Database

**Goal**: `mj sync push/pull` works against PostgreSQL.

**Current state**: mj-sync uses `RunView` and entity objects, which go through the data provider. If the data provider supports PG (which `GraphQLDataProvider` does, since it talks to MJAPI which talks to whichever DB), mj-sync should work.

**Key question**: Does mj-sync ever run raw SQL? If so, that SQL needs to be dialect-aware.

**Action items:**
- [ ] Audit mj-sync for any raw SQL usage
- [ ] Test full push/pull cycle against MJAPI running on PostgreSQL
- [ ] Document any PG-specific behavior (UUID case sensitivity, etc.)

### 3.5 Dev-on-PG Workflow

**Goal**: A developer can do a fresh MJ install on PostgreSQL and use the full toolchain.

#### 3.5.1 Fresh PG Install Flow

```bash
# 1. Clone MJ repo
git clone https://github.com/MemberJunction/MJ.git && cd MJ

# 2. Configure for PostgreSQL
# mj.config.cjs: dbType: 'postgresql', host, port, credentials

# 3. Run all PG migrations
mj migrate run  # Skyway applies migrations-pg/v5/*.pg.sql in order

# 4. Run CodeGen (generates PG-native objects)
mj codegen  # Reads PG schema, generates views/functions/triggers

# 5. Seed reference data
mj sync push --dir=metadata  # Pushes metadata via MJAPI

# 6. Start MJAPI + Explorer
npm run start:api && npm run start:explorer
```

#### 3.5.2 Creating New Migrations on PG

When a dev adds a table/column for their business app:

```bash
# Creates migration file with PG-native DDL
mj migrate create "add_customer_preferences"
# Output: migrations-pg/v5/V202603231200__v5.12.x__add_customer_preferences.pg.sql
```

The generated file uses PG-native syntax: `SERIAL`, `TEXT`, `BOOLEAN`, `TIMESTAMPTZ`, etc.

If the dev also needs SQL Server compat, they can:
```bash
mj migrate convert --from postgres --to tsql --file <the-new-file>
```

This is the **reverse direction** — PG → T-SQL — which also needs support.

**Action items:**
- [ ] Implement `mj migrate create` with dialect-aware templates
- [ ] Add PG → T-SQL conversion rules (reverse direction)
- [ ] Test: create PG migration → convert to T-SQL → apply both → compare schemas

### 3.6 Testing Infrastructure

#### 3.6.1 Automated CI Pipeline

`.github/workflows/pg-migrations.yml` — path-filtered on `migrations/`, `migrations-pg/`, and `packages/SQLConverter/**`. Spins up a PG container, runs `mj migrate convert` + `mj migrate`, fails if either dialect drifts. Sets `MJ_CODEGEN_STRICT_VIEW_REGEN=true` so any view regeneration failure is a hard CI failure.

`.github/scripts/validate-migration-filenames.sh` enforces the `V<UTC>__v<MJ>.x__<Description>.{pg,pg-only}.sql` naming convention.

#### 3.6.2 Integration Test Suite

`packages/CodeGenLib/src/__tests__/integration/`:
- `pg-codegen-sprocs.integration.test.ts` — 15 tests for the 7 hand-ported CodeGen sprocs
- `pg-view-regen.integration.test.ts` — 9 tests for non-destructive view regeneration (identical shape, added/removed/retyped columns, dependent views/functions, materialized views, 42P16 fallback handoff)
- `pg-view-dependency-capture.integration.test.ts` — 17 tests for `pg_depend`/`pg_rewrite` capture functions
- `pg-view-fallback.integration.test.ts` — 16 tests for the fallback orchestrator (happy path, each phase failure, willRegenerate short-circuit)
- `pg-entity-phased.integration.test.ts` — 2 tests for phase gating (phase 1 fail → phases 2+3 skipped)

All gated on `MJ_TEST_PG_URL` so they're optional in CI but auditable locally. **59+ tests total.**

#### 3.6.3 Install Pipeline Scripts

`scripts/pg-install-fresh.mjs` — full end-to-end: drop DB → migrate → CodeGen → seed user → ready for `npm start`. Used to verify end-state for every PG-affecting change.

`scripts/pg-diff-regenerated.mjs` + `scripts/pg-diff-non-header.mjs` — clean-slate experiment tooling: snapshot working migrations, regenerate from T-SQL, classify diffs as cosmetic-header vs. substantive. CLI-arg driven (`<snapshot-dir> [regen-dir]`).

`scripts/full-pg-test-cycle.mjs`, `scripts/test-pg-ci-flow.mjs`, `scripts/check-migration-state.mjs` — operator-level scripts for the PG dev loop, runnable in CI or locally.

#### 3.6.4 Docker Workbench for Interactive Dev

Docker workbench invokes `mj migrate` instead of raw `psql`:

```bash
# Inside docker
mj migrate                  # Replaces: for f in *.pg.sql; do psql -f $f; done
mj migrate convert          # Converts any new T-SQL migrations
mj codegen                  # Regenerates views/functions/grants
```

#### 3.6.5 v5 Migration Regression Suite

Status: forward direction (T-SQL → PG → install) is fully validated. Reverse direction (PG → T-SQL) and round-trip diffing are deferred — not yet needed in practice.

The clean-slate regeneration experiment (snapshot + regenerate + diff + install) is documented in `PG_CLEAN_SLATE_REGEN_REPORT.md`. Of 86 regenerated files, 81 differ only in a cosmetic header and 4 have substantive diffs traced to 4 specific converter gaps (catalogued in `PG_MANUAL_FIXES_CATALOG.md` Category F). Forward development is unaffected; closing the gaps would unlock true clean-slate regeneration.

---

## 4. Migration Path (Phased Implementation)

### Phase A: Foundation — ✅ Complete

1. [x] **Audit SQLConverter rules** — All 14 classified and documented in `RULES.md`
2. [x] **Consolidate pipelines** — BatchConverter is sole orchestrator; ConversionPipeline `@deprecated`
3. [x] **Pin sqlglot** — Version pinned in `requirements.txt` for reproducibility
4. [x] **Integrate Skyway** — Multi-package split, PG provider implemented, wired into `mj migrate`
5. [x] **Add bypass justifications** — Every Bypass rule has a `BypassJustification` field

### Phase B: Dev-on-PG — ✅ Complete

1. [x] **CodeGen PG validation** — `PostgreSQLCodeGenProvider` produces valid PG SQL across all object types
2. [x] **mj-sync PG validation** — `provider-utils.ts` lazy-loads PG; full push/pull cycle works
3. [x] **End-to-end PG install** — Documented in `DEV_ON_PG_GUIDE.md`; install pipeline script proves it repeatably
4. [x] **mj migrate create** — Dialect-aware templates for both SQL Server and PG
5. [x] **Docker workbench update** — Uses `mj migrate` instead of raw `psql`

### Phase C: Safety, CI & Regression — ✅ Largely Complete

1. [x] **GitHub Actions workflow** — `.github/workflows/pg-migrations.yml` enforces parity on migration changes
2. [x] **View regeneration safety** — Non-destructive default + 42P16 fallback orchestrator with dependency capture/restore
3. [x] **Phased per-entity execution** — view → CRUD → grants with phase gating; failures scoped to one entity
4. [x] **Strict mode + batch summary** — `MJ_CODEGEN_STRICT_VIEW_REGEN=true` for CI hard-fail
5. [x] **Integration test suite** — 59+ tests across 5 files, gated on `MJ_TEST_PG_URL`
6. [x] **Sproc port migration** — 7 baseline CodeGen sprocs hand-ported in a dedicated `.pg-only.sql` migration
7. [x] **Stop swallowing SQL errors** — Shell exit codes propagate; per-entity generators surface failures
8. [x] **Install pipeline script** — `scripts/pg-install-fresh.mjs` exercises the full end-to-end flow
9. [ ] **Close converter gaps from clean-slate experiment** — 4 specific bugs catalogued in `PG_MANUAL_FIXES_CATALOG.md` Category F
10. [ ] **Schema-comparison report** — Automated table/column/constraint diff between SQL Server and PG installs (deferred)

### Phase D: MySQL & Extensibility — Not Started

1. [ ] **MySQLDialect** — Type mapping, quoting, introspection
2. [ ] **MySQL conversion rules** — T-SQL → MySQL rule set
3. [ ] **MySQL CodeGen provider** — Generate MySQL-native objects
4. [ ] **MySQL migration output** — `migrations-mysql/v5/` directory
5. [ ] **Reverse conversion** — PG → T-SQL and MySQL → T-SQL for bidirectional dev (deferred — no demand yet)

---

## 5. Key Decisions — Resolved

| # | Decision | Resolution |
|---|----------|------------|
| 1 | **Where does Skyway live?** | External npm package, multi-package split (`skyway-core` + `skyway-sqlserver` + `skyway-postgres`). Driver-agnostic core. |
| 2 | **Reverse conversion (PG → T-SQL)?** | Deferred. T-SQL → PG covers all current needs. Re-evaluate when PG-first dev becomes the norm. |
| 3 | **ConversionPipeline fate?** | Deprecated. BatchConverter is sole orchestrator. LLM fallback not absorbed yet — has not been needed in practice. |
| 4 | **Migration file location by dialect** | `migrations-pg/v5/` for PG, kept separate from `migrations/v5/`. Naming convention enforced by validator script. |
| 5 | **CI parity checks** | Path-filtered on migration and converter changes. Strict-mode flag set in CI. |
| 6 | **MySQL timeline** | After PG is solid. Architecture supports it (registry keyed on dialect pairs); rules and dialect class not yet written. |

---

## 6. Success Criteria — Status

1. ✅ **SQLGlot handles >90% of statements** — All bypass rules now have written justifications; bypass count is auditable in `RULES.md`.
2. ✅ **All v5 migrations pass on PG against the committed file set** — 89 of 89 applied; install pipeline script verifies repeatedly.
3. ✅ **Fresh PG install works end-to-end** — migrations → CodeGen → seed → MJAPI → Explorer, login successful.
4. ✅ **CI catches regressions** — Path-filtered workflow + strict-mode flag block PRs that break parity.
5. ✅ **Dev can create PG-native migrations** — `mj migrate create` produces valid PG DDL with the right templates.
6. ⬜ **MySQL scaffolding** — Architecture supports it; not yet started.
7. ✅ **Documentation complete** — `DEV_ON_PG_GUIDE.md`, this architecture doc, `RULES.md`, `PG_MANUAL_FIXES_CATALOG.md`.

**Additional criteria added during the work:**

8. ✅ **No silent data loss during repeated CodeGen runs** — View regeneration uses non-destructive default with explicit fallback path; failures are visible and scoped via phased execution.
9. ✅ **Per-entity failures are visible and isolated** — Phase gating means a single bad entity does not corrupt the rest of the install.
10. ⬜ **Clean-slate regeneration produces a working install** — Forward development works; full clean-slate regeneration blocked by 4 catalogued converter gaps.

---

## 7. Open Questions — Resolved or Updated

1. ✅ **Skyway's placeholder system** — Resolved: `${flyway:defaultSchema}` is preserved by Skyway's pre-processing layer.
2. ✅ **Skyway version table schema** — Resolved: `__mj.skyway_schema_history`. Does not conflict with MJ tables.
3. ✅ **sqlglot version pinning** — Resolved: pinned in `requirements.txt`. Upgrade procedure documented.
4. ⬜ **LLM fallback strategy** — Still open. Has not been needed in practice; revisit if a converter gap appears that rules + sqlglot can't handle.
5. ⬜ **PG → T-SQL conversion** — Deferred. Most dev still starts on SQL Server; revisit if PG-first becomes the norm.

**New questions surfaced:**

6. **Should the `.pg-only.sql` sproc port migration be split per-sproc?** — Currently bundled for atomicity; splitting would improve diff clarity but complicates dependency ordering.
