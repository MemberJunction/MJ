---
"@memberjunction/ai-prompts": patch
"@memberjunction/content-pipeline": patch
---

Add native multimodal content embedding support (`Contents?: ChatMessageContent[]`) to `AIEmbeddingRunner` via `BaseEmbeddings.EmbedContent` (with bounded concurrency, per-attempt abort propagation, output dimensions, catalog prefix handling, and prompt-run tracking), and add `HasMediaInput` / `ResolveEmbedContent` hooks to `EmbedStage` so video, image, and audio chunks can embed natively alongside text chunks in the same routed vector index.

Note: `EmbeddingRunParams.Texts` is now optional (`Texts?: string[]`) to allow mutually exclusive `Texts` or `Contents` inputs; downstream TypeScript code reading `params.Texts` under strict null checks should guard with `params.Texts ?? []`.
