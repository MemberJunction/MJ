---
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
---

Fix two integration-tier regressions that surfaced when merging the Query & Entity Materialization work into the test-coverage branch.

**`codegen-determinism.CD3` — stale generated field.** The generated `MJMaterializedResultEntity` carried a `SourceQuery` field, but the materialization migration removed the direct source-query columns in favor of a join table, so `vwMaterializedResults` (which the entity is generated from) exposes no `SourceQuery` — CD3 correctly flagged the generated schema key as having no live field. Removed the stale field from the generated ORM to match the live view. No runtime code read the property.

**`client-cache.C12` — Trust=0 client caching regressed.** The materialization work re-gated the smart-cache-check WRITE path from `param.CacheLocal` to `runViewCacheEligible`, which includes `IsServerCacheAllowedForEntity`. That term gates the SERVER cache (kept fresh by BaseEntity events), so it excludes Trust=0 / Record-Changes / caching-disabled entities. But the CLIENT cache writes each slot with a `maxUpdatedAt` stamp and DB-revalidates per request, so those entities are still safely client-cacheable when stamped — the shared gate over-tightened the client path. Added `runViewCacheEligibleForWrite`: on the trusting server it is exactly `runViewCacheEligible`; on a client it keeps the structural + materialized exclusions but drops the server Trust/event gate. The Fields-override `willCache` decision is unchanged.
