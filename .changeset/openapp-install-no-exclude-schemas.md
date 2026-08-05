---
"@memberjunction/open-app-engine": patch
---

fix(open-app): stop the installer silently disabling CodeGen entity registration for an app's schema.

`mj app install` / `mj app upgrade` wrote the app's `manifest.schema.name` into the host's CodeGen `excludeSchemas` on every run. That flag gates **three** independent things, not one: entity **discovery** (`createNewEntities` → `createExcludeTablesAndSchemasFilter`), SQL ownership (base views + CRUD procs, `sql_codegen.ts`), and TS/GraphQL/Angular emission (`runCodeGen.ts`). Only the third is what an installed app needs suppressed, and the `entityPackageName` mapping the installer already writes does exactly that on its own.

The consequence was silent and total for any app following the documented contract (README "Migration Content": ship raw DDL, *"MJ's CodeGen handles those automatically after entity registration"*): `mj app install` succeeded, `mj codegen` succeeded, and the app ended up with its tables present and **zero entities** — no error at any step. It also re-armed, so a host that removed the line by hand got it back on the next upgrade.

Whether an app manages its own entity metadata is now **detected** rather than assumed: after migrations run, the installer counts the app schema's rows in `__mj.Entity`. Rows present means the app's own migrations seeded them, so the schema stays excluded; zero means nothing registered them, so the schema is removed from `excludeSchemas` and the host's CodeGen registers them. An optional `schema.selfManagedMetadata` manifest field overrides the probe in either direction, and when the probe cannot run the installer changes nothing and warns rather than guessing.

Detection rather than a manifest default is load-bearing. Every Open App published to date predates the field, and the first-party apps split both ways: `mj-bizapps-common`, `-forms` and `-tasks` all seed their own rows (`INSERT INTO [__mj].Entity` in their baseline) while declaring nothing, whereas `mj-bizapps-caliber` seeds none. Any fixed default silently gets one group wrong — a `false` default would have un-excluded the three self-seeding apps on their next upgrade and handed the host's CodeGen co-ownership of entity metadata they already own.

On the host-CodeGen path the installer actively **removes** the schema from `excludeSchemas`, so hosts already broken by an earlier installer version heal on the next install or upgrade rather than staying broken.

The original justification for the write (app-owned `flyway_schema_history` being adopted as an entity) was already covered independently: CodeGen's default `excludeTables` has carried `{ schema: '%', table: 'flyway_schema_history' }` since well before it landed. Note that `excludeTables` **replaces** rather than merges on override, so a host that defines its own `excludeTables` should keep that entry.

Three further conditions were needed before the default path is actually correct, each of which otherwise reproduced the original "app has tables and no entities" symptom by a different route:

- **`includeSchemas` hosts.** That key is an opt-in POSITIVE scope which CodeGen resolves into `excludeSchemas` by excluding every schema it does not name — so clearing `excludeSchemas` alone still leaves the app's schema excluded. The installer now also names the schema in that list (and drops it again for a self-managed app). It never creates the key and never writes into an empty one: an absent or empty include list means "no scope in force", and populating it would scope CodeGen to that single schema and silently drop every other schema the host owns.
- **PostgreSQL casing.** PG folds unquoted DDL identifiers to lowercase, so the physical schema is `__mj_bizappscaliber` while the manifest says `__mj_BizAppsCaliber`, and CodeGen's discovery filter compares with a case-sensitive SQL `<>` on PG. The config write now uses `Dialect.CanonicalSchemaName`, matching what the orchestrator already does when persisting `SchemaInfo`.
- **Shared schemas.** Un-excluding is a decision about the schema, not about one app. When another installed app declares the same schema `selfManagedMetadata: true`, the exclusion is kept, so install order no longer silently decides whether the host's CodeGen co-owns that app's tables. Mirrors the existing shared-aware `HandleAngularPrebundleExcludeRemoval`.

Because the default path *deletes* from the host's config rather than merely declining to write, the installer now emits a warning when it actually removed an entry, and the README and manifest JSDoc say so explicitly — the app author, not the host, is the authority on whether CodeGen owns the schema.

Fixes #3457.
