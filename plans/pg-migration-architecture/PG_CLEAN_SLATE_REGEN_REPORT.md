# Clean-Slate PG Migration Regeneration Report

**Question:** Is the PG migration pipeline truly future-proof? Could we delete the .pg.sql files and have the converter regenerate them correctly from T-SQL sources?

**Answer:** **No, not yet.** The converter has 4 specific bugs that block a clean regeneration from working end-to-end.

---

## Procedure

This report documents an experiment that can be re-run anytime via `scripts/pg-diff-regenerated.mjs` and `scripts/pg-diff-non-header.mjs`.

1. Snapshot the existing 90 `.pg.sql` files to a working directory (e.g. `/tmp/pg-snapshot/`).
2. Move the 86 auto-converted `.pg.sql` files out of `migrations-pg/v5/` (keep the 4 `.pg-only.sql` hand-written files in place).
3. Run `mj migrate convert` to regenerate from T-SQL sources.
4. Restore V202604090002 Geo_Functions (no T-SQL source — was hand-written).
5. Diff regenerated vs. snapshot: `node scripts/pg-diff-regenerated.mjs /tmp/pg-snapshot ./migrations-pg/v5` and `node scripts/pg-diff-non-header.mjs /tmp/pg-snapshot ./migrations-pg/v5`.
6. Run the install pipeline against the regenerated files: `node scripts/pg-install-fresh.mjs`.

Latest run: **81 of 85 cosmetic header-only diffs, 4 substantive diffs, install failed at baseline migration.**

---

## Findings

### Cosmetic Diff (Harmless)
Every regenerated file gains a 22-line header (extension setup, schema creation, `standard_conforming_strings`, pg_cast int→bool implicit cast). All idempotent. Affects 81 files. No action needed.

### Substantive Diff #1 — Baseline (`B202602151200`) — **BLOCKER**
**Status:** Install fails here.

**Error:** `type "__mj.vwEntityBehaviorTypes" does not exist`

**Cause:** The T-SQL baseline contains `CREATE PROCEDURE spCreateEntityBehaviorType` whose body references `vwEntityBehaviorTypes`, but neither the `EntityBehaviorType` table nor the view is created in the baseline. SQL Server tolerates this via deferred name resolution; PG does not — `RETURNS SETOF __mj.vwEntityBehaviorTypes` requires the view to exist at function-creation time.

**Snapshot solution:** The previous converter run skipped these sprocs with a `-- SKIPPED: References view "vwEntityBehaviorTypes" not created in this file (CodeGen will recreate)` comment.

**Current converter regression:** [packages/SQLConverter/src/rules/ProcedureToFunctionRule.ts:519-527](C:/Dev/MJ/MJ/packages/SQLConverter/src/rules/ProcedureToFunctionRule.ts) was deliberately changed to *always emit* the function (with rationale: "view typically lives in the baseline or an earlier migration"). This is correct for incremental migrations but wrong for the baseline itself.

**Fix proposal:** When converting baseline files (filename starts with `B`), skip sprocs whose `SETOF` view is not also CREATEd in the same file. Keep current always-emit behavior for incremental migrations.

### Substantive Diff #2 — Geo Features (`V202604090003`) — **BLOCKER**
The converter emits invalid PG syntax for `fn_MJ_GeoDistance` and `fn_MJ_GeoRecordsNear`:
- `DECLARE x FLOAT = ...` (T-SQL syntax — not valid in plpgsql)
- `ATN2` instead of `ATAN2`
- `RETURNS TABLE AS RETURN (...)` (not a valid PG ITVF pattern)
- Single `$` delimiter instead of `$$`

**Snapshot solution:** Hand-written PG versions in V202604090002 (runs first) + the auto-conversion is omitted from V202604090003 with an explanatory comment.

**Fix proposal:** Add a converter rule for T-SQL inline scalar/table-valued functions that emit valid plpgsql (specifically: variable initialization, ATN2→ATAN2, RETURNS TABLE without RETURN, dollar-quoting).

### Substantive Diff #3 — Add_AllowCaching (`V202604131300`) — **BLOCKER**
After `ALTER TABLE Entity ADD COLUMN DetectExternalChanges`, the converter emits a SELECT that queries `__mj.vwEntities` — but the view's `SELECT *` was snapshotted at view-creation time and doesn't include the new column. Same issue for `vwEntityFields`.

**Snapshot solution:** Manual edit that queries base tables (`__mj.Entity`, `__mj.EntityField`) directly instead of views.

**Fix proposal:** When converting an incremental migration that ALTERs a table to add columns, downstream queries in the same file that reference the table's view (`vw<EntityName>s`) should be rewritten to query the base table — OR the converter should emit `DROP VIEW` + `CREATE VIEW` for the affected views before the dependent SELECT runs. The latter is safer and matches what CodeGen does post-migration.

### Substantive Diff #4 — Add_Restore_Lineage (`V202604191500`) — **BLOCKER**
The converter places `ALTER TABLE ... ADD COLUMN RestoredFromID UUID NULL CONSTRAINT FK_... REFERENCES ...` in the FK/CHECK section, which runs *after* indexes and functions. But the indexes and functions emitted earlier in the same file reference the new column.

**Snapshot solution:** Split the column addition (top of file) from the FK constraint addition (end of file).

**Fix proposal:** When `ALTER TABLE ADD COLUMN` is also referenced by an index or function emitted in the same file, the column add must be emitted before its first reference. Two options: (a) hoist column adds to the top of the file unconditionally, or (b) split combined `ADD COLUMN ... CONSTRAINT FK ...` so the column lands at the top and the FK lands in the FK section.

---

## End-State

- Install ran through Skyway start, npm install, and local-package patching successfully
- Migration apply **fails** at the baseline file
- No subsequent migrations were attempted
- The 3 manual-fix files (V202604090003, V202604131300, V202604191500) would also have failed individually if the baseline had succeeded

## Recommendation

The committed .pg.sql files in `migrations-pg/v5/` represent the **truth of what works**. They contain manual fixes the converter cannot yet produce. Until the 4 converter bugs above are fixed, the pipeline is **not** safely re-runnable from a clean slate.

**Short-term workflow:** Continue editing the .pg.sql files manually when the converter produces wrong output. Document each manual fix in a comment block at the top of the patched section.

**Medium-term:** File issues (or PRs) for each of the 4 converter bugs above and add regression tests in `packages/SQLConverter/src/__tests__/` that fix the specific failure modes.

**Long-term:** Re-run this experiment after each converter fix. The criterion for "future-proof" is: delete all .pg.sql files, regenerate, run fresh install end-to-end with no failures.

## Re-running the experiment

```bash
# 1. Snapshot the current working files somewhere outside the repo.
mkdir -p /tmp/pg-snapshot
cp migrations-pg/v5/*.pg.sql /tmp/pg-snapshot/

# 2. Move the auto-converted files out (keep .pg-only.sql files in place).
mkdir -p /tmp/pg-removed
mv migrations-pg/v5/*.pg.sql /tmp/pg-removed/

# 3. Regenerate from T-SQL.
node packages/MJCLI/bin/run.js migrate convert

# 4. (If applicable) restore any hand-written files that have no T-SQL source.

# 5. Diff.
node scripts/pg-diff-regenerated.mjs /tmp/pg-snapshot ./migrations-pg/v5
node scripts/pg-diff-non-header.mjs /tmp/pg-snapshot ./migrations-pg/v5

# 6. Try a full install on the regenerated files.
node scripts/pg-install-fresh.mjs

# 7. Restore working files when done experimenting.
cp /tmp/pg-snapshot/*.pg.sql migrations-pg/v5/
```
