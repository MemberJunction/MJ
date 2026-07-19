---
"@memberjunction/core": patch
---

Fix: MaxRows-limited RunView results are no longer maintained in place by the local cache. A `MaxRows`/`StartRow` slot holds a truncated/offset SUBSET of the matching set, so upserting a saved row grew it past the caller's own row limit (a `MaxRows: 1` slot served 2, 3, 4 … rows) and removing a deleted row shrank it below. Such slots are now conservatively invalidated on save/delete — the same treatment filtered slots already receive — and repopulated from the database on the next read.
