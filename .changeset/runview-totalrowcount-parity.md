---
"@memberjunction/core": patch
---

Fix RunView `TotalRowCount` diverging between `count_only` and paginated reads. The local cache maintained `totalRowCount` as the size of the cached slice rather than the database total, so for a paginated / `MaxRows`-limited slot the total collapsed to the subset size after the first differential merge or in-place save/delete event. A fresh `count_only` read (never cached) then reported a larger count than a cached paginated read of the same entity. `ApplyDifferentialUpdate` now honors the server's authoritative row count, and the in-place upsert/remove path maintains the total across the row delta instead of dropping it.
