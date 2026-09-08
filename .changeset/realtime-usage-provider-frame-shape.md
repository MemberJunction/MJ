---
"@memberjunction/ai": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ai-openai": patch
---

Fix realtime token usage being silently discarded for xAI Grok Voice sessions.

The two OpenAI-compatible realtime providers put the `response.done` usage payload in **different places**, verified by live wire capture:

- **OpenAI** (`gpt-realtime`) populates `response.usage` and sends no top-level `usage`.
- **xAI** (Grok Voice) populates a **top-level** `usage` and sends `response.usage` as an **empty object**.

Both readers in the codebase dereferenced `response.usage` only. For xAI that value is `{}` — which is truthy — so the `if (!usage) return` guard never fired. A usage event was emitted with `input_tokens`/`output_tokens` `undefined`, those clamped to `0` downstream, the host dropped the all-zero delta without arming its flush timer, and the session's tokens were never relayed. The result was `TokensPrompt`/`TokensCompletion`/`TokensUsed` sitting at NULL on `AIPromptRun` for every Grok Voice session — a silent accounting hole rather than a visible failure. The server-bridged path had the same read and would have recorded zeros.

Adds `ResolveResponseDoneUsage` to `@memberjunction/ai`, shared by the client-direct reader (`OpenAIProtocolRealtimeClient`) and the server-bridged driver (`OpenAIRealtime`) so the two paths cannot drift apart on this again. It prefers the nested payload whenever that carries real token counts — leaving OpenAI's behavior unchanged — and falls back to the top-level one, so xAI is captured now and nothing breaks if xAI later populates the nested slot. Crucially it rejects a payload with no numeric token fields, which is what closes the empty-object trap.

xAI's payload also carries per-modality detail (`text_tokens` / `audio_tokens` / `grok_tokens`), `output_audio_seconds` and `billable_audio_seconds`; these survive on the usage event's `Raw` field. Note `billable_audio_seconds` is **cumulative**, not a per-response delta, so it must not be summed if it is ever surfaced as one.

The existing xAI usage test passed throughout, because it asserted against a hand-written OpenAI-shaped frame — encoding the very assumption that was wrong. Tests now use frames copied from real captures of both providers.
