---
"@memberjunction/sql-converter": patch
"@memberjunction/cli": patch
---

Resolve `${mjSchema}` when converting migrations. `${flyway:defaultSchema}` (the app's own schema) was substituted but `${mjSchema}` (MJ core) was not, so the macro survived into the emitted `.pg.sql` and into the SQL `--bake-codegen` executes against the working database — failing with `relation "${mjSchema}.Entity" does not exist` and halting the entire bake chain at the first migration that referenced core. Adds a `coreSchema` option to `convertMigration` and `IncrementalBaker`, plus a `--core-schema` CLI flag (default `__mj`). The two are deliberately separate values: an Open App names itself with `${flyway:defaultSchema}` and core with `${mjSchema}`, and for every app those differ.
