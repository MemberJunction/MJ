# PostgreSQL Manual Fixes Catalog

Every manual fix, workaround, and configuration change applied during the PG dev-on-PG validation session (April 13–16, 2026). This is the source-of-truth reference for what a PG install requires beyond running `mj migrate`.

Each fix is categorized by whether it should be automated in the pipeline, included in the baseline, or remains a developer responsibility.

---

## Category A: Converter should fix (T-SQL → PG conversion bugs)

### A1. DatasetItem.DateFieldToCheck literal quote contamination
**What:** 35 rows in `DatasetItem` had `"__mj_UpdatedAt"` (with literal `"` chars) instead of `__mj_UpdatedAt`. Caused `zero-length delimited identifier` errors on every MJAPI request, including auth middleware → "Authentication failed" on every login attempt.
**Manual fix applied:** `UPDATE __mj."DatasetItem" SET "DateFieldToCheck" = REPLACE("DateFieldToCheck", '"', '') WHERE "DateFieldToCheck" LIKE '%"%'`
**Root cause:** The T-SQL→PG converter's InsertRule converted `[bracket-quoted]` identifiers to `"double-quoted"` — including inside data VALUES where brackets were literal text, not identifiers. E.g., `[__mj_UpdatedAt]` in a WHERE clause value became `"__mj_UpdatedAt"`.
**Pipeline fix:** Already fixed in current converter — `InsertRule` uses `transformCodeOnly` to protect string literals from `__mj_` quoting. The contaminated data in the existing baseline is from an older conversion run. Reconverting the baseline with the current converter produces clean output.
**Status:** ✅ Converter is correct. Baseline needs reconversion (included in the migration files PR when all files are regenerated).

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

---

## Category B: PG baseline should include (missing from migrations)

### B1. Database roles: `cdp_UI`, `cdp_Developer`, `cdp_Integration`
**What:** GRANT statements in migrations and CodeGen reference these roles. They don't exist on a fresh PG install.
**Manual fix applied:** `CREATE ROLE "cdp_UI" NOLOGIN; CREATE ROLE "cdp_Developer" NOLOGIN; CREATE ROLE "cdp_Integration" NOLOGIN;` + GRANT statements.
**Where it should live:** PG baseline migration (`B202602151200__v5.0__Baseline.pg.sql`) or a dedicated `pg-only` bootstrap migration.
**Status:** Not yet in baseline. Currently in `scripts/pg-bootstrap-helpers.sql`.

### B2. `spGetPrimaryKeyForTable` function
**What:** CodeGen calls this during entity validation. Exists on SQL Server but was never ported to PG baseline.
**Manual fix applied:** Created PG version in `scripts/pg-bootstrap-helpers.sql`.
**Where it should live:** PG baseline migration.
**Status:** Not yet in baseline.

### B3. 5 CodeGen helper stored procedures
**What:** `spUpdateExistingEntitiesFromSchema`, `spUpdateExistingEntityFieldsFromSchema`, `spSetDefaultColumnWidthWhereNeeded`, `spUpdateSchemaInfoFromDatabase`, `spDeleteUnneededEntityFields`. All called by CodeGen during metadata management. All exist on SQL Server but never ported to PG.
**Manual fix applied:** Created simplified PG versions in `scripts/pg-bootstrap-helpers.sql`.
**Where it should live:** PG baseline migration or converter should convert them from the T-SQL baseline.
**Status:** Not yet in baseline. Simplified stubs — may need enhancement for full feature parity.

### B4. `UQ_User_Email` unique index
**What:** SQL Server baseline has a unique index on `User.Email`. PG baseline doesn't. Without it, every Auth0 login creates a duplicate user row (coworker documented 20+ duplicates for a single user).
**Manual fix applied:** `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_User_Email" ON __mj."User" ("Email")`.
**Where it should live:** PG baseline migration.
**Status:** Not yet in baseline.

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

