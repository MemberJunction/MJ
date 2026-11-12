---
"@memberjunction/ai": minor
"@memberjunction/ai-groq": minor
"@memberjunction/ai-prompts": minor
"@memberjunction/ai-agents": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
---

Groq: recover a tool call from a `tool_use_failed` rejection instead of falling back to the envelope (#5847).

- Groq checks tool arguments against the declared schema and refuses a call whose types do not match (a boolean sent as the string "true"), although MJ's argument coercion would accept it. The Groq driver now reads the call out of the rejection's `failed_generation` (the Qwen `<function=…><parameter=…>` form and the JSON `{name, arguments}` form) and returns it as an ordinary tool-call result, when every call names a tool the request declared. Otherwise it rethrows as before.
- New optional `ChatResult.ToolCallsRecovered` flag marks such results.
- New `ToolCallingMode` value `'NativeRecovered'` on `MJ: AI Prompt Runs` and `MJ: AI Agent Run Steps` (migration + CodeGen). The prompt runner records it for a recovered hybrid `Native` turn; a `NativeImplicit` turn keeps its mode. Agent steps count tool calls on `NativeRecovered` turns.
