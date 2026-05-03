# @memberjunction/postgresql-dataprovider

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
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/generic-database-provider@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/query-processor@5.31.0
  - @memberjunction/sql-dialect@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/generic-database-provider@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/query-processor@5.30.1
- @memberjunction/sql-dialect@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/core@5.30.0
  - @memberjunction/generic-database-provider@5.30.0
  - @memberjunction/query-processor@5.30.0
  - @memberjunction/global@5.30.0
  - @memberjunction/sql-dialect@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
  - @memberjunction/core@5.29.0
  - @memberjunction/sql-dialect@5.29.0
  - @memberjunction/generic-database-provider@5.29.0
  - @memberjunction/query-processor@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/generic-database-provider@5.28.0
  - @memberjunction/query-processor@5.28.0
  - @memberjunction/global@5.28.0
  - @memberjunction/sql-dialect@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/generic-database-provider@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/query-processor@5.27.1
  - @memberjunction/sql-dialect@5.27.1

## 5.27.0

### Patch Changes

- Updated dependencies [4357090]
  - @memberjunction/generic-database-provider@5.27.0
  - @memberjunction/core@5.27.0
  - @memberjunction/global@5.27.0
  - @memberjunction/query-processor@5.27.0
  - @memberjunction/sql-dialect@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [a1002f4]
  - @memberjunction/core@5.26.0
  - @memberjunction/generic-database-provider@5.26.0
  - @memberjunction/query-processor@5.26.0
  - @memberjunction/global@5.26.0
  - @memberjunction/sql-dialect@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
  - @memberjunction/core@5.25.0
  - @memberjunction/generic-database-provider@5.25.0
  - @memberjunction/query-processor@5.25.0
  - @memberjunction/global@5.25.0
  - @memberjunction/sql-dialect@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/generic-database-provider@5.24.0
  - @memberjunction/query-processor@5.24.0
  - @memberjunction/global@5.24.0
  - @memberjunction/sql-dialect@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/generic-database-provider@5.23.0
  - @memberjunction/query-processor@5.23.0
  - @memberjunction/sql-dialect@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/generic-database-provider@5.22.0
  - @memberjunction/query-processor@5.22.0
  - @memberjunction/sql-dialect@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
- Updated dependencies [72fc93b]
  - @memberjunction/core@5.21.0
  - @memberjunction/query-processor@5.21.0
  - @memberjunction/generic-database-provider@5.21.0
  - @memberjunction/global@5.21.0
  - @memberjunction/sql-dialect@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [cc954e1]
- Updated dependencies [2298f8a]
  - @memberjunction/generic-database-provider@5.20.0
  - @memberjunction/core@5.20.0
  - @memberjunction/query-processor@5.20.0
  - @memberjunction/global@5.20.0
  - @memberjunction/sql-dialect@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/generic-database-provider@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/global@5.19.0
- @memberjunction/query-processor@5.19.0
- @memberjunction/sql-dialect@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/generic-database-provider@5.18.0
- @memberjunction/core@5.18.0
- @memberjunction/global@5.18.0
- @memberjunction/query-processor@5.18.0
- @memberjunction/sql-dialect@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [4b6fd2a]
- Updated dependencies [9881045]
  - @memberjunction/generic-database-provider@5.17.0
  - @memberjunction/core@5.17.0
  - @memberjunction/query-processor@5.17.0
  - @memberjunction/global@5.17.0
  - @memberjunction/sql-dialect@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/generic-database-provider@5.16.0
  - @memberjunction/query-processor@5.16.0
  - @memberjunction/global@5.16.0
  - @memberjunction/sql-dialect@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [5e85b29]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/generic-database-provider@5.15.0
  - @memberjunction/query-processor@5.15.0
  - @memberjunction/global@5.15.0
  - @memberjunction/sql-dialect@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/generic-database-provider@5.14.0
  - @memberjunction/query-processor@5.14.0
  - @memberjunction/global@5.14.0
  - @memberjunction/sql-dialect@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/generic-database-provider@5.13.0
  - @memberjunction/query-processor@5.13.0
  - @memberjunction/sql-dialect@5.13.0

## 5.12.0

### Minor Changes

- 8ca8698: pg migrations

### Patch Changes

- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
  - @memberjunction/core@5.12.0
  - @memberjunction/generic-database-provider@5.12.0
  - @memberjunction/query-processor@5.12.0
  - @memberjunction/global@5.12.0
  - @memberjunction/sql-dialect@5.12.0

## 5.11.0

### Minor Changes

- a4c3c81: migration/metadata

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/generic-database-provider@5.11.0
  - @memberjunction/core@5.11.0
  - @memberjunction/query-processor@5.11.0
  - @memberjunction/global@5.11.0
  - @memberjunction/sql-dialect@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/generic-database-provider@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/global@5.10.1
- @memberjunction/query-processor@5.10.1
- @memberjunction/sql-dialect@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/generic-database-provider@5.10.0
  - @memberjunction/query-processor@5.10.0
  - @memberjunction/global@5.10.0
  - @memberjunction/sql-dialect@5.10.0

## 5.9.0

### Patch Changes

- 194ddf2: Add Redis-backed ILocalStorageProvider with cross-server cache invalidation via pub/sub
- Updated dependencies [194ddf2]
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/generic-database-provider@5.9.0
  - @memberjunction/query-processor@5.9.0
  - @memberjunction/sql-dialect@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [064cf3a]
- Updated dependencies [0753249]
  - @memberjunction/generic-database-provider@5.8.0
  - @memberjunction/core@5.8.0
  - @memberjunction/query-processor@5.8.0
  - @memberjunction/global@5.8.0
  - @memberjunction/sql-dialect@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/generic-database-provider@5.7.0
  - @memberjunction/query-processor@5.7.0
  - @memberjunction/global@5.7.0
  - @memberjunction/sql-dialect@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/generic-database-provider@5.6.0
  - @memberjunction/query-processor@5.6.0
  - @memberjunction/global@5.6.0
  - @memberjunction/sql-dialect@5.6.0

## 5.5.0

### Minor Changes

- ee9f788: migrations - postgres sql support!

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/sql-dialect@5.5.0
  - @memberjunction/generic-database-provider@5.5.0
  - @memberjunction/query-processor@5.5.0
