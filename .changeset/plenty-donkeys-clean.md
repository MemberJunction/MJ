---
"@memberjunction/ai-segmentation": minor
"@memberjunction/search-engine": minor
---

Add content cleaning, adaptive-boundary and paged segmentation, and chunk-aware external search mapping — all from PR review feedback.

**Cleaning is now its own plug-in stage** (`@memberjunction/ai-segmentation`). Segmenting dirty content produces well-bounded garbage: navigation, sidebars, cookie banners, and advertising usually outweigh the article, and because that chrome repeats across every page of a site it yields many near-identical chunks that crowd out real answers.

- `BaseContentCleaner` — resolved through the class factory like segmenters, via `ResolveContentCleaner` / `SuggestCleanerKey`.
- `HtmlContentCleaner` (`Html`) — CSS-selector-driven extraction. `IncludeSelectors` is the high-leverage knob: naming the element that holds the content discards everything else without enumerating what to drop. `ExcludeSelectors` handles what survives inside it. An invalid selector is skipped rather than failing the clean, and if cleaning would remove everything the original is returned with a warning.
- `PlainTextContentCleaner` (`PlainText`) — whitespace normalization and truncation, preserving the paragraph breaks segmenters use as boundaries.

**`AdaptiveBoundarySegmenter` (`AdaptiveBoundary`)** targets a size and closes on the nearest natural break, escalating through boundary quality: paragraph → sentence → word → hard ceiling. Segment sizes vary on purpose — a slightly short segment ending at a paragraph beats an exactly-sized one ending mid-clause. It also declines to split when the whole text is only modestly over target, avoiding one full chunk plus a context-free runt. `TargetTokens` should be sized to your **queries**, not to the embedding model's context window, which is an upper bound rather than a goal.

**`PagedContentSegmenter` (`PagedContent`)** emits one segment per page of a paginated source via the new `SegmentationParams.Pages`, preserving `PageNumber` for citation-grade provenance. A page may carry text, a rendered-page media reference, or both — the both case is what allows embedding a PDF page *as an image* (preserving tables and charts that text extraction flattens) while its text rides along for lexical search. Pages carrying media are never merged, so their provenance stays true.

**`@memberjunction/search-engine`** gains `ExternalHitMapper`, a shared field mapping now used by all four external providers (Azure AI Search, Elasticsearch, OpenSearch, Typesense) instead of four inline copies. It resolves snippets from `description` and `transcript` in addition to the conventional `content`/`body`/`text`, so a media chunk returns readable text rather than an empty snippet, and recovers chunk provenance (`chunkId`, `modality`, `startMs`/`endMs`, `pageNumber`) into the result's `RawMetadata` — which is what lets a hit deep-link to a moment in a recording or a page in a PDF. Field names are matched across camelCase, PascalCase, and snake_case, and numeric strings are coerced, since external indexes are populated outside MJ.

Also fixes `BaseSegmenter` rejecting a params object that carried only `Pages`.
