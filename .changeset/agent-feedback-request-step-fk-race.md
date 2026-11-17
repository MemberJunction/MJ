---
"@memberjunction/ai-agents": patch
"@memberjunction/ai-core-plus": patch
---

Fix a race that could lose an agent's feedback request. Since agent run steps began saving without blocking the run, a root agent's Chat or Plan step could raise its `MJ: AI Agent Requests` row before the step's own INSERT had landed. The request has a foreign key to the step (`FK_AIAgentRequest_OriginatingStep`), so its save failed; the failure was logged and swallowed, and the run paused `AwaitingFeedback` with no request to answer or resume from. `createFeedbackRequest` now waits for the step's queued saves to settle first, through a new `AgentRunStepSaveQueue.Settled(step)`.
