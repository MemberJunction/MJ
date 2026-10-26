---
"@memberjunction/ai-agents": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/ai-gemini": patch
---

Run conversation naming in parallel with `RunAgent` on new conversations (the generated name is saved after the run's own writes, also when the run fails), and skip new-conversation artifact scans and redundant `ConversationDetail` reloads in `AgentRunner.RunAgentInConversation`. `BaseModelRunner` keeps `AIPromptModel.VendorID` (as that model's first vendor; a runtime vendor override still wins), `EffortLevel`, and `PromptConfigurationObject` on `Default` and fallback model-selection candidates. `GeminiLLM` merges `modelSpecificResponseFormat` options alongside the `JSON` response format, and a rejected `thinkingConfig` carried that way is replaced on later calls like an effort-level one.
