# v5.30 PG migration notes

Quick reference for what landed in this release for PG and what's deferred.

## What's new

- **Skyway 0.6.0** published with multi-dialect support (`@memberjunction/skyway-core`, `skyway-sqlserver`, `skyway-postgres`). MJ runtime resolves them from npm; no local-link required.
- **Runtime PG safety** — `PostgreSQLDataProvider.ExecuteSQL` now auto-quotes mixed-case identifiers in raw SQL (PascalCase columns, `vw*` views) so hand-written queries from MJ resolvers/engines/dashboards work without per-call quoting. See `autoQuoteIdentifiers` in [PostgreSQLDataProvider.ts](../packages/PostgreSQLDataProvider/src/PostgreSQLDataProvider.ts).
- **SQL converter fix** — `quoteAsAliases` is now case-insensitive on the `AS` keyword, so SS sources using lowercase `as Foo` translate correctly (caught the `vwEntityPermissions.RoleName` bug).
- **5 new v5.30 PG ports**:
  - `V202604222142__v5.30.x__Runtime_Actions_Schema.pg.sql` — auto-converted
  - `V202604241345__v5.30.x__Archive_Codegen.pg.sql` — auto-converted
  - `V202604260056__v5.30.x__Memory_Consolidation_Schema.pg.sql` — auto-converted + 2 hand-fixes (sys.check_constraints translation)
  - `V202604241700__v5.30.x__Unified_Permissions_Phase_2.pg.sql` — auto-converted + hand-rewritten §4 (MERGE → INSERT ON CONFLICT)
  - `V202604261352__v5.30.x__Scoped_EntityField_SPs.pg.sql` — full hand-port (CodeGen-bootstrap SPs with temp tables → arrays)

  All 5 verified equivalent to their SQL Server sources by applying both files to fresh DBs at v5.30 pre-test baseline and diffing schema deltas (tables, columns, constraints, indexes, routines, views) — see `scripts/snapshot-{ss,pg}.sh` + `scripts/README-migration-equivalence.md`.
- **PG-only fix migration** — `V202604282300__v5.30.x__Fix_vwEntityPermissions_RoleName_Alias.pg-only.sql` recreates the v5.0 baseline view that had an unquoted `as RoleName` alias case-folding to `rolename` on PG.
- **PG-only fix migration** — `V202604301930__v5.30.x__Add_vwEntitiesWithMissingBaseTables.pg-only.sql` adds the `vwEntitiesWithMissingBaseTables` view that the v5.0 baseline's wrapped `DO` block silently failed to create. CodeGen depends on it during the metadata-management phase; without it `mj codegen` against PG fails with `relation __mj.vwEntitiesWithMissingBaseTables does not exist`. Same query as the SS source — a `LEFT JOIN information_schema.tables` to find Entity rows whose backing table no longer exists.

## Managed PostgreSQL (RDS/Aurora/Cloud SQL/Azure)

As of v5.30, MJ migrations install on managed PG without superuser. The
`pg_cast` UPDATE that used to require catalog-modify privileges has been
stripped from all 50 affected files. Bulk metadata INSERTs now use
`TRUE/FALSE` for BOOLEAN columns directly. See the commit message of
`v5.30: managed-PG support — strip pg_cast UPDATE …` for the full breakdown.

Verification: applied 107/107 migrations cleanly to a fresh PG database
with zero `pg_cast` manipulation. Schema parity with the prior pg_cast-
dependent state confirmed.

**Existing PG dev environments**: pulling this change invalidates Flyway
checksums — run `flyway repair` once. The actual schema effects are
identical so no schema drift; just history-row hash updates.

## ⚠️ Required post-install step for fresh PG installs

The migration set (v5.0 baseline `B202602151200__v5.0__Baseline.pg.sql` plus 106 V*.pg.sql / *.pg-only.sql files through v5.30) brings a fresh PG database to the v5.30 schema and metadata-syncs through v5.29. **It does not include v5.30 metadata-only updates** — those were deferred (see "What's deferred" below). After a fresh install, you must run:

```bash
mj sync push --dir metadata
```

This applies the v5.30 metadata changes from canonical source files in `metadata/` (new AI prompts, agent definitions, entity descriptions, etc.). Without this step, your install will have v5.30 schema but stale metadata.

## ⚠️ Known v5.30 limits on PG

Verified by end-to-end testing on 2026-05-01 against a fresh PG install:

**Works on a fresh v5.30 PG install:**
- ✅ All 107 migration files apply cleanly (`ON_ERROR_STOP=1`, zero failures)
- ✅ MJAPI boots, loads 312 entities, exposes 1,376 GraphQL query fields and 1,016 mutations
- ✅ Read queries on any entity work via Explorer / GraphQL
- ✅ CRUD mutations on **v5.0–v5.29 entities** work end-to-end (their `fn_create_*` / `fn_update_*` / `fn_delete_*` sprocs ship in the migration set)

