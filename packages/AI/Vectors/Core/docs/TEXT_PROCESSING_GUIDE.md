# Text Processing Guide for @memberjunction/ai-vectors

This guide covers the text processing utilities in the Vector Core package: `TextChunker` and `TextExtractor`. It explains why chunking matters, how to choose the right strategy, how to tune overlap, and how these utilities integrate with the vectorization and autotagging pipelines.

## Table of Contents

- [Why Text Chunking Matters](#why-text-chunking-matters)
- [Choosing the Right Strategy](#choosing-the-right-strategy)
- [Configuring Overlap](#configuring-overlap)
- [Token Estimation](#token-estimation)
- [HTML Extraction Edge Cases](#html-extraction-edge-cases)
- [Integration with the Vectorization Pipeline](#integration-with-the-vectorization-pipeline)
- [Integration with the Autotagging Pipeline](#integration-with-the-autotagging-pipeline)
- [Performance Considerations](#performance-considerations)
- [Real-World Content Type Examples](#real-world-content-type-examples)

---

## Why Text Chunking Matters

Embedding models have fixed context windows -- typically 512 to 8192 tokens depending on the model. When source text exceeds this limit, the model either truncates silently or rejects the input. Neither outcome is acceptable for production systems:

- **Silent truncation** means the tail of the document is never represented in the vector. Semantic search queries matching content in the truncated portion return no results.
- **Rejection** causes the pipeline to fail entirely for that record.

Chunking solves both problems by splitting text into pieces that fit within the model's context window. But naive splitting (e.g., every N characters) breaks meaning mid-sentence and produces chunks with poor semantic coherence, which degrades embedding quality and search relevance.

`TextChunker` provides boundary-aware splitting: it respects sentence and paragraph boundaries so each chunk is a self-contained unit of meaning. This produces embeddings that better represent the semantic content of the source text.

### The Chunking Tradeoff

Smaller chunks produce more focused embeddings that are easier to match precisely, but they lose surrounding context. Larger chunks preserve more context but become less specific. The right size depends on your use case:

| Use Case | Recommended Chunk Size | Why |
|---|---|---|
| Semantic search (find relevant passages) | 256-512 tokens | Focused enough for precise matching |
| RAG (retrieve context for LLM) | 512-1024 tokens | Larger context reduces the number of chunks the LLM must process |
| Duplicate detection | 128-256 tokens | Small chunks detect partial overlaps between records |
| Document classification | Full document or 1024+ tokens | Needs broad context to classify correctly |

---

## Choosing the Right Strategy

`TextChunker.ChunkText()` supports three strategies. Each one determines where chunk boundaries are placed.

### Sentence Strategy (Default)

```typescript
TextChunker.ChunkText({
    Text: articleText,
    MaxChunkTokens: 512,
    Strategy: 'sentence'
});
```

**How it works:** Splits text on sentence-ending punctuation (`.`, `!`, `?`) followed by whitespace or end-of-string. Adjacent sentences are merged into chunks until adding the next sentence would exceed `MaxChunkTokens`. If a single sentence exceeds the limit, it is emitted as its own oversized chunk rather than being split mid-sentence.

**Best for:**
- Articles, blog posts, documentation
- Natural language prose where sentence boundaries carry semantic meaning
- Entity descriptions, notes, and comments stored in MemberJunction entities

**Limitations:**
- Abbreviations like "Dr.", "U.S.", "e.g." can cause false splits. The regex handles many common cases, but highly abbreviated text (legal documents, medical records) may benefit from a custom pre-processing step.
- Sentences that span hundreds of tokens (e.g., legal run-on sentences) will exceed the chunk limit and be emitted as oversized chunks.

### Paragraph Strategy

```typescript
TextChunker.ChunkText({
    Text: markdownReport,
    MaxChunkTokens: 512,
    Strategy: 'paragraph'
});
```

**How it works:** Splits on double newlines (`\n\n`+). Adjacent paragraphs are merged into chunks until the token limit is reached. This preserves the author's original structural boundaries.

**Best for:**
- Markdown documents and README files
- Structured reports with clear section breaks
- Email bodies and forum posts
- Content that uses blank lines as logical dividers

**Limitations:**
- Content without double newlines (e.g., single-spaced plain text) will be treated as one giant paragraph. Use the sentence strategy instead.
- Very long paragraphs (common in academic writing) may exceed the chunk limit and be emitted as oversized chunks.

### Fixed Strategy

```typescript
TextChunker.ChunkText({
    Text: logOutput,
    MaxChunkTokens: 256,
    Strategy: 'fixed'
});
```

**How it works:** Splits at the character limit (estimated from `MaxChunkTokens * 4`), backing up to the nearest whitespace boundary. This is the simplest and fastest strategy -- it does not analyze sentence or paragraph structure.

**Best for:**
- Server logs and structured data
- Source code and configuration files
- Content where linguistic boundaries are not meaningful
- Very large documents where chunking speed matters more than semantic precision

**Limitations:**
- May split mid-sentence or mid-thought, producing chunks with weaker semantic coherence.
- Token estimation is rougher than the other strategies because it operates purely on character counts.

### Decision Tree

```
Is the content natural language prose?
  YES --> Does it have clear paragraph structure (double newlines)?
            YES --> Use 'paragraph'
            NO  --> Use 'sentence'
  NO  --> Use 'fixed'
```

---

## Configuring Overlap

Overlap controls how many tokens from the end of one chunk are repeated at the beginning of the next chunk. This provides context continuity -- useful when a concept spans a chunk boundary.

### Default Behavior

When `OverlapTokens` is not specified, it defaults to **10% of `MaxChunkTokens`**:

```typescript
// MaxChunkTokens = 512, so OverlapTokens defaults to 51
TextChunker.ChunkText({ Text: content, MaxChunkTokens: 512 });
```

### Setting Explicit Overlap

```typescript
// 100 tokens of overlap for maximum context continuity
TextChunker.ChunkText({
    Text: content,
    MaxChunkTokens: 512,
    OverlapTokens: 100,
    Strategy: 'sentence'
});
```

### Disabling Overlap

```typescript
// No overlap -- each chunk is completely independent
TextChunker.ChunkText({
    Text: content,
    MaxChunkTokens: 512,
    OverlapTokens: 0
});
```

### How Overlap Works Internally

For the sentence and paragraph strategies, overlap is measured in whole units (sentences or paragraphs). After emitting a chunk, the chunker takes trailing sentences/paragraphs from that chunk that fit within the `OverlapTokens` budget and prepends them to the next chunk's buffer. This means the actual overlap may be slightly less than `OverlapTokens` if the last unit that fits is smaller than the remaining budget.

For the fixed strategy, overlap is measured in characters (`OverlapTokens * 4`). The start position for the next chunk is backed up by that many characters from the end of the current chunk.

### Tuning Overlap

| Overlap | Trade-off |
|---|---|
| 0 | Smallest total chunks, fastest processing, but context may be lost at boundaries |
| 10% (default) | Good balance for most use cases |
| 20-25% | Better for RAG where the LLM needs surrounding context to answer accurately |
| >25% | Diminishing returns; significantly increases total chunk count and storage |

**Rule of thumb:** If search queries frequently match content near chunk boundaries and return incomplete context, increase overlap. If storage costs or embedding API calls are a concern, reduce it.

---

## Token Estimation

`TextChunker.EstimateTokenCount()` uses a simple heuristic: **~4 characters per token** for English text. This is a fast approximation that avoids the overhead of loading a tokenizer.

```typescript
const estimate = TextChunker.EstimateTokenCount('Hello, world!');
// Returns: 4 (13 characters / 4, rounded up)
```

### Accuracy by Content Type

The 4 chars/token heuristic is calibrated for English prose. Actual token counts vary:

| Content Type | Actual Chars/Token | Heuristic Accuracy |
|---|---|---|
| English prose | 3.5-4.5 | Good (within 15%) |
| Technical documentation | 3.0-4.0 | Good |
| Source code | 2.5-3.5 | Overestimates token count by 15-30% |
| CJK text (Chinese, Japanese, Korean) | 1.5-2.5 | Significantly overestimates |
| URLs and file paths | 2.0-3.0 | Overestimates by 20-40% |

Overestimation is the safe direction for chunking: chunks end up slightly smaller than the maximum, which avoids model truncation.

### When to Use tiktoken Instead

For scenarios where precise token counts matter (e.g., fitting exactly within a model's context window, billing estimation), use the `tiktoken` library directly:

```typescript
import { encoding_for_model } from 'tiktoken';

const enc = encoding_for_model('text-embedding-ada-002');
const exactCount = enc.encode(text).length;
enc.free();
```

For chunking purposes, the built-in heuristic is generally sufficient and avoids the startup cost of loading tokenizer data.

---

## HTML Extraction Edge Cases

`TextExtractor.ExtractFromHTML()` handles the most common HTML patterns using regex-based extraction. This section documents what it does and where edge cases arise.

### What Gets Removed

| Element | Handling |
|---|---|
| `<script>` | Entire element and content removed |
| `<style>` | Entire element and content removed |
| `<p>`, `<div>`, `<h1>`-`<h6>` | Opening tag replaced with newline; closing tag replaced with newline |
| `<li>`, `<tr>` | Replaced with newline |
| `<br>`, `<br/>` | Replaced with newline |
| `<blockquote>`, `<pre>` | Replaced with newline |
| All other tags | Replaced with a single space |

### Entity Decoding

Named entities are decoded via a lookup table covering the most common HTML entities:

`&amp;` `&lt;` `&gt;` `&quot;` `&#39;` `&apos;` `&nbsp;` `&mdash;` `&ndash;` `&hellip;` `&copy;` `&reg;` `&trade;`

Numeric entities are decoded for both decimal (`&#169;`) and hex (`&#xA9;`) formats via `String.fromCharCode`.

### Known Edge Cases

**Nested scripts/styles with CDATA:** The regex-based removal handles standard `<script>...</script>` patterns. Extremely malformed HTML with unclosed script tags may leave residual content.

**Inline styles and event handlers:** Attributes like `style="..."` and `onclick="..."` are removed along with their tags, but attribute values containing `>` characters could theoretically confuse the tag-stripping regex. This is rare in practice.

**Table content:** `<td>` and `<th>` cells are separated by spaces (not tabs or delimiters). If you need structured table data, extract it with a dedicated HTML parser before passing through `ExtractFromPlainText`.

**Image alt text:** Alt text within `<img alt="description">` is not extracted. If alt text is important for your use case, extract it separately before calling `ExtractFromHTML`.

**Pre-formatted code blocks:** Content within `<pre>` tags has its internal whitespace normalized by the whitespace collapsing step. If exact formatting of code blocks matters, extract `<pre>` content separately before processing.

**Uncommon named entities:** Only the 13 most common entities are in the lookup table. Less common entities like `&laquo;`, `&raquo;`, or `&euro;` will not be decoded. If your content uses these, consider a pre-processing step with a more comprehensive entity decoder.

### Recommendation for Complex HTML

For production HTML with complex structure (rich email templates, CMS content, web scraping output), consider a two-step approach:

1. Use a proper HTML parser (e.g., `cheerio`, `jsdom`) to extract the semantic content you care about
2. Pass the extracted text through `TextExtractor.ExtractFromPlainText()` for final normalization

`ExtractFromHTML` is intentionally dependency-light for server-side use without browser dependencies. It handles 90%+ of real-world HTML correctly.

---

## Integration with the Vectorization Pipeline

The vectorization pipeline (`@memberjunction/ai-vector-sync`) uses `TextChunker` and `TextExtractor` to prepare entity record content for embedding.

### Typical Flow

```
Entity Record
    |
    v
TextExtractor.ExtractByMimeType()    -- Clean raw content (HTML, plain text)
    |
    v
TextExtractor.TruncateToTokenLimit() -- (optional) Cap total text length
    |
    v
TextChunker.ChunkText()              -- Split into embedding-sized chunks
    |
    v
Embedding Model                      -- Generate vector for each chunk
    |
    v
Vector Database                      -- Upsert vectors with record metadata
```

### How Entity Content Maps to Text

MemberJunction entities store content in various formats depending on the entity type and field:

| Content Source | MIME Type | Extraction Method |
|---|---|---|
| Rich text fields (HTML) | `text/html` | `ExtractFromHTML` |
| Plain text fields | `text/plain` | `ExtractFromPlainText` |
| Description/notes fields | Usually plain text | `ExtractFromPlainText` |
| Concatenated field values | Plain text | `ExtractFromPlainText` |

The vectorization pipeline constructs a text representation of each record by concatenating relevant fields, then runs it through extraction and chunking.

### Chunk-to-Vector Mapping

Each `TextChunk` becomes a separate vector in the database. The chunk's `Index`, `StartOffset`, and `EndOffset` are stored as metadata alongside the vector, enabling:

- **Source tracing:** Given a search result, identify exactly which portion of the original record matched
- **Re-chunking detection:** When chunk settings change, compare offsets to determine which vectors need regeneration
- **Deduplication:** Identical chunks from the same record (due to overlap) can be detected via offset comparison

### Pipeline Code Example

```typescript
import { TextExtractor, TextChunker } from '@memberjunction/ai-vectors';

// 1. Extract clean text from the record's content
const rawText = TextExtractor.ExtractFromHTML(htmlContent);

// 2. Chunk into embedder-friendly pieces
const chunks = TextChunker.ChunkText({
    Text: rawText,
    MaxChunkTokens: 512,
    Strategy: 'sentence',
});

// 3. Embed each chunk (via EntityVectorSyncer or directly)
for (const chunk of chunks) {
    const embedding = await embeddingModel.EmbedTexts({
        texts: [chunk.Text],
        model: null
    });
    // Store embedding with chunk.Index, chunk.StartOffset, chunk.EndOffset as metadata
}
```

---

## Integration with the Autotagging Pipeline

The autotagging system uses the same text processing utilities to prepare content for classification and tag extraction by LLMs.

### Autotagging Flow

```
Entity Record
    |
    v
TextExtractor                         -- Clean raw content
    |
    v
TextChunker                           -- Split into manageable pieces (if content exceeds model limits)
    |
    v
LLM / Classification Model            -- Extract tags, categories, or labels from each chunk
    |
    v
Tag Aggregation                        -- Merge and deduplicate tags across all chunks
    |
    v
Tag Assignment                         -- Write tags back to entity metadata
```

### Key Differences from Vectorization

| Aspect | Vectorization | Autotagging |
|---|---|---|
| Chunk size | 256-512 tokens (embedding model limit) | 1024-4096 tokens (LLM context window) |
| Strategy | Sentence (semantic precision) | Paragraph or fixed (broader context) |
| Overlap | 10% (search continuity) | 0-5% (tag extraction is less boundary-sensitive) |
| Output per chunk | One embedding vector | One or more tags/labels |
| Aggregation | All chunk vectors stored independently | Tags merged and deduplicated across chunks |

### Chunking for Autotagging

When autotagging, larger chunks generally produce better results because the classification model has more context to determine relevant tags. Use the paragraph strategy with a higher `MaxChunkTokens`:

```typescript
const cleanText = TextExtractor.ExtractFromHTML(record.Content);

const chunks = TextChunker.ChunkText({
    Text: cleanText,
    MaxChunkTokens: 2048,
    OverlapTokens: 0,       // Tags are less sensitive to boundary context
    Strategy: 'paragraph'
});

// Send each chunk to the LLM for tag extraction, then merge results
const allTags: Set<string> = new Set();
for (const chunk of chunks) {
    const tags = await extractTagsFromChunk(chunk.Text);
    tags.forEach(tag => allTags.add(tag));
}
```

---

## Performance Considerations

### Chunk Size and Total Count

The relationship between `MaxChunkTokens` and total chunk count is roughly inverse-linear. For a 10,000-token document:

| MaxChunkTokens | OverlapTokens | Approximate Chunks |
|---|---|---|
| 256 | 25 | ~43 |
| 512 | 51 | ~22 |
| 1024 | 102 | ~11 |
| 2048 | 0 | ~5 |

Each chunk requires one embedding API call, so doubling the chunk size roughly halves the number of API calls and stored vectors. Choose the largest chunk size that still provides good retrieval quality for your use case.

### Memory Usage

`TextChunker` processes text in a single pass and does not build an AST or DOM tree. Memory usage is proportional to the input text size plus the output chunk array. For a 1MB text document:

- Input string: ~1MB
- Sentence/paragraph split array: ~1MB (references into the input)
- Output chunks: ~1MB + overlap duplication
- **Total peak: ~3-4MB**

This is well within Node.js default heap limits for any reasonable document size. Extremely large documents (100MB+) should be pre-split into sections before chunking.

### Processing Speed

All three strategies are single-pass with O(n) complexity relative to input length:

| Strategy | Relative Speed | Why |
|---|---|---|
| Fixed | Fastest | Simple character-offset arithmetic |
| Paragraph | Fast | Single regex split on `\n\n` |
| Sentence | Slightly slower | Regex-based sentence boundary detection |

For typical documents (10-100KB), all strategies complete in under 1ms. The embedding API call dominates total pipeline time by orders of magnitude -- optimizing chunk strategy for speed is rarely worthwhile.

### TextExtractor Performance

HTML extraction performance depends on the complexity of the input:

| Input Size | Entity Decoding | Tag Stripping | Total |
|---|---|---|---|
| 10KB HTML | <1ms | <1ms | <1ms |
| 100KB HTML | ~1ms | ~1ms | ~2ms |
| 1MB HTML | ~5ms | ~10ms | ~15ms |

For batch processing thousands of records, consider running extraction in parallel with a concurrency limit to avoid overwhelming the event loop:

```typescript
// Process 10 records concurrently
const concurrency = 10;
for (let i = 0; i < records.length; i += concurrency) {
    const batch = records.slice(i, i + concurrency);
    await Promise.all(batch.map(async (record) => {
        const text = TextExtractor.ExtractFromHTML(record.Content);
        const chunks = TextChunker.ChunkText({ Text: text, MaxChunkTokens: 512 });
        // ... embed chunks
    }));
}
```

---

## Real-World Content Type Examples

### Customer Support Tickets

```typescript
import { TextExtractor, TextChunker } from '@memberjunction/ai-vectors';

// Support tickets often contain HTML from rich text editors
const ticketBody = record.Description; // HTML content

const cleanText = TextExtractor.ExtractFromHTML(ticketBody);
const chunks = TextChunker.ChunkText({
    Text: cleanText,
    MaxChunkTokens: 256,    // Small chunks for precise similarity matching
    Strategy: 'sentence',   // Preserve individual customer statements
    OverlapTokens: 25
});
```

### Knowledge Base Articles

```typescript
// Long-form articles with section headers
const articleContent = TextExtractor.ExtractFromHTML(record.Content);
const chunks = TextChunker.ChunkText({
    Text: articleContent,
    MaxChunkTokens: 512,    // Balance between precision and context
    Strategy: 'paragraph',  // Respect the article's section structure
    OverlapTokens: 50
});
```

### Product Descriptions

```typescript
// Short text that may not need chunking at all
const description = TextExtractor.ExtractFromPlainText(record.Description);
const tokens = TextChunker.EstimateTokenCount(description);

if (tokens <= 512) {
    // Small enough for a single embedding -- skip chunking entirely
    // Pass description directly to the embedding model
} else {
    const chunks = TextChunker.ChunkText({
        Text: description,
        MaxChunkTokens: 512,
        Strategy: 'sentence'
    });
}
```

### Server Logs and Audit Trails

```typescript
// Structured, line-oriented content
const logText = TextExtractor.ExtractFromPlainText(logContent);
const chunks = TextChunker.ChunkText({
    Text: logText,
    MaxChunkTokens: 256,
    Strategy: 'fixed',      // No sentence structure to preserve
    OverlapTokens: 0        // Each chunk is independent
});
```

### Email Content

```typescript
// Emails can be HTML or plain text
const emailBody = TextExtractor.ExtractByMimeType(
    record.Body,
    record.ContentType  // 'text/html' or 'text/plain'
);

// Truncate very long email threads before chunking
const truncated = TextExtractor.TruncateToTokenLimit(emailBody, 8192);

const chunks = TextChunker.ChunkText({
    Text: truncated,
    MaxChunkTokens: 512,
    Strategy: 'paragraph',  // Email threads have natural paragraph breaks
    OverlapTokens: 50
});
```

### Concatenated Entity Fields

```typescript
// Build a text representation from multiple entity fields
const parts = [
    `Name: ${record.Name}`,
    `Category: ${record.Category}`,
    `Description: ${TextExtractor.ExtractFromPlainText(record.Description)}`,
    `Notes: ${TextExtractor.ExtractFromHTML(record.Notes)}`
].filter(p => p && !p.endsWith(': '));

const fullText = parts.join('\n\n');
const chunks = TextChunker.ChunkText({
    Text: fullText,
    MaxChunkTokens: 512,
    Strategy: 'paragraph'   // Each field becomes a natural paragraph
});
```

### Binary Document Content (PDF, DOCX)

```typescript
// Binary formats need a dedicated parser first
import pdfParse from 'pdf-parse';

const pdfBuffer = await fs.readFile(filePath);
const pdfResult = await pdfParse(pdfBuffer);

// Then normalize and chunk the extracted text
const cleanText = TextExtractor.ExtractFromPlainText(pdfResult.text);
const chunks = TextChunker.ChunkText({
    Text: cleanText,
    MaxChunkTokens: 512,
    Strategy: 'paragraph',  // PDF text often preserves paragraph breaks
    OverlapTokens: 50
});
```

---

## Summary

| Decision | Recommendation |
|---|---|
| **Strategy for prose** | `sentence` |
| **Strategy for structured docs** | `paragraph` |
| **Strategy for logs/code** | `fixed` |
| **Chunk size for search** | 256-512 tokens |
| **Chunk size for RAG** | 512-1024 tokens |
| **Chunk size for autotagging** | 1024-4096 tokens |
| **Overlap for search** | 10% (default) |
| **Overlap for RAG** | 15-25% |
| **Overlap for autotagging** | 0-5% |
| **Token estimation** | Use `EstimateTokenCount` for chunking; use `tiktoken` for billing/exact limits |
| **HTML with complex structure** | Use a DOM parser first, then `ExtractFromPlainText` |
| **Binary formats (PDF, DOCX)** | Use dedicated parser first, then `ExtractFromPlainText` |
