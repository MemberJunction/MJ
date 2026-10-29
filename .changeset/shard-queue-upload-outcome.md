---
"@memberjunction/realtime-runtime": patch
---

The recording shard queue is now told why an upload failed, not only that it did. Before, every failed shard upload was logged as `server refused the shard`, including a dropped network where the request never reached the server, so support chasing lost audio looked for a server rejection that never happened. The queue's upload now resolves the transport's `Acked`/`Refused`/`Retry` outcome: a network failure, 5xx or expired token is retried up to the attempts cap with a reason that does not read as a refusal, and a `Refused` shard (400, 403, 409, 410 or 413) is given up on after one attempt instead of three, since the transport documents a re-send as pointless. A refused shard still leaves the local store through the during-call store drain, which already deletes refused shards.
