# @memberjunction/sql-converter

## 5.32.0

### Patch Changes

- @memberjunction/sql-dialect@5.32.0
- @memberjunction/sqlglot-ts@5.32.0

## 5.31.0

### Minor Changes

- 3c5176f: Bring MJ to a state where it runs end-to-end on PostgreSQL — including managed PG services (RDS, Aurora, Cloud SQL, Azure) — on a developer machine and in self-hosted environments.

  **Runtime (`@memberjunction/postgresql-dataprovider`):** new `autoQuoteIdentifiers` tokenizer in `ExecuteSQL` auto-quotes mixed-case identifiers in raw SQL (PascalCase columns, `vw*` views) so hand-written queries from MJ resolvers, engines, and dashboards work on PG without per-call quoting. Conservative — only quotes PascalCase or lowercase-first identifiers preceded by `.` (object refs). 30 new tokenizer tests covering keywords, dollar-quoted blocks, positional `$N` params, string literals, `[bracketed]` SQL Server identifiers, and the regression cases from Memory Manager and ConversationEngine flows.

  **Converter (`@memberjunction/sql-converter`):** `quoteAsAliases` regex made case-insensitive on the `AS` keyword (caught the `vwEntityPermissions.RoleName` alias case-fold bug). `SequenceDeduplicator` now auto-detects and fixes EntityField sequence collisions as a post-conversion step. Heavy regression tests gated behind `process.env.CI === 'true'` (with `CI_HEAVY_REGRESSION=true` opt-out for nightly) — pg-migrations.yml workflow already does the equivalent gate at the workflow level.

  **CodeGen (`@memberjunction/codegen-lib`):** CodeGen audit SQL output now routes to `migrations-pg/v5/` when `dbPlatform=postgresql` (was always going to `migrations/v5/`).

  **CLI (`@memberjunction/cli`):** consumes published Skyway 0.6.0 multi-dialect packages (`skyway-core`, `skyway-sqlserver`, `skyway-postgres`).

  **Managed-PG support:** historical PG migrations rewritten to drop the `pg_cast` UPDATE that required superuser, with INSERT VALUES tuples / WHERE-comparisons / CHECK constraints rewritten to use BOOLEAN literals (`TRUE`/`FALSE`) directly. 50 files touched in the companion `pg-migration-files` PR; 10,967 INSERT tuples + 3,510 comparisons + 9 CHECK constraints fixed.

  The actual PG migration content — v5.0 baseline + every V\*.pg.sql for v5.0–v5.30 — ships in the companion `pg-migration-files` PR. The two PRs merge together.

  See `migrations-pg/TESTING_GUIDE.md` for the verification strategy used during this PR's development (per-migration audit, schema dump diff, snapshot scripts, autoQuoter coverage).

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [7ed7a4b]
- Updated dependencies [9457655]
  - @memberjunction/sql-dialect@5.31.0
  - @memberjunction/sqlglot-ts@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/sql-dialect@5.30.1
- @memberjunction/sqlglot-ts@5.30.1

## 5.30.0

### Patch Changes

- @memberjunction/sql-dialect@5.30.0
- @memberjunction/sqlglot-ts@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
  - @memberjunction/sql-dialect@5.29.0
  - @memberjunction/sqlglot-ts@5.29.0

## 5.28.0

### Patch Changes

- @memberjunction/sql-dialect@5.28.0
- @memberjunction/sqlglot-ts@5.28.0

## 5.27.1

### Patch Changes

- @memberjunction/sql-dialect@5.27.1
- @memberjunction/sqlglot-ts@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/sql-dialect@5.27.0
- @memberjunction/sqlglot-ts@5.27.0

## 5.26.0

### Patch Changes

- @memberjunction/sql-dialect@5.26.0
- @memberjunction/sqlglot-ts@5.26.0

## 5.25.0

### Patch Changes

- @memberjunction/sql-dialect@5.25.0
- @memberjunction/sqlglot-ts@5.25.0

## 5.24.0

### Patch Changes

- @memberjunction/sql-dialect@5.24.0
- @memberjunction/sqlglot-ts@5.24.0

## 5.23.0

### Patch Changes

- @memberjunction/sql-dialect@5.23.0
- @memberjunction/sqlglot-ts@5.23.0

## 5.22.0

### Patch Changes

- @memberjunction/sql-dialect@5.22.0
- @memberjunction/sqlglot-ts@5.22.0

## 5.21.0

### Patch Changes

- @memberjunction/sql-dialect@5.21.0
- @memberjunction/sqlglot-ts@5.21.0

## 5.20.0

### Patch Changes

- @memberjunction/sql-dialect@5.20.0
- @memberjunction/sqlglot-ts@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/sql-dialect@5.19.0
- @memberjunction/sqlglot-ts@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/sql-dialect@5.18.0
- @memberjunction/sqlglot-ts@5.18.0

## 5.17.0

### Patch Changes

- @memberjunction/sql-dialect@5.17.0
- @memberjunction/sqlglot-ts@5.17.0

## 5.16.0

### Patch Changes

- @memberjunction/sql-dialect@5.16.0
- @memberjunction/sqlglot-ts@5.16.0

## 5.15.0

### Patch Changes

- @memberjunction/sql-dialect@5.15.0
- @memberjunction/sqlglot-ts@5.15.0

## 5.14.0

### Patch Changes

- @memberjunction/sql-dialect@5.14.0
- @memberjunction/sqlglot-ts@5.14.0

## 5.13.0

### Patch Changes

- @memberjunction/sql-dialect@5.13.0
- @memberjunction/sqlglot-ts@5.13.0

## 5.12.0

### Patch Changes

- @memberjunction/sql-dialect@5.12.0
- @memberjunction/sqlglot-ts@5.12.0

## 5.11.0

### Minor Changes

- a4c3c81: migration/metadata

### Patch Changes

- @memberjunction/sql-dialect@5.11.0
- @memberjunction/sqlglot-ts@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/sql-dialect@5.10.1
- @memberjunction/sqlglot-ts@5.10.1

## 5.10.0

### Patch Changes

- @memberjunction/sql-dialect@5.10.0
- @memberjunction/sqlglot-ts@5.10.0

## 5.9.0

### Patch Changes

- @memberjunction/sql-dialect@5.9.0
- @memberjunction/sqlglot-ts@5.9.0

## 5.8.0

### Patch Changes

- @memberjunction/sql-dialect@5.8.0
- @memberjunction/sqlglot-ts@5.8.0

## 5.7.0

### Patch Changes

- @memberjunction/sql-dialect@5.7.0
- @memberjunction/sqlglot-ts@5.7.0

## 5.6.0

### Patch Changes

- @memberjunction/sql-dialect@5.6.0
- @memberjunction/sqlglot-ts@5.6.0

## 5.5.0

### Minor Changes

- ee9f788: migrations - postgres sql support!

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/sql-dialect@5.5.0
  - @memberjunction/sqlglot-ts@5.5.0
