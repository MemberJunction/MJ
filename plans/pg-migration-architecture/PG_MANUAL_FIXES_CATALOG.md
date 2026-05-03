# PostgreSQL Manual Fixes Catalog

Every manual fix, workaround, and configuration change ever applied to get a PG install end-to-end. This is the source-of-truth reference for what a PG install requires beyond running `mj migrate`, and the to-do list for closing the remaining converter gaps.

Each fix is categorized by whether it should be automated in the pipeline, included in the baseline, or remains a developer responsibility. Status reflects what is currently shipping versus what is still outstanding.

---

## Category A: Converter should fix (T-SQL → PG conversion bugs)

### A1. DatasetItem.DateFieldToCheck literal quote contamination
**What:** 35 rows in `DatasetItem` had `"__mj_UpdatedAt"` (with literal `"` chars) instead of `__mj_UpdatedAt`. Caused `zero-length delimited identifier` errors on every MJAPI request, including auth middleware → "Authentication failed" on every login attempt.
**Manual fix applied:** `UPDATE __mj."DatasetItem" SET "DateFieldToCheck" = REPLACE("DateFieldToCheck", '"', '') WHERE "DateFieldToCheck" LIKE '%"%'`
**Root cause:** The T-SQL→PG converter's InsertRule converted `[bracket-quoted]` identifiers to `"double-quoted"` — including inside data VALUES where brackets were literal text, not identifiers. E.g., `[__mj_UpdatedAt]` in a WHERE clause value became `"__mj_UpdatedAt"`.
**Pipeline fix:** Already fixed in current converter — `InsertRule` uses `transformCodeOnly` to protect string literals from `__mj_` quoting. The contaminated data was in the legacy v5.0 baseline; the new v5.30 baseline (`B202604301800__v5.30__PG_Baseline.pg.sql`) is dumped from a clean canonical PG state and contains no such contamination.
**Status:** ✅ Converter is correct. New baseline is clean.

### A2. EntityField Sequence collisions across migrations
**What:** Two migrations inserting EntityField rows for the same entity both used Sequence=100048, violating `UQ_EntityField_EntityID_Sequence`.
**Manual fix applied:** Hand-edited V202603131800 to bump 100048→100051.
**Pipeline fix:** **DONE** — `SequenceDeduplicator.ts` now auto-detects and fixes these collisions as a post-conversion step. Wired into `mj migrate convert`.
**Status:** ✅ Fixed in this PR.

### A3. `ALTER COLUMN TYPE NULL` syntax
**What:** T-SQL `ALTER TABLE x ALTER COLUMN col UNIQUEIDENTIFIER NULL` → PG needs `ALTER COLUMN "col" DROP NOT NULL`, not `ALTER COLUMN "col" UUID NULL`.
**Pipeline fix:** **DONE** — AlterTableRule updated to handle quoted types and the NULL (make nullable) pattern.
**Status:** ✅ Fixed in this PR.

### A4. `sys.default_constraints` + `ADD DEFAULT FOR` pattern
**What:** T-SQL block that looks up a default constraint in `sys.default_constraints`, drops it, then `ADD DEFAULT val FOR col`. PG doesn't use named default constraints — just `ALTER COLUMN SET DEFAULT`.
**Pipeline fix:** **DONE** — DeclareDmlBlockRule detects this pattern and simplifies to direct `ALTER COLUMN SET DEFAULT`.
**Status:** ✅ Fixed in this PR.

### A5. `sys.check_constraints` + `sys.columns` dynamic-name lookup
**What:** T-SQL block declaring a `NVARCHAR` variable, populating it via `SELECT @x = cc.name FROM sys.check_constraints cc JOIN sys.columns c ON ...`, then dynamically dropping the resulting constraint. SQL Server uses this when CHECK constraint names are auto-generated (no explicit `CONSTRAINT name` in the original ADD).
**Manual fix applied:** In `V202604260056__v5.30.x__Memory_Consolidation_Schema.pg.sql`, hand-translated 2 such blocks to `pg_constraint` + `pg_class` + `pg_attribute` joins inside `DO $$ DECLARE … BEGIN`. Documented inline in the converted file.
**Pipeline fix needed:** SQLConverter rule that detects the `DECLARE @x NVARCHAR + SELECT @x = cc.name FROM sys.check_constraints + IF @x IS NOT NULL EXEC ALTER TABLE DROP CONSTRAINT` pattern and emits the PG equivalent. Spans multiple statements with a local variable, so requires a multi-statement DSL match rather than a single regex.
**Status:** ⚠️ Open. Affected files: 1 (Memory_Consolidation_Schema). v5.30.1 follow-up.

