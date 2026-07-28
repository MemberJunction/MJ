import { describe, it, expect } from 'vitest';
import { FixedWindowSegmenter } from '../generic/FixedWindowSegmenter';

const segmenter = new FixedWindowSegmenter();

describe('FixedWindowSegmenter', () => {
    it('declares its key and supports every modality', () => {
        expect(segmenter.Key).toBe('FixedWindow');
        expect(segmenter.SupportedModalities).toContain('video');
        expect(segmenter.SupportedModalities).toContain('text');
    });

    describe('text', () => {
        it('splits text into token-bounded windows with offsets', async () => {
            const text = Array.from({ length: 40 }, (_, i) => `Sentence ${i} of the log file.`).join(' ');
            const result = await segmenter.Segment({ Text: text, Options: { MaxSegmentTokens: 30 } });

            expect(result.Segments.length).toBeGreaterThan(1);
            for (const segment of result.Segments) {
                expect(segment.Modality).toBe('text');
                expect(segment.StartOffset).toBeGreaterThanOrEqual(0);
                expect(segment.EndOffset).toBeLessThanOrEqual(text.length);
            }
        });

        it('keeps short text as a single segment', async () => {
            const result = await segmenter.Segment({ Text: 'Short line.', Options: { MaxSegmentTokens: 500 } });
            expect(result.Segments).toHaveLength(1);
        });
    });

    describe('media', () => {
        it('emits a single segment for an image', async () => {
            const result = await segmenter.Segment({ Media: { URL: 'photo.png', MimeType: 'image/png' } });
            expect(result.Segments).toHaveLength(1);
            expect(result.Segments[0].Modality).toBe('image');
            expect(result.Segments[0].StartMs).toBeUndefined();
        });

        it('emits fixed-duration windows across a video duration', async () => {
            const result = await segmenter.Segment({
                Media: { URL: 'talk.mp4', MimeType: 'video/mp4' },
                DurationMs: 100_000,
                Options: { WindowMs: 30_000 },
            });

            expect(result.Segments).toHaveLength(4);
            expect(result.Segments[0].StartMs).toBe(0);
            expect(result.Segments[0].EndMs).toBe(30_000);
            expect(result.Segments[3].EndMs).toBe(100_000);
            expect(result.Segments.every((s) => s.Modality === 'video')).toBe(true);
        });

        it('applies window overlap when configured', async () => {
            const result = await segmenter.Segment({
                Media: { URL: 'talk.mp4', MimeType: 'video/mp4' },
                DurationMs: 60_000,
                Options: { WindowMs: 30_000, WindowOverlapMs: 10_000 },
            });
            // step = 20s -> windows at 0, 20000, 40000
            expect(result.Segments.map((s) => s.StartMs)).toEqual([0, 20_000, 40_000]);
        });

        it('never produces a zero or negative step even with a pathological overlap', async () => {
            const result = await segmenter.Segment({
                Media: { URL: 'talk.mp4', MimeType: 'video/mp4' },
                DurationMs: 10_000,
                Options: { WindowMs: 1_000, WindowOverlapMs: 5_000 },
            });
            expect(result.Segments.length).toBeGreaterThan(0);
            expect(result.Segments.length).toBeLessThan(100);
        });

        it('emits one segment for media with unknown duration', async () => {
            const result = await segmenter.Segment({ Media: { URL: 'clip.mp4', MimeType: 'video/mp4' } });
            expect(result.Segments).toHaveLength(1);
        });

        it('classifies unknown media as multimodal', async () => {
            const result = await segmenter.Segment({ Media: { URL: 'thing.bin' } });
            expect(result.Segments[0].Modality).toBe('multimodal');
        });
    });

    it('prefers text when both text and media are supplied', async () => {
        const result = await segmenter.Segment({ Text: 'Some text.', Media: { URL: 'a.mp4', MimeType: 'video/mp4' } });
        expect(result.Segments[0].Modality).toBe('text');
    });
});
