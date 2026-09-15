---
"@memberjunction/server": patch
"@memberjunction/sqlserver-dataprovider": patch
---

fix(server): correct the cache-refresh interval unit — the metadata cache was refreshing every ~50 hours instead of the configured 3 minutes. `databaseSettings.metadataCacheRefreshInterval` is milliseconds (default 180000 = 3 min), but MJServer passed it undivided into `SQLServerProviderConfigData`'s `checkRefreshIntervalSeconds` argument (seconds), and `SQLServerDataProvider` then scheduled `setInterval(RefreshIfNeeded, CheckRefreshIntervalSeconds * 1000)` → 180000 × 1000 ≈ 50 h, so the metadata cache effectively never auto-refreshed (the likely root cause of "stale metadata until MJAPI restart"). Fix (both required together): divide by 1000 at the two `MJServer/src/index.ts` call sites (matching the already-correct PostgreSQL siblings), and multiply `CheckRefreshIntervalSeconds` by 1000 where it is passed to `UserCache.Instance.Refresh` in `SQLServerDataProvider/src/config.ts` (that parameter is milliseconds) — otherwise fixing only the first half would make the user cache hammer the DB every 180 ms. After both, the metadata and user caches each refresh every 3 minutes, as configured.
