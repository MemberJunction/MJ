---
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agents": minor
---

Add `resumeRunId` support on sub-agent calls to resume a sub-agent that asked a question under `ChatHandlingOption = 'Consult'`, threading the prior run's `FinalPayload`, question, and parent answer into the resumed sub-agent run.
