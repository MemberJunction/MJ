---
"@memberjunction/codegen-lib": patch
"@memberjunction/postgresql-dataprovider": patch
---

A long PostgreSQL CodeGen run survives its own plumbing: the metadata-sync routines keep their working tables for the session (create-once + TRUNCATE) so a reused pooled connection never hits a stale cached plan ("could not open relation with OID"), the PostgreSQL connection manager recovers a dropped pooled connection, and advanced generation's LLM calls are bounded so a failing provider stops being asked.
