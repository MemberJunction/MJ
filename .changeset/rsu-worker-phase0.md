---
"@memberjunction/schema-engine": patch
---

RSU worker-mode foundation (Phase 0 — zero default-behavior change). Fixes a fail-**open** hazard in `RuntimeSchemaManager.acquireDBLock`: when the DB lock is enabled (`RSU_DB_LOCK_ENABLED=1`), a lock-acquire failure for any reason other than "another instance holds it" previously returned "acquired" and let RSU run with only the per-process mutex — unsafe in a multi-instance deployment. It now fails **closed** (throws `RSUError('LOCK_ERROR')`); the legacy fail-open behavior is opt-in via `RSU_DB_LOCK_LENIENT=1`.

Ships (unused by default) the RSU worker foundation tables (`__mj.RSUJob`, `RSUSchemaState`, `RSUPendingWork`, `RSUAdditionalSchemaInfo`) on both SQL Server and PostgreSQL, plus the `plans/rsu-worker-container.md` design for the optional out-of-process RSU worker. In-process RSU remains the default; nothing reads the new tables yet.
