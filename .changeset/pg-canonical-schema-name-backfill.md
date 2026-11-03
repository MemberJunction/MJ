---
"@memberjunction/codegen-lib": patch
---

CodeGen backfills a NULL SchemaInfo.CanonicalSchemaName from installed Open Apps and from a new `canonicalSchemaNames` map in mj.config.cjs, so schemas that are not Open Apps keep their class-name casing on PostgreSQL.
