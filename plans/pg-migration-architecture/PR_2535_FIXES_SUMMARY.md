# PR 2535 — PG Toolchain Fixes Summary

A concise per-fix reference for reviewers. Each entry lists the failure mode, the change, and the commit that landed it. The companion `.changeset/sturdy-pgcodegen-bridge.md` has the user-facing release-note framing; this file is for reviewers walking the diff.

For longer context, see `plans/pg-migration-architecture/PG_TOOLCHAIN_FIXES_v5.30.1.md` (original planning doc).

---

## SQLConverter rule additions

These prevent PG output bugs at conversion time. Every future `mj sql-convert` run (and `/pg-migrate` Phase 2 by extension) inherits these fixes.

### Fix 1 — `IF NOT EXISTS (sys.schemas) … CREATE SCHEMA` translation
**Commit:** `5b5c544a3c`
**File:** `packages/SQLConverter/src/rules/ConditionalDDLRule.ts`
SS-specific pattern survived into PG output as untranslated `EXEC('CREATE SCHEMA [X]')` (broken). New handler emits PG-native `CREATE SCHEMA IF NOT EXISTS "X"`.

### Fix 2 — `IF NOT EXISTS (sys.extended_properties)` schema-level → `COMMENT ON SCHEMA`
**Commit:** `5b5c544a3c`
**File:** `packages/SQLConverter/src/rules/ConditionalDDLRule.ts`
Schema-level extended-property pattern (no `level1` clause) is distinct from the table/column-level one already handled by `ExtendedPropertyRule`. New handler emits `COMMENT ON SCHEMA "X" IS '…'`.

### Fix 3 — Strip `UPDATE pg_cast` from migration header (managed-PG support)
**Commit:** `e3b80fe90f`
**File:** `packages/SQLConverter/src/rules/DialectHeaderBuilder.ts`
Earlier converter versions modified `pg_cast` to make INTEGER→BOOLEAN implicit. That requires `pg_catalog` write privileges, rejected by managed PG (RDS, Aurora, Cloud SQL, Azure). Bulk INSERTs use native `TRUE`/`FALSE` since v5.30, so the modification is unnecessary; removed entirely.

### Fix 17 — Strip quotes around bracket-wrapped T-SQL types in `convertCastTypes`
**Commit:** `3bb43ea7d4`
**File:** `packages/SQLConverter/src/rules/ExpressionHelpers.ts`
When source SS has `CAST(x AS [INT])`, upstream `convertIdentifiers` turns `[INT]` into `"INT"`. PG parses `"INT"` as a quoted identifier (column reference), not a type, and rejects with `type "INT" does not exist`. Pre-pass strips quotes from known T-SQL type tokens so existing rules apply.

### Fix 18 — DROP-overload guard before every `CREATE OR REPLACE FUNCTION`
**Commit:** `84125db469`
**Files:** `packages/SQLConverter/src/rules/ExpressionHelpers.ts` (helper), `ProcedureToFunctionRule.ts`, `FunctionRule.ts`
PG dispatches functions by `(name, ordered-arg-type-list)`. `CREATE OR REPLACE FUNCTION` only replaces when the new signature exactly matches the prior; adding/renaming/retyping any parameter creates a new overload alongside the old one. New `emitDropOverloadsBlock` helper prepends a `DO`-block iterating `pg_proc` and DROPping every overload of the function name. Used by ProcedureToFunctionRule (CREATE PROCEDURE → FUNCTION) and FunctionRule (inline-TVF and scalar paths). Trigger functions and handwritten built-ins deliberately not touched (signatures stable, view dependents).

### Fix 19 — Named-arg PERFORM for cross-sproc EXEC translation
**Commit:** `84125db469`
**File:** `packages/SQLConverter/src/rules/ProcedureToFunctionRule.ts`
T-SQL `EXEC ... @P = value` (named args) was being translated to PG positional `PERFORM proc(value, value, …)`. Positional binds by slot, so when the called sproc's signature changed (e.g. a `_Clear` companion inserted between existing slots), positional args bound to wrong types and PG raised runtime type errors on cascade-delete chains. Now emits PG named-arg syntax `p_X => value` which survives parameter insertion.

---

## CodeGen output fixes

These affect what `mj codegen` produces for PG.

### Fix 4 — `PostgreSQLCodeGenProvider` CASE expressions return BOOLEAN not INTEGER
**Commit:** `e3b80fe90f`
**File:** `packages/CodeGenLib/src/Database/providers/postgresql/PostgreSQLCodeGenProvider.ts`
Three `CASE … THEN 1 ELSE 0` patterns returned INTEGER for output columns whose downstream consumers compared against BOOLEAN. PG strict typing rejected with `operator does not exist: integer = boolean`. Rewritten to `THEN TRUE ELSE FALSE`.

