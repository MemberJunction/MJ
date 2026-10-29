---
"@memberjunction/ai-agents": patch
"@memberjunction/server": patch
---

Realtime sessions without a co-agent prompt run now say why once, when the session is prepared (the co-agent has no active prompt, or a run save failed), and the usage, transcript and tool-turn relays log the missing prompt run once per session instead of on every delta.
