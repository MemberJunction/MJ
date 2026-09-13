---
"@memberjunction/core": patch
---

Restore the local metadata cache, which has silently not been written since 6.1.0-edge.3.

`BaseInfo.toJSON` serializes a `_`-prefixed backing field through its public getter, and since edge.3 it prefers the PascalCase getter name. That newly reaches `QueryInfo.CategoryPath`, which walks `CategoryInfo` → `Metadata.Provider.QueryCategories`. During the initial metadata load the global provider is not assigned yet, so the getter throws, `JSON.stringify` of the whole `AllMetadata` snapshot aborts, and `SaveLocalMetadataToStorage` drops the snapshot. Nothing fails visibly; every process boot (server and browser) re-reads all metadata from the database.

Two guards, each with its own regression test:

- `BaseInfo.toJSON` now omits a key whose getter throws instead of aborting the serialization. The method's own contract already says computed getters can throw when their sources are not ready; the value is recomputed lazily on the next access.
- `SaveLocalMetadataToStorage` now writes the payload first and the timestamps last. Previously the timestamps were written before the payload, so a failed save left the cache claiming freshness with no payload behind it, and `LocalMetadataObsolete()` never asked for a retry. With the timestamps last, a failed payload write leaves the previous timestamps in place and the next boot retries.
