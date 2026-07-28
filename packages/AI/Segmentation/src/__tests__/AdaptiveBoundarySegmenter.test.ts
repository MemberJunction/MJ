import { describe, it, expect } from 'vitest';
import { AdaptiveBoundarySegmenter } from '../generic/AdaptiveBoundarySegmenter';

const segmenter = new AdaptiveBoundarySegmenter();

/** ~4 chars/token, so N tokens ≈ N*4 chars. */
const sentence = (i: number) => `This is sentence number ${i} and it carries some content.`;
const paragraphs = (count: number, perParagraph = 6) =>
    Array.from({ length: count }, (_, p) =>
        Array.from({ length: perParagraph }, (_, s) => sentence(p * perParagraph + s)).join(' '),
    ).join('\n\n');

describe('AdaptiveBoundarySegmenter', () => {
    it('declares its key and modality', () => {
        expect(segmenter.Key).toBe('AdaptiveBoundary');
        expect(segmenter.SupportedModalities).toEqual(['text']);
    });

    describe('no-split tolerance', () => {
        it('emits one segment when the text is only modestly over target', async () => {
            // ~110 chars vs a 100-token (400 char) target — well inside NoSplitPercent
            const result = await segmenter.Segment({ Text: paragraphs(1, 2), Options: { TargetTokens: 100 } });
            expect(result.Segments).toHaveLength(1);
        });

        it('splits once the text exceeds the no-split band', async () => {
            const result = await segmenter.Segment({
                Text: paragraphs(10),
                Options: { TargetTokens: 60, NoSplitPercent: 10 },
            });
            expect(result.Segments.length).toBeGreaterThan(1);
        });

        it('respects a configured NoSplitPercent of zero', async () => {
            const text = paragraphs(4);
            const lenient = await segmenter.Segment({ Text: text, Options: { TargetTokens: 200, NoSplitPercent: 500 } });
            const strict = await segmenter.Segment({ Text: text, Options: { TargetTokens: 60, NoSplitPercent: 0 } });
            expect(lenient.Segments).toHaveLength(1);
            expect(strict.Segments.length).toBeGreaterThan(1);
        });
    });

    describe('boundary preference', () => {
        it('prefers paragraph breaks — segments end at paragraph boundaries', async () => {
            const text = paragraphs(8, 5);
            const result = await segmenter.Segment({
                Text: text,
                Options: { TargetTokens: 80, OverlapTokens: 0, NoSplitPercent: 0 },
            });

            expect(result.Segments.length).toBeGreaterThan(1);
            // Every segment except possibly the last should end where a paragraph ended,
            // i.e. its final character is sentence-terminating punctuation.
            for (const segment of result.Segments.slice(0, -1)) {
                expect(segment.Text?.trimEnd().endsWith('.')).toBe(true);
            }
        });

        it('falls back to sentence breaks when no paragraph break is in range', async () => {
            // One long paragraph — no \n\n anywhere, so paragraph detection can't fire.
            const text = Array.from({ length: 40 }, (_, i) => sentence(i)).join(' ');
            const result = await segmenter.Segment({
                Text: text,
                Options: { TargetTokens: 60, OverlapTokens: 0, NoSplitPercent: 0 },
            });

            expect(result.Segments.length).toBeGreaterThan(1);
            for (const segment of result.Segments.slice(0, -1)) {
                expect(segment.Text?.trimEnd().endsWith('.')).toBe(true);
            }
        });

        it('falls back to word breaks when there is no sentence punctuation', async () => {
            const text = 'alpha '.repeat(400).trim();
            const result = await segmenter.Segment({
                Text: text,
                Options: { TargetTokens: 50, OverlapTokens: 0, NoSplitPercent: 0 },
            });

            expect(result.Segments.length).toBeGreaterThan(1);
            // Word-boundary splitting must never bisect a token.
            for (const segment of result.Segments) {
                expect(segment.Text).toMatch(/^alpha( alpha)*$/);
            }
        });

        it('cuts at the hard ceiling when no boundary of any kind exists', async () => {
            const text = 'x'.repeat(5000);
            const result = await segmenter.Segment({
                Text: text,
                Options: { TargetTokens: 50, MaxSegmentTokens: 60, OverlapTokens: 0, NoSplitPercent: 0 },
            });
            expect(result.Segments.length).toBeGreaterThan(1);
            for (const segment of result.Segments) {
                expect(segment.TokenEstimate).toBeLessThanOrEqual(60);
            }
        });
    });

    describe('sizing', () => {
        it('produces segments that vary in size — boundaries win over exact sizing', async () => {
            const result = await segmenter.Segment({
                Text: paragraphs(12, 4),
                Options: { TargetTokens: 80, OverlapTokens: 0, NoSplitPercent: 0 },
            });
            const sizes = new Set(result.Segments.map((s) => s.TokenEstimate));
            expect(result.Segments.length).toBeGreaterThan(2);
            expect(sizes.size).toBeGreaterThan(1);
        });

        it('never exceeds the hard ceiling', async () => {
            const result = await segmenter.Segment({
                Text: paragraphs(20),
                Options: { TargetTokens: 100, MaxSegmentTokens: 140, OverlapTokens: 0, NoSplitPercent: 0 },
            });
            for (const segment of result.Segments) {
                expect(segment.TokenEstimate).toBeLessThanOrEqual(140);
            }
        });

        it('raises a hard ceiling that would sit below the target', async () => {
            // MaxSegmentTokens < TargetTokens would otherwise mean every segment is
            // ceiling-cut before a boundary is ever considered.
            const result = await segmenter.Segment({
                Text: paragraphs(6),
                Options: { TargetTokens: 200, MaxSegmentTokens: 50, OverlapTokens: 0, NoSplitPercent: 0 },
            });
            expect(result.Success).toBe(true);
            expect(result.Segments.length).toBeGreaterThan(0);
        });
    });

    describe('offsets and termination', () => {
        it('reports offsets that resolve back into the source text', async () => {
            const text = paragraphs(10);
            const result = await segmenter.Segment({
                Text: text,
                Options: { TargetTokens: 70, OverlapTokens: 0, NoSplitPercent: 0 },
            });

            for (const segment of result.Segments) {
                const slice = text.slice(segment.StartOffset, segment.EndOffset);
                expect(slice).toContain((segment.Text ?? '').slice(0, 20));
            }
        });

        it('advances even when overlap would stall the cursor', async () => {
            const result = await segmenter.Segment({
                Text: paragraphs(10),
                Options: { TargetTokens: 40, OverlapTokens: 10_000, NoSplitPercent: 0 },
            });
            expect(result.Segments.length).toBeGreaterThan(0);
            expect(result.Segments.length).toBeLessThan(200);
        });

        it('returns no segments for empty input', async () => {
            const result = await segmenter.Segment({ Text: '   ' });
            expect(result.Success).toBe(false);
        });
    });
});
