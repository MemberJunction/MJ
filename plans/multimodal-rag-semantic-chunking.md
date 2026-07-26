# Multimodal Embeddings & Semantic Chunking for MJ RAG — Proposal (v2)

**Status:** Draft for discussion (dray / topher / amith)
**Author:** Claude (research + design pass)
**Date:** 2026-07-26

> v2 reframes v1 after feedback: the **ContentAutotagging pipeline** — not `EntityVectorSyncer` — is
> the real ingestion pathway for unstructured content, and `MJ: Content Item Chunks` already ships
> there. Everything below is grounded in the actual autotagger source
> (`packages/ContentAutotagging/src/Engine/generic/AutotagBaseEngine.ts`, 2737 lines) and the in-flight
> chunk-lifecycle work in PR #3275.
>
> The paper PDF's full text couldn't be machine-extracted in this environment, so the paper-specific
> figures (1 FPS / 32-frame video window → ~32s embedding window, 3072-dim vectors, modality-aware hard
> negatives) come from the agent-thread summary and are treated as design inputs, not verified quotes.

---

## 1. Correction from v1 — which pipeline actually matters

MJ has **two** vectorization pathways; they are not equal for this work:

- **`EntityVectorSyncer`** (`@memberjunction/ai-vector-sync`) — takes **structured DB entity records**,
  renders an `EntityDocument` Nunjucks template per record → **one vector per record** (`Entity Record
  Documents`). Records rarely exceed one chunk, so semantic chunking here is **marginal**. *Not the target.*
  (A chunking config type exists but is unused; leave it — low value.)

- **`AutotagBaseEngine`** (`@memberjunction/content-autotagging`) — takes **unstructured content**
  (websites, cloud files, RSS, local files, entity content) → extracts text → **chunks** → embeds →
  stores vectors **and `Content Item Chunks` rows** → LLM-tags. **This is the pathway.** `Content Items`
  / `Content Item Chunks` already ship; PR #3275 (topher, open) is hardening its chunk lifecycle,
  config, dimensions, and purge. **All multimodal + semantic-chunking work belongs here.**

---

## 2. The autotagger today — exact seams (read from source)

**Orchestration:** GraphQL `RunAutotagPipeline` → the MJ Action `AutotagAndVectorizeContentAction`, which
runs **two decoupled phases**: (1) **tag** — `RunAutotagProviders` iterates each `ContentSourceType`
adapter's `Autotag(...)`; (2) **embed** — `RunDirectVectorization` loads `Content Items` where
`EmbeddingStatus='Pending'` and calls `VectorizeContentItems`. Tag and embed are independent passes over
the same `Content Items`.

**Tagging entry:** `ExtractTextAndProcessWithLLM(...)` (line 152) → per content item:
`buildProcessingParams` → `ProcessContentItemText`. (Tagging chunks are **not persisted** and chunks are
**not tagged individually** — tagging is at Content-Item level.)

**Text extraction (line ~14):** imports `pdf-parse` and `officeparser` directly — so **PDF and DOCX →
text happens inside this engine** (unlike the vector-core `TextExtractor`, which defers binary parsing to
callers). HTML/plain text handled too. **Only text-bearing formats are supported.**

**Two separate chunking sites, both text-only, both naive:**
1. **Tagging chunk** — `chunkExtractedText(text, tokenLimit)` (line 923) → `TextChunker.ChunkText` with a
   `fallbackChunkText` char-split (line 952). Feeds `promptAndRetrieveResultsFromLLM` (line 784).
2. **Embedding chunk** — `buildEmbeddingChunks(item): string[]` (line 2223): concatenates
   `Name\nDescription\nText`, returns `[full]` if under `MAX_EMBEDDING_TOKENS` (= **7500**, so chunking
   only fires on very long items), else `TextChunker` (overlap 100) or a char-split fallback. **Token
   budget is `chars/4`.** No topic/section/heading awareness; no structure.

**A `Content Item` is a text record.** `.Text` (nvarchar MAX) is the only payload carrier;
`VectorizeContentItems` **silently skips** any item with empty `.Text` (line 1474). And
`Content Item Chunks.Text` is **`NOT NULL`** — so a pure-media segment **cannot be persisted as a chunk
today** without a schema change. These two facts are the concrete blockers for AV, not the embedding call.

**Embedding (text-only):** `vectorizeGroup` (line 1523) → `buildChunksForBatch` (chunk tuple
`{item, chunkIndex, text, chunkId}`, line 1614) → `AIModelRunner.RunEmbedding({ Texts, ModelID,
PromptID })` (line 1554). `RunEmbedding` (AIModelRunner.ts:103) calls **`EmbedTexts` (line 131) only** —
`EmbeddingRunParams.Texts: string[]`. **No `EmbedContent`, no media, anywhere in the chain.**

