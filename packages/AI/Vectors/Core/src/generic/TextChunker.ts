/**
 * @fileoverview Token-aware text chunking with sentence boundary detection.
 *
 * Provides configurable text splitting for use in vectorization, autotagging,
 * and any pipeline that needs to break text into embedder-friendly chunks.
 *
 * @module @memberjunction/ai-vectors
 */

/**
 * Parameters for chunking text.
 */
export interface ChunkTextParams {
    /** The text to chunk */
    Text: string;
    /** Maximum tokens per chunk (default: 512) */
    MaxChunkTokens?: number;
    /** Overlap tokens between consecutive chunks (default: ~10% of MaxChunkTokens) */
    OverlapTokens?: number;
    /** Chunking strategy (default: 'sentence') */
    Strategy?: 'sentence' | 'paragraph' | 'fixed';
}

/**
 * A text unit (sentence or paragraph) paired with its real position in the
 * source text. Positions are resolved once, in a single forward pass, so a unit
 * whose text repeats elsewhere in the document still reports its own offsets.
 */
interface PositionedUnit {
    Text: string;
    Start: number;
    End: number;
}

/**
 * A single chunk of text with position metadata.
 */
export interface TextChunk {
    /** The chunk text content */
    Text: string;
    /** Start character offset in the original text */
    StartOffset: number;
    /** End character offset in the original text (exclusive) */
    EndOffset: number;
    /** Approximate token count for this chunk */
    TokenCount: number;
    /** 0-based chunk index */
    Index: number;
}

/**
 * Token-aware text chunker that respects natural boundaries.
 *
 * Supports three strategies:
 * - **sentence**: Splits on sentence boundaries (`.`, `!`, `?`), never mid-sentence.
 *   Best for prose and natural language text.
 * - **paragraph**: Splits on paragraph boundaries (`\n\n`). Best for structured documents.
 * - **fixed**: Splits on whitespace boundaries at the token limit. Fastest but least semantic.
 */
export class TextChunker {
    /**
     * Split text into chunks that fit within the token limit.
     */
    public static ChunkText(params: ChunkTextParams): TextChunk[] {
        const text = params.Text;
        if (!text || text.trim().length === 0) {
            return [];
        }

        const maxTokens = params.MaxChunkTokens ?? 512;
        const overlapTokens = params.OverlapTokens ?? Math.floor(maxTokens * 0.1);
        const strategy = params.Strategy ?? 'sentence';

        switch (strategy) {
            case 'sentence':
                return TextChunker.chunkBySentence(text, maxTokens, overlapTokens);
            case 'paragraph':
                return TextChunker.chunkByParagraph(text, maxTokens, overlapTokens);
            case 'fixed':
                return TextChunker.chunkByFixed(text, maxTokens, overlapTokens);
            default:
                return TextChunker.chunkBySentence(text, maxTokens, overlapTokens);
        }
    }

    /**
     * Estimate token count using whitespace splitting.
     * This is a fast approximation; for production accuracy, use tiktoken.
     */
    public static EstimateTokenCount(text: string): number {
        if (!text || text.trim().length === 0) return 0;
        // Rough approximation: ~4 characters per token for English text
        return Math.ceil(text.length / 4);
    }

    // ─────────────────────────────────────────────
    // Strategy Implementations
    // ─────────────────────────────────────────────

    private static chunkBySentence(text: string, maxTokens: number, overlapTokens: number): TextChunk[] {
        const sentences = TextChunker.splitSentences(text);
        return TextChunker.mergeUnitsIntoChunks(TextChunker.locateUnits(sentences, text), maxTokens, overlapTokens);
    }

    private static chunkByParagraph(text: string, maxTokens: number, overlapTokens: number): TextChunk[] {
        const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
        return TextChunker.mergeUnitsIntoChunks(TextChunker.locateUnits(paragraphs, text), maxTokens, overlapTokens);
    }

    /**
     * Resolve each unit's true offsets with a single forward-moving cursor.
     *
     * Searching from the start of the document for every unit (the obvious
     * implementation) returns the *first* occurrence of that text, so any repeated
     * sentence — boilerplate, a recurring header, "Thank you." — makes later chunks
     * report offsets pointing at the wrong part of the document. Because those
     * offsets are persisted as chunk provenance, that silently corrupts the link
     * from a search hit back to its source passage. The cursor also makes this a
     * single O(n) pass instead of O(n²).
     */
    private static locateUnits(units: string[], originalText: string): PositionedUnit[] {
        const positioned: PositionedUnit[] = [];
        let cursor = 0;
        for (const unit of units) {
            const found = originalText.indexOf(unit, cursor);
            const start = found >= 0 ? found : cursor;
            const end = Math.min(start + unit.length, originalText.length);
            positioned.push({ Text: unit, Start: start, End: end });
            cursor = end;
        }
        return positioned;
    }

