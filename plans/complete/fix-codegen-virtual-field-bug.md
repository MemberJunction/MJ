## Problem Statement

Running `mj codegen` multiple times against the same database produced different
output each time. Virtual fields were dropped, display names flip-flopped between
values, the LLM was called unnecessarily on every run to regenerate form layouts,
and field categories were rewritten non-deterministically. This made it impossible
to trust codegen output or achieve a stable baseline.

## Root Cause Analysis

Four interconnected bugs were identified through systematic investigation against
clean 4.0 databases (MJ_4_0_TEST_1 through MJ_4_0_TEST_4):

### Bug 1: Virtual fields dropped due to sqlcmd SSL failure (sql.ts)

When connecting to SQL Server with `trustServerCertificate: true`, the `sqlcmd`
utility requires the `-C` flag to trust the server certificate. Without this flag,
sqlcmd silently fails when executing view-regeneration scripts. The base views are
never updated, so virtual fields (IsVirtual=1 EntityField records that come from
VIEW JOINs, not physical table columns) appear absent from `vwSQLColumnsAndEntityFields`.

The downstream effect: `spDeleteUnneededEntityFields` compares EntityField metadata
against `vwSQLColumnsAndEntityFields` (which uses `COALESCE(e.view_object_id,
e.object_id)` to read from base views). When views are stale, virtual columns
don't appear, and the SP deletes their EntityField records.

**Fix**: Added `-C` flag to sqlcmd args when `trustServerCertificate` is enabled
(sql.ts lines 423-426).

### Bug 2: Display name flip-flop due to contradictory WHERE clause (manage-metadata.ts)

The `updateEntityFieldDisplayNameWhereNull` function had a WHERE clause:
`ef.DisplayName IS NULL AND ef.DisplayName <> ef.Name`. This is logically
impossible — a NULL value can never be `<> something`. The function never
executed, so display names set by the LLM on one run would be overwritten
by a different LLM response on the next run.

**Fix**: Removed the contradictory `ef.DisplayName <> ef.Name` condition,
leaving just `ef.DisplayName IS NULL` (manage-metadata.ts line 2001). Now
the deterministic function correctly sets display names for NULL fields on
the first run, and subsequent runs skip them since they're no longer NULL.

### Bug 3: LLM form layout generation triggered unnecessarily (manage-metadata.ts)

The `applyAdvancedGeneration` function's guard condition was:
`fields.some((f) => f.AutoUpdateCategory)` — this checked whether ANY field
on the entity allows category auto-update, but NOT whether it actually NEEDS
a category. Since most fields have `AutoUpdateCategory=1` by default, the LLM
was called for virtually every entity on every codegen run.

The LLM produces non-deterministic output: different category names, different
display names (via `AutoUpdateDisplayName`), different section icons. This caused
~315 category UPDATEs and ~30 display name changes on every run, plus cascading
form component regeneration (HTML templates, section groupings, icons).

**Fix**: Changed the guard to:
`fields.some((f) => f.AutoUpdateCategory && (!f.Category || f.Category.trim() === ''))`
Now the LLM is only called when there are fields that both allow auto-update AND
have empty/null categories. Once categories are set (either by migration or by a
single codegen run), subsequent runs skip the LLM entirely.

### Bug 4: Pipeline timing — field deletion before view regeneration (manage-metadata.ts)

The codegen pipeline calls `manageEntityFields` twice:
  - **First pass** (in `manageMetadata()`): before SQL scripts execute
  - **Second pass** (in `manageSQLScriptsAndExecution()`): after views are regenerated

Both passes called `spDeleteUnneededEntityFields`, which compares EntityField
metadata against live view columns. On the first pass, base views haven't been
regenerated yet (that happens during SQL execution between the passes). Virtual
fields from VIEW JOINs appear absent, so the SP deletes their EntityField records
— including their Category, DisplayName, FieldCategoryInfo, and other metadata.

The second pass re-inserts these fields (views are now current), but the metadata
is lost. On the NEXT codegen run, those fields have NULL categories, triggering
the LLM (Bug 3), which produces different values, creating the appearance of
flip-flopping.

**Fix**: Added `skipDeleteUnneededFields` parameter to `manageEntityFields`
(default: false). The first pass call now passes `true`, deferring deletion to
the second pass when views are current and virtual fields are correctly visible.

## Verification

Tested against 4 clean 4.0 database restores (MJ_4_0_TEST_1 through _4):
  1. Clean 4.0 DB → apply 4.2 migration → run codegen → produces expected
     first-run output (field property updates, CascadeDelete methods)
  2. Run codegen again on same DB → **zero output**, no CodeGen_Run SQL
     file generated, no file modifications whatsoever
  3. Restored clean DB, repeated steps 1-2 → identical results

Full idempotency confirmed: N consecutive codegen runs produce identical output.

## Migration Note

Renamed migration from v4.1.x to v4.2.x since 4.1 has already shipped.
The migration contains the one-time metadata fix (field property updates for
IsNameField, DefaultInView, IncludeInUserSearchAPI) that brings a clean 4.0
database in sync with the corrected codegen output.
