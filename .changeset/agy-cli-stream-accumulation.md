---
"@memberjunction/ai-agent-harness": patch
---

Accumulate streamed `step_update.agent_response` chunks in `AntigravityCliAdapter` so final turn responses are preserved when the terminal `result.response` field is empty.
