---
"@memberjunction/core-entities": minor
"@memberjunction/ng-shared-generic": patch
"@memberjunction/ng-search": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/integration-test-suite": patch
---

`UserInfoEngine` no longer caches `MJ: User Record Logs`. A row in that table is written every time a user opens a record, which makes it a poor fit for an engine cache. On the server the engine loaded every user's logs with no filter. So every record open became an in-memory update and a cross-server publish on every MJAPI, and the logs grew without bound in each process's memory. Nothing on the server read them. The entity also ships with `TrustServerCacheCompletely = false`, so it was the one engine config the periodic engine sweep queried on a stock installation.

- **New:** `UserInfoEngine.LoadRecentRecordLogs(maxItems, contextUser?, provider?)` queries a user's logs, newest first, limited to `maxItems`. It does not need `Config()` to have run. It returns `[]` when there is no user, and when the query fails (the error is logged).
- **Removed:** the `UserRecordLogs` getter and `GetRecentRecordsForEntity()`. Nothing in MJ called `GetRecentRecordsForEntity()`. Callers of `UserRecordLogs` move to `await LoadRecentRecordLogs(n)`.
- **Callers updated:** `RecentAccessService.LoadRecentItems`, the omnibar's `#` empty state, `SearchService.GetRecentlyOpenedRecords` and the Data Explorer's recent records now query on demand. Each passes its own provider. "Recents" now costs one small indexed query when it is shown, instead of a cache read.
- **22 log, run and audit entities no longer take part in caching** (`AllowCaching = false` in `metadata/entities/.audit-related-entities.json`). They were marked `TrustServerCacheCompletely = false`, which kept them out of the server RunView cache, but every save still went through the cache machinery. These tables are written constantly and read with filters that any write invalidates, so caching them costs work on every write and almost never hits. `AllowCaching = false` says "don't cache this" directly and skips that work. Their `TrustServerCacheCompletely` values are unchanged. `MJ: Record Changes` keeps `AllowCaching` as it was. `MJ: Action Execution Logs` is not changed here.
- **Integration checks S25 and C12** used `MJ: Audit Logs` as their example of a cacheable but untrusted entity. They now enable `AllowCaching` on the test process's in-memory metadata for their own duration and restore it, so they still exercise the trust branch. Nothing is written to the database.
