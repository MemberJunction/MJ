---
'@memberjunction/codegen-lib': patch
---

Preserve external-data-source entities through CodeGen's metadata management.

External-data-source entities (`Entity.ExternalDataSourceID` set) have no physical MJ table or view — their data is proxied live from a remote system — so CodeGen's `manage-metadata` pass would otherwise treat them as orphaned and prune them on every run, and never provision their fields. These guards are added, each the analogue of an existing `VirtualEntity` exclusion (found and fixed via an end-to-end CodeGen run against a live external source):

- **Entity pruning:** `checkAndRemoveMetadataForDeletedTables` skips entities whose `ExternalDataSourceID` is set via a single, dialect-agnostic code guard (the analogue of the `VirtualEntity` exclusion, kept in code rather than the per-dialect filter so it applies uniformly to SQL Server and PostgreSQL). Such entities always appear in `vwEntitiesWithMissingBaseTables` (no base table in `INFORMATION_SCHEMA`). The guard alone was firing as a no-op because that view is a `SELECT e.*` whose cached column list predated `ExternalDataSourceID` — so the v5.42 migration **recreates `vwEntitiesWithMissingBaseTables`** (re-expanding `*`) solely to re-expose the column to the guard. The view stays semantically unchanged — a pure "missing base table" detector — and the exclusion lives only in the code guard, not duplicated in the view.
- **Field pruning:** the `spDeleteUnneededEntityFields` stored proc (re-created in the v5.42 migration) excludes external-data-source entities, so their `EntityField` rows aren't deleted for being absent from the SQL catalog (`vwSQLColumnsAndEntityFields`).
- **Field provisioning:** `manageExternalEntities` now refreshes the in-memory metadata cache before syncing fields. Without it, `EntityByName()` returned null for entities created/seeded after CodeGen's startup load and field sync was silently skipped — so external entities never got their introspected fields. This mirrors the existing refresh for config-created virtual entities.
- **System-column ensuring:** `ensureCreatedAtUpdatedAtFieldsExist` skips external entities — they have no physical base table to add `__mj_CreatedAt/UpdatedAt/DeletedAt` columns to.

The create-new-fields-from-schema and `spUpdateExistingEntityFieldsFromSchema` paths are unaffected — they INNER JOIN to the SQL catalog, which yields no rows for external entities.