**Vector write + chunk identity (this part is already good — reuse it):**
- `buildVectorRecords` (line 1634): single-chunk items → deterministic item-level vector id; multi-chunk
  → each chunk's own minted `chunkId` as vector id (purge-safe). `buildVectorMetadata` (line 2259) sets
  `{RecordID, Entity:'MJ: Content Items', ContentSourceID, Title, Description, URL, Tags}`.
- `upsertVectorRecords` → `vectorDB.CreateRecords`.
- `persistVectorReferences` (line ~1665): single-chunk → `ContentItem.VectorRecordID`; multi-chunk →
  `replaceContentItemChunks` (line 1716) writes `Content Item Chunks` rows
  (`ContentItemID, Sequence, Text, VectorRecordID`).
- **Lifecycle:** `EmbeddingStatus`/`DeleteStatus`/`TaggingStatus`, soft-delete + `PurgeDeletedChunks`
  (line 1845, batched `DeleteRecords`), `Checksum` dedup, rate limiters (LLM/Embedding/VectorDB). Solid.

**`Content Item Chunks` schema today:** `{ID, ContentItemID, Sequence, Text, VectorRecordID,
EmbeddingStatus, DeleteStatus, TaggingStatus, LastEmbeddedAt, LastDeletedAt, LastTaggedAt}`. **No
modality, no time offsets, no description, no transcript.**

**Source adapters** (`Websites`, `CloudStorage`, `RSSFeed`, `Entity`, `LocalFileSystem`) all subclass
`AutotagBase` — this is exactly the **integration-engine shape** (like HubSpot/Salesforce) that a
Vimeo / Zoom / podcast-host adapter would follow. Adding AV sources is "another adapter," not new plumbing.

---

## 3. The four seams, mapped to the autotagger

