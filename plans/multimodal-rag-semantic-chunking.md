# Multimodal Embeddings & Semantic Chunking for MJ RAG — Design + Implementation (v3)

**Status:** Segmentation framework implemented; multimodal ingestion still proposed
**Audience:** dray / topher / amith
**Date:** 2026-07-26

> **v3** adds an adversarial review of the v2 proposal and ships the first workstream as code.
> **v2** refocused from `EntityVectorSyncer` onto the ContentAutotagging pipeline.
> **v1** was the original research pass.
>
> Paper-specific figures (≈32s effective video window, 3072-dim vectors, modality-aware hard
> negatives) come from the discussion thread, not from machine-extracted text — the PDF could not be
> parsed in the authoring environment. Treat them as design inputs, not quotes.

---

## 1. What shipped in this PR

A new package, **`@memberjunction/ai-segmentation`** — segmentation as a registered, swappable
strategy, the same way `BaseEmbeddings` and `VectorDBBase` already work for providers.

| Piece | What it does |
|---|---|
| `BaseSegmenter` | Template-method base. Subclasses implement **one** method (`SegmentCore`); the base handles validation, the token ceiling, undersized merging, sequence numbering, parent remapping, cycle-safe depth, provenance. |
| `StructuralTextSegmenter` | Markdown/HTML heading structure → sections with real hierarchy. The text default. |
| `SemanticTextSegmenter` | LLM topic boundaries via `AIPromptRunner` (tracked `MJ: AI Prompt Run`), degrading to structural on any failure. |
| `TranscriptSegmenter` | Timed cues → AV **chapters** with `StartMs`/`EndMs`, optional per-speaker sub-chapters, carrying media **and** transcript. |
| `FixedWindowSegmenter` | Universal fallback: token windows for text, duration windows for untranscribed media. |
| `ResolveSegmenter` / `SuggestSegmenterKey` | Metadata-driven selection that degrades instead of throwing on a stale config key. |

Plus **two real bug fixes in `TextChunker`** (see §2.3) and a test suite covering all of it.

### Layering — and why a new package

```
@memberjunction/ai-vectors        TextChunker   — "split this string to fit a budget"
        ▲ uses
@memberjunction/ai-segmentation   BaseSegmenter — "what are the meaningful units of this content"
        ▲ consumed by
   ingestion pipelines (content autotagging, vector sync, knowledge pipeline)
```

Segmentation deliberately does **not** live in `ai-vectors`: `ai-prompts → templates →
ai-provider-bundle → ai-vectors-pinecone → ai-vectors`, so `ai-vectors` importing `ai-prompts` is a
genuine cycle. Putting segmentation one layer up means the LLM segmenter can use `AIPromptRunner`
directly — versioned prompt metadata, real cost/token attribution — instead of an injected callback
that would have thrown all of that away. It also keeps segmentation reusable: had it gone inside
ContentAutotagging, `ai-vector-sync` could not have used it without depending on the autotagger.

---

## 2. Retrospective review of the v2 proposal

Reviewed as a colleague's work. The core thesis held up — the autotagger *is* the right pathway, the
seams *are* where v2 said they were, and the four-warning framing maps cleanly onto real code. The
findings below are what did not survive scrutiny.

### 2.1 🟡 Dual representation is one vector, not two — but v2's "hybrid for free" claim doesn't hold

An earlier revision of this review claimed dual representation forced two vectors per chunk and
therefore broke #3275's Chunk-Identity Contract. **That misread the intent.** The design is:

- **one vector per media chunk** — the *native* multimodal vector, and only that;
- the LLM **`Description`/`Transcript` stored as text columns on the chunk row**, hydrated at
  retrieval so an agent has something readable;
- optionally **mirrored into the vector record's metadata** for display/filtering.

That keeps `VectorRecordID` 1:1 and leaves #3275's contract, soft-delete, and purge untouched. It is
simpler than what this review originally proposed, and it is the right default.

What *does* survive is narrower and worth stating, because v2 asserts it explicitly:

> "**also** embed the LLM `Description` as text into the text index → AV becomes discoverable by cheap
> text-to-text + keyword/FTS ('hybrid retrieval for free')"

With no description vector, that sentence is wrong — there is no free text-to-text recall path to a
video chunk. A text query reaches media only via:

1. **native text→media similarity** in the multimodal index — which is precisely the leg the paper
   warns runs colder than text→text, and
2. **lexical matching over the description**, which only exists if that column is actually indexed for
   search. Vector-DB metadata does **not** provide this: metadata is filter/payload, not ranked
   full-text, and it is size-capped per provider (MJ already truncates metadata text to 1000 chars in
   `buildVectorMetadata`, so a full transcript does not belong there).

