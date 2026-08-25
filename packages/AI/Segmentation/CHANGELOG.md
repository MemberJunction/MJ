# @memberjunction/ai-segmentation

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [199eb2b]
- Updated dependencies [e7f1f88]
- Updated dependencies [07cb22e]
- Updated dependencies [711c208]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [06ccfb2]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [8ec1515]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [d907a1b]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [9f6a53b]
- Updated dependencies [6d7d3da]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/aiengine@6.1.0-edge.3
  - @memberjunction/ai-core-plus@6.1.0-edge.3
  - @memberjunction/ai-prompts@6.1.0-edge.3
  - @memberjunction/ai-vectors@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [255d506]
- Updated dependencies [59def38]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [fccd0b2]
- Updated dependencies [9a29da4]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai-core-plus@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/aiengine@6.1.0-edge.2
  - @memberjunction/ai-prompts@6.1.0-edge.2
  - @memberjunction/ai-vectors@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/ai-core-plus@6.1.0-edge.1
  - @memberjunction/aiengine@6.1.0-edge.1
  - @memberjunction/ai-prompts@6.1.0-edge.1
  - @memberjunction/ai-vectors@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
- Updated dependencies [1100077]
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/aiengine@6.1.0-edge.0
  - @memberjunction/ai-core-plus@6.1.0-edge.0
  - @memberjunction/ai-prompts@6.1.0-edge.0
  - @memberjunction/ai-vectors@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ai-core-plus@6.0.0
  - @memberjunction/aiengine@6.0.0
  - @memberjunction/ai-prompts@6.0.0
  - @memberjunction/ai-vectors@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/ai-core-plus@5.51.0
  - @memberjunction/aiengine@5.51.0
  - @memberjunction/ai-prompts@5.51.0
  - @memberjunction/ai-vectors@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Minor Changes

- 0686d52: Add content cleaning, adaptive-boundary and paged segmentation, and chunk-aware external search mapping — all from PR review feedback.

  **Cleaning is now its own plug-in stage** (`@memberjunction/ai-segmentation`). Segmenting dirty content produces well-bounded garbage: navigation, sidebars, cookie banners, and advertising usually outweigh the article, and because that chrome repeats across every page of a site it yields many near-identical chunks that crowd out real answers.
  - `BaseContentCleaner` — resolved through the class factory like segmenters, via `ResolveContentCleaner` / `SuggestCleanerKey`.
  - `HtmlContentCleaner` (`Html`) — CSS-selector-driven extraction. `IncludeSelectors` is the high-leverage knob: naming the element that holds the content discards everything else without enumerating what to drop. `ExcludeSelectors` handles what survives inside it. An invalid selector is skipped rather than failing the clean, and if cleaning would remove everything the original is returned with a warning.
  - `PlainTextContentCleaner` (`PlainText`) — whitespace normalization and truncation, preserving the paragraph breaks segmenters use as boundaries.

  **`AdaptiveBoundarySegmenter` (`AdaptiveBoundary`)** targets a size and closes on the nearest natural break, escalating through boundary quality: paragraph → sentence → word → hard ceiling. Segment sizes vary on purpose — a slightly short segment ending at a paragraph beats an exactly-sized one ending mid-clause. It also declines to split when the whole text is only modestly over target, avoiding one full chunk plus a context-free runt. `TargetTokens` should be sized to your **queries**, not to the embedding model's context window, which is an upper bound rather than a goal.

  **`PagedContentSegmenter` (`PagedContent`)** emits one segment per page of a paginated source via the new `SegmentationParams.Pages`, preserving `PageNumber` for citation-grade provenance. A page may carry text, a rendered-page media reference, or both — the both case is what allows embedding a PDF page _as an image_ (preserving tables and charts that text extraction flattens) while its text rides along for lexical search. Pages carrying media are never merged, so their provenance stays true.

  **`@memberjunction/search-engine`** gains `ExternalHitMapper`, a shared field mapping now used by all four external providers (Azure AI Search, Elasticsearch, OpenSearch, Typesense) instead of four inline copies. It resolves snippets from `description` and `transcript` in addition to the conventional `content`/`body`/`text`, so a media chunk returns readable text rather than an empty snippet, and recovers chunk provenance (`chunkId`, `modality`, `startMs`/`endMs`, `pageNumber`) into the result's `RawMetadata` — which is what lets a hit deep-link to a moment in a recording or a page in a PDF. Field names are matched across camelCase, PascalCase, and snake_case, and numeric strings are coerced, since external indexes are populated outside MJ.

  Also fixes `BaseSegmenter` rejecting a params object that carried only `Pages`.

- 9efcfe6: Add `@memberjunction/ai-segmentation` — pluggable content segmentation for RAG ingestion, and fix two latent bugs in `TextChunker`.

  **New package `@memberjunction/ai-segmentation`** turns chunking into a registered, swappable strategy resolved through the MJ class factory, the same way `BaseEmbeddings` and `VectorDBBase` providers already work. `BaseSegmenter` is a template-method base: a new strategy implements one method (`SegmentCore`) and the base handles validation, the token ceiling (splitting oversized segments while preserving titles and rebasing offsets), undersized merging, sequence numbering, `ParentIndex` → `ParentSequence` remapping after splits, cycle-safe depth, and provenance stamping. Ships four segmenters:
  - `StructuralText` — markdown/HTML heading structure → sections with real parent/child hierarchy; the recommended text default.
  - `SemanticText` — LLM topic boundaries via `AIPromptRunner` (a tracked `MJ: AI Prompt Run`), skipping the call for short documents and degrading to `StructuralText` on any failure.
  - `Transcript` — timed cues → audio/video **chapters** with `StartMs`/`EndMs`, optional per-speaker sub-chapters, each carrying a media reference _and_ the transcript text.
  - `FixedWindow` — universal fallback: token windows for text, duration windows for untranscribed media.

  The package sits above `@memberjunction/ai-prompts` so the LLM segmenter can use real, versioned prompt metadata with cost attribution; `ai-vectors` cannot depend on `ai-prompts` (`ai-prompts → templates → ai-provider-bundle → ai-vectors-pinecone → ai-vectors` is circular).

  **`@memberjunction/ai-vectors` — `TextChunker` fixes** (no API change):
  - **Chunk offsets were wrong for repeated text.** `buildChunkFromUnits` resolved each chunk's start with `indexOf` from position 0, so any recurring sentence (boilerplate, a repeated header) made later chunks report the _first_ occurrence — a chunk truly spanning offsets 61–86 reported 0–86. Offsets are chunk provenance, so this silently corrupted the link from a search hit back to its source passage. Now resolved with a single forward-cursor pass, which is also O(n) instead of O(n²).
  - **`chunkByFixed` could never terminate** when `OverlapTokens >= MaxChunkTokens`, because the start cursor moved backwards each iteration. Overlap is now capped at half the window and the loop guarantees forward progress.

### Patch Changes

- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [deb02b4]
- Updated dependencies [9efcfe6]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ai-core-plus@5.50.0
  - @memberjunction/ai-prompts@5.50.0
  - @memberjunction/ai-vectors@5.50.0
  - @memberjunction/aiengine@5.50.0
  - @memberjunction/global@5.50.0
