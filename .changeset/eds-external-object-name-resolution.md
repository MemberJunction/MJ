---
"@memberjunction/external-data-sources": patch
"@memberjunction/codegen-lib": patch
---

Fix two External Data Sources read/codegen bugs.

External read paths now resolve the remote object name via a new per-driver `ResolveObjectName(entity)` method on `BaseExternalDataSourceDriver`. SQL drivers (`BaseSqlExternalDataSourceDriver`) schema-qualify a bare name with the entity's `SchemaName` so objects in a non-default schema (e.g. medallion bronze/silver/gold, or any multi-schema source) resolve correctly; non-SQL drivers (e.g. MongoDB) return the name verbatim as a literal collection. The read router (`ExternalDataSourceReadRouterImpl`) no longer schema-qualifies the name itself, so a schema-qualified name can never reach a driver that treats the name literally — fixing a case where a MongoDB collection read would target a non-existent `schema.collection`.

CodeGen entity-subclass generation now hoists and de-duplicates the base-class import (e.g. `ReadOnlyExternalBaseEntity`) into the file header once per file instead of once per entity, fixing a TS2300 duplicate-identifier error in generated files that contain 2+ external entities. The import is hoisted only for entities that actually emit a class (those with a primary key), so a skipped PK-less entity can't leave a dangling import.
