---
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
---

A recorded UPDATE now carries only the fields the save changed, so replaying a Metadata_Sync migration no longer resets the target row's other columns.

Metadata_Sync migrations are SQL logs of `mj sync push`. The logged form of an update passed every column of the row as it stood in the recording database, even though the push had changed one field. Replayed on a deployment, it overwrote every setting that deployment had tuned on that MJ-owned row. `V202609221852__v6.2.x__Metadata_Sync.sql` changed only `AllowUserSearchAPI` on `MJ: Content Items`, and its replay also reset a consumer's `TrustServerCacheCompletely = 0`. With the cache back on, that consumer's content-vectorizing worker re-read a cached list of pending items and re-embedded the same batch for hours. The same migration rewrote 18 entity rows and 2 entity-field rows in full.

- **New hook `GenericDatabaseProvider.RenderReplayUpdateSQL(binding, entity, changedFieldValues)`.** It mirrors the create-side `RenderReplaySaveSQL` (#4503) and receives only the parameters whose fields are dirty. The default returns `undefined`, so dialects without an override (PostgreSQL) log exactly what they logged before.
- **SQL Server overrides it.** The logged update is `EXEC spUpdate<Entity>` with the changed fields plus the primary key. The update procs keep any column whose parameter is not passed (`ISNULL(@p, [Col])`), which is the same contract not-loaded fields already rely on.
  - A field changed to NULL keeps its `_Clear` companion.
  - The replay form reuses the save's variable suffix, so it never consumes an extra `TransactionGroup` ordinal.
  - A save whose changes touch no proc parameter is logged as a SQL comment, because there is nothing to replay.
  - An entity with a hand-written update proc (`spUpdateGenerated` off) keeps the full-row form, because nothing promises that proc keeps unpassed columns.
- **A forced save keeps the full-row form.** A save with `IgnoreDirtyState` (MetadataSync's `alwaysPush`) asked to re-impose the whole row, so its recording still does.
- **The executed SQL is unchanged.** Execution still passes every column. Only the log form changed, and only for loggers that write the record-change-free form (`logRecordChangeMetadata` not `true`).

Behaviour note: a recording now re-imposes only the values that MJ changed. A value MJ did not change, even one that differs on a consumer, is no longer written by the replay. Migrations published before this change still contain full-row updates, so consumers that tune MJ-owned rows should keep re-applying those settings after migrating.
