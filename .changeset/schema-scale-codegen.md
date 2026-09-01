---
"@memberjunction/codegen-lib": patch
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
"@memberjunction/server": patch
---

CodeGen treats schema as the incremental unit at 2,000+ entities: per-schema emit with write-if-changed and dirty-schema regen, `'schema.table'` exclude strings, schema-parallel file generation, incremental `tsc` on core-entities and server, hydrate-by-schema catalog projections, and `schemaOutput` routing so brownfield/demo schemas do not land in published packages. BigSchemaDemo is the droppable test bed.