| Parallel agent's warning | Autotagger reality | Where |
|---|---|---|
| **Chunking is the hard part** | `buildEmbeddingChunks` / `chunkExtractedText` — concat + `TextChunker` (chars/4), text-only, no structure, no AV. | `AutotagBaseEngine.ts:2223, 923` |
| **Retrieval returns a pointer** | `Content Item Chunks` has no modality / time / description / transcript. A video segment can't be reasoned over. | chunk schema + `buildVectorMetadata:2259` |
| **Modality bias** | One `VectorIndex` = one model = one dimension; multimodal vectors need their own index; `SearchFusion` has no per-modality normalization. | `SearchEngine` / index topology |
| **Keep provider behind abstraction** | Already done (`BaseEmbeddings`/`VectorDBBase`, class-factory). Gap: `RunEmbedding`→`EmbedTexts` only; `EmbedContent` (#2834) has no caller. | `AIModelRunner.ts:131` |

---

## 4. Proposal — extend the autotagger (additive, metadata-driven)

### 4A. Extend `MJ: Content Item Chunks` for modality + time + dual representation

Migration + CodeGen, folded into **#3275** so the chunk schema lands once. Proposed columns:

| Column | Type | Purpose |
|---|---|---|
| `Modality` | CHECK `'text'\|'image'\|'audio'\|'video'\|'multimodal'` (default `'text'`) | Index routing + fusion. |
| `StartMs` / `EndMs` | int null | AV time window (`14:22–15:05`). |
| `StartOffset` / `EndOffset` | int null | Char offsets (already produced by `TextChunker`). |
| `PageNumber` | int null | PDF/slide provenance. |
| `Description` | nvarchar(max) null | **LLM description of the segment** — readable representation. |
| `Transcript` | nvarchar(max) null | Verbatim transcript for AV. |
| `SegmentTitle` | nvarchar null | Chapter/sub-chapter label. |
| `ParentChunkID` | uniqueidentifier null | Chapter → sub-chapter hierarchy. |
| `EmbeddedRepresentation` | nvarchar null | `'native'` \| `'description'` — which text was embedded for retrieval. |

**Also relax `Content Item Chunks.Text` to nullable** — today it is `NOT NULL`, which is the single schema
blocker preventing a pure-media segment from persisting. The rest of the chunk machinery
(`replaceContentItemChunks`, `PurgeDeletedChunks`, the `VectorRecordID` single-vs-multi strategy, the
status lifecycle) already keys off `VectorRecordID`, **not** `Text`, so it carries over to media unchanged.

**Dual representation is the core commitment.** Every AV/image chunk stores **both** the native
embedding (retrieval) **and** `Description`/`Transcript` (agent reasoning + keyword/FTS + reranking). This
makes `followSourceLink` / `getMatchingChunks` return real content and lets `AgentPreExecutionRAG`'s
`<retrieved_context>` be readable for a video hit. `buildVectorMetadata` gains `Modality`/`StartMs`/`EndMs`.

> Asset modeling: keep the **asset** on `Content Items` (already has URL, Checksum, file type, hierarchy)
> and the **segments** on `Content Item Chunks` — one lifecycle (#3275), not a forked one. Only introduce a
> first-class `MJ: Media Assets` if AV provenance needs fields `Content Items` can't hold.

### 4B. A `Segmenter` abstraction — semantic text + AV chapters

Introduce `BaseSegmenter` (class-factory-selected, same pattern as `BaseEmbeddings`/`VectorDBBase`),
configured per `Content Type` / `Content Source` via the `Configuration` JSON that #3275 already parses.
**Replace the two ad-hoc chunk sites** (`buildEmbeddingChunks`, `chunkExtractedText`) with a call into
the resolved segmenter; keep `TextChunker` as the within-segment splitter.

```
BaseSegmenter.Segment(item, extracted): Promise<Segment[]>
  Segment = { Modality, Text?, MediaRef?, StartMs?, EndMs?, StartOffset?, EndOffset?,
              PageNumber?, SegmentTitle?, ParentIndex? }
```

- **`StructuralTextSegmenter`** — headings/markdown/HTML structure + `TextChunker` per section. Cheap
  default; strictly better than today for docs/PDF. **This alone replaces "dumb chunking" for text.**
- **`SemanticTextSegmenter`** — LLM topic-boundary + chapter-title pass (via `AIPromptRunner`), cost-bounded.
- **`TranscriptSegmenter`** (audio/video) — **consume MJ's existing realtime-capture timed transcripts**
  (speaker turns + timings + `peaks.json`; `REALTIME_SESSION_CAPTURE_GUIDE.md`) when present, else ASR;
  detect boundaries by topic shift + speaker change + (video) scene/slide transitions → **chapters →
  sub-chapters** with `StartMs`/`EndMs`. This realizes "break audio/video into chapters."
- **`FixedWindowAVSegmenter`** — naive ~32s-window fallback (the paper's default) when no transcript/budget.

Semantic segmentation is the preprocessing pass the paper says most engineering goes into — the embedder
is the easy part.

### 4C. Wire `EmbedContent` into the autotagger (close the #2834 gap)

1. **Extraction stage** learns media: for image/audio/video `ContentFileType`s, produce a `MediaRef`
   (bytes / storage URL via `@memberjunction/storage` + `MediaStreamHandler`) instead of extracted text.
2. **Chunk tuple** carries `Modality` + `MediaRef` + time (extends `buildChunksForBatch`).
3. **Embed branch in `vectorizeGroup`:**
   - text segments → `RunEmbedding({ Texts })` → text `VectorIndex` (unchanged).
   - image/audio/video segments → build `ChatMessageContent` (media block ± transcript) → **`EmbedContent`**
     → **dedicated multimodal `VectorIndex`** (own model + dimension, e.g. Gemini 3072-dim).
   - **also** embed the LLM `Description` as text into the text index → AV becomes discoverable by cheap
     text-to-text + keyword/FTS ("hybrid retrieval for free").
4. **New plumbing:** add a `Content?`/`RunContentEmbedding` path to `EmbeddingRunParams` / `AIModelRunner`
   (mirroring `RunEmbedding`, with `AIPromptRun` tracking) that calls `EmbedContent`. Currently it only
   knows `EmbedTexts`.
6. **Group by `(model, index, modality)`, not just item.** `groupItemsByInfrastructure` (line 2075) keys on
   `(embeddingModelID, vectorIndexID)` per item; since AV uses a different (multimodal) model + index than
   text, batching must key on **chunk modality** too, so a mixed item fans its text chunks to the text
   index and its media chunks to the multimodal index.
7. **Un-skip media items:** `VectorizeContentItems` filters out empty-`.Text` items (line 1474) — that
   filter must become "no embeddable segments," or media items are silently dropped.

**Why this is lower-risk than it sounds:** the only two seams that must change are `buildChunksForBatch`
(line 1614, the sole chunk producer) and the single `EmbedTexts` call (`AIModelRunner.ts:131`, the modality
switch). Everything downstream — upsert, `VectorRecordID` strategy, chunk persistence, purge, status
lifecycle — is already modality-agnostic except the `Text NOT NULL` column (4A).
5. **Fix #2834's error-swallowing:** `EmbedContent` returns an empty vector on failure. For a **paid AV
   embed**, make `EmbedResult` extend `BaseResult` (the deferred #2834 decision) so failures surface
   instead of silently storing `[]` and marking the chunk Complete. Batch multimodal (`EmbedContents`)
   can come later — start with bounded-concurrency per-segment calls under the existing rate limiter.

### 4D. Modality-aware retrieval

- **Retrieve top-k per index/modality, merge via RRF** (rank-based fusion is scale-free — lean on the
  existing `ComputeRRF` rather than a global raw-cosine top-k that skews text-heavy). Ensure
  `VectorSearchProvider` contributes each modality's ranked list.
- Optional **per-modality score normalization** for score-based callers.
- **Rerank over the readable representation** — cross-encoder rerankers (Cohere/Voyage/OpenAI/BGE) can't
  score a raw video vector, but with 4A's `Description`/`Transcript` they rank AV hits fairly.
- `SearchResultSetToolLibrary` gains `filterByModality`; `followSourceLink` returns time-windowed
  playback deep-links via `MediaStreamHandler`.

### 4E. Cost & portability

- Keep the **multimodal index isolated** so an AV re-embed (provider/dimension change) never touches text
  vectors. `VectorIndex.Dimensions` + #3175 reduced-dim support already make this config-only.
- AV backfills **resumable + bounded** — reuse chunk `EmbeddingStatus`/`DeleteStatus` + keyset pagination.
- **Cost pre-flight / dry-run**: estimate `segments × per-modality price` before a full-archive embed
  (video embedding is a real budget line). Surface via the pipeline progress callback. Log any cap — never
  silently truncate.
- **Media source adapters** (Vimeo/Zoom/podcast) subclass `AutotagBase` like the existing Website/RSS/
  CloudStorage adapters — the integration-engine pattern already in place.

---

## 5. Composition with in-flight work

- **#3275 (topher)** hosts 4A + 4C: it already owns chunk identity, config on `Content Source`/`Content
  Type`, dimensions, provider routing, `EmbedPendingChunks`/`PurgeDeletedChunks`. The modality/time/dual-
  rep columns and the `EmbedContent` branch slot in. **One migration for the schema, not two.**
- **#2715 (AN)** — land 4D's fusion changes behind the unified `Provider.SearchEntity` primitive.
- `BaseSegmenter` (4B) is new and independent — prototype in `@memberjunction/ai-vectors` without blocking.

---

## 6. Sequencing

1. **4A schema** on `Content Item Chunks`, folded into #3275.
2. **`BaseSegmenter` + `StructuralTextSegmenter`** (4B) → immediate text/PDF quality win; wire into
   `buildEmbeddingChunks` (and `chunkExtractedText`).
3. **`EmbedContent` ingestion path (4C)** + `EmbedResult:BaseResult` fix, **image first** (simplest media),
   dedicated multimodal `VectorIndex`.
4. **`TranscriptSegmenter` (4B)** reusing realtime transcripts → AV chapters → `EmbedContent` + description
   embedding. The "dead archive → searchable" headline.
5. **`SemanticTextSegmenter` (4B)** — LLM topic boundaries where structure isn't enough.
6. **Modality-aware fusion (4D)** in `SearchEngine`.
7. **Cost pre-flight + resumable AV backfill (4E)**; price a representative association archive.

Every step is independently shippable; the text path is untouched until a `Content Type` opts in.

---

## 7. Open questions for the team

1. **Asset modeling:** extend `Content Items`/`Content Item Chunks` (recommended) vs. first-class
   `MJ: Media Assets` + `Media Segments`?
2. **Default AV embed target:** native multimodal vector, description-text vector, or **both** (recommended)?
3. **Semantic-segmentation budget:** LLM boundary pass per document, or gate to high-value corpora with
   structural segmentation as default?
4. **Provider commitment:** Gemini Embedding 2 (3072-dim, multimodal, non-portable) as AV default, Cohere
   Embed v4 for image/text? Worth pricing before committing index topology.
5. **`RunEmbedding` shape:** add a `Content` mode to `EmbeddingRunParams`/`AIModelRunner`, or a separate
   `RunContentEmbedding`? (Affects `AIPromptRun` tracking uniformity.)
6. **Reranker default for mixed modality:** keep Noop + opt-in, or default a cross-encoder rerank whenever
   a scope spans >1 modality?
