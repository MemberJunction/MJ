---
"@memberjunction/codegen-lib": patch
---

CodeGen backfills a NULL SchemaInfo.CanonicalSchemaName from installed Open Apps and from a new `canonicalSchemaNames` map in mj.config.cjs, so schemas that are not Open Apps keep their class-name casing on PostgreSQL. The logged UPDATE is keyed on `SchemaName`, so it matches on every database that runs the migration.
