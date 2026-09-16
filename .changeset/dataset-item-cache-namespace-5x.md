---
'@memberjunction/core': patch
'@memberjunction/generic-database-provider': patch
---

A cached dataset no longer serves rows that an ordinary read left behind, including rows deleted since.

`GetDatasetByName` caches each dataset item's rows through the same cache-key builder an ordinary `RunView` uses, passing only the entity name and the item's `WhereClause`. Every shipped dataset item has a NULL `WhereClause`, so a dataset item and a plain unfiltered read of the same entity produced the identical key and silently shared one cache slot. Whichever ran first filled it, and the other was served those rows — observed as a cached `MJ_Metadata` dataset holding 51 `MJ: Query Entities` rows while the database held 48, because rows had been deleted after the slot was filled. Dataset items can also project a subset of columns (`DatasetItem.Columns`), where a `RunView` slot always holds the full field set, so the two are not interchangeable in shape either.

Each dataset item now has its own cache namespace (`<dataset>/<item code>`). The namespace is added only for dataset reads, so ordinary reads keep their exact previous key and no existing cache entry is invalidated.

Backported from the 6.x fix in #3425.
