---
"@memberjunction/core": minor
"@memberjunction/geo-core": patch
"@memberjunction/core-actions": patch
"@memberjunction/core-entities": patch
"@memberjunction/server": patch
"@memberjunction/ng-core-entity-forms": patch
---

Geocoding efficiency + address-level dedup: new MJ: Geo Address Caches table shares geocoding results across records/entities (SHA-256 of normalized address, negative caching with TTL, writes gated on provider AllowsPersistentStorage ToS flag) with an in-run memo coalescing duplicate addresses. Scheduled Geocoding job now pushes its missing/stale filter into SQL (NOT EXISTS / __mj_UpdatedAt staleness sweep) instead of bulk-loading RecordGeoCode into memory, enumerates distinct entities via keyset seeks, fixes retry pagination drift, collapses the pending-row double save, and skips cache-invalidation reloads when no in-process cache consumer exists.
