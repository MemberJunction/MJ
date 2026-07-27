---
"@memberjunction/codegen-lib": patch
---

Fix CodeGen for linked/co-generated Open Apps and add an opt-in `includeSchemas` scope.

- **Reverse-relationship emission is now gated on type availability, not schema/package heuristics.** A reverse-relationship (child-array) GraphQL field references the related entity's type by bare class name, so it is now emitted only when that type is actually resolvable in the generated file — i.e. the related entity's class is emitted inline in this run (`generatedEntityNames`), or it is a core (`__mj`) entity in a non-core file (reached via the `mj_core_schema_server_object_types.*` namespace import). This fixes the `TS2304: Cannot find name` build break that occurred when a base Open App was generated alongside a dependent app that foreign-keys into it (the base emitted fields typed with the dependent's classes, which its package cannot import), and it does so without dropping legitimate cross-schema relationships in a monolith, a multi-schema single app, or a single run that co-generates several apps into one file.

- **New opt-in `includeSchemas` config (positive scope).** When set, CodeGen processes only the listed schemas; it is resolved into `excludeSchemas` at a single point before the metadata and file-generation phases, so it is pure sugar over the existing exclude mechanism (in-scope ⇔ named in `includeSchemas` and not in `excludeSchemas`; no implicit includes — the core schema must be listed explicitly). Lets an Open App scope its CodeGen to its own schema without hand-maintaining an exclude list of every other installed app.