### A6. `MERGE INTO ... USING (VALUES) AS src` + `WHEN MATCHED/NOT MATCHED`
**What:** T-SQL upsert pattern using `MERGE INTO target AS tgt USING (VALUES (...)) AS src ON tgt.x = src.x WHEN MATCHED THEN UPDATE ... WHEN NOT MATCHED THEN INSERT ...`. The converter currently leaves `MERGE`, `USING`, `MATCHED` as bare keywords which then get mis-interpreted as identifiers (wrapped in double quotes), and doesn't translate the structure.
**Manual fix applied:** In `V202604241700__v5.30.x__Unified_Permissions_Phase_2.pg.sql`, hand-rewrote the §4 block (UI role permissions + RLS filters) to use `INSERT INTO … VALUES … ON CONFLICT (x) DO UPDATE SET …`. Documented inline.
**Pipeline fix needed:** SQLConverter rule for `MERGE INTO`. PG 15+ has its own `MERGE` syntax (slightly different from SS), or it can be lowered to `INSERT ... ON CONFLICT`. Either is correct; ON CONFLICT is more broadly supported.
**Status:** ⚠️ Open. Affected files: 1 (Unified_Permissions_Phase_2). v5.30.1 follow-up.

### A7. `DECLARE @x type = value` (variable initialization with default)
**What:** T-SQL `DECLARE @FilterAgentRunsID UNIQUEIDENTIFIER = 'E1AF0001-...';` (single-statement declare-and-assign). The converter currently emits `-- Could not parse: …` comments and leaves the declarations broken.
**Manual fix applied:** Replaced with PG `DECLARE v_filter_agent_runs_id UUID := 'E1AF0001-...';` in the hand-fixed Unified_Permissions_Phase_2.
**Pipeline fix needed:** Extend the DECLARE statement parser in DeclareDmlBlockRule to recognize the `= value` initializer and translate to PG's `:=` syntax.
**Status:** ⚠️ Open. Recurs anywhere T-SQL initializes locals at declare time. v5.30.1.

### A8. Constraint names not quoted (case-folded on PG)
**What:** Generated PG output writes `CONSTRAINT PK_FooBar PRIMARY KEY (...)` unquoted. PG case-folds unquoted identifiers, so the constraint actually lands as `pk_foobar`. SS preserves `PK_FooBar`. The constraint exists with the same scope and behavior; only the *name* differs from SS.
**Manual fix applied:** None (functional, but cosmetic mismatch with SS).
**Pipeline fix needed:** Same fix-class as A5/A6 — teach SQLConverter to quote `CONSTRAINT` names. Probably a small extension to the existing `quoteAsAliases` work that already handles `AS` aliases.
**Status:** ⚠️ Open, low-priority. Apps don't reference these names. v5.30.1.

### A9. SQL Server scratch DB application requires `SET QUOTED_IDENTIFIER ON`
**What:** Migrations like `Runtime_Actions_Schema.sql` reference computed-column expressions and indexed views that fail with `Msg 1934` unless `QUOTED_IDENTIFIER ON` is set. The migration files don't include this `SET` themselves; Flyway ships with it on by default but ad-hoc `sqlcmd` runs don't.
**Manual fix applied:** Prepend `SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON; GO` when applying via sqlcmd directly (used during equivalence verification tonight).
**Pipeline fix needed:** None — Flyway and the standard MJ migrate path set this correctly. Document for devs running migrations manually.
**Status:** ✅ Documented (this entry). No code change needed.

---

