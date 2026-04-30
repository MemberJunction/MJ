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

## What's deferred to v5.30.1

### Critical for managed PG (RDS/Aurora/Cloud SQL/Azure)
- **`pg_cast` manipulation in v5.1–v5.11 baseline files** — the `UPDATE pg_cast SET castcontext = 'i'` header in those migrations requires real superuser, which managed PG services don't grant. **Hard blocker for any RDS install today.** See `plans/pg-migration-architecture/DEV_ON_PG_GUIDE.md` "Managed PostgreSQL — current limitations".

### v5.30 coverage
- **`V202604271430__v5.30.x__Metadata_Sync.sql`** — 964k-line auto-generated metadata dump. Hits a converter string-literal escape bug at the `${formatted}` JS template literal pattern in stored Query SQL. Right fix is to regenerate via `mj-sync push` from a known-correct state rather than repair generated content.

### Converter rule gaps surfaced this round (Category A in the manual fixes catalog)
- A5: `sys.check_constraints` + `sys.columns` dynamic-name lookup → `pg_constraint` joins
- A6: `MERGE INTO ... USING (VALUES) AS src` → `INSERT ... ON CONFLICT DO UPDATE`
- A7: `DECLARE @x type = value` (initialize-at-declare) parser
- A8: Quote `CONSTRAINT` names so they don't case-fold on PG

### Other follow-ups
- Performance smoke test on a realistic dataset (1M+ rows in busy entities)
- Actual managed-PG (RDS) install dry-run
- Connection pooling and operational hardening guide
- Re-enable the parity test (`should have a PG counterpart for every T-SQL V-migration`) after both PRs merge

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
