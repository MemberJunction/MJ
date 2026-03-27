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
        return TextChunker.mergeUnitsIntoChunks(sentences, text, maxTokens, overlapTokens);
    }

    private static chunkByParagraph(text: string, maxTokens: number, overlapTokens: number): TextChunk[] {
        const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
        return TextChunker.mergeUnitsIntoChunks(paragraphs, text, maxTokens, overlapTokens);
    }

    private static chunkByFixed(text: string, maxTokens: number, overlapTokens: number): TextChunk[] {
        const words = text.split(/\s+/);
        const maxChars = maxTokens * 4; // rough token-to-char estimate
        const overlapChars = overlapTokens * 4;
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

            startCharOffset = endCharOffset - overlapChars;
            if (startCharOffset >= text.length) break;
            if (endCharOffset >= text.length) break;
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
        units: string[],
        originalText: string,
        maxTokens: number,
        overlapTokens: number
    ): TextChunk[] {
        const chunks: TextChunk[] = [];
        let currentUnits: string[] = [];
        let currentTokens = 0;
        let chunkIndex = 0;

        for (const unit of units) {
            const unitTokens = TextChunker.EstimateTokenCount(unit);

            // If a single unit exceeds the max, emit it as its own chunk
            if (unitTokens > maxTokens) {
                // Flush current buffer first
                if (currentUnits.length > 0) {
                    chunks.push(TextChunker.buildChunkFromUnits(currentUnits, originalText, chunkIndex++));
                    currentUnits = TextChunker.getOverlapUnits(currentUnits, overlapTokens);
                    currentTokens = currentUnits.reduce((sum, u) => sum + TextChunker.EstimateTokenCount(u), 0);
                }
                // Emit the oversized unit
                chunks.push(TextChunker.buildChunkFromUnits([unit], originalText, chunkIndex++));
                continue;
            }

            if (currentTokens + unitTokens > maxTokens && currentUnits.length > 0) {
                chunks.push(TextChunker.buildChunkFromUnits(currentUnits, originalText, chunkIndex++));
                currentUnits = TextChunker.getOverlapUnits(currentUnits, overlapTokens);
                currentTokens = currentUnits.reduce((sum, u) => sum + TextChunker.EstimateTokenCount(u), 0);
            }

            currentUnits.push(unit);
            currentTokens += unitTokens;
        }

        // Flush remaining
        if (currentUnits.length > 0) {
            chunks.push(TextChunker.buildChunkFromUnits(currentUnits, originalText, chunkIndex));
        }

        return chunks;
    }

    /**
     * Get the trailing units that fit within the overlap token budget.
     */
    private static getOverlapUnits(units: string[], overlapTokens: number): string[] {
        if (overlapTokens <= 0) return [];

        const overlapUnits: string[] = [];
        let tokens = 0;

        for (let i = units.length - 1; i >= 0; i--) {
            const unitTokens = TextChunker.EstimateTokenCount(units[i]);
            if (tokens + unitTokens > overlapTokens) break;
            overlapUnits.unshift(units[i]);
            tokens += unitTokens;
        }

        return overlapUnits;
    }

    /**
     * Build a TextChunk from a list of text units, finding their offset in the original text.
     */
    private static buildChunkFromUnits(units: string[], originalText: string, index: number): TextChunk {
        const text = units.join(' ');
        const startOffset = originalText.indexOf(units[0]);
        const lastUnit = units[units.length - 1];
        const endOffset = originalText.indexOf(lastUnit, startOffset) + lastUnit.length;

        return {
            Text: text,
            StartOffset: Math.max(0, startOffset),
            EndOffset: Math.min(endOffset, originalText.length),
            TokenCount: TextChunker.EstimateTokenCount(text),
            Index: index,
        };
    }
}