## Category B: PG baseline should include (missing from migrations)

### B1. Database roles: `cdp_UI`, `cdp_Developer`, `cdp_Integration`
**What:** GRANT statements in migrations and CodeGen reference these roles. They don't exist on a fresh PG install.
**Pipeline fix:** **DONE** — the new v5.30 baseline (`B202604301800__v5.30__PG_Baseline.pg.sql`) creates all three roles in its prelude via idempotent `DO $$ ... CREATE ROLE IF NOT EXISTS ... $$` blocks. No bootstrap script needed.
**Status:** ✅ Shipped.

### B2. `spGetPrimaryKeyForTable` function
**What:** CodeGen calls this during entity validation. Exists on SQL Server but was never ported to PG baseline.
**Pipeline fix:** **DONE** — included in the dedicated `.pg-only.sql` sproc-port migration (`V202604220000__v5.29.x__Port_Missing_CodeGen_Sprocs.pg-only.sql`). Covered by integration tests in `packages/CodeGenLib/src/__tests__/integration/pg-codegen-sprocs.integration.test.ts`.
**Status:** ✅ Shipped.

### B3. CodeGen helper stored procedures (7 total)
**What:** `spUpdateExistingEntitiesFromSchema`, `spUpdateExistingEntityFieldsFromSchema`, `spSetDefaultColumnWidthWhereNeeded`, `spUpdateSchemaInfoFromDatabase`, `spDeleteUnneededEntityFields`, `spUpdateEntityFieldRelatedEntityNameFieldMap`, `spDeleteUnneededEntityFields`. All called by CodeGen during metadata management. All exist on SQL Server but cannot be auto-translated by the converter (they rely on `sys.*` joins, `STRING_SPLIT`, `IIF`, table variables, `SELECT ... INTO`).
**Pipeline fix:** **DONE** — hand-ported to plpgsql in the same `.pg-only.sql` migration as B2. The PG ports also fix a pre-existing arity bug in `spUpdateEntityFieldRelatedEntityNameFieldMap`.
**Status:** ✅ Shipped. 15 integration tests prove correctness against a real PG instance.

### B4. `UQ_User_Email` unique index
**What:** SQL Server baseline has a unique index on `User.Email`. PG baseline doesn't. Without it, every auth provider login can create a duplicate user row.
**Pipeline fix:** **DONE** — present in the new v5.30 baseline (`B202604301800__v5.30__PG_Baseline.pg.sql`). Verified via direct query against a fresh apply.
**Status:** ✅ Shipped.

### B5. `BaseViewGenerated = false` on custom views
**What:** 5+ entities (Entity Fields, Company Integrations, User Views, Company Integration Runs, AI Models) had `BaseViewGenerated = false` in the PG metadata. CodeGen skips view regeneration for these. When new columns are added by migrations, the views become stale.
**Manual fix applied:** `UPDATE __mj."Entity" SET "BaseViewGenerated" = true WHERE "Name" IN (...)`.
**Where it should live:** Either the PG baseline should set all entities to `BaseViewGenerated = true`, or CodeGen should regenerate views regardless of this flag when running on a fresh PG install.
**Status:** Manual workaround applied. Needs either a baseline data fix or a CodeGen behavior change.

---

## Category C: CodeGen PG provider should fix (source code changes needed)

### C1. Views emitted as `SELECT e.*` without LEFT JOINs
**What:** The PostgreSQLCodeGenProvider generates views like `SELECT e.* FROM __mj."EntityField" AS e` — no JOINs to related entities. SQL Server equivalent has 10+ LEFT JOINs producing virtual columns (Entity, RelatedEntity, Vendor, etc.). Affects every entity list view in Explorer — entities with missing virtual columns show 0 rows.
**Manual fix applied:** Manually rebuilt vwEntityFields with 13 JOIN columns; re-ran CodeGen multiple times to populate `_RelatedEntityJoinFieldMappings`.
**Root cause:** CodeGen generates JOINs only when `ef._RelatedEntityJoinFieldMappings` is populated. This requires `vwEntityFields` to already have the `RelatedEntity` column (chicken-and-egg). On the first CodeGen run, vwEntityFields is minimal → RelatedEntity is NULL → no JOINs generated → vwEntityFields stays minimal.
**Fix approach:** Either (a) rebuild vwEntityFields manually before first CodeGen (bootstrap script), or (b) have CodeGen query the EntityField table directly instead of the view for its initial metadata load.
**Status:** Partially working after 2+ CodeGen runs with manual view rebuilds between them. Multi-hop JOINs (e.g., AIModel → AIModelType → AIVendor → Vendor name) still don't generate.

