---
"@memberjunction/generic-database-provider": patch
---

`RunViewsWithCacheCheck` sends only the changed rows (`differential`) to a client whose cached copy of a change-tracked entity is older than the server's cached copy, instead of the full cached result. Entities without record-change tracking still get the full cached copy.
