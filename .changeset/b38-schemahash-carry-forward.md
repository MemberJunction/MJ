---
"@memberjunction/core": patch
---

Fix B38: in-place cache maintenance no longer strips `schemaHash`, which had silently disabled schema-drift detection.

`UpsertSingleEntity`/`RemoveSingleEntity` rewrite a cached slot through `storeCachedResults`, which built a fresh payload carrying `results`, `maxUpdatedAt` and `totalRowCount` — but **not** `schemaHash`. Because `isSchemaStaleCacheEntry` short-circuits on a missing hash (`if (!data.schemaHash) return false`), a single save left that slot permanently unable to detect a post-migration column change. Reproduced: cold read → `1bd8ea31`; after one SAVE → `NONE`. Protection therefore covered only slots never written to.

Same class of omission as #3195, which fixed `totalRowCount` being lost on this exact write path.

The hash is **carried forward, not recomputed** — deliberately. Those rows were fetched under the *old* schema; stamping today's hash onto them would assert they match the current field list and mask the very drift the guard exists to catch. `schemaHash` is now surfaced on `CachedRunViewResult` so the maintenance path can forward it.

Guarded by `cache-gauntlet` CG6, which found the defect.
