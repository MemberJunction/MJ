---
"@memberjunction/search-engine": patch
---

`SearchParams.Audience` lets a caller name the other people who will see a search's results. When set, the engine runs its permission safety net (entity read, row filters, ownership) once for the caller and once per reader, concurrently, and keeps only the results every reader may read, so a shared conversation's results are the intersection of what its participants may see. The audience is part of the result-cache key, so a search the caller ran alone is never served to a room, nor the reverse. Nothing changes for callers that pass no audience.

Every reader must be a hydrated `UserInfo` with a non-empty `ID` and a `UserRoles` array. A malformed audience (`Readers` not an array, a `null` reader, a reader with no `ID` or no `UserRoles` array) fails the search with a "SearchEngine: invalid Audience" error instead of being skipped. `UserRoles: []` is legitimate and reads nothing.

Limits, matching the `SearchParams.Audience` docs and the Search Scopes guide:
- `storage-file` results are refused under an audience (their permissions are evaluated for the caller only).
- `streamSearch` `provider` events carry `results: []` under an audience (progress only); results reach the room through `fused`/`final`.
- Scope entitlement (`SearchScopePermission`), `ServerDerived` dimensions, scope `ExtraFilter`/`MetadataFilter` templates and vector push-down are evaluated for the caller only: hosts must check each reader's scope permission themselves.
- `SourceCounts` are counted before the permission and audience passes, so they reveal the caller's unfiltered reach.
- The result cache keys on reader IDs, so within its 30 s TTL a differently hydrated reader with the same `ID` gets the cached verdict.
