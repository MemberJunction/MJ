---
"@memberjunction/server": patch
---

Streamed agent chunks no longer carry the whole agent run tree. Each chunk used to serialize every step's full prompt and conversation history, megabytes per token on the main thread, which stalled every request on the process (MJ #5510). A chunk now carries the run's `ID`, `ConversationDetailID` and `Agent`, the only run fields its consumers read. Progress events still carry the full run.
