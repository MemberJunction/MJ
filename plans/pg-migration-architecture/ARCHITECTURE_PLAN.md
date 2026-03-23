# PostgreSQL Migration Architecture Plan

## Executive Summary

This plan redesigns MemberJunction's database migration tooling to be **multi-database native** with SQLGlot as the core transpiler, Skyway as the migration runner, and a comprehensive dev-on-PG workflow. The goal: a developer can install MJ on PostgreSQL (or MySQL, eventually) and use the full toolchain — migrations, CodeGen, mj-sync — without any SQL Server dependency.

---

## 1. Current State Assessment

### What Exists Today

| Component | Status | Notes |
|-----------|--------|-------|
| **SQLGlotTS** | Working | Python microservice wrapper; spawns a FastAPI server, communicates via HTTP |
| **SQLConverter** | Working | Rule-based pipeline: split → classify → pre-process → SQLGlot → post-process → group |
| **SQLDialect** | Working | Abstraction layer with `SQLServerDialect` and `PostgreSQLDialect` implementations |
| **CodeGenLib** | Working | Has `PostgreSQLCodeGenProvider` alongside `SQLServerCodeGenProvider` |
| **pg-migrate** | Working | 5-phase slash command: discover → convert → parity → smoke test → report |
| **Docker workbench** | Working | SQL Server + PostgreSQL + Claude Code container for automated testing |
| **Skyway** | External repo | TypeScript Flyway clone; PG support underway |
| **migrations-pg/** | ~Working | Converted PG migrations; some brittleness in conversion rules |

### Current Pain Points

1. **Rules replaced SQLGlot in too many places** — CC iterated on rules until they covered edge cases, but the result is fragile regex-based conversion for things SQLGlot should handle natively
2. **No dev-on-PG workflow** — You can replay migrations on PG, but can't *create* new migrations targeting PG, run CodeGen against PG, or use mj-sync with PG
3. **No MySQL path** — Architecture is SQL Server → PostgreSQL; adding MySQL means another full rule set
4. **Migration runner is `psql -f` in a loop** — No version tracking, no rollback, no state management
5. **ConversionPipeline vs BatchConverter** — Two overlapping conversion orchestrators exist; unclear which is primary
6. **No automated regression suite** — Docker testing is manual/slash-command driven, not CI

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

Every rule in `packages/SQLConverter/src/rules/` needs classification:

| Category | Action | Example |
|----------|--------|---------|
| **Pre-process** (keeps SQLGlot as core) | Keep, refine | Schema placeholder replacement, bracket removal |
| **Post-process** (fixes SQLGlot output) | Keep, refine | Boolean casting, serial type fixup |
| **Bypass** (replaces SQLGlot entirely) | Justify or remove | `sp_addextendedproperty` → `COMMENT ON` |
| **Redundant** (SQLGlot handles it fine now) | Remove | Check if newer sqlglot versions handle patterns that rules were written for |

**Action items:**
- [ ] Upgrade sqlglot Python package to latest version
- [ ] Run each bypass rule's test cases through raw SQLGlot to see which are now handled
- [ ] For remaining bypasses, file upstream sqlglot issues where appropriate
- [ ] Document each bypass rule with: pattern, why SQLGlot can't handle it, upstream issue link
- [ ] Add a `BypassJustification` field to `IConversionRule` interface

#### 3.1.2 Consolidate Pipelines

Two conversion orchestrators exist:
- `ConversionPipeline` — statement-level, uses `SqlGlotClient` directly
- `BatchConverter` — file-level, uses rules system

**Decision**: **BatchConverter is the primary pipeline.** It has the rule system, grouping, and context tracking. `ConversionPipeline` was an earlier prototype.

**Action items:**
- [ ] Deprecate `ConversionPipeline` (keep temporarily for backward compat)
- [ ] Move `ConversionPipeline`'s LLM fallback and database verification into `BatchConverter`
- [ ] Single entry point: `BatchConverter.convertFile()` for all conversion needs

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

#### 3.2.1 Skyway as `mj migrate` Backend

```
mj migrate run              # Apply pending migrations (uses Skyway)
mj migrate status           # Show applied/pending state
mj migrate create <name>    # Create new migration file with timestamp
mj migrate convert          # Convert T-SQL migrations to target dialect
mj migrate validate         # Dry-run: parse all migrations, check syntax
mj migrate rollback <ver>   # Rollback to version (if supported)
```

**Action items:**
- [ ] Add `@memberjunction/skyway` as a dependency to `@memberjunction/cli`
- [ ] Wire Skyway's `migrate()` method into `mj migrate run`
- [ ] Configure Skyway to read from `migrations/v5/` (SQL Server) or `migrations-pg/v5/` (PostgreSQL) based on detected database type
- [ ] Skyway version table: `__mj.skyway_schema_history` (or whatever Skyway uses)
- [ ] Pass `${flyway:defaultSchema}` placeholder resolution to Skyway's pre-processing

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

`PostgreSQLCodeGenProvider` already exists and generates:
- PG-native views (`CREATE OR REPLACE VIEW`)
- PG-native functions (replacing stored procedures)
- PG-native triggers
- Uses `PostgreSQLDialect` for quoting, type mapping

**Remaining gaps:**
- [ ] **Migration output**: CodeGen generates `CodeGen_Run_*.sql` files in T-SQL; needs PG variant
- [ ] **Schema introspection**: Does `PostgreSQLCodeGenProvider` read PG catalog correctly?
- [ ] **Entity field sync**: The metadata sync (EntityField inserts) uses T-SQL syntax
- [ ] **Full-text search**: PG uses `tsvector`/`tsquery`, not `CONTAINS()`
- [ ] **Permissions/Grants**: PG uses `GRANT ... ON FUNCTION`, not `GRANT EXEC ON`

**Action items:**
- [ ] Verify `PostgreSQLCodeGenProvider` generates valid PG SQL for all object types
- [ ] Add PG-native migration file output (`.pg.sql` suffix on CodeGen output)
- [ ] Test CodeGen → Skyway round-trip: generate PG migration, apply with Skyway
- [ ] Ensure schema introspection reads from PG `information_schema` / `pg_catalog`

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

Replace the manual `/pg-migrate` slash command with automated CI:

```yaml
# .github/workflows/pg-parity.yml
name: PG Parity Check
on:
  push:
    paths: ['migrations/v5/**', 'packages/SQLConverter/**']

jobs:
  parity:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
      sqlserver:
        image: mcr.microsoft.com/mssql/server:2022-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: mj migrate convert --from tsql --to postgres  # Convert any new
      - run: mj migrate run --db postgres                   # Apply all PG migrations
      - run: mj migrate run --db sqlserver                  # Apply all SQL Server migrations
      - run: mj migrate parity-check                        # Compare schemas
```

#### 3.6.2 Docker Workbench for Interactive Dev

Keep the Docker workbench for CC-driven iteration, but make it invoke `mj migrate` instead of raw `psql`:

```bash
# Inside docker
mj migrate run --db postgres      # Replaces: for f in *.pg.sql; do psql -f $f; done
mj migrate status --db postgres   # Shows applied/pending
mj migrate convert                # Converts any new T-SQL migrations
mj migrate parity-check           # Compares SQL Server vs PG schemas
```

#### 3.6.3 v5 Migration Regression Suite

Test **all** v5 migrations in both directions:

1. **Fresh SQL Server** — apply all `migrations/v5/*.sql` via Skyway
2. **Fresh PostgreSQL** — apply all `migrations-pg/v5/*.pg.sql` via Skyway
3. **Schema comparison** — tables, columns, constraints, indexes
4. **Data comparison** — seed data matches (via mj-sync push on both)
5. **API smoke tests** — MJAPI starts and serves GraphQL on both
6. **Round-trip test** — For each migration: convert T-SQL→PG, reconvert PG→T-SQL, diff

**Output**: Parity report (like Phase 3's current output but automated and in CI).

---

## 4. Migration Path (Phased Implementation)

### Phase A: Foundation

1. **Audit SQLConverter rules** — Classify every rule, test against latest sqlglot, remove redundant bypasses
2. **Consolidate pipelines** — BatchConverter as sole orchestrator, absorb ConversionPipeline features
3. **Upgrade sqlglot** — Latest version, test full v5 migration set
4. **Integrate Skyway** — Wire into `mj migrate run`, test with PG migrations
5. **Add bypass justifications** — Document every bypass rule

### Phase B: Dev-on-PG

1. **CodeGen PG validation** — Run CodeGen against PG, fix any generated SQL issues
2. **mj-sync PG validation** — Full push/pull cycle on PG
3. **End-to-end PG install** — Document and test the fresh-install flow
4. **mj migrate create** — Dialect-aware migration templates
5. **Docker workbench update** — Use `mj migrate` instead of raw `psql`

### Phase C: CI & Regression

1. **GitHub Actions workflow** — Automated parity checks on migration changes
2. **v5 migration regression** — Full comparison of all migrations
3. **Parity report automation** — Machine-readable comparison output
4. **Update `/pg-migrate` slash command** — Use new tooling internally

### Phase D: MySQL & Extensibility

1. **MySQLDialect** — Type mapping, quoting, introspection
2. **MySQL conversion rules** — T-SQL → MySQL rule set
3. **MySQL CodeGen provider** — Generate MySQL-native objects
4. **MySQL migration output** — `migrations-mysql/v5/` directory
5. **Reverse conversion** — PG → T-SQL and MySQL → T-SQL for bidirectional dev

---

## 5. Key Decisions Needed

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | **Where does Skyway live?** | (a) External npm package, (b) Monorepo package | (a) — it's a general-purpose tool, not MJ-specific |
| 2 | **Reverse conversion (PG → T-SQL)?** | (a) Build now, (b) Build later | (b) — Focus on T-SQL → PG first; most devs start with SQL Server |
| 3 | **ConversionPipeline fate?** | (a) Remove, (b) Deprecate, (c) Merge into BatchConverter | (c) — Absorb LLM fallback + DB verification, then remove |
| 4 | **Migration file location by dialect** | (a) `migrations-pg/`, (b) `migrations/v5/pg/`, (c) Same dir, different extension | (a) — Current approach works, keep it |
| 5 | **CI parity checks** | (a) Every PR, (b) Only migration PRs, (c) Nightly | (b) — Path-filtered triggers on migration/SQLConverter changes |
| 6 | **MySQL timeline** | (a) Parallel with PG work, (b) After PG is solid | (b) — Get PG right first, MySQL benefits from the patterns |

---

## 6. Success Criteria

1. **SQLGlot handles >90% of statements** — Bypass rules are <10% of total conversions
2. **All v5 migrations pass on PG** — Zero errors, zero TODOs
3. **Fresh PG install works end-to-end** — migrations → CodeGen → mj-sync → MJAPI → Explorer
4. **CI catches regressions** — Any breaking migration change fails the PR check
5. **Dev can create PG-native migrations** — `mj migrate create` produces valid PG DDL
6. **MySQL scaffolding exists** — Dialect, type map, and at least one conversion rule as proof of concept
7. **Documentation complete** — Dev-on-PG guide, architecture docs, rule justification docs

---

## 7. Open Questions

1. **Skyway's placeholder system** — Does Skyway support `${flyway:defaultSchema}` or does it use its own placeholder syntax? Need alignment.
2. **Skyway version table schema** — What does Skyway's history table look like? Does it conflict with anything in `__mj`?
3. **sqlglot version pinning** — Should we pin to a specific sqlglot version to prevent upstream changes from breaking our conversions?
4. **LLM fallback strategy** — Keep for edge cases? The current `ConversionPipeline` has it, `BatchConverter` does not. Should `BatchConverter` get LLM fallback for the last-resort cases SQLGlot + rules can't handle?
5. **PG → T-SQL conversion** — Is this actually needed? Or do we say "if you develop on PG, your business-app migrations are PG-only"?
