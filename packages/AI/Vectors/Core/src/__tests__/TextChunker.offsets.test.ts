import { describe, it, expect } from 'vitest';
import { TextChunker } from '../generic/TextChunker';

/**
 * Offsets are persisted as chunk provenance — they are how a search hit resolves
 * back to the exact passage in the source document. These tests pin that
 * contract: `text.slice(StartOffset, EndOffset)` must actually contain the chunk.
 */
describe('TextChunker offsets', () => {
    it('reports offsets that resolve back to the chunk text', () => {
        const text = Array.from({ length: 12 }, (_, i) => `Sentence number ${i + 1} of the document.`).join(' ');
        const chunks = TextChunker.ChunkText({ Text: text, MaxChunkTokens: 12, OverlapTokens: 0, Strategy: 'sentence' });

        expect(chunks.length).toBeGreaterThan(1);
        for (const chunk of chunks) {
            const slice = text.slice(chunk.StartOffset, chunk.EndOffset);
            // The first sentence of the chunk must appear inside the sliced range.
            const firstSentence = chunk.Text.split('.')[0];
            expect(slice).toContain(firstSentence);
        }
    });

    it('does not collapse offsets to the first occurrence when a sentence repeats', () => {
        // "Thank you." recurs — the naive implementation resolved every later chunk
        // back to the FIRST occurrence, so a chunk covering the tail of the document
        // reported offsets spanning the whole document.
        const text =
            'Thank you. Alpha content here about budgets. ' +
            'Thank you. Beta content here about staffing. ' +
            'Thank you. Gamma content here about facilities.';

        const chunks = TextChunker.ChunkText({ Text: text, MaxChunkTokens: 10, OverlapTokens: 0, Strategy: 'sentence' });
        expect(chunks.length).toBeGreaterThan(1);

        const last = chunks[chunks.length - 1];
        // The final chunk must not claim to start at the top of the document.
        expect(last.StartOffset).toBeGreaterThan(0);
        expect(text.slice(last.StartOffset, last.EndOffset)).toContain('Gamma');
        expect(text.slice(last.StartOffset, last.EndOffset)).not.toContain('Alpha');
    });

    it('produces monotonically non-decreasing offsets across chunks', () => {
        const text = Array.from({ length: 20 }, () => 'Repeated identical sentence.').join(' ');
        const chunks = TextChunker.ChunkText({ Text: text, MaxChunkTokens: 10, OverlapTokens: 0, Strategy: 'sentence' });

        for (let i = 1; i < chunks.length; i++) {
            expect(chunks[i].StartOffset).toBeGreaterThanOrEqual(chunks[i - 1].StartOffset);
        }
    });

    it('keeps offsets within the bounds of the source text', () => {
        const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three is a little longer than the others.';
        const chunks = TextChunker.ChunkText({ Text: text, MaxChunkTokens: 8, OverlapTokens: 0, Strategy: 'paragraph' });

        for (const chunk of chunks) {
            expect(chunk.StartOffset).toBeGreaterThanOrEqual(0);
            expect(chunk.EndOffset).toBeLessThanOrEqual(text.length);
            expect(chunk.EndOffset).toBeGreaterThan(chunk.StartOffset);
        }
    });

    it('terminates when overlap is configured larger than the window', () => {
        // An overlap >= the window size would push the cursor backwards forever.
        const text = 'word '.repeat(200).trim();
        const chunks = TextChunker.ChunkText({ Text: text, MaxChunkTokens: 10, OverlapTokens: 50, Strategy: 'fixed' });

        expect(chunks.length).toBeGreaterThan(0);
        expect(chunks.length).toBeLessThan(500);
    });
});
