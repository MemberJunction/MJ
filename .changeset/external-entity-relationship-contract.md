---
'@memberjunction/core': patch
'@memberjunction/external-data-source-postgres': patch
'@memberjunction/external-data-source-mongodb': patch
'@memberjunction/external-data-source-snowflake': patch
'@memberjunction/codegen-lib': patch
---

External-schema introspection: relationships (foreign keys), PascalCase contract, and Postgres FK discovery.

- **Relationships seam** — `ExternalSchemaObject` gains an optional, additive `Relationships?: ExternalSchemaRelationship[]`: referencing-side foreign-key descriptors with composite-key support via `ExternalSchemaRelationshipColumn` (`Column` → `ReferencedColumn` pairings, plus `ReferencedObject` / `ReferencedSchema` / optional constraint `Name`).
- **PascalCase contract** — the whole introspection contract (`ExternalSchemaColumn` / `ExternalSchemaObject` / `ExternalSchemaDescriptor` / the new relationship types) now uses PascalCase members (`Name`, `NativeType`, `Nullable`, `IsPrimaryKey`, `Columns`, `Objects`, `Database`, …), matching MJ's convention for public/exported members (every other exported `@memberjunction/core` interface is PascalCase). The three shipped drivers and CodeGen's `manageExternalEntities` are updated accordingly; contained to the EDS subsystem.
- **Postgres FK introspection** — the PostgreSQL driver now populates `Relationships` from `information_schema` (referential_constraints + key_column_usage paired via the unique-constraint position, so composite keys map correctly). MongoDB has no foreign keys, and Snowflake's `INFORMATION_SCHEMA` does not expose them reliably, so those leave `Relationships` empty.
- **CodeGen FK consumption (baseline)** — `manageExternalEntities` now consumes the introspected `Relationships`: for each single-column FK whose referenced remote object is *also* an imported external entity in the same data source, it sets the FK field's `RelatedEntityID` + `RelatedEntityFieldName` + `IsSoftForeignKey`, then a second `manageEntityRelationships` pass materializes them into `EntityRelationship` records (the external FKs are processed after the main relationship pass, so they get their own). Composite FKs and references to non-imported objects are skipped with a log — that hardening is the follow-on. Verified end-to-end via CodeGen against a live Postgres source (an external `orders.customer_id → customers.id` FK becomes a Demo Customers → Demo Orders relationship). CodeGen also now loads the SQL Server / MySQL / Oracle driver packages so external entities backed by those sources can be introspected.
- **Connection model** — confirmed (and unit-tested) that a single driver instance holds one connection pool per configured data source (`Map<dataSourceId, pool>`), so any number of independent connections per driver type is supported.
