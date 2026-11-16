---
'@memberjunction/ai': patch
'@memberjunction/ai-anthropic': patch
'@memberjunction/ai-gemini': patch
'@memberjunction/ai-mistral': patch
'@memberjunction/ai-bedrock': patch
'@memberjunction/ai-ollama': patch
'@memberjunction/ai-lmstudio': patch
'@memberjunction/unit-testing': patch
---

`ChatResult` `finish_reason` now means the same on every driver (#4335): new `NormalizeFinishReason` maps Anthropic `end_turn`/`stop_sequence`, Gemini `STOP` and similar to `'stop'`, `max_tokens`/`MAX_TOKENS` to `'length'`, refusals and safety blocks to `'content_filter'` and `tool_use` to `'tool_calls'`; unknown values pass through. Anthropic (which reported `"completed"`), Gemini, Mistral, Bedrock, Ollama and LM Studio use it in streaming and non-streaming results. LM Studio streaming now reads the finished prediction's stats: a prediction LM Studio stopped or whose model it unloaded is a retriable failure instead of a truncated answer, and token counts come from the stats; non-streaming also fails on `modelUnloaded` (#5651). The tool-calling conformance kit drops its `OrdinaryFinishReason` knob and expects `'stop'`.
