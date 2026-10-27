---
'@memberjunction/metadata-sync': minor
'@memberjunction/generic-database-provider': minor
'@memberjunction/core-entities-server': minor
---

`mj sync push` writes SQL that works on any database, and handles deletes and `@file:` changes correctly.

- A value that came from an `@lookup`, as a primary key or a foreign key, is captured as a subquery on its natural key instead of this database's ID, so Metadata_Sync migrations update the right row everywhere (#5626, #3619).
- `--formatAsMigration` rewrites every schema declared in `schemaPlaceholders`, so Open App migrations call core procedures in the core schema (#3618).
- Deletes run in true dependency order regardless of file order, and a row a cascade already removed is skipped with a warning (#4935).
- `--incremental` notices when only an `@file:` target changed (#4190).
- A seed whose primary key misses but whose natural key matches an existing row fails with a message naming that row; the CodeGen-granted permission seeds are now keyed by natural key (#4400).
- Template parameter extraction never marks `_`-prefixed system variables as required (#5156).
