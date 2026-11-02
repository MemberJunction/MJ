---
"@memberjunction/core": minor
---

RecordChange gets a covering index for the recycle-bin chip's deleted-record count (EntityID, Type, ChangedAt DESC, including RecordID), so the query every record open and grid render issues per entity seeks and reads the index instead of sorting every change ever recorded for that entity.
