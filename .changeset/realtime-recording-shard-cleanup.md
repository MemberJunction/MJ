---
"@memberjunction/ai-agents": patch
---

Realtime call recordings: the crash-recovery `seg-*` shards are now actually deleted once the consolidated recording is stored. `DeleteRealtimeRecordingSegments` listed the session folder without a trailing slash, so delimiter-based storage drivers (S3, Google Cloud Storage) returned the folder as a common prefix and no objects, and every shard was left behind with nothing logged.
