---
'@memberjunction/realtime-runtime': patch
'@memberjunction/server': patch
---

Retry a failed realtime recording shard upload under its own index instead of leaving a permanent gap (#5197). When the call ends, the retry queue is closed: retained shards are released and a flush still running stops sending, and the server refuses a shard for a session that already has its consolidated recording, so a late shard can no longer be left orphaned in storage.
