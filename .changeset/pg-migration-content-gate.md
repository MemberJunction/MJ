---
"@memberjunction/sql-converter": patch
---

Add a content gate for converted PostgreSQL migrations. `mj migrate convert` can emit an
empty `.pg.sql` while printing `unhandled stmts: 0` and exiting `0`, and nothing caught it —
**an empty migration applies perfectly cleanly, so the fresh-database apply that the release
process treats as authoritative is structurally incapable of failing on it.** The parity check
only asserts the counterpart file exists.

This already shipped once. `V202607071019__v5.45.x__Metadata_Sync.pg.sql` is 126 bytes against
a 12,041-line T-SQL source, so PostgreSQL deployments migrating through v5.45 silently received
none of that release's curated metadata (#3253). The same behavior recurred three times during
the v5.49.0 build — header-only stubs, and one file with six bare `;` where six `CREATE INDEX`
statements belonged. It was found by hand-diffing line counts against sources.

`scripts/check-pg-migration-content.mjs` now runs in `pg-migrations.yml` before the apply step,
so a failure points at conversion rather than at SQL. Two design points:

- **It counts statements, not lines.** The bare-`;` output was 23 lines carrying zero statements;
  a line-count heuristic scores that 23 and passes it. Header boilerplate is excluded, since every
  converted file has it regardless of whether content survived.
- **The rule is "empty AND undeclared".** Some counterparts are correctly empty — the SQL Server
  migration may alter a routine PostgreSQL maintains in TypeScript (`metadataSupportObjects.ts`).
  A blunt "empty fails" rule would produce false positives and get disabled, so an intentional
  no-op declares itself with `-- PG-EMPTY-BY-DESIGN: <reason>`. The judgement stays with the
  author; the check only enforces that it was recorded.

Five pre-existing empty counterparts are grandfathered with written reasons, because committed
`.pg.sql` files are Flyway-checksummed and immutable — editing one breaks `mj migrate` on any
deployment that already applied it. It is a ratchet rather than an amnesty: the v5.45 entry
records that it is **not** correct. Investigating another entry narrowed the problem — `v5.38
Fix_AllowUpdateAPI_On_Virtual_Transition`, previously suspected as a second escape, is correctly
empty, so confirmed shipped escapes drop from two to one.

The detector self-tests against the real failure shapes, and that step is wired into CI too: a
neutered comparison and a broken declaration-token regex were both verified to fail it. Without
it a broken detector would pass everything silently.

This compensates for the converter defect rather than fixing it (#3252, #3254) — `mj migrate
convert` still writes empty files while reporting success. The `/pg-migrate-experimental` runbook
and `DEPLOYMENT.md` Step 8 gain the same content check plus a recipe for recovering counterparts
that feature PRs authored and later deleted by policy.
