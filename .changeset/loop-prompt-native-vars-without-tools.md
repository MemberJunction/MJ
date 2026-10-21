---
"@memberjunction/ai-prompts": patch
---

A Loop agent run that declares no tools renders its system prompt again. The Loop system prompt reads `_NATIVE_TOOL_CALLING` and `_NATIVE_CONTROL_FLOW` on its first line, so template parameter extraction marks both required, but `AIPromptRunner` set them only when tools were declared, and every such run failed with "Parameter _NATIVE_TOOL_CALLING is required". The runner now sets both on every hierarchical run, to the envelope path's values (`false`, `'envelope'`) when no tools are declared and the caller supplied none.
