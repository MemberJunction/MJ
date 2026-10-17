---
"@memberjunction/ai-agents": patch
"@memberjunction/server": patch
---

Export `CanAgentOwnSubAgentConsults` and `LoadOpenSubAgentConsults` from `@memberjunction/ai-agents` and update `RunAIAgentResolver.RunAIAgentFromConversationDetail` to chain chat-thread replies to a predecessor run paused on `FinalStep === 'Chat'` with open sub-agent consultations.
