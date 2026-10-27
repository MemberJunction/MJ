---
"@memberjunction/ai-agents": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/ai-gemini": patch
"@memberjunction/ai-reranker": patch
---

Run conversation naming in parallel with `RunAgent` on new conversations (the generated name is saved after the run's own writes, also when the run fails, unless the conversation was renamed meanwhile), and skip new-conversation artifact scans and redundant `ConversationDetail` reloads in `AgentRunner.RunAgentInConversation`. On `Default` and fallback model selection, an `AIPromptModel` row's `VendorID` now picks which vendor serves its model when that vendor has credentials (a runtime vendor override still wins), without changing which model the ranking selects; its `EffortLevel` and `PromptConfigurationObject` go to the candidates the row describes. Every runner (prompt, decision, embedding, image, media, reranker) selects this way, so the vendor no longer depends on whether failover is on. Failover follows the same rule: on reaching a model it starts on the row's vendor and then tries that model's other vendors, so within the default 3-call budget it more often stays on the same model across vendors; with every vendor keyed, the 2nd call's model differs from before on 3 of 22 shipped Default-strategy prompts and the 3rd call's on 11. `GeminiLLM` merges `modelSpecificResponseFormat` options alongside the `JSON` response format, and a rejected `thinkingConfig` carried that way is replaced on later calls like an effort-level one.
