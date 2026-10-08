---
"@memberjunction/ai-anthropic": patch
---

Streamed Claude requests no longer fail with `max_tokens: Field required`.

The Anthropic driver built its streaming request separately from its non-streaming one, and the streaming copy sent no `max_tokens`, a field the API requires on every request. Explorer chat always streams, so every Claude chat in Explorer failed with "Unknown error", while CLI runs, which never stream, kept passing. Both paths now build their request in one place, so a streamed call also gets what the non-streaming path already sent:

- `max_tokens` defaults to 32,000, raised above the thinking budget when budget-form thinking is on.
- Budget-form models get the default thinking budget when an effort level is set without one, and a budget below the API minimum of 1,024 is raised to it instead of being sent and rejected.
- Every system message is sent, not just the first.
- Claude Opus 4.5 drops a caller's temperature while thinking, as the non-streaming path already did.

Streamed thinking is now captured: the driver looked for a top-level `thinking_delta` event that the SDK never emits, so thinking text was dropped. Both paths also honour `enableCaching: false`; the non-streaming path read `enableCaching || true`, which could never be false.
