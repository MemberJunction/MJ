---
"@memberjunction/ai-agents": patch
"@memberjunction/server": patch
---

A realtime recording whose end-of-call upload never arrived is now recovered from its crash-recovery shards. The session janitor finds closed sessions with a recording start but no recording file, rebuilds a `recording-recovered-<epoch ms>-<random hex>.wav` (a new name per attempt; missing shards filled with estimated silence), stamps it on the session unless the session already has a recording (re-checked just before the stamp; best effort, not a compare-and-set), and only then deletes the shards. Shards written before this change carry no rate in their name; on storage that keeps no content type (Box) their rate is inferred from shard size. One session's recovery is abandoned after 10 minutes, so a storage call that never answers cannot stop later recoveries.
