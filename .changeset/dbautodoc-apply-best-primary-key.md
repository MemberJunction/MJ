---
"@memberjunction/db-auto-doc": patch
---

Discovery applies one primary key per table (#6004): the best non-rejected candidate at or above
the confidence floor, instead of flagging the columns of every candidate above it (which produced
the union of two candidates' columns). Primary-key pruning now re-applies the flags afterwards, so
a candidate it rejected no longer keeps its columns flagged.
