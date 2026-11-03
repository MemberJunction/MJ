---
"@memberjunction/sql-converter": patch
"@memberjunction/sqlglot-ts": patch
"@memberjunction/cli": patch
---

`mj migrate convert --split` / `--bake-codegen`: Open App CodeGen metadata written against `${mjSchema}` (EntityField / Entity / ApplicationEntity UPDATEs, EntitySetting and GeneratedCode INSERTs) is recovered from the CodeGen block; a `vw…` view in a feature migration with no CodeGen banner and no CodeGen routines is treated as hand-written and transpiled; metadata DML dropped in statement mode outside an mj-sync log is a named `METADATA-DML-DROPPED` gap; CodeGen's core refresh calls (`spUpdateExistingEntitiesFromSchema` and siblings) convert to PostgreSQL calls, with `@IncludedSchemaNames` turned into an apply-time excluded list; each `sp_refreshview` is a named, non-blocking warning on both paths; and the bake runs the PostgreSQL field sync between apply and capture, baking `DefaultValue` changes into the file (#5550, #5551, #5919, #5649, #5650).