### Fix 9 — Dialect-aware boolean parameter type for `_Clear` companions
**Commit:** `f132d36481`
**Files:** `packages/SQLDialect/src/sqlDialect.ts` (abstract), `postgresqlDialect.ts`, `sqlServerDialect.ts`, `packages/CodeGenLib/src/Database/codeGenDatabaseProvider.ts`, `PostgreSQLCodeGenProvider.ts`
Codegen emitted `_Clear` params as hardcoded `bit DEFAULT 0` with `= 1` comparison. PG has a `bit` type but it's a 1-character bit-string, not boolean — comparison failed at runtime. New abstract `Dialect.BooleanParameterType()` returns `'bit'` on SS, `'boolean'` on PG; `Dialect.BooleanLiteral(true)` reused for comparison. SS output byte-identical, PG output now correct.

### Fix 13 — Terminate generated PG SQL statements with `;`
**Commit:** `a71ea82cc6`
**Files:** `packages/CodeGenLib/src/Misc/sql_logging.ts`, `Database/providers/postgresql/PostgreSQLCodeGenProvider.ts`, `Database/manage-metadata.ts`
`mj codegen` against PG completed but the resulting log-replay file failed with `syntax error at or near INSERT` because consecutive statements lacked trailing `;`. SS hides this with `GO` batch separators; PG strict parser does not. Per-template fixes plus a systematic catch-all in `appendToSQLLogFile` (append `;` if not already terminated). SS output unaffected.

### Fix 16 — Wrap PG `CREATE OR REPLACE VIEW` in DO/EXCEPTION fallback (42P16)
**Commit:** `a8bb216194`
**File:** `packages/CodeGenLib/src/Database/providers/postgresql/PostgreSQLCodeGenProvider.ts`
PG `CREATE OR REPLACE VIEW` rejects with `42P16 invalid_table_definition` when the column list changes (rename or removed column, even with same type). Generated views now wrap the `CREATE OR REPLACE` in a `DO $vw_regen$ … EXCEPTION WHEN invalid_table_definition THEN DROP VIEW … CASCADE; EXECUTE vsql; END $$` so column changes succeed by falling through to drop + recreate.

---

## Framework runtime fixes

Fixes outside the converter for code paths that broke at runtime on PG.

### Fix 6 — MJServer: replace BIT-style boolean filters with JS-side filtering
**Commit:** `78c71363dd`
**Files:** `packages/MJServer/src/auth/newUsers.ts`, `MJServer/src/resolvers/IntegrationDiscoveryResolver.ts`
Two framework call sites passed `IsActive = 1` / `DefaultForNewUser = 1` as `RunView.ExtraFilter` strings. SS accepts integer-vs-bit; PG rejects with `operator does not exist: boolean = integer`. Crashed every first-time PG sign-in. Rewritten to filter UUIDs/strings server-side via SQL and booleans client-side in JS — dialect-agnostic.

### Fix 7 — MJCoreEntitiesServer: same JS-side filter rewrite
**Commit:** `78c71363dd`
**File:** `packages/MJCoreEntitiesServer/src/custom/MJApplicationEntityServer.server.ts`
Same `IsActive = 1` pattern when fanning out UserApplication records on app save. Same JS-side rewrite for parity.

### Fix 8 — PostgreSQLDataProvider `ValidateDeleteResult` override
**Commit:** `ce70e70416`
**File:** `packages/PostgreSQLDataProvider/src/PostgreSQLDataProvider.ts`
The Phase-2 Save/Delete refactor (Feb 2026) added `ValidateDeleteResult` for SQL Server but missed PG. PG `spDelete<Entity>` sprocs return their result column as `_result_id` (baseline migration convention to avoid PL/pgSQL ambiguity), but the framework's default validation only knew the new PK-named shape. Every Delete reported "record not found" despite the row actually being deleted. Override accepts either shape and supports composite PKs.

### Fix 11 — MJCLI: `DB_TYPE` env fallback for `dbPlatform`
**Commit:** `f8d3cbd5e2`
**File:** `packages/MJCLI/src/config.ts`
MJAPI honors `DB_TYPE=postgresql` from `.env` to pick its data provider; MJCLI required explicit `dbPlatform: 'postgresql'` in `mj.config.cjs`. Developers with PG `.env` running `mj migrate` silently got SqlServerProvider talking SS protocol to PG → `Connection lost - read ECONNRESET` with no useful diagnostic. MJCLI now reads `DB_TYPE` (and aliases `postgres`/`mssql`) as fallback; auto-defaults `dbPort` to 5432 vs 1433 based on inferred platform.

