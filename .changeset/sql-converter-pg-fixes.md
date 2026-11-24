---
"@memberjunction/sql-converter": patch
"@memberjunction/installer": patch
---

T-SQL → PostgreSQL converter fixes found by converting the unreleased 6.3 migrations against a real PostgreSQL 16.

- Converted migrations emit `CREATE EXTENSION` only for an extension the body actually uses (`uuid-ossp` for `uuid_generate_*`, `pgcrypto` for `digest`/`crypt`/`gen_salt`/`hmac`/`pgp_*`). MJ's minimum is PostgreSQL 14, where `gen_random_uuid()` is built in, so new migrations no longer need either extension allowlisted on a managed host. The installer still creates both, because shipped migrations still contain the statements.
- Index columns with `ASC`/`DESC` are quoted (they folded to lowercase and failed); `ASC`/`DESC` is stripped from `UNIQUE` and composite primary-key lists.
- `ORDER BY`/`GROUP BY` quoting no longer quotes an alias qualifier (`"cirInner"."StartedAt"` against an unquoted alias).
- CodeGen's 6.3 single-write `spUpdate` (named columns, `IF @@ROWCOUNT = 0 … ELSE …`) converts to a `RETURNS TABLE` function with `RETURN QUERY`, matching native PostgreSQL CodeGen.
- A bare `DROP TRIGGER` before a re-create is skipped like the other drops; `@var` renaming in DECLARE/DML blocks ignores comments; `OUTER APPLY` / `CROSS APPLY` inside functions become `LEFT JOIN LATERAL … ON TRUE` / `CROSS JOIN LATERAL`.