So the concrete follow-through is: **index `Description`/`Transcript` lexically** — trivial in the
colocated pgvector/SQL2025 path, which already fuses a `tsvector` with the vector via RRF in one
statement, and otherwise via `FullTextSearch`. An optional description *vector* stays available as a
per-corpus opt-in where text→media recall proves too weak, rather than a default that doubles cost.

### 2.2 🟠 "Only two seams must change" was optimistic

v2's closing reassurance names `buildChunksForBatch` and the `EmbedTexts` call. The real list is
larger, and v2 itself lists some of these elsewhere without reconciling them against the claim:

- `groupItemsByInfrastructure` must key on modality (v2 says so at 4C.6 — contradicting its own summary)
- the empty-`.Text` skip at `VectorizeContentItems:1474`
- `AIModelRunner` needs a content path (`RunEmbedding` only knows `EmbedTexts`)
- `Text NOT NULL` on the chunk table
- **`DetectVectorDuplicates` is a second, unmentioned `EmbedTexts` caller** (`AutotagBaseEngine.ts:2474`).
  Any change to how items are embedded has to consider dedup, which v2 never mentions.

Call it five or six seams. Still tractable, but "two" would have set the wrong expectation in planning.

### 2.3 🔴 The proposal wanted to persist offsets that were being computed wrong

v2's §4A proposes `StartOffset`/`EndOffset` columns "already produced by `TextChunker`". They were
produced — incorrectly. `buildChunkFromUnits` resolved a chunk's start with
`originalText.indexOf(units[0])`, always searching from position 0, so any **repeated** sentence
(boilerplate, a recurring header, "Thank you.") made later chunks report the offsets of the *first*
occurrence. Demonstrated on an 86-character document: a chunk truly spanning 61–86 reported **0–86**.

Persisting that as provenance would have silently corrupted the link from a search hit back to its
source passage — the exact thing the column exists to provide. Fixed in this PR with a single
forward-cursor pass (also O(n) instead of O(n²)), with regression tests.

A second latent bug surfaced while testing: `chunkByFixed` could **never terminate** when
`OverlapTokens ≥ MaxChunkTokens`, because the start cursor moved backwards each iteration. Fixed by
capping overlap at half the window *and* guaranteeing forward progress. Both fixes are in
`TextChunker`, independent of anything multimodal.

### 2.4 🟡 v2 missed the second chunking site's purpose

v2 correctly identifies two chunk sites but proposes replacing both with the segmenter. They serve
different masters: `buildEmbeddingChunks` sizes for the **embedding model** (7500 tokens), while
`chunkExtractedText` sizes for the **LLM context window** (`InputTokenLimit / 1.5`) and its output is
never persisted. Unifying them behind one strategy is right; unifying their *budgets* is not. The
`SegmentationOptions.MaxSegmentTokens` knob keeps them independent — worth stating explicitly so
nobody "simplifies" them into one call later.

### 2.5 🟡 Editorial defects

Section 4C is numbered 1, 2, 3, 4, 6, 7 — item **5 is orphaned below a summary paragraph** that was
inserted mid-list. Minor, but it's the section a reader most needs to follow in order.

### 2.6 ✅ What held up

- The pipeline refocus (autotagger, not `EntityVectorSyncer`) — correct, and the reasoning is sound:
  a templated entity record rarely exceeds one chunk.
- `Text NOT NULL` as the concrete blocker for media segments — verified against the generated ORM
  (`get Text(): string`, not `string | null`).
- Reusing `Content Items`/`Content Item Chunks` rather than forking a media-asset hierarchy.
- The observation that downstream machinery keys off `VectorRecordID` rather than `Text`, so purge and
  lifecycle carry over to media largely unchanged.
- Identifying MJ's realtime session capture (speaker + timings per turn) as the AV transcript
  substrate — `TranscriptSegmenter` consumes exactly that cue shape.

---

## 3. Where the autotagger stands

Unchanged by this PR, and stated precisely (from source):

- **Extraction**: `pdf-parse` / `officeparser` / `cheerio` inside the engine; `parseFileFromPath`
  supports **only** pdf/docx and throws otherwise. Extension-based, no MIME sniffing. No media decoders.
- **Embedding chunk**: `buildEmbeddingChunks` concatenates `Name\nDescription\nText`, returns one
  chunk under `MAX_EMBEDDING_TOKENS` (7500) — so today chunking fires only on very long items.
- **Embedding**: `vectorizeGroup` → `AIModelRunner.RunEmbedding({ Texts })` → `EmbedTexts`
  (`AIModelRunner.ts:131`). `EmbedContent` from #2834 still has **no ingestion caller**.
- **Chunk lifecycle**: purge-safe vector ids, `replaceContentItemChunks`, `PurgeDeletedChunks`,
  status columns, rate limiters. Solid; reuse as-is.

### Why this PR does not modify `AutotagBaseEngine`

