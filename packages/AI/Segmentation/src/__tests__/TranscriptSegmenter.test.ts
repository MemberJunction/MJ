import { describe, it, expect } from 'vitest';
import { TranscriptSegmenter } from '../generic/TranscriptSegmenter';
import { TranscriptCue } from '../generic/Segmentation.types';

const segmenter = new TranscriptSegmenter();

/** Build a cue list with no gaps, each cue `durationMs` long. */
const contiguousCues = (count: number, durationMs = 1000, speaker?: string): TranscriptCue[] =>
    Array.from({ length: count }, (_, i) => ({
        StartMs: i * durationMs,
        EndMs: (i + 1) * durationMs,
        Text: `Utterance number ${i}.`,
        Speaker: speaker,
    }));

describe('TranscriptSegmenter', () => {
    it('declares its key and supported modalities', () => {
        expect(segmenter.Key).toBe('Transcript');
        expect(segmenter.SupportedModalities).toEqual(['audio', 'video', 'multimodal']);
    });

    it('returns no segments when there are no cues', async () => {
        const result = await segmenter.Segment({ Media: { URL: 'a.mp4' }, Cues: [] });
        expect(result.Success).toBe(true);
        expect(result.Segments).toEqual([]);
    });

    describe('chapter boundaries', () => {
        it('starts a new chapter after a silence gap', async () => {
            const cues: TranscriptCue[] = [
                { StartMs: 0, EndMs: 1000, Text: 'Opening remarks about the agenda.' },
                { StartMs: 1000, EndMs: 2000, Text: 'Still on the agenda topic.' },
                // 10s gap -> boundary
                { StartMs: 12000, EndMs: 13000, Text: 'Now discussing the budget.' },
            ];
            const result = await segmenter.Segment({ Cues: cues, Media: { URL: 'a.mp4' } });

            expect(result.Segments).toHaveLength(2);
            expect(result.Segments[0].EndMs).toBe(2000);
            expect(result.Segments[1].StartMs).toBe(12000);
        });

        it('does not split on a gap below the threshold', async () => {
            const cues: TranscriptCue[] = [
                { StartMs: 0, EndMs: 1000, Text: 'First point.' },
                { StartMs: 1500, EndMs: 2500, Text: 'Second point.' },
            ];
            const result = await segmenter.Segment({ Cues: cues, Media: { URL: 'a.mp4' } });
            expect(result.Segments).toHaveLength(1);
        });

        it('honours a configured boundary gap', async () => {
            const cues: TranscriptCue[] = [
                { StartMs: 0, EndMs: 1000, Text: 'First point.' },
                { StartMs: 1500, EndMs: 2500, Text: 'Second point.' },
            ];
            const result = await segmenter.Segment({
                Cues: cues,
                Media: { URL: 'a.mp4' },
                Options: { BoundaryGapMs: 400 },
            });
            expect(result.Segments).toHaveLength(2);
        });

        it('caps chapter duration', async () => {
            const cues = contiguousCues(20, 1000);
            const result = await segmenter.Segment({
                Cues: cues,
                Media: { URL: 'a.mp4' },
                Options: { MaxChapterMs: 5000, MaxSegmentTokens: 10_000 },
            });
            expect(result.Segments.length).toBeGreaterThan(1);
            for (const segment of result.Segments) {
                expect((segment.EndMs ?? 0) - (segment.StartMs ?? 0)).toBeLessThanOrEqual(6000);
            }
        });

        it('sorts out-of-order cues before segmenting', async () => {
            const cues: TranscriptCue[] = [
                { StartMs: 5000, EndMs: 6000, Text: 'Later utterance.' },
                { StartMs: 0, EndMs: 1000, Text: 'Earlier utterance.' },
            ];
            const result = await segmenter.Segment({
                Cues: cues,
                Media: { URL: 'a.mp4' },
                Options: { BoundaryGapMs: 10_000 },
            });
            expect(result.Segments[0].StartMs).toBe(0);
            expect(result.Segments[0].Text).toContain('Earlier');
        });
    });

    describe('dual representation', () => {
        it('carries both a media reference with a time window and the transcript text', async () => {
            const result = await segmenter.Segment({
                Cues: contiguousCues(3),
                Media: { URL: 'https://cdn/session.mp4', MimeType: 'video/mp4' },
            });
            const segment = result.Segments[0];

            expect(segment.Media?.URL).toBe('https://cdn/session.mp4');
            expect(segment.StartMs).toBe(0);
            expect(segment.EndMs).toBe(3000);
            expect(segment.Text).toContain('Utterance number 0');
            expect(segment.Modality).toBe('video');
        });

        it('infers audio modality from the mime type', async () => {
            const result = await segmenter.Segment({
                Cues: contiguousCues(2),
                Media: { URL: 'ep.mp3', MimeType: 'audio/mpeg' },
            });
            expect(result.Segments[0].Modality).toBe('audio');
        });

        it('falls back to the configured default modality', async () => {
            const result = await segmenter.Segment({
                Cues: contiguousCues(2),
                Media: { URL: 'unknown.bin' },
                Options: { DefaultModality: 'video' },
            });
            expect(result.Segments[0].Modality).toBe('video');
        });

        it('prefixes speaker labels so the transcript reads as dialogue', async () => {
            const cues: TranscriptCue[] = [
                { StartMs: 0, EndMs: 1000, Text: 'Welcome everyone.', Speaker: 'Host' },
                { StartMs: 1000, EndMs: 2000, Text: 'Glad to be here.', Speaker: 'Guest' },
            ];
            const result = await segmenter.Segment({ Cues: cues, Media: { URL: 'a.mp4' } });
            expect(result.Segments[0].Text).toContain('Host: Welcome everyone.');
            expect(result.Segments[0].Text).toContain('Guest: Glad to be here.');
        });

        it('records a single speaker on the segment but not a mixed one', async () => {
            const single = await segmenter.Segment({ Cues: contiguousCues(2, 1000, 'Host'), Media: { URL: 'a.mp4' } });
            expect(single.Segments[0].Speaker).toBe('Host');

            const mixed = await segmenter.Segment({
                Cues: [
                    { StartMs: 0, EndMs: 1000, Text: 'A.', Speaker: 'Host' },
                    { StartMs: 1000, EndMs: 2000, Text: 'B.', Speaker: 'Guest' },
                ],
                Media: { URL: 'a.mp4' },
            });
            expect(mixed.Segments[0].Speaker).toBeUndefined();
        });
    });

    describe('sub-chapters', () => {
        const mixedSpeakers: TranscriptCue[] = [
            { StartMs: 0, EndMs: 1000, Text: 'Intro from the host.', Speaker: 'Host' },
            { StartMs: 1000, EndMs: 2000, Text: 'Response from guest.', Speaker: 'Guest' },
            { StartMs: 2000, EndMs: 3000, Text: 'Follow up from host.', Speaker: 'Host' },
        ];

        it('is off by default to avoid doubling embedding cost', async () => {
            const result = await segmenter.Segment({ Cues: mixedSpeakers, Media: { URL: 'a.mp4' } });
            expect(result.Segments).toHaveLength(1);
        });

        it('emits one child per speaker run when enabled', async () => {
            const result = await segmenter.Segment({
                Cues: mixedSpeakers,
                Media: { URL: 'a.mp4' },
                Options: { EmitSubChapters: true },
            });

            expect(result.Segments).toHaveLength(4); // 1 chapter + 3 speaker runs
            const children = result.Segments.filter((s) => s.ParentSequence === 0);
            expect(children).toHaveLength(3);
            expect(children.map((c) => c.Speaker)).toEqual(['Host', 'Guest', 'Host']);
            expect(children.every((c) => c.Depth === 1)).toBe(true);
        });

        it('does not emit children when the chapter has a single speaker', async () => {
            const result = await segmenter.Segment({
                Cues: contiguousCues(3, 1000, 'Host'),
                Media: { URL: 'a.mp4' },
                Options: { EmitSubChapters: true },
            });
            expect(result.Segments).toHaveLength(1);
        });
    });
});
