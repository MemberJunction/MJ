---
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-prompts": minor
"@memberjunction/ai-agents": minor
---

A Loop agent's relocated specialization now renders with the same native tool-calling flags as the system prompt. The agent pre-renders a relocated child prompt into the trailing runtime-state message before a model is selected, so it rendered without `_NATIVE_TOOL_CALLING` / `_NATIVE_CONTROL_FLOW`, which the prompt runner sets from the selected model's tool-calling decision: a child prompt worded for the native or envelope path got the envelope wording while the system prompt got the native one. `AIPromptParams` gains an optional `OnTemplateDataFinalized` callback that the runner calls once the flags are set and before the prompt renders; the agent uses it to render the trailing message again and swaps it in when the text changed (keeping the first build if the re-render fails). A failover attempt whose decision differs still re-renders only the system prompt.
