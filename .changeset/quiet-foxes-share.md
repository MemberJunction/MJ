---
"@memberjunction/ng-conversations": patch
---

Fix stale collection contents after removing an artifact: read collection membership from the join entity directly instead of via a subquery, so the per-entity RunView cache invalidates correctly on add/remove.