### C3. `DROP VIEW CASCADE` needed before `CREATE OR REPLACE VIEW`
**What:** PG's `CREATE OR REPLACE VIEW` cannot change column order or remove columns from an existing view. When CodeGen tries to regenerate a view with different columns (e.g., after adding JOINs), PG silently rejects it or errors. CodeGen needs to `DROP VIEW IF EXISTS ... CASCADE` first.
**Manual fix applied:** Manually dropped views before CodeGen runs.
**Impact of CASCADE:** Drops dependent functions (`fn_create_*`, `fn_update_*`, `fn_delete_*` that RETURN SETOF the view). CodeGen must regenerate those too.
**Status:** Known issue (coworker report #36). Needs PostgreSQLCodeGenProvider to emit DROP VIEW CASCADE before CREATE OR REPLACE VIEW.

### C4. `LENGTH` keyword not in `_SQL_KEYWORDS` set (published 5.24.0)
**What:** The published 5.24.0 npm package's `PostgreSQLCodeGenProvider` doesn't include `LENGTH` in the SQL keywords set. CodeGen's `processWord` method quotes it as `"LENGTH"` → PG function call fails.
**Manual fix applied:** Patched `node_modules/@memberjunction/codegen-lib/.../PostgreSQLCodeGenProvider.js` to add `'LENGTH'` to the set.
**Source fix:** **DONE** in this PR — `LENGTH`, `LEFT`, `RIGHT`, `POSITION`, `OVERLAY`, `EXTRACT`, `GREATEST`, `LEAST` added to `_SQL_KEYWORDS`.
**Status:** ✅ Fixed in source (not yet published to npm).

### C5. `quoteFieldNamesInToken` quotes function calls as column names
**What:** The `PostgreSQLDataProvider`'s quoting regex matches entity field names (like `Length`) against function calls (`LENGTH(...)`) and quotes them — `"Length"(...)` is not a valid PG function call.
**Manual fix applied:** Patched `node_modules/@memberjunction/postgresql-dataprovider/.../PostgreSQLDataProvider.js` to add negative lookahead `(?!\s*\()`.
**Source fix:** Not yet applied to the `postgresql-dataprovider` package source. Our fix is only in `PostgreSQLCodeGenProvider`'s `_SQL_KEYWORDS` set.
**Status:** Needs source fix in `@memberjunction/postgresql-dataprovider`.

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
**Automation path:** Phase C CI can automate the two-pass pattern. Alternatively, Fix 2 (convert proc calls → direct INSERT) would eliminate the dependency.
**Status:** Documented in TESTING_GUIDE.md and DEV_ON_PG_GUIDE.md. 8 of 41 new migrations are affected.

---

## Priority ranking for pipeline automation

| Priority | Item | Effort | Impact |
|---|---|---|---|
| 1 | B1–B4: Add roles, helper procs, unique index to PG baseline | Low (SQL only) | Eliminates 4 manual setup steps |
| 2 | C1: Fix CodeGen bootstrap chicken-and-egg (vwEntityFields) | Medium (CodeGen source) | Fixes most empty-list Explorer issues |
| 3 | A1: Fix converter data-value quote contamination | Medium (InsertRule) | Prevents auth failures on fresh install |
| 4 | C3: Add DROP VIEW CASCADE to CodeGen PG provider | Low (1-line per view) | Prevents stale views after schema changes |
| 5 | C5: Fix DataProvider quoteFieldNamesInToken regex | Low (source fix) | Prevents runtime query failures |
| 6 | C2: Multi-hop JOIN support in CodeGen | High (architecture) | Enables ~20 virtual columns across ~10 entities |
| 7 | B5: Fix BaseViewGenerated default for PG installs | Low (data fix) | Prevents manual flag flipping |
| 8 | E1: Automate two-pass workflow in Phase C CI | Medium (CI config) | Makes migration testing hands-off |
