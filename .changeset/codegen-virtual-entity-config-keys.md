---
"@memberjunction/codegen-lib": patch
---

CodeGen applies the `PrimaryKey` and `ForeignKeys` declared on `VirtualEntities` entries in `additionalSchemaInfo`, and finishes a config-declared virtual entity in one run.

Before, only `PrimaryKey[0]` was used (composite keys collapsed to one column), `ForeignKeys` were parsed and dropped, and the entity never joined `NewEntityList`, so its keys, relationships, entity class and GraphQL type appeared only on a second run. Users worked around it with a duplicate schema-key table entry naming the view.

- New `applyVirtualEntitySoftKeys` applies `VirtualEntities` keys on every run, right after the view-column sync (view name as `TableName`, string `PrimaryKey` normalized). Relationships are rebuilt in the same run when a key changed. `applySoftPKFKConfig` keeps handling table entries only.
- `processVirtualEntityConfig` creates the entity with logged INSERT statements (fixed CodeGen-generated ID, `Description` kept) instead of the unlogged `spCreateVirtualEntity` call, so the CodeGen_Run capture replays on other databases; it registers the entity in `NewEntityList`; `SchemaName` defaults to `dbo` as documented (was the core schema).
- An `EntityName` already in use (compared without case) skips the entry with an error before anything is captured; a name derived from the view gets the `__<schema>` suffix, like table-backed entities.
- The soft key writer skips a configured column that does not exist instead of writing an UPDATE that matches no row, and clears `IsUnique` on the columns of a composite `VirtualEntities` key.
- `manageSingleVirtualEntity` no longer counts fields it just removed when it checks for a primary key, so a view without an `ID` column and without a configured key no longer aborts SQL generation. It matches view columns without case and sets the field name to the view's casing, so a key named in different case is not deleted and re-added.
- Docs: Method 2 SQL includes the required `@PrimaryKeyFieldName`; the config template names the schema explicitly.
