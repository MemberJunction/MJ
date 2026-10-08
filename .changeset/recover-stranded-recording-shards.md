---
"@memberjunction/ai-agents": patch
"@memberjunction/server": patch
---

A realtime recording whose end-of-call upload never arrived is now recovered from its crash-recovery shards. The session janitor finds closed sessions with a recording start but no recording file, rebuilds a `recording-recovered.wav` (missing shards filled with estimated silence), stamps it on the session, and only then deletes the shards.