### C2. Multi-hop virtual columns (Vendor, DriverClassName, etc.)
**What:** Some virtual columns require chain JOINs through intermediate entities. E.g., `Vendor` on AI Models requires: AIModel → AIModelTypeID → AIModelType → AIVendorID → AIVendor → Name. CodeGen only generates single-hop FK JOINs.
**Manual fix applied:** None — these columns remain missing.
**Status:** Not fixable without CodeGen source enhancement. Tracked as task #52.

### C3. View regeneration when column shape changes (PG `42P16`)
**What:** PG's `CREATE OR REPLACE VIEW` cannot change column order or remove columns from an existing view; it raises `SQLSTATE 42P16` (`invalid_table_definition`). A naive `DROP VIEW ... CASCADE` solves the parse problem but silently nukes dependent views, functions, and grants.
**Pipeline fix:** **DONE** — `PostgreSQLCodeGenProvider.regenerateBaseView` now uses a fallback orchestrator that:
1. Tries `CREATE OR REPLACE VIEW` first (non-destructive happy path).
2. On 42P16, captures dependent views, functions, grants, and the COMMENT via `pg_depend`/`pg_rewrite`/`information_schema` queries.
3. Drops with CASCADE, recreates the target with the new shape, then restores all dependents in reverse order.
4. Skips restoring dependents that the same CodeGen run will recreate later (`willRegenerate` set), preventing churn.

A `ViewFallbackRestoreError` with phase discriminant (`capture` / `drop` / `recreate` / `restore-views` / `restore-functions` / `restore-grants` / `restore-metadata`) makes any restoration failure visible and scoped.

Covered by 33 integration tests across `pg-view-regen.integration.test.ts`, `pg-view-dependency-capture.integration.test.ts`, and `pg-view-fallback.integration.test.ts`.
**Status:** ✅ Shipped.

### C4. `LENGTH` keyword not in `_SQL_KEYWORDS` set
**What:** Older `PostgreSQLCodeGenProvider` did not include `LENGTH` in the SQL keywords set. CodeGen's `processWord` method quoted it as `"LENGTH"` → PG function call fails.
**Source fix:** **DONE** — `LENGTH`, `LEFT`, `RIGHT`, `POSITION`, `OVERLAY`, `EXTRACT`, `GREATEST`, `LEAST` added to `_SQL_KEYWORDS`.
**Status:** ✅ Shipped.

### C5. `quoteFieldNamesInToken` quotes function calls as column names
**What:** `PostgreSQLDataProvider`'s quoting regex matched entity field names (like `Length`) against function calls (`LENGTH(...)`) and quoted them — `"Length"(...)` is not a valid PG function call.
**Source fix:** Negative lookahead `(?!\s*\()` added to the regex in `PostgreSQLDataProvider`.
**Status:** ✅ Shipped.

### C6. CRUD function naming alignment
**What:** Runtime `PostgreSQLDataProvider` was looking up `spCreate*`/`spUpdate*` (T-SQL naming), but CodeGen on PG actually emits `fn_create_*`/`fn_update_*`/`fn_delete_*`. Result: every Save() through the PG path failed with "function does not exist".
**Source fix:** `getCRUDFunctionName` in `PostgreSQLDataProvider` now returns `fn_create_<snake_table>` (and the matching update/delete forms).
**Status:** ✅ Shipped.

### C7. CodeGen silently swallowed PG shell-execution failures
**What:** `executeSQLFileViaShell` always returned `true` even when `psql` exited non-zero. CodeGen marched on with broken state (missing functions, missing grants).
**Source fix:** Shell return codes now propagate; per-entity SQL generators check the return value and surface failures.
**Status:** ✅ Shipped.

