---
"@memberjunction/db-auto-doc": patch
---

Discovery applies one primary key per table instead of flagging the columns of every candidate above
the confidence floor, which produced the union of two candidates' columns. The key is the best
surviving candidate: not rejected, confirmed or at or above the floor, confirmed before unconfirmed,
then highest confidence. The flags are re-applied after primary-key pruning and after the LLM
confirms or proposes a key, so a candidate that lost or was rejected no longer keeps its columns
flagged, and a table whose candidates were all rejected ends with none.
