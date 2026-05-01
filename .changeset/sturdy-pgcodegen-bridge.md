---
"@memberjunction/sql-converter": patch
"@memberjunction/codegen-lib": patch
---

PG toolchain fixes that unblock `mj codegen` against fresh PostgreSQL installs and complete the v5.31 migration conversion path.

**SQLConverter** — Two new handlers in `ConditionalDDLRule` for SS-specific patterns that previously survived into PG output untranslated:

- `IF NOT EXISTS (sys.schemas WHERE name = X) ... EXEC('CREATE SCHEMA [X]')` → `CREATE SCHEMA IF NOT EXISTS "X"`
- `IF NOT EXISTS (sys.extended_properties ... level0 = SCHEMA) ... EXEC sp_addextendedproperty` → `COMMENT ON SCHEMA "X" IS '...'`