### C8. Per-entity CodeGen aborted on first error inside the entity batch
**What:** CodeGen-per-entity SQL was a single batch (view + CRUD functions + grants). PG's simple-query protocol aborts the whole batch on the first error, so a view failure left CRUD functions and grants for that entity uncreated.
**Source fix:** `PostgreSQLCodeGenProvider.executeEntityPhased` runs the three pieces as separate phases. Phase 1 (view) uses the C3 fallback orchestrator. Phase 2 (CRUD) only runs if phase 1 succeeded. Phase 3 (grants) only runs if phase 2 succeeded. Each phase failure is reported separately and scoped to the affected entity.
**Status:** ✅ Shipped. 2 integration tests prove the gating behavior.

### C9. Strict mode for CodeGen view regeneration
**What:** Failures during view regeneration were logged but CodeGen continued. CI had no way to assert "all views must regenerate cleanly".
**Source fix:** `regenerateFailedBaseViews` collects per-entity failures, logs a batch summary, and throws when `MJ_CODEGEN_STRICT_VIEW_REGEN=true`. CI sets this flag; local dev defaults to non-strict.
**Status:** ✅ Shipped.

### C10. Pagination math wrong on PG (silently worked on SQL Server)
**What:** `GenericDatabaseProvider` pagination math used SQL Server's `OFFSET ... FETCH NEXT` semantics implicitly. PG's `LIMIT ... OFFSET` returned wrong rows when MaxRows was zero or undefined. Affected every paginated list view in Explorer when running against PG.
**Source fix:** Explicit MaxRows-zero/undefined handling + 9 unit tests.
**Status:** ✅ Shipped.

---

## Category D: Configuration (developer responsibility per deployment)

### D1. `.env` file with PG connection settings
**What:** MJAPI and CodeGen read database credentials from `.env`. Must include `DB_TYPE=postgresql` and `PG_*` overrides.
**Key settings:**
```
DB_TYPE=postgresql
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=mj_pg_dev
PG_USERNAME=postgres
PG_PASSWORD=<password>
```
**Notes:** Both `DB_*` and `PG_*` vars needed (CodeGen reads `PG_*` first, falls back to `DB_*`). Must be copied to `apps/MJAPI/.env` as well (MJAPI loads its own).
**Status:** Developer responsibility. Documented in DEV_ON_PG_GUIDE.md.

### D2. `mj.config.cjs` PG overrides
**What:** Two settings needed: `dbPort` must be overridden (published 5.24.0 defaults to 1433), and `excludeSchemas` must NOT include `__mj` (or CodeGen generates 0 entities).
```javascript
dbPort: parseInt(process.env.DB_PORT, 10) || 5432,
excludeSchemas: ['sys', 'staging'],  // NOT ['sys', 'staging', '__mj']
```
**Status:** Developer responsibility. `dbPort` fix is in this PR's source changes; `excludeSchemas` documented.

### D3. Explorer environment files
**What:** `GRAPHQL_URI` and `GRAPHQL_WS_URI` must point to MJAPI's actual port.
**Status:** Developer responsibility.

### D4. User seeding for specific developers
**What:** Each developer who needs to log in must have a record in `__mj.User` with appropriate roles in `__mj.UserRole`.
**Status:** Developer responsibility. Can be automated by `UPDATE_USER_CACHE_WHEN_NOT_FOUND=1` for auto-creation on first login.

---

## Category E: Metadata_Sync two-pass workflow

### E1. Stored proc signature mismatch on batch migration
**What:** Metadata_Sync migrations call `fn_create_*`/`fn_update_*` with parameters for columns added by earlier DDL migrations in the same batch. The PG functions don't include those parameters until CodeGen regenerates them.
**Workflow fix:** Run migrations in two passes: `mj migrate` (DDL) → `mj codegen` → `mj migrate` (sync).
**Automation path:** CI workflow can automate the two-pass pattern. Alternatively, converting proc calls → direct INSERT would eliminate the dependency.
**Status:** Documented in DEV_ON_PG_GUIDE.md. Affects ~8 migrations across the v5 series.

