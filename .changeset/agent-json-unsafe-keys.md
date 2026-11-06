---
"@memberjunction/ai-agents": patch
---

Agent responses can no longer write to `Object.prototype`: `__proto__`, `constructor` and `prototype` keys are dropped when an agent's JSON reply is parsed and when PayloadManager applies a payload change request, merges or clones a payload.
