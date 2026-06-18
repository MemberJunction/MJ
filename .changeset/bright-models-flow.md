---
"@memberjunction/ai-prompts": patch
---

Fix model vendor driver resolution by threading full ModelSelectionResult through the execution pipeline instead of discarding and re-deriving vendor data at the ExecutePrompt → executeSinglePrompt boundary
