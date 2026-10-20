---
"@memberjunction/content-autotagging": patch
---

`FieldPathResolver` no longer reports a record as missing just because an engine cache predates it.

`loadRowsByPK` consulted `BaseEngineRegistry` first and returned that answer whole whenever any engine cached the entity. But the registry hands back a FILTERED SUBSET, so a key the cache had never heard of came back as an empty result — indistinguishable from "no such row" — and the `PK IN (...)` RunView that would have found it was never reached.

A `BaseEngine` full-set cache is complete only as of the moment it loaded. It refreshes on local entity saves, but unless Redis cross-server cache sync is configured, nothing tells it about a row another PROCESS inserted, so on any deployment that writes through a second process (a worker, an importer, a sibling API instance) every record created after the reader booted resolved to nothing for that process's lifetime.

That is not a cosmetic miss. This resolver feeds `VectorDBBase.GetSourceRecordFieldPaths`, whose values route a record to its tenant partition, and a driver that requires one is entitled to fail closed when it is absent — so the symptom is a total, silent refusal to write, reported as though the related record did not exist. Seen in production: a content source created after the vectorization worker booted left every one of its items unembeddable, with a correct row in the database the whole time.

- A cache hit is now authoritative only for the keys it actually produced; the rest are queried. The fast path is unchanged when the cache covers the batch, so a cold row costs one extra `IN (...)` rather than a full reload.
- Keys are taken from what the cache produced, not from the row count, so a cached row with an unreadable PK counts as a miss instead of suppressing the query for a key nothing resolved.
- When that query fails, whatever the cache did serve still resolves; `null` stays reserved for "nothing to offer at all", which is what the caller turns into a failed load.

`AutotagBaseEngine` also reloads the KnowledgeHub cache once when a pass references a content source or content type the cache lacks. Unblocking the namespace was not enough on its own: the source row also carries the item's routing (its own embedding model + vector index) and its storage config (`VectorIDStrategy`, `ChunkTextStorage`, `VectorMetadata`, `VectorEntityName`), and read from the stale cache all of those silently fell back to the content type's values or the defaults, so the item would have been written into the wrong index with the wrong vector ids. Both ids are required foreign keys on the item, so a miss always means staleness. The check runs at every vectorization entry point (`VectorizeContentItems`, `PurgeDeletedChunks`, `EmbedPendingChunks`, vector dedup) and per batch of the tagging pass (the source's classification config, the type's model and tag limits). It is one batched, cache-bypassing `Config(true)`, paid only on a miss and at most once per call; a failed reload is logged and the pass carries on with the cache it has.
