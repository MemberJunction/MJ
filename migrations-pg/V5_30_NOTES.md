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

The v5.30 baseline (`B202604301800__v5.30__PG_Baseline.pg.sql`) contains every schema change from v5.0–v5.30 (tables, columns, views, functions, indexes, constraints) and metadata syncs through v5.29. **It does not contain v5.30 metadata-only updates** — those were deferred (see below). After a fresh install, you must run:

```bash
mj sync push --dir metadata
```

This applies the v5.30 metadata changes from canonical source files in `metadata/` (new AI prompts, agent definitions, entity descriptions, etc.). Without this step, your install will have v5.30 schema but stale metadata.

## What's deferred to v5.30.1

### v5.30 coverage
- **`V202604271430__v5.30.x__Metadata_Sync.sql`** — 964k-line auto-generated metadata dump. Hits a converter string-literal escape bug at the `${formatted}` JS template literal pattern in stored Query SQL. The right fix is to regenerate via `mj sync push` from a known-correct state rather than repair generated content. **Workaround for fresh installs: `mj sync push --dir metadata` after applying baseline.** This is captured above in the "Required post-install step" section.

### Converter rule gaps surfaced this round (Category A in the manual fixes catalog)
- A5: `sys.check_constraints` + `sys.columns` dynamic-name lookup → `pg_constraint` joins
- A6: `MERGE INTO ... USING (VALUES) AS src` → `INSERT ... ON CONFLICT DO UPDATE`
- A7: `DECLARE @x type = value` (initialize-at-declare) parser
- A8: Quote `CONSTRAINT` names so they don't case-fold on PG

### Other follow-ups
- Performance smoke test on a realistic dataset (1M+ rows in busy entities)
- Actual managed-PG (RDS) install dry-run
- Connection pooling and operational hardening guide
- Parity test (`should have a PG counterpart for every T-SQL V-migration`) is currently `it.skip(...)` in `pg-migration-regression.test.ts`. It is meaningful only on the historical-migrations path (`pg-migration-files` worktree branch). On the baseline path (this PR) there are no committed V*.pg.sql to map to T-SQL sources, so the test would always show 100% missing — re-enable only if the historical path is selected for merge.

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
