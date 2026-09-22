---
"@memberjunction/generic-database-provider": patch
"@memberjunction/metadata-sync": patch
---

SQL logging: let the caller supply schema→placeholder rules, so `formatAsMigration` produces a usable migration for an Open App.

Fixes [#3618](https://github.com/MemberJunction/MJ/issues/3618).

`formatAsMigration` could only ever emit one placeholder, `${flyway:defaultSchema}`, and `CreateSqlLogger` fed it the MJ **core** schema. In MJ's own repo that is correct — there, `${flyway:defaultSchema}` *is* `__mj`. In an Open App it is not: Skyway binds `${flyway:defaultSchema}` to the **app** schema and `${mjSchema}` to core, so every captured core CRUD call was redirected into the app schema (`EXEC [${flyway:defaultSchema}].spUpdateSchemaInfo` → a procedure that does not exist on a host, failing at the first statement), while the app's own schema was hardcoded literally.

- **`SqlLoggingOptions.schemaPlaceholders`** accepts the same `{ schema, placeholder }[]` array CodeGen already reads from `SQLOutput.schemaPlaceholders` in `mj.config.cjs`. When it is absent the single-schema `defaultSchemaName` → `${flyway:defaultSchema}` behaviour is unchanged, so MJ's own capture is byte-identical.
- Rules apply in **one pass**, alternation ordered longest-schema-first. A generic rule (`__mj`) therefore cannot eat the prefix of a specific one (`__mj_BizAppsAccounting`) in either declared order, and an emitted placeholder is never re-matched by a later rule — the ordering hazard the app configs currently guard against by hand-written comment. Schema names are regex-escaped and the matcher is compiled once per session.
- **`SqlLoggingOptions.escapeFlywaySyntax`** exposes the string-literal `${...}` escaping independently of `formatAsMigration`. Apps that disabled `formatAsMigration` to work around the schema bug were silently losing that protection too.
- **MetadataSync** push and watch resolve the array from `sqlLogging.schemaPlaceholders` in `.mj-sync.json`, else `SQLOutput.schemaPlaceholders` from `mj.config.cjs`. Every affected app already declares the correct array for CodeGen, so the fix reaches them with **no new configuration** — re-enabling `formatAsMigration: true` is the whole app-side change, and the manual post-edit of generated SQL at release time goes away.
