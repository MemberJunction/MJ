---
"@memberjunction/ai-agents": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/ai-gemini": patch
---

Run conversation naming in parallel with `RunAgent` on new conversations, skip new-conversation artifact scans and redundant `ConversationDetail` reloads in `AgentRunner.RunAgentInConversation`, preserve `AIPromptModel.VendorID`, `EffortLevel`, and `PromptConfigurationObject` across `Default` and fallback model-selection candidates in `BaseModelRunner`, and merge `modelSpecificResponseFormat` options alongside `JSON` and `Any` response formats in `GeminiLLM`.
