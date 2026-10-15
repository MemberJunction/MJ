---
"@memberjunction/ai-agents": patch
"@memberjunction/server": patch
---

Recover lost realtime recordings from existing raw PCM shards after a closed-session grace period. Preserve recordings written by another attempt, verify the stamp before deleting assembled shards, and bound recovery memory, retries, hung storage calls, and shutdown waits.
