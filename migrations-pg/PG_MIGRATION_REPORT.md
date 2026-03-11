# PostgreSQL Migration Parity Report
Generated: 2026-03-11
Branch: an-dev-10
Host: Docker workbench (claude-dev)

## Summary
- Total SQL Server migrations: 30
- Previously converted: 21
- Newly converted this run: 11
- Conversion failures (manual review): 0
- Full migration test: 32/32 PASS (all migrations run on fresh PG database with zero errors)
- SQLConverter tests: 708/708 passing

## Migration Conversion Results

| # | Migration File | Status | Attempts | Notes |
|---|---------------|--------|----------|-------|
| 1 | V202603021058__v5.5.x__Metadata_Sync | PASS | 1 | 12 bracket refs in string literals (data, not SQL) |
| 2 | V202603021401__v5.6.x__Grant_UI_Role_Agent_Permissions | PASS | 3 | Required 4 toolchain fixes |
| 3 | V202603031102__v5.6.x__Metadata_Sync | PASS | 1 | Clean conversion |
| 4 | V202603042042__v5.8.x__Integration_System | PASS | 2 | Required PostProcessor fix |
| 5 | V202603051443__v5.8.x__Add_CredentialTypeID_To_Integration | PASS | 2 | Re-converted with PostProcessor fix |
| 6 | V202603051650__v5.8.x__Metadata_Sync | PASS | 1 | Clean conversion |
| 7 | V202603080719__v5.9.x__Integration_SchedulingFields_And_Object_Metadata | PASS | 2 | Re-converted with PostProcessor fix |
| 8 | V202603081507__v5.9.x__Metadata_Sync | PASS | 1 | Clean conversion |
| 9 | V202603091000__v5.10.x__Fix_vwEntityFieldsWithCheckConstraints_duplicate_join | PASS | 1 | Clean conversion |
| 10 | V202603091152__v5.10.x__Add_ExternalReferenceID_To_AIAgentRun | PASS | 2 | Re-converted with PostProcessor fix |
| 11 | V202603101334__v5.10.x__Metadata_Sync | PASS | 1 | Clean conversion |

## Toolchain Fixes Applied

### 1. StatementClassifier: Session settings no longer skip entire batches
**Files**: `packages/SQLConverter/src/rules/StatementClassifier.ts`

Previously, `SET NOCOUNT ON` at the start of a batch caused the entire batch (including real DML statements) to be classified as `SKIP_SESSION` and dropped. Now strips session settings and re-classifies the remainder. Also handles leading comments before session settings (prevents recursion).

### 2. New DECLARE_DML_BLOCK type + DeclareDmlBlockRule
**Files**: `packages/SQLConverter/src/rules/types.ts`, `packages/SQLConverter/src/rules/DeclareDmlBlockRule.ts`, `packages/SQLConverter/src/rules/TSQLToPostgresRules.ts`, `packages/SQLConverter/src/rules/BatchConverter.ts`, `packages/SQLConverter/src/rules/index.ts`

DECLARE blocks with UPDATE/INSERT/DELETE (but no EXEC) were being skipped. New rule converts them to PL/pgSQL `DO $$` blocks with proper syntax: `DECLARE @var` -> `DECLARE v_var`, `SELECT @var =` -> `SELECT INTO`, `IF BEGIN/END` -> `IF THEN/END IF`, `RAISERROR` -> `RAISE EXCEPTION`. Registered at priority 53 (between ExecBlockRule 52 and ConditionalDDLRule 55).

### 3. PostProcessor: Strip sys.indexes pre-flight wrappers
**File**: `packages/SQLConverter/src/rules/PostProcessor.ts`

T-SQL `IF NOT EXISTS (SELECT FROM sys.indexes WHERE OBJECT_ID(...))` wrappers around `CREATE INDEX` statements were passing through unconverted. These reference `sys.indexes` and `OBJECT_ID()` which don't exist in PostgreSQL. Now stripped by PostProcessor; the existing `CREATE INDEX IF NOT EXISTS` provides equivalent idempotency.

### Test Updates
**File**: `packages/SQLConverter/src/__tests__/TSQLToPostgresRules.test.ts`

Updated rule count assertion from 13 to 14 and added priority 53 to expected priority list.

## Manual Review Needed
None - all 11 migrations converted and validated successfully.

## PG-Only Migrations (Preserved)
These migrations exist in `migrations-pg/v5/` with no SQL Server source - they are intentional PG-specific patches:

| File | Purpose |
|------|---------|
| V202602171600__v5.0.x__Add_PlatformVariants_Columns | PG-specific platform variant columns |
| V202603011600__v5.5.x__Create_Missing_Views | PG-specific missing views creation |
