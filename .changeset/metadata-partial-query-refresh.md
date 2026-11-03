---
'@memberjunction/core': patch
---

Metadata refresh: a change confined to the saved-query family (Queries, Query Fields, Query Entities, Query Parameters, Query Categories, Query Permissions, Query Dependencies, Query SQLs) now reloads only those MJ_Metadata items and swaps them into the existing metadata, instead of rebuilding all entity metadata. Agents that persist a query per step no longer trigger a full metadata reload per write. Any other change, a failed scoped read, or an explicit `Refresh()` still performs the full reload.
