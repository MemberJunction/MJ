---
"@memberjunction/open-app-engine": minor
---

fix(open-app): regenerate spCreateOpenApp/spUpdateOpenApp with @Subpath on SQL Server (#2998)

The v5.43.x SQL Server migration `V202606260000__OpenApp_Subpath.sql` added the `__mj.OpenApp.Subpath` column but — unlike its Postgres twin — did not insert the `EntityField` metadata or regenerate the CRUD sprocs. Once `Subpath` is in the OpenApp metadata, the SQL Server provider emits `EXEC spCreateOpenApp … @Subpath = …` and the deployed proc (pre-Subpath) rejects the parameter, rolling back every OpenApp create — notably `mj app install` (`RecordInstallationAtomically`).

Adds a self-contained follow-up migration (`V202606302331__v5.44.x__OpenApp_Subpath_Regenerate_Sprocs.sql`) that inserts the `Subpath` `EntityField` (idempotent; reuses the PG twin's field UUID for SS/PG parity) and regenerates `spCreateOpenApp`/`spUpdateOpenApp` with `@Subpath` in the current CodeGen shape. SQL-Server-only (the PG twin already ships all parts); no column DDL, no base-view regen.
