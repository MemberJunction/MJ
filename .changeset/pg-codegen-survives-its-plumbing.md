---
"@memberjunction/codegen-lib": patch
"@memberjunction/postgresql-dataprovider": patch
---

A long PostgreSQL CodeGen run survives its own infrastructure. `pg_get_expr()` is wrapped so a relation dropped mid-render no longer aborts the catalog view (`fnSafePGGetExpr`); the metadata-sync routines create their working tables once per session and TRUNCATE them (no DROP + CREATE), so a reused pooled connection never hits a stale cached plan ("could not open relation with OID"); and one idle-socket reset no longer kills the run. Advanced generation's LLM calls get a per-call ceiling, a consecutive-stall circuit that stops asking a failing provider, and an optional per-run USD cap (off by default).
