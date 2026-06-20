---
"@memberjunction/metadata-sync": patch
---

Batch the deletion-audit database lookups so a large `mj sync push` no longer appears to hang for tens of minutes.

- **FK reference scan (`DatabaseReferenceScanner.scanForReferences`)**: group records-to-delete by entity and issue one `RunView` per (target entity, referencing FK field) using a chunked `IN (...)` filter, instead of one serial query per (record × referencing field). Found rows are attributed back to the exact deleted record via the FK value (case-insensitive, to handle SQL Server upper / PostgreSQL lower GUIDs). Metadata membership is resolved via a precomputed O(1) `Set` rather than re-scanning every metadata record per reference.
- **Existence check (`DeletionAuditor.checkRecordExistence`)**: single-primary-key entities are resolved with batched `IN (...)` queries instead of one `loadEntity` round-trip per record; composite-key / unknown entities keep the per-record fallback. Safe defaults preserved — a record whose key can't be determined, or whose query fails, is treated as still-existing so a real delete is never silently skipped.
- The batched queries pass `IgnoreMaxRows: true` so a scan matching more rows than the referencing entity's `UserViewMaxRows` cap is not silently truncated (which would miss references).

No behavioral change to the audit output; tests added for both batched paths.
