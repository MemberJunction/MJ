---
"@memberjunction/sql-converter": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/server": patch
"@memberjunction/core-entities-server": patch
---

PG toolchain fixes that unblock fresh PostgreSQL installs end-to-end — `mj codegen` runs cleanly, the v5.31 migration conversion path completes, and first-time sign-in (plus other framework-emitted runtime queries) no longer crashes on `boolean = integer` errors.

**SQLConverter** — Two new handlers in `ConditionalDDLRule` for SS-specific patterns that previously survived into PG output untranslated:

- `IF NOT EXISTS (sys.schemas WHERE name = X) ... EXEC('CREATE SCHEMA [X]')` → `CREATE SCHEMA IF NOT EXISTS "X"`
- `IF NOT EXISTS (sys.extended_properties ... level0 = SCHEMA) ... EXEC sp_addextendedproperty` → `COMMENT ON SCHEMA "X" IS '...'`

Plus `DialectHeaderBuilder` no longer emits an `UPDATE pg_cast` statement that required pg_catalog write privileges (rejected by managed PG — RDS, Aurora, Cloud SQL, Azure). All bulk INSERTs use native `TRUE`/`FALSE` as of v5.30, so the cast modification is no longer needed.

**CodeGenLib** — `PostgreSQLCodeGenProvider` had three CASE expressions returning INTEGER `1`/`0` for output columns whose downstream consumers compared against BOOLEAN. PG rejected with `operator does not exist: integer = boolean` during `mj codegen`. Rewritten to `TRUE`/`FALSE`. `createNewUser.ts` had the same hardcoded BIT-style filter pattern in a RunView ExtraFilter — moved to JS post-fetch. Companion `.pg-only.sql` migration fixes the equivalent type mismatch in `vwSQLColumnsAndEntityFields` view definition (v5.30 sprocs declared BOOLEAN columns but the view returned INTEGER).

**MJServer** — Two framework-level call sites (`auth/newUsers.ts` and `resolvers/IntegrationDiscoveryResolver.ts`) passed `IsActive = 1` / `DefaultForNewUser = 1` BIT-style booleans as RunView ExtraFilter strings. Crashed every first-time sign-in on PG. Rewritten to do UUID/string filtering server-side via SQL and boolean filtering client-side in JS — dialect-agnostic, no infrastructure changes.

**MJCoreEntitiesServer** — `MJApplicationEntityServer.server.ts` had the same `IsActive = 1` pattern when fanning out UserApplication records on app save. Same JS-side rewrite for parity.