    private static chunkByFixed(text: string, maxTokens: number, overlapTokens: number): TextChunk[] {
        const maxChars = maxTokens * 4; // rough token-to-char estimate
        // Cap the overlap at half the window. Beyond 50% each chunk is mostly a copy
        // of its predecessor, and as the overlap approaches the window size the chunk
        // count explodes (an overlap >= the window never advances at all). The loop
        // below additionally guarantees forward progress, since backing up to a word
        // boundary can shorten a window enough that even a legal overlap would stall.
        const overlapChars = Math.min(overlapTokens * 4, Math.floor(maxChars / 2));
        const chunks: TextChunk[] = [];
        let startCharOffset = 0;
        let chunkIndex = 0;

        while (startCharOffset < text.length) {
            let endCharOffset = Math.min(startCharOffset + maxChars, text.length);

            // Back up to last whitespace if not at end
            if (endCharOffset < text.length) {
                const lastSpace = text.lastIndexOf(' ', endCharOffset);
                if (lastSpace > startCharOffset) {
                    endCharOffset = lastSpace;
                }
            }

            const chunkText = text.slice(startCharOffset, endCharOffset).trim();
            if (chunkText.length > 0) {
                chunks.push({
                    Text: chunkText,
                    StartOffset: startCharOffset,
                    EndOffset: endCharOffset,
                    TokenCount: TextChunker.EstimateTokenCount(chunkText),
                    Index: chunkIndex++,
                });
            }

            if (endCharOffset >= text.length) break;
            // Always advance by at least one character, so a short word-boundary
            // window can never leave the cursor where it started.
            startCharOffset = Math.max(endCharOffset - overlapChars, startCharOffset + 1);
        }

        return chunks;
    }

    // ─────────────────────────────────────────────
    // Utility Methods
    // ─────────────────────────────────────────────

    /**
     * Split text into sentences using common sentence-ending punctuation.
     * Handles abbreviations, decimals, and common edge cases.
     */
    private static splitSentences(text: string): string[] {
        // Split on sentence-ending punctuation followed by space or end of string
        const sentenceRegex = /[^.!?]*[.!?]+(?:\s|$)|[^.!?]+$/g;
        const matches = text.match(sentenceRegex);
        if (!matches) return [text];
        return matches.map((s) => s.trim()).filter((s) => s.length > 0);
    }

    /**
     * Merge small text units (sentences or paragraphs) into chunks that fit within
     * the token limit, with overlap between consecutive chunks.
     */
    private static mergeUnitsIntoChunks(
        units: PositionedUnit[],
        maxTokens: number,
        overlapTokens: number
    ): TextChunk[] {
        const chunks: TextChunk[] = [];
        let currentUnits: PositionedUnit[] = [];
        let currentTokens = 0;
        let chunkIndex = 0;

        for (const unit of units) {
            const unitTokens = TextChunker.EstimateTokenCount(unit.Text);

            // If a single unit exceeds the max, emit it as its own chunk
            if (unitTokens > maxTokens) {
                // Flush current buffer first
                if (currentUnits.length > 0) {
                    chunks.push(TextChunker.buildChunkFromUnits(currentUnits, chunkIndex++));
                    currentUnits = TextChunker.getOverlapUnits(currentUnits, overlapTokens);
                    currentTokens = TextChunker.sumTokens(currentUnits);
                }
                // Emit the oversized unit
                chunks.push(TextChunker.buildChunkFromUnits([unit], chunkIndex++));
                continue;
            }

            if (currentTokens + unitTokens > maxTokens && currentUnits.length > 0) {
                chunks.push(TextChunker.buildChunkFromUnits(currentUnits, chunkIndex++));
                currentUnits = TextChunker.getOverlapUnits(currentUnits, overlapTokens);
                currentTokens = TextChunker.sumTokens(currentUnits);
            }

            currentUnits.push(unit);
            currentTokens += unitTokens;
        }

        // Flush remaining
        if (currentUnits.length > 0) {
            chunks.push(TextChunker.buildChunkFromUnits(currentUnits, chunkIndex));
        }

        return chunks;
    }

    /**
     * Total estimated tokens across a set of units.
     */
    private static sumTokens(units: PositionedUnit[]): number {
        return units.reduce((sum, u) => sum + TextChunker.EstimateTokenCount(u.Text), 0);
    }

    /**
     * Get the trailing units that fit within the overlap token budget.
     */
    private static getOverlapUnits(units: PositionedUnit[], overlapTokens: number): PositionedUnit[] {
        if (overlapTokens <= 0) return [];

        const overlapUnits: PositionedUnit[] = [];
        let tokens = 0;

        for (let i = units.length - 1; i >= 0; i--) {
            const unitTokens = TextChunker.EstimateTokenCount(units[i].Text);
            if (tokens + unitTokens > overlapTokens) break;
            overlapUnits.unshift(units[i]);
            tokens += unitTokens;
        }

        return overlapUnits;
    }

    /**
     * Build a TextChunk from positioned units. Offsets come from the units
     * themselves, which were resolved by a forward scan in `locateUnits`.
     */
    private static buildChunkFromUnits(units: PositionedUnit[], index: number): TextChunk {
        const text = units.map((u) => u.Text).join(' ');

        return {
            Text: text,
            StartOffset: units[0].Start,
            EndOffset: units[units.length - 1].End,
            TokenCount: TextChunker.EstimateTokenCount(text),
            Index: index,
        };
    }
}
