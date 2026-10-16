---
"@memberjunction/ai-agents": patch
---

`ChatHandlingOption = 'Retry'` no longer ends the run. The loop re-prompts, a sub-agent's question reaches the parent as a sub-agent result, and repeated Chat is capped by the unproductive-retry limit.

