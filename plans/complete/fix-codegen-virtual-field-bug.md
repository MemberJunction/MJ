# Fix CodeGen Virtual Fields Bug

## Problem Statement

Three related bugs in MemberJunction CodeGen:

### Bug 1: Virtual Fields Dropped on First Run
After `mj migrate` + first `mj codegen` on a fresh database, virtual fields (IsVirtual=1) are incorrectly identified as "gone" and removed from generated TypeScript. A second `mj codegen` run restores them.

### Bug 2: Display Name Flip-Flop
Display names at the Entity Field level get tweaked back and forth between CodeGen runs.

### Bug 3: Field Categories Regenerated
Even for entities with existing saved Field Categories, they get regenerated. Legacy back-compat field category icon system should potentially be removed.

---

## Root Cause Analysis

### Pipeline Order of Operations

The CodeGen pipeline in `runCodeGen.ts` runs these steps:

1. **`manageMetadata()`** (`manage-metadata.ts`)
   - Calls `recompileAllBaseViews()` — only runs `sp_refreshview` on existing views, does NOT regenerate view SQL
   - Calls `manageEntityFields()` → `deleteUnneededEntityFields()` → `spDeleteUnneededEntityFields`
   - The stored proc compares EntityField metadata against `vwSQLColumnsAndEntityFields` (actual SQL view columns)
   - **If a view hasn't been regenerated yet to include virtual columns, those fields get deleted**

2. **`provider.Refresh()`** — reloads metadata (now missing virtual fields)

3. **`manageSQLScriptsAndExecution()`** (`sql_codegen.ts`)
   - Generates SQL including view definitions (now including virtual columns)
   - Executes the SQL files via `sqlcmd`
   - **If SQL execution fails, the function returns `false` at line 215 and the second `manageEntityFields` call at line 225 NEVER runs**
   - Calls `manageEntityFields()` a **SECOND** time — this restores virtual fields
   - TypeScript generation uses metadata from AFTER step 3 (line 253 in sql_codegen.ts calls `md.Refresh()`)

4. **TypeScript code generation** — uses whatever metadata state exists after step 3

### Key Stored Procedure: `spDeleteUnneededEntityFields`

```sql
-- Gets EntityFields that are NOT in actual SQL view/table columns
SELECT ef.* INTO #ef FROM vwEntityFields ef
INNER JOIN vwEntities e ON ef.EntityID = e.ID
WHERE e.VirtualEntity = 0 AND excludedSchemas.value IS NULL
-- LEFT JOIN against actual columns — if no match, field gets deleted
LEFT JOIN #actual actual ON ef.EntityID=actual.EntityID AND ef.Name = actual.EntityFieldName
WHERE actual.column_id IS NULL
```

### Critical Failure Path: SQL Execution Failure

In `sql_codegen.ts` lines 212-215:
```typescript
if (!executionSuccess) {
    failSpinner('Failed to execute entity SQL files');
    TempBatchFile.cleanup();
    return false;  // <-- EARLY RETURN: second manageEntityFields NEVER runs
}
```

When `sqlcmd` fails (e.g., SSL certificate errors), the method returns early. The second `manageEntityFields` pass (line 225) which would restore virtual fields is NEVER executed. But `runCodeGen.ts` continues and generates TypeScript with stale metadata.

### Bug 2: Display Name SQL Logic Error

The `updateEntityFieldDisplayNameWhereNull` function at `manage-metadata.ts:983` had a contradictory SQL WHERE clause:
```sql
WHERE ef.DisplayName IS NULL AND ef.DisplayName <> ef.Name
```
- `ef.DisplayName IS NULL` can never coexist with `ef.DisplayName <> ef.Name` — in SQL, NULL compared with `<>` always yields UNKNOWN (not TRUE)
- This means the query **never returns any rows**, so display names are never populated by this function
- The LLM-based form layout generation (advanced_generation.ts) then sets display names via a different path, potentially with different values than the deterministic camelCase-to-spaces conversion
- On subsequent runs, the function still returns no rows (due to the bug), but the LLM may produce different display names, causing flip-flop

### Bug 3: Field Category Unnecessary Regeneration

The `applyAdvancedGeneration` function at `manage-metadata.ts:2402` triggered LLM-based form layout generation whenever ANY field had `AutoUpdateCategory=true`:
```typescript
if (fields.some((f: any) => f.AutoUpdateCategory))
```
- This condition is true even when all auto-updatable fields already have categories assigned
- The LLM was called unnecessarily for every entity on every codegen run
- While the SQL guard `AND AutoUpdateCategory = 1` prevented updates to locked fields, the LLM could still reassign unlocked fields to different categories each run
- This wasted LLM API calls and could cause unlocked field categories to flip-flop

---

## Investigation Results

### Iteration 1: Clean Database Test (with SSL fix)

**Database**: MJ_4_ITERATION_1 (fresh)
**Baseline**: 272 entities, 3686 entity fields, 600 virtual fields