**Deferred to v5.30.1:**
- ❌ **`mj codegen` against PG** is blocked on multiple boolean/integer type mismatches in code shipped by PR #2208 (the PG codegen support work). Specifically:
  - CodeGenLib's `PostgreSQLCodeGenProvider.ts` has CASE expressions that return `1`/`0` (SS-style) for output columns whose downstream consumers expect BOOLEAN
  - The view `vwSQLColumnsAndEntityFields` returns `INTEGER` for `AutoIncrement` and `IsVirtual` while `spUpdateExistingEntityFieldsFromSchema` compares them with `TRUE` (boolean)
  - These are systemic — one fix surfaces the next layer
- ❌ **CRUD mutations on v5.30-introduced entities** (`MJ: System Events`, anything in `Runtime_Actions_Schema` / `Memory_Consolidation_Schema`) fail at runtime because their CRUD sprocs were never generated (CodeGen failed before reaching them). These entities are read-only on PG until v5.30.1.

The `mj codegen` blockers are not in this migrations PR's scope — they live in `packages/CodeGenLib` and in the view/sproc bodies introduced by PR #2208. A follow-up PR will fix them and ship the v5.30 CRUD sprocs as a regenerated `CodeGen_Run_*.pg.sql` migration.

## What's deferred to v5.30.1

### v5.30 coverage
- **`V202604271430__v5.30.x__Metadata_Sync.sql`** — 964k-line auto-generated metadata dump. Hits a converter string-literal escape bug at the `${formatted}` JS template literal pattern in stored Query SQL. The right fix is to regenerate via `mj sync push` from a known-correct state rather than repair generated content. **Workaround for fresh installs: `mj sync push --dir metadata` after applying migrations.** This is captured above in the "Required post-install step" section.
- **`V202604292210__v5.31.x__Create_UDT_Schema.sql`** — v5.31-tagged UDT schema migration that landed in the SS migration set ahead of the v5.31 release. PG port deferred to land alongside v5.31. Exempted in the SQLConverter parity test via `PENDING_V5_30_PORTS`.
- **`mj codegen` against PG + v5.30 entity CRUD** — see "Known v5.30 limits on PG" section above. Blocked on bugs in code shipped by PR #2208; tracked separately for v5.30.1.

### Converter rule gaps surfaced this round (Category A in the manual fixes catalog)
- A5: `sys.check_constraints` + `sys.columns` dynamic-name lookup → `pg_constraint` joins
- A6: `MERGE INTO ... USING (VALUES) AS src` → `INSERT ... ON CONFLICT DO UPDATE`
- A7: `DECLARE @x type = value` (initialize-at-declare) parser
- A8: Quote `CONSTRAINT` names so they don't case-fold on PG

### Other follow-ups
- Performance smoke test on a realistic dataset (1M+ rows in busy entities)
- Actual managed-PG (RDS) install dry-run
- Connection pooling and operational hardening guide
- Parity test (`should have a PG counterpart for every T-SQL V-migration`) in `pg-migration-regression.test.ts` is **enabled** as of this PR. It enforces 1:1 SS↔PG file parity with two documented exemptions in `PENDING_V5_30_PORTS` (the v5.30 Metadata_Sync and the v5.31 UDT schema files). Future SS migrations without a PG counterpart will fail this gate unless explicitly added to the exemption set.

## How to verify a new migration port locally

```bash
# 1. Convert via the deterministic toolchain
npx mj migrate convert --file V202604XXXXXX__v5.30.x__Foo.sql --output-dir /tmp/out

# 2. Inspect for `-- TODO:` markers and obvious T-SQL leftovers
grep "TODO:" /tmp/out/*.pg.sql           # must be empty
grep -E "GETUTCDATE\(\)|sys\." /tmp/out/*.pg.sql

# 3. Set up scratch DBs at the same baseline
#    See scripts/README-migration-equivalence.md for the workflow

# 4. Apply on each platform, diff deltas
bash scripts/snapshot-ss.sh mj_test_ss /tmp/before-ss
bash scripts/snapshot-pg.sh mj_test_pg /tmp/before-pg
# (apply migration on each side)
bash scripts/snapshot-ss.sh mj_test_ss /tmp/after-ss
bash scripts/snapshot-pg.sh mj_test_pg /tmp/after-pg
for type in tables cols cons routines views idx; do
  comm -13 <(sort /tmp/before-ss.$type.txt) <(sort /tmp/after-ss.$type.txt) > /tmp/ss-delta.$type.txt
  comm -13 <(sort /tmp/before-pg.$type.txt) <(sort /tmp/after-pg.$type.txt) > /tmp/pg-delta.$type.txt
done
diff /tmp/ss-delta.tables.txt /tmp/pg-delta.tables.txt   # repeat per category
```

Type aliases to expect across platforms (these are normal, not real differences):
- `nvarchar`/`varchar` ↔ `character varying`/`text`
- `uniqueidentifier` ↔ `uuid`
- `bit` ↔ `boolean`
- `datetimeoffset` ↔ `timestamp with time zone`
- `int` ↔ `integer`
- `decimal` ↔ `numeric`
- PG additionally surfaces implicit `NOT NULL` CHECK constraints that SS doesn't list separately (e.g. `MyTable_MyCol_not_null`)
