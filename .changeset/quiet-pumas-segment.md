---
"@memberjunction/ai-segmentation": minor
"@memberjunction/ai-vectors": patch
---

Add `@memberjunction/ai-segmentation` — pluggable content segmentation for RAG ingestion, and fix two latent bugs in `TextChunker`.

**New package `@memberjunction/ai-segmentation`** turns chunking into a registered, swappable strategy resolved through the MJ class factory, the same way `BaseEmbeddings` and `VectorDBBase` providers already work. `BaseSegmenter` is a template-method base: a new strategy implements one method (`SegmentCore`) and the base handles validation, the token ceiling (splitting oversized segments while preserving titles and rebasing offsets), undersized merging, sequence numbering, `ParentIndex` → `ParentSequence` remapping after splits, cycle-safe depth, and provenance stamping. Ships four segmenters:

- `StructuralText` — markdown/HTML heading structure → sections with real parent/child hierarchy; the recommended text default.
- `SemanticText` — LLM topic boundaries via `AIPromptRunner` (a tracked `MJ: AI Prompt Run`), skipping the call for short documents and degrading to `StructuralText` on any failure.
- `Transcript` — timed cues → audio/video **chapters** with `StartMs`/`EndMs`, optional per-speaker sub-chapters, each carrying a media reference *and* the transcript text.
- `FixedWindow` — universal fallback: token windows for text, duration windows for untranscribed media.

The package sits above `@memberjunction/ai-prompts` so the LLM segmenter can use real, versioned prompt metadata with cost attribution; `ai-vectors` cannot depend on `ai-prompts` (`ai-prompts → templates → ai-provider-bundle → ai-vectors-pinecone → ai-vectors` is circular).

**`@memberjunction/ai-vectors` — `TextChunker` fixes** (no API change):

- **Chunk offsets were wrong for repeated text.** `buildChunkFromUnits` resolved each chunk's start with `indexOf` from position 0, so any recurring sentence (boilerplate, a repeated header) made later chunks report the *first* occurrence — a chunk truly spanning offsets 61–86 reported 0–86. Offsets are chunk provenance, so this silently corrupted the link from a search hit back to its source passage. Now resolved with a single forward-cursor pass, which is also O(n) instead of O(n²).
- **`chunkByFixed` could never terminate** when `OverlapTokens >= MaxChunkTokens`, because the start cursor moved backwards each iteration. Overlap is now capped at half the window and the loop guarantees forward progress.
