---
"@memberjunction/ai-agents": patch
---

finishIf: a `finishIfMode` that is set but is not `off`, `shadow` or `on` (for example `"On"` or `"true"`) still turns the agent's gates off, but it now logs a warning naming the agent and the value it got. The warning is logged once per agent and value, not on every turn. Shadow mode after a sub-agent is now covered by a test.

Loop-agent decisions: decision requests held back until their step had run are now logged as skipped when the run is cancelled, or when an error is thrown out of the step loop, as well as when the step ends the run. Each held request is logged exactly once, and the log line says how the run ended. Nothing new is sent; this only makes the log complete.
