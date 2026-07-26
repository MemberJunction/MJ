# @memberjunction/ai-segmentation

Pluggable **content segmentation** for MemberJunction's RAG ingestion — the step that decides *what*
gets embedded, before an embedding model decides *how*.

## Why this package exists

Retrieval quality is capped by segmentation quality. An embedding is only as good as the span of
content it represents: split a document on an arbitrary token boundary and you get vectors that
straddle two topics and match neither query well. Feed a 60-minute recording to a multimodal model in
one call and you get a mush vector, because those models sample a bounded window regardless of clip
length.

Before this package, chunking was a private helper inside whichever pipeline needed it — which meant
every new strategy would have been another bespoke branch in someone else's engine. Segmentation is
now a **registered, swappable strategy**, selected the same way `BaseEmbeddings` and `VectorDBBase`
providers already are.

## Layering

```
@memberjunction/ai-vectors        TextChunker  — "split this string to fit a token budget"
            ▲
            │ uses
@memberjunction/ai-segmentation   BaseSegmenter — "what are the meaningful units of this content"
            ▲
            │ consumed by
   ingestion pipelines (content autotagging, vector sync, knowledge pipeline)
```

`TextChunker` stays a low-level string primitive in `ai-vectors`. Segmenters live one layer up,
where `@memberjunction/ai-prompts` is available — which is what lets `SemanticText` run a real,
tracked `MJ: AI Prompt Run` rather than an untracked side-channel LLM call. (`ai-vectors` cannot
depend on `ai-prompts`: `ai-prompts → templates → ai-provider-bundle → ai-vectors-pinecone →
ai-vectors` would make it circular.)

## Built-in segmenters

| Key | Class | Best for |
|---|---|---|
| `StructuralText` | `StructuralTextSegmenter` | Documents with headings — markdown, HTML, converted PDFs. **Recommended text default.** |
| `SemanticText` | `SemanticTextSegmenter` | Prose with no structure — transcripts, reports, long articles. Uses an LLM to find latent topic boundaries. |
| `Transcript` | `TranscriptSegmenter` | Audio/video with a timed transcript. Produces time-windowed **chapters** (and optional per-speaker sub-chapters). |
| `FixedWindow` | `FixedWindowSegmenter` | Universal fallback — token windows for text, fixed-duration windows for untranscribed media. |

The ordering in `SuggestSegmenterKey` encodes the quality hierarchy: a real transcript beats document
structure, which beats uniform windows.

## Usage

```typescript
import { ResolveSegmenter, SuggestSegmenterKey } from '@memberjunction/ai-segmentation';

const params = { Text: extractedText, MimeType: 'text/markdown', ContextUser: contextUser };
const segmenter = ResolveSegmenter(contentType.SegmenterKey, SuggestSegmenterKey(params));

const result = await segmenter.Segment({ ...params, Options: { MaxSegmentTokens: 512 } });
if (!result.Success) {
    LogError(`Segmentation failed: ${result.ErrorMessage}`);
    return;
}

for (const segment of result.Segments) {
    // segment.Text        -> embed into the text index
    // segment.Media       -> embed via EmbedContent into a multimodal index
    // segment.StartMs/EndMs, StartOffset/EndOffset -> persist as chunk provenance
    // segment.ParentSequence -> chapter / sub-chapter hierarchy
}
```

Segmenters **never throw** for content-shaped problems; they return `Success: false` with an
`ErrorMessage`, matching the convention used by `RunView` and `BaseEntity.Save()`.

### Bootstrap

Segmenters are resolved dynamically through the class factory, so bundlers may tree-shake them. Call
the load-prevention export once from your application bootstrap:

```typescript
import { LoadContentSegmenters } from '@memberjunction/ai-segmentation';
LoadContentSegmenters();
```

Skipping this doesn't produce an error — `ResolveSegmenter` degrades to the fallback strategy — so
content still gets chunked, just by the wrong strategy and silently.

### Audio/video chapters

