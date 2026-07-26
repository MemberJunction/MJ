---
"@memberjunction/content-autotagging": minor
---

Route both autotag chunking sites through the pluggable segmentation layer (`@memberjunction/ai-segmentation`).

`buildEmbeddingChunks` and `chunkExtractedText` previously each called `TextChunker` directly with their own inline parameters. Both now resolve a segmenter via `ResolveSegmenter` and go through a single shared `segmentTextForChunking` seam.

**Behavior is unchanged.** The strategy defaults to `FixedWindow` with the same token budgets, overlap, and sentence strategy each site used before, and both keep their short-circuit that passes already-fitting text through verbatim. This is a refactor that makes the strategy swappable, not a change to how content is chunked.

- New `protected resolveSegmenterKey()` is the extension point — override it (or, once the config field lands, resolve it from the Content Source / Content Type `Configuration`) to opt into `StructuralText`, `SemanticText`, or `Transcript` segmentation.
- New `protected segmentTextForChunking()` runs the resolved strategy and returns null on failure so each caller keeps its own fallback rather than silently embedding nothing.
- The two sites deliberately keep **separate token budgets** — embedding chunks are sized to the embedding model (7500 tokens) and persisted; tagging chunks are sized to the LLM context window (`InputTokenLimit / 1.5`) and transient. They share a strategy, not a budget.

`chunkExtractedText` is now `async` (it was synchronous). It is public, so this is a signature change, though the only callers in the repo are its own tests.
