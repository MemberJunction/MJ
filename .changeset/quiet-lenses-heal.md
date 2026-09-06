---
"@memberjunction/core": minor
"@memberjunction/codegen-lib": patch
---

Add optional `@IncludedSchemaNames` to CodeGen metadata-heal stored procedures so Open App migrations can positively scope heals without photographing sibling apps. Cascade-delete SQL is intra-schema only unless `allowCrossSchemaCascadeDeletes` is set. Custom-view `sp_refreshview` in the migration log honors `excludeSchemas` and, when set, `includeSchemas`.