### Fix 12 — MJCLI: `BaselineVersion: '1'` default
**Commit:** `f8d3cbd5e2`
**File:** `packages/MJCLI/src/config.ts`
Skyway treats `BaselineVersion: '1'` as a sentinel meaning "auto-select the highest-versioned `B__` baseline file." When unset, Skyway found no baseline and silently skipped it on fresh installs — next migration failed with `relation does not exist`. MJCLI now defaults to `'1'` when not configured.

---

## Migration fixes (`migrations-pg/v5/`)

### Fix 5 — `vwSQLColumnsAndEntityFields` BOOLEAN columns
**Commit:** `e3b80fe90f`
**File:** `migrations-pg/v5/V202605012100__v5.31.x__Fix_vwSQLColumnsAndEntityFields_Boolean_Columns.pg-only.sql`
View's `AutoIncrement` and `IsVirtual` columns were CASE-expressions returning INTEGER; consuming sprocs declared them BOOLEAN in their `RETURNS TABLE`. Same `integer = boolean` mismatch as Fix 4 but in a hand-authored view. PG-only migration rewrites the CASE expressions as boolean predicates.

### Fix 14 — `vwFlywayVersionHistoryParsed` view + `ExtractVersionComponents` function
**Commit:** `f68d98dd6c`
**File:** `migrations-pg/v5/V202605031200__v5.32.x__Add_vwFlywayVersionHistoryParsed_For_PG_Parity.pg-only.sql`
SS baseline defined a view `vwFlywayVersionHistoryParsed` parsing migration descriptions via `CROSS APPLY ExtractVersionComponents(f.description)`. The converter intentionally skipped this (CROSS APPLY not translatable). A "Server Installed Version History" Query in baseline metadata references the view — manually invoking it from MJ Explorer crashed with `relation does not exist`. PG-only migration adds a PL/pgSQL `ExtractVersionComponents` mirroring the SS implementation char-for-char and creates the view via `CROSS JOIN LATERAL`.

### v5.32 ComponentLibrary PG counterpart
**Commit:** `29ef2cac8c`
**File:** `migrations-pg/v5/V202605021919__v5.32.x__Add_ComponentLibrary_UsageInstructions.pg.sql`
Upstream landed `V202605021919__...UsageInstructions.sql` (SS, adds `UsageInstructions` column) on `next` without a PG counterpart. Generated via `mj sql-convert` to keep parity. The file shipped in this PR was generated *before* Fix 18+19 landed — it doesn't yet have DROP-overload guards or named-arg PERFORM. The cleanup migration handles the duplicate-overload state created during apply.

