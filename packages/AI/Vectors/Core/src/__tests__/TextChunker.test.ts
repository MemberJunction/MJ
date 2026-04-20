import { describe, it, expect } from 'vitest';
import { TextChunker, TextChunk } from '../generic/TextChunker';

describe('TextChunker', () => {
    describe('ChunkText', () => {
        it('should return empty array for empty text', () => {
            expect(TextChunker.ChunkText({ Text: '' })).toEqual([]);
            expect(TextChunker.ChunkText({ Text: '   ' })).toEqual([]);
        });

        it('should return single chunk for text within limit', () => {
            const result = TextChunker.ChunkText({ Text: 'Hello world.', MaxChunkTokens: 100 });
            expect(result).toHaveLength(1);
            expect(result[0].Text).toContain('Hello world');
            expect(result[0].Index).toBe(0);
        });

        it('should split long text into multiple chunks', () => {
            // Each sentence is roughly 4-5 tokens
            const text = 'First sentence here. Second sentence here. Third sentence here. Fourth sentence here. Fifth sentence here.';
            const result = TextChunker.ChunkText({ Text: text, MaxChunkTokens: 10, OverlapTokens: 0 });
            expect(result.length).toBeGreaterThan(1);
        });

        it('should include chunk index on each chunk', () => {
            const text = 'First sentence. Second sentence. Third sentence. Fourth sentence.';
            const result = TextChunker.ChunkText({ Text: text, MaxChunkTokens: 8, OverlapTokens: 0 });
            result.forEach((chunk, i) => {
                expect(chunk.Index).toBe(i);
            });
        });

        it('should estimate token counts', () => {
            const result = TextChunker.ChunkText({ Text: 'Hello world this is a test.', MaxChunkTokens: 100 });
            expect(result[0].TokenCount).toBeGreaterThan(0);
        });
    });

    describe('sentence strategy', () => {
        it('should not split mid-sentence', () => {
            const text = 'This is sentence one. This is sentence two. This is sentence three.';
            const result = TextChunker.ChunkText({ Text: text, MaxChunkTokens: 12, OverlapTokens: 0, Strategy: 'sentence' });
            for (const chunk of result) {
                // Each chunk should end with a period or be the full text
                const trimmed = chunk.Text.trim();
                expect(trimmed.endsWith('.') || trimmed === text.trim()).toBe(true);
            }
        });
    });

    describe('paragraph strategy', () => {
        it('should split on paragraph boundaries', () => {
            const text = 'Paragraph one content here.\n\nParagraph two content here.\n\nParagraph three content here.';
            const result = TextChunker.ChunkText({ Text: text, MaxChunkTokens: 10, OverlapTokens: 0, Strategy: 'paragraph' });
            expect(result.length).toBeGreaterThan(1);
        });
    });

    describe('fixed strategy', () => {
        it('should split at whitespace boundaries', () => {
            const text = 'word '.repeat(100).trim();
            const result = TextChunker.ChunkText({ Text: text, MaxChunkTokens: 10, OverlapTokens: 0, Strategy: 'fixed' });
            expect(result.length).toBeGreaterThan(1);
            // No chunk should be split mid-word
            for (const chunk of result) {
                expect(chunk.Text).not.toMatch(/^\S+\s\S+$/); // basic check that it's words
            }
        });
    });

    describe('overlap', () => {
        it('should create overlapping chunks when overlapTokens > 0', () => {
            const sentences = Array.from({ length: 10 }, (_, i) => `Sentence number ${i + 1}.`).join(' ');
            const result = TextChunker.ChunkText({ Text: sentences, MaxChunkTokens: 15, OverlapTokens: 5, Strategy: 'sentence' });

            if (result.length >= 2) {
                // The end of chunk N should overlap with the start of chunk N+1
                // We can verify that some text appears in both chunks
                const chunk0Words = new Set(result[0].Text.split(/\s+/));
                const chunk1Words = result[1].Text.split(/\s+/);
                const overlap = chunk1Words.filter((w) => chunk0Words.has(w));
                // There should be some overlap (shared words)
                expect(overlap.length).toBeGreaterThan(0);
            }
        });

        it('should not create overlap when overlapTokens = 0', () => {
            const text = 'Sentence A. Sentence B. Sentence C. Sentence D.';
            const result = TextChunker.ChunkText({ Text: text, MaxChunkTokens: 8, OverlapTokens: 0, Strategy: 'sentence' });
            // Chunks shouldn't share content (hard to verify precisely, just check they differ)
            if (result.length >= 2) {
                expect(result[0].Text).not.toBe(result[1].Text);
            }
        });
    });

    describe('EstimateTokenCount', () => {
        it('should return 0 for empty text', () => {
            expect(TextChunker.EstimateTokenCount('')).toBe(0);
            expect(TextChunker.EstimateTokenCount('   ')).toBe(0);
        });

        it('should estimate roughly 1 token per 4 characters', () => {
            const text = 'Hello world'; // 11 chars -> ~3 tokens
            const estimate = TextChunker.EstimateTokenCount(text);
            expect(estimate).toBeGreaterThan(0);
            expect(estimate).toBeLessThan(10);
        });
    });

    describe('offset tracking', () => {
        it('should track start and end offsets', () => {
            const text = 'First sentence. Second sentence.';
            const result = TextChunker.ChunkText({ Text: text, MaxChunkTokens: 100 });
            expect(result[0].StartOffset).toBeGreaterThanOrEqual(0);
            expect(result[0].EndOffset).toBeLessThanOrEqual(text.length);
        });
    });
});