```typescript
const result = await ResolveSegmenter('Transcript').Segment({
    Media: { URL: 'https://cdn/session-1428.mp4', MimeType: 'video/mp4' },
    Cues: timedTranscriptCues,          // from ASR, or MJ realtime session capture
    Options: { MaxChapterMs: 300_000, BoundaryGapMs: 4_000 },
});
```

Each chapter carries **both** a media reference with a `StartMs`/`EndMs` window *and* the transcript
text for that window. That dual payload is the point: the media reference is what a multimodal model
embeds for retrieval, while the transcript is what an agent can read, what a cross-encoder can rerank,
and what keyword search can match.

This is **one vector per chunk**, not two — the native multimodal vector — with the description and
transcript stored as text alongside it. A short summary plus structured fields (`SegmentTitle`,
`StartMs`/`EndMs`, `Speaker`, `Modality`) may be mirrored into the vector record's metadata for
filtering and display; a full transcript should not be, since metadata is size-capped and is
filter/payload rather than ranked full-text.

### Making media findable from a text query

| Path | Strong at | Weak at |
|---|---|---|
| Native text→media similarity | visual/audio semantics | runs colder than text→text |
| Lexical (FTS/BM25) over the description | names, acronyms, jargon, titles | paraphrase |
| A description *vector* (text→text) | paraphrase | rare proper nouns |

Ship the first two; add a description vector selectively, once measurement shows paraphrase misses.
When you do, add it as a **sibling text chunk row** pointing at the media chunk rather than a second
vector on the same row — that keeps one vector per row and lets retrieval collapse duplicates on the
parent key. For speech-dominant archives, also price transcript-only ingestion first: text chapters
alone give full semantic search at zero multimodal embedding spend.

See the [Content Segmentation Guide](../../../guides/CONTENT_SEGMENTATION_GUIDE.md) for the full
rationale and the cross-package picture.

## Adding a new strategy

Implement one method and register the class:

```typescript
@RegisterClass(BaseSegmenter, 'MyStrategy')
export class MySegmenter extends BaseSegmenter {
    public get Key(): string { return 'MyStrategy'; }
    public get SupportedModalities(): ContentModality[] { return ['text']; }

    protected async SegmentCore(params: SegmentationParams): Promise<RawSegment[]> {
        return findBoundaries(params.Text ?? '').map(b => ({
            Modality: 'text', Text: b.Text, StartOffset: b.Start, EndOffset: b.End,
        }));
    }
}
```

`BaseSegmenter` handles everything else: input validation, enforcing the token ceiling (splitting
oversized segments while preserving titles and rebasing offsets), merging undersized segments,
sequence numbering, remapping `ParentIndex` → `ParentSequence` after splits, cycle-safe depth
calculation, and provenance stamping. Subclasses reference sibling segments by their index in the
array they just returned and never reason about post-split numbering.

## Options

Common to every segmenter (`SegmentationOptions`):

| Option | Default | Purpose |
|---|---|---|
| `MaxSegmentTokens` | 512 | Hard ceiling; the base class splits anything larger. |
| `OverlapTokens` | 10% of max | Overlap applied when an oversized segment is split. |
| `MinSegmentTokens` | 0 (off) | Merge adjacent text segments below this size. |

Each segmenter extends these with its own strongly-typed options — see
`StructuralTextSegmentationOptions`, `SemanticTextSegmentationOptions`,
`TranscriptSegmentationOptions`, and `FixedWindowSegmentationOptions`.

## Cost posture

Segmentation runs on every ingested item, so the defaults are deliberately cheap:

- `StructuralText` and `FixedWindow` make **no** model calls.
- `SemanticText` skips the LLM entirely for documents under `MinTokensForLLM` (default 750 tokens),
  truncates each block to a preview before prompting, asks the model for **block indices** rather than
  character offsets (models are unreliable at arithmetic over long strings, and a bad offset would
  silently corrupt chunk provenance), and degrades to `StructuralText` on any failure.
- `Transcript` emits sub-chapters only when `EmitSubChapters` is enabled, since they double the
  embedding count for a chapter.

## Testing

```bash
cd packages/AI/Segmentation && npm run test
```
