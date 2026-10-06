---
"@memberjunction/search-engine": patch
---

`SearchParams.Audience` lets a caller name the other people who will see a search's results. When set, the engine runs its permission safety net once for the caller and once per reader (in parallel) and keeps only the results every reader may read, so a shared conversation's results are the intersection of what its participants may see. The audience is part of the result-cache key, so a search the caller ran alone is never served to a room, nor the reverse. Two limits fail closed: `storage-file` results are refused under an audience (their permissions are evaluated for the caller only), and a reader passed without `UserRoles` reads nothing. Nothing changes for callers that pass no audience.
