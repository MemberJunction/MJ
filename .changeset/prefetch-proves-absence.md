---
"@memberjunction/integration-engine": patch
---

A batch that already proved a row absent no longer re-checks it per record.

Each apply batch queries the destination for the rows it is about to touch. `CreateRecord` then
asked again, one record at a time, with an `InnerLoad` — a `SELECT *` returning every column
including any `NVARCHAR(MAX)` — usually to discover the row is not there. On a first full sync that
is one wasted round trip per record.

The prefetch now also asks about create-path keys (the key the mapped fields carry, which is exactly
what `CreateRecord` was about to probe) and returns three separate facts: the stored content hashes,
the set of keys proven to EXIST, and whether the query covered every record in the batch. Presence is
tracked separately from hashes on purpose — a row can exist while carrying no hash, and conflating
the two would turn an update into a duplicate insert.

`CreateRecord` skips its existence load only when absence is proven: the batch covered every record
AND this key was missing from the result. A partial prefetch, a failed query, or a
destination-generated key all mean "unknown", and fall through to the load exactly as before.
