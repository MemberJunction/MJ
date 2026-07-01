---
"@memberjunction/ai-gemini": patch
---

fix(ai-gemini): EmbedTexts returns one vector per text (was collapsing the batch)

`GeminiEmbedding2.EmbedTexts` passed the whole `texts` array to `embedContent` as a single `contents` value. Because `gemini-embedding-2` is multimodal, Gemini fused the array into ONE blended vector (`response.embeddings.length === 1`) and the method silently returned that single vector for the whole batch — corrupting any consumer that pairs vectors to records by index (e.g. `EntityVectorSyncer`), which wrecks downstream semantic search/clustering. No error was thrown.

`EmbedTexts` now issues one `embedContent` call per text with bounded concurrency (max 4 in flight), preserving input order and returning exactly one vector per input text. A hard guard asserts `vectors.length === texts.length` and throws on mismatch so a collapse can never silently corrupt downstream storage. The existing error contract is preserved: on an API/embedding failure it returns an empty `vectors` array (matching the prior behavior and the other MJ embedding providers) rather than throwing, so batch pipelines degrade gracefully. The single-text `EmbedText` and multimodal `EmbedContent` paths are unchanged.
