---
"@memberjunction/ai-agents": minor
"@memberjunction/integration-test-suite": patch
---

Reload open sub-agent consults from `lastRunId` when an agent run resumes after a `Chat` step, raise an `MJ: AI Agent Requests` row at the root when a `Consult` sub-agent pairing exceeds its consult round limit and propagates `Chat`, and add the deterministic `agent-consult` integration test bundle.
