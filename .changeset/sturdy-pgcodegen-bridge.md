---
"@memberjunction/sql-converter": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/server": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/sql-dialect": patch
"@memberjunction/cli": patch
---

PG toolchain fixes that unblock fresh PostgreSQL installs end-to-end — `mj codegen` runs cleanly, the v5.31 migration conversion path completes, first-time sign-in no longer crashes on `boolean = integer` errors, and `BaseEntity.Delete()` against PG correctly recognizes successful deletions.

**SQLConverter** — Two new handlers in `ConditionalDDLRule` for SS-specific patterns that previously survived into PG output untranslated:

- `IF NOT EXISTS (sys.schemas WHERE name = X) ... EXEC('CREATE SCHEMA [X]')` → `CREATE SCHEMA IF NOT EXISTS "X"`
- `IF NOT EXISTS (sys.extended_properties ... level0 = SCHEMA) ... EXEC sp_addextendedproperty` → `COMMENT ON SCHEMA "X" IS '...'`

Plus `DialectHeaderBuilder` no longer emits an `UPDATE pg_cast` statement that required pg_catalog write privileges (rejected by managed PG — RDS, Aurora, Cloud SQL, Azure). All bulk INSERTs use native `TRUE`/`FALSE` as of v5.30, so the cast modification is no longer needed.

**CodeGenLib** — `PostgreSQLCodeGenProvider` had three CASE expressions returning INTEGER `1`/`0` for output columns whose downstream consumers compared against BOOLEAN. PG rejected with `operator does not exist: integer = boolean` during `mj codegen`. Rewritten to `TRUE`/`FALSE`. `createNewUser.ts` had the same hardcoded BIT-style filter pattern in a RunView ExtraFilter — moved to JS post-fetch. Companion `.pg-only.sql` migration fixes the equivalent type mismatch in `vwSQLColumnsAndEntityFields` view definition (v5.30 sprocs declared BOOLEAN columns but the view returned INTEGER).

**MJServer** — Two framework-level call sites (`auth/newUsers.ts` and `resolvers/IntegrationDiscoveryResolver.ts`) passed `IsActive = 1` / `DefaultForNewUser = 1` BIT-style booleans as RunView ExtraFilter strings. Crashed every first-time sign-in on PG. Rewritten to do UUID/string filtering server-side via SQL and boolean filtering client-side in JS — dialect-agnostic, no infrastructure changes.

**MJCoreEntitiesServer** — `MJApplicationEntityServer.server.ts` had the same `IsActive = 1` pattern when fanning out UserApplication records on app save. Same JS-side rewrite for parity.

**PostgreSQLDataProvider** — Adds the `ValidateDeleteResult` override that the Phase-2 Save/Delete refactor (Feb 2026) added for SQL Server but missed for PG. PG `spDelete<Entity>` sprocs return their result column as `"_result_id"` (baseline migration convention, originally chosen to avoid PL/pgSQL `RETURNS TABLE("ID")` + `WHERE "ID" = p_id` ambiguity), but the framework's default validation only knows the new PK-named shape — so every Delete against an unmodified PG install reported "record not found" *despite the row actually being deleted*. The override accepts either shape and supports compound PKs.

**SQLDialect + CodeGenLib (tolerant-SP `_Clear` companion)** — The base codegen template emitted nullable-column `_Clear` companion parameters with a hardcoded `bit` SQL type and a hardcoded `= 1` comparison in the CASE branches. SS works with `bit`/`= 1`; PG declares the parameter as `bit` (which exists but is a 1-character bit-string type, not boolean) and then compares with `= 1` (integer), failing at runtime with `operator does not exist: boolean = integer`. The previous fix (`914cd49079`) was a `sed`-rewrite of 123 occurrences in one PG migration file — replaced here with a source-level fix: a new `Dialect.BooleanParameterType()` (returns `'bit'` on SS, `'boolean'` on PG) and reuse of `Dialect.BooleanLiteral(true)` for the comparison. SS output is byte-identical (`bit DEFAULT 0` + `= 1`); PG output is now correct (`boolean DEFAULT false` + `= true`) at the source — no more sed band-aids needed for future codegen runs.

**MJCLI (dialect detection + baseline auto-select)** — Two fresh-PG-install blockers in `mj migrate`:

- *DB_TYPE env-var fallback.* MJAPI honors `DB_TYPE=postgresql` from `.env` to select its runtime data provider, but MJCLI did not — it required `dbPlatform: 'postgresql'` to be explicitly set in `mj.config.cjs`. Developers with a fully-configured PG `.env` who ran `mj migrate` silently got a `SqlServerProvider` attempting to talk SS protocol to a PG server, producing `Connection lost - read ECONNRESET` with no useful diagnostic. MJCLI now reads `DB_TYPE` (and aliases `postgres` / `mssql`) as a fallback for `dbPlatform`, and auto-defaults `dbPort` to 5432 vs 1433 based on the inferred platform. Single `.env` now drives both paths consistently.
- *BaselineVersion default.* Skyway treats `BaselineVersion: '1'` as a sentinel meaning "auto-select the highest-versioned `B__` baseline file." When `baselineVersion` is left `undefined`, Skyway finds no baseline matching `undefined` and silently skips the baseline file on fresh installs — the next migration then fails with `relation does not exist`. MJCLI now defaults `BaselineVersion` to `'1'` when not configured, matching the documented expected behavior.

**CodeGenLib (PG-output statement termination)** — `mj codegen` against PG completes and validates 315 entities, but the generated `CodeGen_Run_*.pg.sql` migration file failed to *replay* against a fresh PG with `syntax error at or near INSERT` because consecutive INSERT/ALTER statements were emitted without trailing `;`. SS hides this issue with `BEGIN/END` blocks and `GO` separators that self-terminate; PG strict parser does not. Fixed by adding `;` to PG-emitted templates (`wrapInsertWithConflictGuard` suffix, `addColumnSQL`, `alterColumnTypeAndNullabilitySQL`, `dropObjectSQL`, `addDefaultConstraintSQL`, `dropDefaultConstraintSQL`, plus 3 dialect-agnostic INSERT templates in `manage-metadata.ts`), and adding a systematic catch-all in `appendToSQLLogFile`: if the trimmed content doesn't already end with `;` or `GO`, append `;` before the `\n\n` separator. SS output unaffected since trailing `;` is harmless after SS statements.