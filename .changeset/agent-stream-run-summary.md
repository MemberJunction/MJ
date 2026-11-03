---
"@memberjunction/server": patch
---

A streamed agent chunk carries a run summary (ID, AgentID, Agent, ParentRunID, Status, ConversationID, ConversationDetailID) instead of the run's full values. The full values hold every step and prompt run, so a long run sent megabytes per chunk. Progress messages and the final result still carry the full run.
