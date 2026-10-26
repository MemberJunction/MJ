---
"@memberjunction/ai-agents": patch
---

An agent's conversation response no longer stays "In-Progress" after the run finishes.

`AgentRunner.RunAgentInConversation` saves each progress message to the agent-response conversation detail, then writes the final status when the run ends. It waited for in-flight progress saves with `EnsureSaveComplete()`, which resolves on the entity's `save` event — and `BaseEntity` raises that event before the save finishes committing. A progress save still committing when the run ended was therefore in flight when the final update called `Save()`, and `BaseEntity.Save()` hands a concurrent caller the in-flight save's promise, so the final `Status`/`Message` were never written: the detail kept `Status: 'In-Progress'` and the last progress message. Progress saves now run one at a time on a promise chain that the final update awaits before saving; a failed progress save is logged and does not break the chain.