### One-time cleanup: drop duplicate sproc overloads
**Commit:** `7c67d72f9d`
**File:** `migrations-pg/v5/V202605041500__v5.32.x__Cleanup_Duplicate_Function_Overloads.pg-only.sql`
A fresh PG install applying all v5 migrations in order accumulates duplicate sproc overloads at every signature change in intermediate migrations (because their committed bodies don't have DROP guards). This migration runs at the end of the v5 chain, finds any `sp%` function names with >1 overload in `__mj`, drops all overloads of those names. `mj codegen` (already part of standard upgrade flow) regenerates the cleaned-up sprocs with single, correct overloads. Idempotent — re-applies are no-ops once state is clean. Verified against an actually-dirty DB (4 overloads dropped across 2 sproc names; 862 singletons untouched).

### File renames for version-vs-timestamp ordering
**Commit:** `2eaa440ae0`
**Files:** Renamed `V202605012100__v5.30.x__Fix_vwSQLColumns…` → `v5.31.x` and `V202605031200__v5.31.x__Add_vwFlyway…` → `v5.32.x`
The CI filename validator enforces v5.X timestamps must be after all v5.(X−1). Two of our PG-only files had labels that violated this (timestamps placed them in a later version range than their label suggested). Renamed; one cross-reference in `MIGRATION_DECISION_TREE.md` updated to match.

---

## Test improvements

### SS convention enforcement + MJ_OVERRIDES-aware schema diff + decision tree
**Commit:** `62a575c34f`
**Files:** `packages/SQLConverter/src/__tests__/MJConventionEnforcement.test.ts`, `scripts/compare-pg-ss-snapshots.mjs`, `migrations-pg/MIGRATION_DECISION_TREE.md`, `migrations-pg/PG_TESTING_AUDIT.md`
Process improvements after a near-miss "Bug #15" where we mistook intentional MJ override (TIMESTAMPTZ for `[datetime]`, documented in `TypeResolver.ts:17`) for drift and almost shipped a wrong-direction fix. Three additions:
- New unit test scans v5 SS migrations for bare `[datetime]`/`[datetime2]`/`[smalldatetime]` columns (violates MJ convention; allowlist for one historical baseline column that can't be retroactively changed)
- `compare-pg-ss-snapshots.mjs` now reads `MJ_OVERRIDES` from the canonical source and applies it during normalization, so intentional drift no longer shows as parity violations
- 5-question decision tree codifying when a `.pg-only.sql` migration is justified

### Test fixups for codegen behavior changes
**Commit:** `48cae2a9c1`
**File:** `packages/CodeGenLib/src/__tests__/PostgreSQLCodeGenProvider.test.ts`
Two upstream-authored tests asserted pre-Fix-9/Fix-16 behavior. Updated to match: `_Clear` comparison now `= true` (was `= 1`); DROP VIEW guard rewritten to allow DROP only inside the 42P16 EXCEPTION recovery block.

### Fix 18 + 19 unit tests (9 new)
**Commit:** `84125db469`
**Files:** `packages/SQLConverter/src/__tests__/ProcedureToFunctionRule.test.ts` (+6), `FunctionRule.test.ts` (+3)
Each fix has order/identity/uniqueness assertions. ProcedureToFunctionRule covers Fix 18 (DROP block emitted, references function by name, precedes CREATE) and Fix 19 (named-arg PERFORM, complex value expressions, parameterless calls). FunctionRule covers Fix 18 extension to inline TVF and scalar paths.

### `pg-migration-function-drop-guard` test (skipped draft)
**Commit:** `84125db469`
**File:** `packages/SQLConverter/src/__tests__/pg-migration-function-drop-guard.test.ts`
A static check that scans `migrations-pg/v5/` for CREATE OR REPLACE FUNCTION calls whose signature has changed without a DROP guard. Initial implementation produced false positives (treated all sig changes equally; didn't account for PG's actual semantics around adding-DEFAULT-params); skipped as a starting point for a future signature-aware version.

### `Force_Regen` allowlist entry in parity test
**Commit:** `84125db469`
**File:** `packages/SQLConverter/src/__tests__/pg-migration-regression.test.ts`
v5.32 SS migration `V202605032116__...Force_Regen_Tolerant_SP_All_Nullable_Columns.sql` (upstream) lacks a PG counterpart pending `/pg-migrate` regeneration with the now-improved converter. Allowlisted in `INTENTIONALLY_NO_PG_COUNTERPART` with a comment pointing at the resolution path.

---

## CI workflow improvements

### `flyway_schema_history` bootstrap + idempotency check
**Commit:** `63824b9644`
**File:** `.github/workflows/pg-migrations.yml`
Two additions:
- **Step 4 (extended)**: bootstrap step now creates `__mj.flyway_schema_history` mirroring Skyway's real schema. Without this, any view that joins it (Fix 14's `vwFlywayVersionHistoryParsed`) fails to create in CI with `relation does not exist`.
- **Step 5b (new, non-blocking)**: re-applies each V-migration after the first-pass apply succeeds. Catches `IF NOT EXISTS` / `OR REPLACE` / `ON CONFLICT` gaps that step 5 cannot — the same class real users hit when running `flyway repair` after partial-commit failure or restoring from a mid-migration backup. Inline allowlist marker `-- pg-test:non-idempotent <reason>` lets specific files opt out. `continue-on-error: true` initially; promote to enforced after current state is triaged.

---

## What this PR does NOT cover

- **Existing customer DBs with prior duplicate overloads** — the cleanup migration handles fresh PG installs, but customers already on PG with accumulated duplicates from prior shipped versions are out of scope. (No PG customers exist yet — flagged for completeness.)
- **Madhav's parallel PR (#2531) fixes** — `formatDefaultValue` typed-literal handling, `EntityInfo.NameField` disambiguation, viewFallback self-reference recovery, codegen idempotency. Those remain in his domain.
- **Re-conversion of existing committed `.pg.sql` files with the improved converter** — deliberately not done in this PR. Existing migrations are immutable; the cleanup migration handles their latent state on apply. A separate `/pg-migrate`-driven PR can regenerate them with DROP guards baked in if/when desired (cosmetic; not functionally required).

---

## End-to-end verification status

| Subsystem | Verification |
|---|---|
| SQLConverter unit tests | 31 files, 0 fail, 2 skipped (drop-guard draft + integration) |
| Bug 1 (duplicate overloads) | Reproduced + fixed end-to-end on postgres-claude with full Ian sequence (baseline → v5.31 Regen → v5.32) |
| Bug 2 (cascade-delete signature drift) | Reproduced + fixed end-to-end with real converter output applied + signature mutation |
| Cleanup migration | Verified against actually-dirty DB (drops only duplicates; idempotent) |
| `pg_depend` CASCADE side-effects | Audited — sp* have 0 dependents, trigger functions and handwritten built-ins correctly excluded |
| Pure-positional EXEC coverage | Audited — 1,112 EXEC patterns across all v5 migrations, 100% named-arg |
| Filename validator | 116 files, all valid, version ordering consistent |
| SS-side regression | None (all converter changes are tsql→postgres rules) |
