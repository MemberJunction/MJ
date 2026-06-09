---
"@memberjunction/sql-converter": patch
"@memberjunction/cli": patch
---

Convert and validate the consolidated baseline in the PostgreSQL migration pipeline. GrantRule now skips `GRANT CONNECT` (no PG equivalent) and ProcedureToFunctionRule skips CRUD sprocs whose `RETURNS SETOF` view is a deprecated/orphaned entity view — both emit `-- SKIPPED (INTENTIONAL)` markers instead of apply-failing SQL. Fix the MJCLI baseline roundtrip's PG conversion (it called nonexistent `--input/--output` flags) and correct the migrate-convert baseline JSDoc.
