---
"@memberjunction/codegen-lib": patch
---

CodeGen applies the `PrimaryKey` and `ForeignKeys` declared on `VirtualEntities` entries in `additionalSchemaInfo`, and finishes a config-declared virtual entity in one run.

Before, only `PrimaryKey[0]` was used (composite keys collapsed to one column), `ForeignKeys` were parsed and dropped, and the entity never joined `NewEntityList`, so its keys, relationships, entity class and GraphQL type appeared only on a second run. Users worked around it with a duplicate schema-key table entry naming the view.

- `applySoftPKFKConfig` now reads `VirtualEntities` entries as well (view name as `TableName`, string `PrimaryKey` normalized).
- `processVirtualEntityConfig` creates the entity with logged INSERT statements (fixed CodeGen-generated ID, `Description` kept) instead of the unlogged `spCreateVirtualEntity` call, so the CodeGen_Run capture replays on other databases; it registers the entity in `NewEntityList`; `SchemaName` defaults to `dbo` as documented (was the core schema).
- After the virtual-entity field sync, the configured keys are applied and relationships are built in the same run.
- `manageSingleVirtualEntity` no longer counts fields it just removed when it checks for a primary key, so a view without an `ID` column and without a configured key no longer aborts SQL generation.
- Docs: Method 2 SQL includes the required `@PrimaryKeyFieldName`; the config template names the schema explicitly.
