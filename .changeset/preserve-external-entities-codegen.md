---
'@memberjunction/codegen-lib': patch
---

Preserve external-data-source entities through CodeGen's metadata management.

External-data-source entities (`Entity.ExternalDataSourceID` set) have no physical MJ table or view — their data is proxied live from a remote system — so CodeGen's `manage-metadata` pass would otherwise treat them as orphaned and prune them on every run. Two guards are added, each the analogue of an existing `VirtualEntity` exclusion:

- **Entity pruning:** `checkAndRemoveMetadataForDeletedTables` now skips entities whose `ExternalDataSourceID` is set. Such entities always appear in `vwEntitiesWithMissingBaseTables` (no base table to match in `INFORMATION_SCHEMA`), and were previously deleted outright via `spDeleteEntityWithCoreDependencies`.
- **Field pruning:** the `spDeleteUnneededEntityFields` stored proc (re-created in a v5.42 migration) now excludes external-data-source entities, so their `EntityField` rows aren't deleted for being absent from the SQL catalog (`vwSQLColumnsAndEntityFields`).

The create-new-fields-from-schema and `spUpdateExistingEntityFieldsFromSchema` paths are unaffected — they INNER JOIN to the SQL catalog, which yields no rows for external entities.
