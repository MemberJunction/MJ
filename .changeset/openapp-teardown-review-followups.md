---
"@memberjunction/open-app-engine": patch
"@memberjunction/sql-dialect": patch
---

Open-App teardown review follow-ups. Completes the "Dialect owns it" direction and hardens the seam:

- **`SQLDialect.AtomicBatchScript(statements)`** (new, SS + PG) now owns the all-or-nothing transaction/session wrapper, so `buildTeardownBatchScript` no longer sniffs `PlatformKey` — the last platform branch leaves the OpenApp engine.
- `RemoveAppEntityMetadata` is now exported from the package index; a deterministic, self-cleaning **integration suite** (`open-app-teardown-tests.ts`, registered in `run-all.ts`) codifies the used-app remove/reinstall scenario (blocking `RecordChange` + link-less fixed-GUID `Application` → clean teardown → re-create without `PK_Application` collision).
- `RemoveApp` now passes the context's bound provider (not `undefined`) into `RemoveAppEntityMetadata`, so its metadata reads honor the multi-provider rule instead of the process-global `Metadata`.
- SQL Server `ForeignKeyGraphSQL` gains `ORDER BY fk.name` (deterministic edge/statement order) and a note that disabled FKs are intentionally included (conservative-safe).
- Docs corrected to match the has-a-Dialect gate (both dialects run the cascade); the migration-declared-`Application` scan is documented as SQL-Server-only (a PostgreSQL follow-up); `RunFkGraphTeardown`/`RemoveAppEntityMetadata` now warn that the raw-SQL teardown bypasses the `BaseEntity` pipeline (no cache invalidation) for in-process callers; the cross-schema-FK limitation and the downloaded-migrations temp-dir cleanup are addressed.
