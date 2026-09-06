---
'@memberjunction/integration-engine': patch
---

fix(integration-engine): PrefetchContentHashes must bypass the RunView cache. Every apply batch's ID set is a unique fingerprint, so the existence-check query can never be a cache hit — without BypassCache each call only deposits a dead cache entry and the RunView cache grows O(records processed) for the life of the process; a large drain (500k+ records) walks the sync host into the kernel OOM kill line through exactly this path. Same point-in-time-read reasoning as LoadAllRecordMaps' existing BypassCache.
