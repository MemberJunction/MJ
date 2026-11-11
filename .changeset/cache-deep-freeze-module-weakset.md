---
"@memberjunction/core": patch
---

`LocalCacheManager` now tracks completed deep-freeze subtrees in a module-scoped `WeakSet` and traverses arrays/objects without allocating intermediate `Object.values()` arrays, making `ApplyDifferentialUpdate`, multi-fingerprint row upserts, and derived cache writes `O(1)` per already-frozen row while preserving shallow-freeze and partial-failure guarantees. Also includes `EntityUniqueKeys` in `ProviderBase.MetadataBuildItemCodes` following #6080 + #6316.
