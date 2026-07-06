---
"@memberjunction/open-app-engine": patch
---

Fix Open-App remove/reinstall teardown. `RemoveAppEntityMetadata` now clears **all** of an entity's FK-dependent `__mj` metadata via a dynamic, FK-graph-driven cascade (enumerated from `sys.foreign_keys`, SQL Server) instead of a hardcoded shortlist — so removing an app that has been _used_ no longer fails on a foreign-key violation (e.g. an orphaned `RecordChange`). It also deletes the app-owned `Application` rows declared in the app's own migrations (unioned with the existing link-based detection), preventing a `PK_Application_ID` collision when the app is reinstalled. PostgreSQL keeps its existing entity-layer teardown unchanged.
