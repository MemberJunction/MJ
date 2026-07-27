---
"@memberjunction/integration-engine": patch
"@memberjunction/schema-engine": patch
---

fix(integration): apply-phase correctness — identity, completeness, and record-map durability

Defects in the sync apply phase, all of which corrupt data rather than fail loudly.

- **Content-unchanged records skipped their tombstone repair.** A record marked deleted in MJ but alive again externally hashes identical on every subsequent sync, so it never reached the sync-state repair and stayed tombstoned permanently. The early return now runs the repair before returning.

- **Record-map loads stopped at the entity row cap.** `RunView` without `MaxRows` is not unbounded — it falls back to `UserViewMaxRows` (1000 by default). The orphan sweep silently stopped cleaning past row 1000, and worse, the full-push path read a missing mapping as "never pushed" and re-created records that already existed in the external system. `LoadAllRecordMaps` now walks the map with `AfterKey` keyset paging ordered by `ID` with `IgnoreMaxRows`, bounded by a `MAX_PAGES` backstop, and reports a `Complete` flag; callers that did not get the whole map refuse to act on it rather than acting on a partial one. Keyset rather than `StartRow` because OFFSET paging skips rows on PostgreSQL, where `gen_random_uuid()` primary keys are random rather than monotonic and concurrent inserts can land before the cursor.

- **Identity was decided by two competing rules.** The entity primary key (soft PKs included) is now the single definition of record identity for both matching and saving. `IsKeyField` remains a fallback lookup for records whose mapped data does not carry the PK, and is no longer AND-ed on as an additional constraint when a complete PK is present.

- **Record-map writes were one statement pair per record on the hot path.** The new `RecordMapBatch` chunks them into a single dialect-portable `SELECT … UNION ALL` upsert. Because a batched write cannot report which row failed, it reads the chunk back and attributes every missing or mismatched mapping to its own external ID; a chunk that throws replays row by row, so no failure is swallowed into a batch-level error. `Queue()` deliberately does not auto-flush on a full chunk — it is called from inside the apply pass's batch transaction, where a flush would write map rows that `Discard()` could no longer take back on rollback and that the read-back would "verify" while reading uncommitted state through the same connection. The apply loop flushes once per batch, after commit.

- **Identity lookups were one query per record.** They are now prefetched per field-set group. The batched path indexes external IDs both exactly and collation-folded (lowercased, trailing blanks stripped), because the single-query path let SQL Server compare — case-insensitive and trailing-blank-insensitive under a default collation — while pairing rows in JavaScript with `===` would read `AB-100 ` against a stored `ab-100` as unmapped and create a duplicate record. A folded key that more than one distinct mapping collapses onto is marked ambiguous and deferred to the per-record query rather than guessed at, as is an ID that was never in the batch's `IN (…)` list. Absence is only ever concluded from a read that can prove it.

- **`verifyChunk` used its own escaping.** It hand-rolled `replace(/'/g, "''")` while the write path used `Dialect.QuoteStringLiteral` — two subtly different rules for the same values. Both use the dialect now.

- **Batch sizes are configurable and clamped.** `MJ_INTEGRATION_RECORD_MAP_CHUNK_SIZE` (default 500, ceiling 5,000 — the upsert inlines one `SELECT` per mapping, so the generated SQL grows linearly with the chunk) and `MJ_INTEGRATION_RECORD_MAP_PAGE_SIZE` (default 10,000, ceiling 50,000). Out-of-range values are clamped with a logged warning rather than accepted.

Also: a schema pipeline whose migration already committed is never retried, so a retry cannot re-run a committed install step.
