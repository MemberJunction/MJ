---
"@memberjunction/core": patch
"@memberjunction/server": patch
---

The largest metadata dataset a tenant has can now be cached, instead of being declined on every boot.

The per-entry cache ceiling was a fixed 25% of the budget: 39 MB of the server's default 150 MB. A
dataset item larger than that was declined on every boot, so every read of that entity went to the
database. The server never passed `maxEntryPercentOfCache` to the cache, so no setting could raise it.

- **`maxEntryPercentOfCache` defaults to `'auto'`.** The ceiling is derived from the budget: all of it
  except a reserve for one entry, which is 75% today. A number is still an exact ceiling, stricter or
  looser, and `0` removes it.
- **A hard maximum clamps any setting**, so no entry can leave less free space than one eviction pass
  needs.
- **Eviction frees only the deficit**, not the whole size of the arriving entry. A large entry no
  longer empties most of the cache to make room that mostly already existed.
- **A declined entry is logged with what to change**: its size, the largest entry the cache can hold,
  the budget, and that every read goes to the database.
- **The server passes the setting through.** `cacheSettings.maxEntryPercentOfCache` in
  `mj.config.cjs` now reaches the cache, and the boot log prints the derived ceiling.

`LocalCacheManagerConfig.maxEntryPercentOfCache` is now `number | 'auto'`. Entries between 25% and 75% of the
budget are now kept in the cache where they used to be declined.
