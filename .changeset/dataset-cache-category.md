---
"@memberjunction/core": patch
"@memberjunction/redis-provider": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/integration-test-suite": patch
---

Give the dataset cache one category, so its warm-serve path works again

Six functions on `ProviderBase` touch the dataset cache and only the warm read in
`GetAndCacheDatasetByName` named a category (`'DatasetCache'`); the write and the other four readers
passed none and so landed in `default`. Every storage provider isolates by category — Redis keys are
`{prefix}:{category}:{key}`, browser localStorage `[mj]:[category]:[key]`, IndexedDB a dedicated
object store — so the read looked in a namespace nothing wrote to and missed on every transport since
`987a126aab` (2026-05-02). The fallback refetched and rewrote the cache, so the system was slow rather
than wrong, which is why it went unnoticed: nothing asserted that a second call did not hit the server.

All six now share `ProviderBase.DatasetCacheCategory`, which also makes
`mj cache clear --category DatasetCache` honest — it previously reported a successful clear of 0 keys
while the dataset sat in `default`. Dataset keys an older build left there are still swept by a full
clear, so no migration is needed. Expiry is unchanged: `CacheDataset` already passed explicit TTLs,
and a per-write TTL wins over any category setting.

Fixing the category switches on a freshness comparison that had not run in five months, and the two
copies of it had drifted: the warm path dereferenced `cachedDataset.Results` unguarded, so a cached
blob without `Results` threw instead of refetching — on the metadata bootstrap path. Both paths now
call one `DatasetRowCountsMatch`, preserving the two behaviours that matter: a status with no
per-entity counts is judged on its timestamp alone (returning false there makes such a dataset
permanently stale), and a missing blob with counts to compare means refetch.

Also widens `CacheDataset`'s `itemFilters` to optional on `ProviderBase`, `Metadata` and
`IMetadataProvider`, matching every sibling method and the implementation's own handling of a falsy
value, and adds integration check `dataset-cache.DS4`, which distinguishes a warm call that was served
from one that silently refetched — something DS1 through DS3 could not do.