Deliberate. #3275 is actively rewriting `buildChunksForBatch`, the config resolution, and the chunk
lifecycle in that exact file; a competing edit would hand topher a painful merge for no benefit,
because without the schema (§4) a segment's modality and time window would be flattened back to plain
text on write. The framework is independently useful and fully tested now; the integration lands with
the schema, on top of #3275 rather than against it.

---

## 4. Remaining roadmap

**4A — Chunk schema** (fold into #3275, one migration): `Modality`, `StartMs`/`EndMs`,
`StartOffset`/`EndOffset`, `PageNumber`, `Description`, `Transcript`, `SegmentTitle`,
`ParentChunkID`, and **relax `Text` to nullable**. `VectorRecordID` stays a single column —
one chunk, one vector (§2.1) — with `Description`/`Transcript` as text hydrated at retrieval and
optionally mirrored (truncated) into vector metadata. Add lexical indexing over
`Description`/`Transcript` so a text query can reach a media chunk without a description vector.

**4B — Autotagger integration**: ✅ **done (behaviour-preserving).** `buildEmbeddingChunks` and
`chunkExtractedText` now both resolve a segmenter through a shared `segmentTextForChunking` seam,
defaulting to `FixedWindow` with each site's historical budget, with `resolveSegmenterKey()` as the
override point. Remaining: resolve the key from the `Content Source`/`Content Type` `Configuration`
JSON (needs a `SegmenterKey` field + CodeGen) and persist segment metadata into the 4A columns.

**4C — Multimodal embedding**: media-aware extraction → `MediaReference`; a content path on
`AIModelRunner` calling `EmbedContent`; a dedicated multimodal `VectorIndex`; group by
`(model, index, modality)`; un-skip empty-`.Text` items; fix #2834's silent error-swallow
(`EmbedResult` should extend `BaseResult`) so a paid AV embed can't store `[]` and be marked Complete.
Don't forget `DetectVectorDuplicates` (§2.2).

**4D — Modality-aware retrieval**: per-index top-k merged via RRF (rank-based, so scale-free), rerank
over `Description`/`Transcript`, `filterByModality` on `SearchResultSetToolLibrary`, time-windowed
playback deep-links.

**4E — Cost & portability**: isolated multimodal index, resumable/bounded backfills, a cost pre-flight
dry-run before any full-archive embed. Log every cap — never truncate silently.

**Price transcript-only ingestion first.** For speech-dominant archives — conference sessions,
webinars, podcasts — the transcript carries nearly all retrievable meaning; the pixels add little.
Transcript-derived text chapters with time windows give full text→text semantics, hybrid FTS, and
reranking at **zero multimodal embedding spend** (the cost of ASR alone). That may deliver most of
"dead archive → searchable" without a multimodal index at all. The native vector earns its place when
visuals carry meaning the words don't: slide diagrams, product demos, image libraries. Measure the
delta on a representative corpus before committing to the index topology in 4C.

**Sequencing**: 4A → 4B (immediate text-quality win, no media yet) → 4C image-first → 4C AV via
`TranscriptSegmenter` → 4D → 4E.

---

## 5. Open questions

1. ~~**Text→media recall**~~ — **decided.** Ship native similarity + **lexical** indexing of
   `Description`/`Transcript`; treat a description vector as a per-corpus opt-in added only after
   measurement shows paraphrase misses. Lexical and text→text fail in opposite directions, and lexical
   covers the queries archives actually receive (speaker names, session titles, acronyms) nearly for
   free in the colocated pgvector/SQL2025 path. When a description vector is warranted, add it as a
   **sibling text chunk row** pointing at the media chunk — preserving one vector per row — and
   collapse on the parent key after fusion. *Cost correction: the summary embed is a rounding error
   next to the video embed; a description vector doubles vector rows, not spend. Its real cost is
   schema and retrieval complexity.*
2. ~~**Metadata payload**~~ — **decided.** Mirror a **short summary plus structured fields**
   (`SegmentTitle`, `StartMs`/`EndMs`, `Speaker`, `Modality`, `PageNumber`) — structured fields are
   worth more than prose there because they are filterable. Full transcript stays on the chunk row;
   metadata is size-capped and is filter/payload, not ranked full-text.
3. **Semantic segmentation budget** — LLM boundary pass per document, or gate to high-value corpora
   with `StructuralText` as the default? (Current default already skips docs under 750 tokens.)
4. **Provider commitment** — Gemini Embedding 2 (3072-dim, multimodal, non-portable) as AV default,
   Cohere Embed v4 for image/text? Worth pricing a representative archive before fixing index topology.
5. **`RunEmbedding` shape** — add a `Content` mode to `EmbeddingRunParams`, or a separate
   `RunContentEmbedding`? Affects `AIPromptRun` tracking uniformity.
6. **Reranker default for mixed modality** — keep Noop + opt-in, or default a cross-encoder whenever a
   scope spans more than one modality?