---

## Category F: Open converter gaps (surface only on full clean-slate regeneration)

These do not block forward development against the committed migration files, but they prevent a true "delete everything and regenerate" workflow. Each was discovered by snapshotting the working `migrations-pg/v5/` set, regenerating from T-SQL via `mj migrate convert`, and diffing the output.

### F1. Baseline `spCreate*` / `spUpdate*` referencing views not created in the baseline
**Affected file:** `migrations-pg/v5/B202602151200__v5.0__Baseline.pg.sql`
**What:** The T-SQL baseline contains `CREATE PROCEDURE spCreateEntityBehaviorType` (and similar) whose body references `vwEntityBehaviorTypes` — but neither the table nor the view is created in the baseline. SQL Server tolerates this via deferred name resolution; PG raises `type "__mj.vwEntityBehaviorTypes" does not exist` at function-creation time, blocking the install at the first migration.
**Required converter fix:** When converting a baseline file (filename starts with `B`), `ProcedureToFunctionRule` should restore its previous behavior of skipping sprocs whose `RETURNS SETOF` view is not also created in the same file. The current "always emit" behavior is correct for incremental migrations (the view exists in DB by then) but wrong for the baseline.
**Status:** Open. Diagnosis captured in `PG_CLEAN_SLATE_REGEN_REPORT.md`. Workaround: keep the existing committed `migrations-pg/v5/` files (which have these sprocs already skipped from a prior conversion run with the comment `-- SKIPPED: References view ... not created in this file`).

### F2. Inline T-SQL TVF/scalar function syntax not converted
**Affected file:** `migrations-pg/v5/V202604090003__v5.25.x__Geo_Features_Tables_And_Functions.pg.sql`
**What:** The geo-functions migration contains T-SQL inline scalar (`fn_MJ_GeoDistance`) and table-valued (`fn_MJ_GeoRecordsNear`) functions whose auto-converted output emits invalid plpgsql: `DECLARE x FLOAT = ...` (T-SQL inline-init syntax), `ATN2` instead of `ATAN2`, `RETURNS TABLE AS RETURN (...)` (not a valid PG ITVF pattern), and a single `$` delimiter instead of `$$`.
**Required converter fix:** Add a converter rule for inline scalar/TVF functions emitting valid plpgsql (variable initialization split into `DECLARE` block + assignment, ATN2→ATAN2, proper `RETURNS TABLE` with embedded `RETURN QUERY`, `$$` delimiter).
**Status:** Open. Workaround: hand-written PG version lives in `migrations-pg/v5/V202604090002__v5.25.x__Geo_Functions.pg.sql` (runs first because of earlier timestamp); the auto-converted definitions are omitted from V202604090003 with an explanatory comment.

### F3. View column-snapshot stale after `ALTER TABLE ADD COLUMN`
**Affected file:** `migrations-pg/v5/V202604131300__v5.26.x__Add_AllowCaching_And_DetectExternalChanges_To_Entity.pg.sql`
**What:** After a migration adds a column to a table, downstream queries in the same migration that reference the table's view (`vw<EntityName>s`) fail because the view's `SELECT *` was snapshotted at view-creation time and doesn't include the new column. PG views materialize column lists; SQL Server views don't. In this case `ALTER TABLE Entity ADD COLUMN DetectExternalChanges` is followed by a SELECT against `vwEntities` that references the new column.
**Required converter fix:** Either (a) rewrite downstream queries to read from the base table directly, or (b) emit `DROP VIEW`/`CREATE VIEW` for the affected views before the dependent SELECT runs. The latter is safer and matches what CodeGen does post-migration.
**Status:** Open. Workaround: hand edit queries `__mj.Entity` and `__mj.EntityField` directly instead of `vwEntities`/`vwEntityFields`.

