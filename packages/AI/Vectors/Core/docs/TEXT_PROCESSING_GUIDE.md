# Text Processing Guide

## Why Chunking Matters

Embedding models have fixed context windows (typically 512-8192 tokens). Text longer than the window is either truncated (losing information) or must be split into chunks. Proper chunking ensures:

- **No information loss**: All content gets embedded
- **Semantic coherence**: Each chunk contains a complete thought
- **Overlap continuity**: Context isn't lost at chunk boundaries
- **Optimal retrieval**: Chunks are the right size for similarity search

## TextChunker

### Choosing a Strategy

| Strategy | Best For | How It Works |
|---|---|---|
| `sentence` (default) | Prose, natural language, articles | Splits on `.`, `!`, `?` boundaries. Never splits mid-sentence. |
| `paragraph` | Structured documents, reports | Splits on `\n\n` paragraph breaks. |
| `fixed` | Code, logs, structured data | Splits at whitespace boundaries at the token limit. Fastest. |

### Basic Usage

```typescript
import { TextChunker } from '@memberjunction/ai-vectors';

// Default: sentence strategy, 512 tokens, 10% overlap
const chunks = TextChunker.ChunkText({ Text: articleText });

// Custom configuration
const chunks = TextChunker.ChunkText({
    Text: documentText,
    MaxChunkTokens: 256,
    OverlapTokens: 25,
    Strategy: 'paragraph',
});

// Each chunk includes position metadata
for (const chunk of chunks) {
    console.log(`Chunk ${chunk.Index}: ${chunk.TokenCount} tokens [${chunk.StartOffset}-${chunk.EndOffset}]`);
    console.log(chunk.Text);
}
```

### Configuring Overlap

Overlap creates shared context between consecutive chunks, preventing retrieval failures at chunk boundaries.

- **0 overlap**: Fastest, but context can be lost between chunks
- **10% overlap** (default): Good balance for most content
- **20-30% overlap**: Better for technical content with long cross-references

```typescript
// No overlap — fastest
TextChunker.ChunkText({ Text: text, OverlapTokens: 0 });

// High overlap — best retrieval quality
TextChunker.ChunkText({ Text: text, MaxChunkTokens: 512, OverlapTokens: 100 });
```

### Token Estimation

`TextChunker.EstimateTokenCount()` uses a simple heuristic (~4 characters per token). This is accurate within ~10% for English text. For exact counts, use a tokenizer like `tiktoken` and pass the result as `MaxChunkTokens`.

## TextExtractor

### HTML Extraction

```typescript
import { TextExtractor } from '@memberjunction/ai-vectors';

const html = '<h1>Title</h1><p>Content with <b>bold</b> text.</p><script>alert("removed")</script>';
const text = TextExtractor.ExtractFromHTML(html);
// Result: "Title\nContent with bold text."
```

Features:
- Strips all HTML tags
- Removes `<script>` and `<style>` elements entirely
- Decodes HTML entities (`&amp;` → `&`, `&#65;` → `A`)
- Adds newlines for block-level elements
- Normalizes whitespace

### MIME-Type Routing

```typescript
// Automatically chooses the right extractor
const text = TextExtractor.ExtractByMimeType(content, 'text/html');
const text = TextExtractor.ExtractByMimeType(content, 'text/plain');
```

### Truncation

```typescript
// Truncate to ~500 tokens, respecting word boundaries
const preview = TextExtractor.TruncateToTokenLimit(longText, 500);
```

## Integration with Vectorization

The typical pipeline:

```typescript
// 1. Extract text from source
const rawText = TextExtractor.ExtractFromHTML(htmlContent);

// 2. Chunk into embedder-friendly pieces
const chunks = TextChunker.ChunkText({
    Text: rawText,
    MaxChunkTokens: 512,
    Strategy: 'sentence',
});

// 3. Embed each chunk (via EntityVectorSyncer or directly)
for (const chunk of chunks) {
    const embedding = await embeddingModel.EmbedTexts({ texts: [chunk.Text], model: null });
    // Store embedding with chunk metadata
}
```

## Integration with Autotagging

For content autotagging, chunking ensures long documents fit within the LLM's context window:

```typescript
const chunks = TextChunker.ChunkText({
    Text: documentText,
    MaxChunkTokens: 2048,  // Larger chunks for LLM analysis
    Strategy: 'paragraph',
    OverlapTokens: 200,
});

// Send each chunk to the LLM for tag extraction
for (const chunk of chunks) {
    const tags = await extractTags(chunk.Text);
}
```

## Performance Considerations

| Content Size | Recommended Strategy | Chunk Size | Notes |
|---|---|---|---|
| < 512 tokens | No chunking needed | — | Embed directly |
| 512 - 10K tokens | `sentence` | 512 | Good balance |
| 10K - 100K tokens | `paragraph` | 1024 | Fewer chunks, faster processing |
| > 100K tokens | `fixed` | 512 | Fastest for very large content |

Memory usage scales linearly with input size. The chunker processes text in a single pass with no copies of the full text.
