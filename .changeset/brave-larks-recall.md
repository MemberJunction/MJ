---
"@memberjunction/ai-agents": patch
---

Memory-writes hardening from live edge-case testing: cross-run dedupe narrowed to exact normalized restatements so corrections are never silently absorbed into a stale note (ADD-only-strict — paraphrase duplicates are consolidated by the Memory Manager's hardening dedupe); note injection now renders each note's recorded date so the memory policy's most-recent-wins tiebreaker is resolvable; loop-agent prompt instructs agents not to claim a memory was saved before its result message arrives. Note: the protected `MemoryWriteManager.queryVectorService` seam now returns the matched note's text.
