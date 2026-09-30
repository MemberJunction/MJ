---
"@memberjunction/ai-agents": patch
---

finishIf: a `finishIfMode` that is set but is not `off`, `shadow` or `on` (for example `"On"` or `"true"`) still turns the agent's gates off, but it now logs a warning naming the agent and the value it got. The warning is logged once per agent and value, not on every turn. Shadow mode after a sub-agent is now covered by a test.
