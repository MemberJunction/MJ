---
"@memberjunction/sql-converter": patch
"@memberjunction/sqlglot-ts": patch
"@memberjunction/cli": patch
---

PostgreSQL conversion fixes for Open App migrations (issue #5364).

- sql-converter (`mj migrate convert`): T-SQL built-ins are no longer emitted as quoted identifiers (`"UPPER"(x)`, `"LEN"(x)`); `OBJECT_ID('s.T')` becomes `to_regclass('s."T"')` and `parent_object_id` becomes `conrelid` in constraint guards; `LIKE` patterns with character classes become `~` / `!~` regexes instead of CHECKs that accept every value; `IF COL_LENGTH(...) IS [NOT] NULL` column guards are translated and placed with the DDL, ahead of the backfill and CHECK that use the column; mid-batch `DECLARE @X = (SELECT ...)` variables are inlined where they are used; `Length=` / `Precision=` in CodeGen `UPDATE EntityField` blocks are quoted; CodeGen hierarchy inline TVFs convert with typed result columns and keep `+ 1` as arithmetic; CodeGen CRUD procedures and `__mj_UpdatedAt` triggers in an Open App schema convert instead of being skipped; `CREATE OR ALTER` routines are classified by kind, and hand-written Open App triggers, procedures and functions are commented out whole under a counted `NEEDS HAND AUTHORING` gap instead of passing through as live T-SQL. An `__mj_<App>.` schema qualifier is no longer quoted as if it were an `__mj_` column.
- sqlglot-ts: `TINYINT` maps to `SMALLINT` (it was emitted as `UTINYINT`).
- cli: `migrate convert --bake-codegen` and `migrate rebake` bake a baseline's CodeGen only for entities in the target `--schema`, not every schema in the working database.
