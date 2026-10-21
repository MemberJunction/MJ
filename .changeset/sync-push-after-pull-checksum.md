---
"@memberjunction/metadata-sync": patch
---

`mj sync push` straight after `mj sync pull` no longer reports every record as updated (#4530). Pull hashed a record's `sync.checksum` over `{ fields }` while push hashed the bare fields object, so the first push saw a mismatch on every record and rewrote it. Both now build the payload with `SyncEngine.BuildRecordChecksumPayload`: bare fields for a record with no composition axes, `{ fields, ...axes }` otherwise, with empty collections, embeds and extension omitted on both sides. Checksums in committed metadata already use this shape and do not change.
