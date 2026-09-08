---
"@memberjunction/integration-engine": patch
---

A row whose content hash goes stale is repaired once, instead of losing its fast path forever.

When a source stops sending a column, the mapper OMITS the absent key rather than mapping it to null
— a missing value is not a null value. The recomputed content hash therefore differs from the stored
one, so the hash fast path correctly does not skip. But `SetEntityFields` never touches that column
either, so the entity is not dirty and the unchanged-record skip fires instead — and that path never
refreshes the stored hash.

The mismatch was permanent. That row lost the content-hash fast path for good, paying a full load and
a field-by-field compare on every sync from then on, until some other field happened to change.

A stale hash now counts as sync state needing repair, alongside a tombstone or an error status: one
write brings the stored hash back in line with what is actually being mapped, and every later sync
skips the row cheaply again. It deliberately does not conclude the column is gone — absence in the
data is not evidence of absence in the schema, and the column's value is left exactly as it is.