### F4. `ALTER TABLE ADD COLUMN` with inline FK placed too late in file
**Affected file:** `migrations-pg/v5/V202604191500__v5.28.x__Add_Restore_Lineage_To_RecordChange.pg.sql`
**What:** When the converter sees `ALTER TABLE ... ADD COLUMN ... CONSTRAINT FK_... REFERENCES ...`, it places the entire statement in the FK/CHECK section that runs after indexes and functions. But indexes and functions emitted earlier in the same file may reference the new column. In this case `RestoredFromID` is referenced by an index and a function that the converter emits before the column add.
**Required converter fix:** When `ALTER TABLE ADD COLUMN` is also referenced by an index or function emitted in the same file, hoist the column add to the top and place the FK constraint at the end (split the combined statement).
**Status:** Open. Workaround: hand edit splits the column add (top of file) from the FK constraint (end of file).

### F5. T-SQL `EXEC __mj.spCreate*` blocks not auto-converted (silent data loss)
**Affected files:** `migrations-pg/v5/V202604201315__v5.29.x__Archive_Actions.pg.sql`, `migrations-pg/v5/V202604201325__v5.29.x__Archive_Scheduled_Job.pg.sql` (9 SKIPPED blocks across the two files)
**What:** Migrations that seed reference data via the metadata-management sproc pattern — `IF NOT EXISTS ... BEGIN EXEC __mj.spCreateAction @ID=..., @Name=N'...' ... END` — are skipped by the converter with a `-- SKIPPED: EXEC block (auto-conversion not supported)` comment. The original T-SQL is copied as comments in the output. **The migration applies cleanly** (no SQL error) **but the seeded records are silently missing**. Runtime later tries to find the records (Action, ActionParam, ScheduledAction, etc.) and fails. This is more dangerous than F1–F4 because the failure surfaces at runtime, not at migration time.
**Required converter fix:** Add a converter rule for the `IF NOT EXISTS ... EXEC __mj.sp{Create,Update,Delete}<Entity> @param=value, ...` pattern that emits the PG equivalent: `DO $$ DECLARE v_id UUID := '...'; BEGIN IF NOT EXISTS (SELECT 1 FROM __mj."Entity" WHERE ...) THEN INSERT INTO __mj."Entity" (...) VALUES (...); END IF; END $$;`. Direct INSERT is preferred over `PERFORM __mj.fn_create_<entity>(...)` because the `fn_create_*` functions are CodeGen-emitted and may not exist at the point a seeding migration runs.
**Status:** Open. Workaround: hand-rewrite each `IF NOT EXISTS ... EXEC` block as a `DO $$ ... INSERT INTO ... END $$;` block. Replace `N'string'` → `'string'`, `1`/`0` → `TRUE`/`FALSE`, `@var` → `v_var`, and `BEGIN`/`END` → `THEN`/`END IF`.

---

## Category G: Hand-written PG-only files (no T-SQL source)

These files exist only in PG form — there is no T-SQL counterpart to convert. They were authored directly because the underlying need is either PG-specific or relies on T-SQL constructs the converter has no rule for. Filename suffix `.pg-only.sql` (or `.pg.sql` where a PG-only function lives alongside a converted file).

### G1. PG-only platform-variant columns
**File:** `migrations-pg/v5/V202602151201__v5.0.x__Add_PlatformVariants_Columns.pg-only.sql`
**What:** Adds columns required by the PG migration architecture itself.
**Why hand-written:** Feature exists only in the PG path; nothing to convert.

### G2. PG view-recovery patches
**File:** `migrations-pg/v5/V202603011600__v5.5.x__Create_Missing_Views.pg-only.sql`
**What:** Recreates views that were lost during earlier `DROP VIEW ... CASCADE` runs.
**Why hand-written:** Predates the 42P16 fallback orchestrator (Category C3). Now that CodeGen captures and restores dependents safely, future column-shape changes should not produce this kind of damage. The file is kept for any historical install that experienced it.

### G3. PG name-quoting cleanup
**File:** `migrations-pg/v5/V202603111159__v5.11.x__Fix_EntityField_Quoted_Names.pg-only.sql`
**What:** Cleans up `EntityField` rows whose names contained literal quote characters from an earlier converter bug (Category A1).
**Why hand-written:** Data fix specific to installations that ran the older converter; no T-SQL equivalent because SQL Server never had the same data corruption path.

