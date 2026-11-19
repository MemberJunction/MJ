---
"@memberjunction/ai-prompts": patch
"@memberjunction/content-pipeline": patch
---

Add native multimodal content embedding support (`Contents?: ChatMessageContent[]`) to `AIEmbeddingRunner` via `BaseEmbeddings.EmbedContent` (with bounded concurrency, output dimensions, catalog prefix handling, and prompt-run tracking), and add `HasMediaInput` / `ResolveEmbedContent` hooks to `EmbedStage` so video, image, and audio chunks embed natively alongside text chunks in the same Content Pipeline finalize batch.
