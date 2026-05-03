---
"@memberjunction/postgresql-dataprovider": minor
"@memberjunction/sql-converter": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/cli": patch
---

Bring MJ to a state where it runs end-to-end on PostgreSQL — including managed PG services (RDS, Aurora, Cloud SQL, Azure) — on a developer machine and in self-hosted environments.

**Runtime (`@memberjunction/postgresql-dataprovider`):** new `autoQuoteIdentifiers` tokenizer in `ExecuteSQL` auto-quotes mixed-case identifiers in raw SQL (PascalCase columns, `vw*` views) so hand-written queries from MJ resolvers, engines, and dashboards work on PG without per-call quoting. Conservative — only quotes PascalCase or lowercase-first identifiers preceded by `.` (object refs). 30 new tokenizer tests covering keywords, dollar-quoted blocks, positional `$N` params, string literals, `[bracketed]` SQL Server identifiers, and the regression cases from Memory Manager and ConversationEngine flows.

**Converter (`@memberjunction/sql-converter`):** `quoteAsAliases` regex made case-insensitive on the `AS` keyword (caught the `vwEntityPermissions.RoleName` alias case-fold bug). `SequenceDeduplicator` now auto-detects and fixes EntityField sequence collisions as a post-conversion step. Heavy regression tests gated behind `process.env.CI === 'true'` (with `CI_HEAVY_REGRESSION=true` opt-out for nightly) — pg-migrations.yml workflow already does the equivalent gate at the workflow level.

**CodeGen (`@memberjunction/codegen-lib`):** CodeGen audit SQL output now routes to `migrations-pg/v5/` when `dbPlatform=postgresql` (was always going to `migrations/v5/`).

**CLI (`@memberjunction/cli`):** consumes published Skyway 0.6.0 multi-dialect packages (`skyway-core`, `skyway-sqlserver`, `skyway-postgres`).

**Managed-PG support:** historical PG migrations rewritten to drop the `pg_cast` UPDATE that required superuser, with INSERT VALUES tuples / WHERE-comparisons / CHECK constraints rewritten to use BOOLEAN literals (`TRUE`/`FALSE`) directly. 50 files touched in the companion `pg-migration-files` PR; 10,967 INSERT tuples + 3,510 comparisons + 9 CHECK constraints fixed.

The actual PG migration content — v5.0 baseline + every V*.pg.sql for v5.0–v5.30 — ships in the companion `pg-migration-files` PR. The two PRs merge together.

See `migrations-pg/TESTING_GUIDE.md` for the verification strategy used during this PR's development (per-migration audit, schema dump diff, snapshot scripts, autoQuoter coverage).