**Fix Applied First**: Added `-C` flag to `sqlcmd` in `sql.ts:424` when `trustServerCertificate` is configured. This was needed because the globally-installed `mj` CLI at `/usr/local/lib/node_modules/@memberjunction/cli/` uses its own bundled `codegen-lib`, not the local workspace version.

**Run 1 Result**:
- SQL execution completed successfully (8.31s)
- No SSL errors
- EntityFields: 3686 → 3712 (26 new fields added)
- Virtual fields: 600 → 626 (26 new virtual fields added)
- `entity_subclasses.ts`: **26 virtual fields ADDED** (PromptRun, TestRun, DuplicateRun, Employee, EntityAction, ActionFilter, CompanyIntegrationRun, etc.)
- **No display name flip-flop detected**
- **No fields removed**

**Run 2 Result**:
- Zero diff from Run 1 output
- Database counts unchanged (3712 EntityFields, 626 virtual)
- **Completely idempotent**

### Key Finding

The checked-in `entity_subclasses.ts` on the `next` branch was **already missing 26 virtual fields**. Our clean codegen run on a fresh database **restored them correctly**. This means:

1. The codegen logic is **correct** when SQL execution succeeds
2. Someone previously ran codegen in a situation where SQL execution failed (likely SSL or similar), committed the incomplete output
3. The virtual field "bug" was actually caused by sqlcmd not having the `-C` flag for SSL certificate trust

---

## All Fixes Applied

### Fix 1: SSL Certificate Trust for sqlcmd (DONE)
**File**: `packages/CodeGenLib/src/Database/sql.ts` (line 423-426)
```typescript
// Add -C flag to trust server certificate when configured
if (sqlConfig.options?.trustServerCertificate) {
    args.push('-C');
}
```
This ensures sqlcmd uses the same certificate trust setting as the mssql Node.js connection.

### Fix 2: Defensive continuation in sql_codegen.ts (DONE)
**File**: `packages/CodeGenLib/src/Database/sql_codegen.ts` (lines 212-260)

Instead of returning early when SQL execution fails, the code now continues to run manageEntityFields, applyPermissions, and post-generation scripts. An `overallSuccess` flag tracks whether any step failed and is returned at the end. This prevents virtual fields from being incorrectly dropped when sqlcmd fails but the mssql connection still works.

### Fix 3: Updated entity_subclasses.ts (DONE)
The clean codegen run on a fresh database produced the correct file with all 626 virtual fields present.

### Fix 4: Display name WHERE NULL query (DONE)
**File**: `packages/CodeGenLib/src/Database/manage-metadata.ts` (line 994)

Removed the contradictory `ef.DisplayName <> ef.Name` condition from the WHERE clause. The function now correctly finds fields with NULL display names. The JavaScript code at line 1004 already handles the "display name same as field name" case by comparing the generated display name against the original field name before updating.

**Before:**
```sql
WHERE ef.DisplayName IS NULL AND ef.DisplayName <> ef.Name AND ef.Name <> 'ID'
```

**After:**
```sql
WHERE ef.DisplayName IS NULL AND ef.Name <> 'ID'
```

### Fix 5: Skip unnecessary LLM form layout generation (DONE)
**File**: `packages/CodeGenLib/src/Database/manage-metadata.ts` (line 2402)

Changed the guard condition to only trigger LLM-based form layout generation when there are auto-updatable fields that still need categories. This prevents unnecessary LLM API calls and eliminates category flip-flop for entities where all categories are already set.

**Before:**
```typescript
if (fields.some((f: any) => f.AutoUpdateCategory))
```

**After:**
```typescript
const needsCategoryGeneration = fields.some((f: any) => f.AutoUpdateCategory && (!f.Category || f.Category.trim() === ''));
if (needsCategoryGeneration)
```

---

## Summary of Changes by File

| File | Fix | Description |
|------|-----|-------------|
| `packages/CodeGenLib/src/Database/sql.ts` | Fix 1 | Added `-C` flag to sqlcmd for SSL certificate trust |
| `packages/CodeGenLib/src/Database/sql_codegen.ts` | Fix 2 | Don't return early on SQL execution failure |
| `packages/MJCoreEntities/src/generated/entity_subclasses.ts` | Fix 3 | 26 virtual fields restored by clean codegen |
| `packages/CodeGenLib/src/Database/manage-metadata.ts` | Fix 4 | Removed contradictory WHERE clause for display names |
| `packages/CodeGenLib/src/Database/manage-metadata.ts` | Fix 5 | Skip LLM when all auto-updatable fields have categories |

## Legacy Field Category Icons

The system maintains both `FieldCategoryInfo` (modern) and `FieldCategoryIcons` (legacy) formats for backwards compatibility. Both are read and written in parallel. Removal of the legacy format was mentioned in the original bug report but is not addressed here as it would require coordination with any consumers still using the legacy format.
