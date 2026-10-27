---
"@memberjunction/ai-agents": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/ai-gemini": patch
---

Run conversation naming in parallel with `RunAgent` on new conversations (the generated name is saved after the run's own writes, also when the run fails, unless the conversation was renamed meanwhile), and skip new-conversation artifact scans and redundant `ConversationDetail` reloads in `AgentRunner.RunAgentInConversation`. On `Default` and fallback model selection, an `AIPromptModel` row's `VendorID` now picks which vendor serves its model when that vendor has credentials (a runtime vendor override still wins), without changing which model the ranking selects; its `EffortLevel` and `PromptConfigurationObject` go to the candidates the row describes. `GeminiLLM` merges `modelSpecificResponseFormat` options alongside the `JSON` response format, and a rejected `thinkingConfig` carried that way is replaced on later calls like an effort-level one.