### G4. Hand-written PG geo functions
**File:** `migrations-pg/v5/V202604090002__v5.25.x__Geo_Functions.pg.sql`
**What:** PG implementation of `fn_MJ_GeoDistance` and `fn_MJ_GeoRecordsNear`.
**Why hand-written:** Pairs with F2 — the converter cannot translate the T-SQL inline TVF/scalar definitions in V202604090003. This file runs first (earlier timestamp) and provides the working PG versions.

### G5. CodeGen sproc port
**File:** `migrations-pg/v5/V202604220000__v5.29.x__Port_Missing_CodeGen_Sprocs.pg-only.sql`
**What:** Hand-port of 7 baseline CodeGen sprocs: `spGetPrimaryKeyForTable`, `spSetDefaultColumnWidthWhereNeeded`, `spUpdateEntityFieldRelatedEntityNameFieldMap` (also fixes a pre-existing arity bug in the T-SQL version), `spUpdateExistingEntitiesFromSchema`, `spUpdateExistingEntityFieldsFromSchema`, `spUpdateSchemaInfoFromDatabase`, `spDeleteUnneededEntityFields`.
**Why hand-written:** The T-SQL versions use SQL Server features the converter has no rule for: `sys.*` catalog joins, `STRING_SPLIT`, `IIF`, table variables, tempdb temp tables, `SELECT ... INTO`. Each had to be reimplemented in plpgsql by a human. Covered by 15 integration tests in `packages/CodeGenLib/src/__tests__/integration/pg-codegen-sprocs.integration.test.ts`.

---

## Summary: human-touch surface

Out of the 90+ files in `migrations-pg/v5/`, only **9 files** require human attention:

| Kind | Count | Files |
|---|---|---|
| Auto-converted with patches (Category F) | 6 | B202602151200 (baseline), V202604090003 (geo), V202604131300 (allow-caching), V202604191500 (restore-lineage), V202604201315 (archive-actions, EXEC blocks), V202604201325 (archive-scheduled-job, EXEC blocks) |
| PG-only (Category G) | 5 | V202602151201, V202603011600, V202603111159, V202604090002, V202604220000 |

The other ~81 files are pure converter output (with the cosmetic 22-line header) and require no manual work.

---

## Priority ranking for remaining work

| Priority | Item | Effort | Impact |
|---|---|---|---|
| 1 | F5: Converter — `IF NOT EXISTS ... EXEC __mj.spCreate*` pattern → `DO $$ ... INSERT ... END $$;` | Medium (new converter rule) | **Silent data loss** — migrations apply cleanly but seed records are missing. Pattern recurs in any migration that seeds Action / ActionParam / ScheduledAction / etc. |
| 2 | B1, B4: Add roles + UQ_User_Email to PG baseline | Low (SQL only) | Eliminates 2 manual setup steps |
| 3 | C1: Fix CodeGen bootstrap chicken-and-egg (vwEntityFields) | Medium (CodeGen source) | Fixes most empty-list Explorer issues |
| 4 | F3: Converter — view-snapshot column staleness after ALTER TABLE | Medium (needs DROP/CREATE view emission or query rewrite) | Recurs on every column-add migration |
| 5 | F1: Converter — baseline-aware sproc skip | Low (filename detection + restore old skip behavior) | Unblocks baseline regeneration |
| 6 | C2: Multi-hop JOIN support in CodeGen | High (architecture) | Enables ~20 virtual columns across ~10 entities |
| 7 | F4: Converter — column hoisting when referenced earlier in file | Medium (cross-section dependency check) | Narrow but real |
| 8 | B5: Fix BaseViewGenerated default for PG installs | Low (data fix) | Prevents manual flag flipping |
| 9 | F2: Converter — inline T-SQL TVF/scalar function rule | High (new converter rule) | Narrow (only geo functions today) |
| 10 | E1: Automate two-pass workflow in CI | Medium (CI config) | Makes migration testing hands-off |
