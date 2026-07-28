import { describe, it, expect } from 'vitest';
import { BaseSegmenter } from '../generic/BaseSegmenter';
import { ContentModality, RawSegment, SegmentationParams } from '../generic/Segmentation.types';

/** A test double that emits whatever raw segments the test supplies. */
class ScriptedSegmenter extends BaseSegmenter {
    constructor(private readonly scripted: RawSegment[], private readonly throwMessage?: string) {
        super();
    }
    public get Key(): string {
        return 'Scripted';
    }
    public get SupportedModalities(): ContentModality[] {
        return ['text', 'video'];
    }
    protected SegmentCore(_params: SegmentationParams): RawSegment[] {
        if (this.throwMessage) {
            throw new Error(this.throwMessage);
        }
        return this.scripted;
    }
}

const textSegment = (text: string, extra: Partial<RawSegment> = {}): RawSegment => ({
    Modality: 'text',
    Text: text,
    ...extra,
});

describe('BaseSegmenter', () => {
    describe('validation', () => {
        it('fails when no payload is supplied', async () => {
            const result = await new ScriptedSegmenter([]).Segment({});
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('requires Text, Media, or Cues');
        });

        it('succeeds with an empty segment list when the strategy finds nothing', async () => {
            const result = await new ScriptedSegmenter([]).Segment({ Text: 'hello' });
            expect(result.Success).toBe(true);
            expect(result.Segments).toEqual([]);
        });

        it('converts a thrown strategy error into a failed result rather than propagating', async () => {
            const result = await new ScriptedSegmenter([], 'boom').Segment({ Text: 'hello' });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toBe('boom');
        });
    });

    describe('normalization', () => {
        it('assigns contiguous sequence numbers and stamps provenance', async () => {
            const segmenter = new ScriptedSegmenter([textSegment('one'), textSegment('two'), textSegment('three')]);
            const result = await segmenter.Segment({ Text: 'source' });

            expect(result.Segments.map((s) => s.Sequence)).toEqual([0, 1, 2]);
            expect(result.Segments.every((s) => s.SegmenterKey === 'Scripted')).toBe(true);
            expect(result.Segments.every((s) => s.TokenEstimate > 0)).toBe(true);
        });

        it('drops segments carrying neither text nor media, and warns', async () => {
            const segmenter = new ScriptedSegmenter([textSegment('kept'), textSegment('   '), { Modality: 'text' }]);
            const result = await segmenter.Segment({ Text: 'source' });

            expect(result.Segments).toHaveLength(1);
            expect(result.Warnings.join(' ')).toContain('Dropped 2 empty segment(s)');
        });

        it('keeps a media-only segment even though it has no text', async () => {
            const segmenter = new ScriptedSegmenter([
                { Modality: 'video', Media: { URL: 'https://example.com/a.mp4' }, StartMs: 0, EndMs: 1000 },
            ]);
            const result = await segmenter.Segment({ Text: 'source' });

            expect(result.Segments).toHaveLength(1);
            expect(result.Segments[0].Text).toBeUndefined();
            expect(result.Segments[0].TokenEstimate).toBe(0);
            expect(result.Segments[0].Media?.URL).toBe('https://example.com/a.mp4');
        });
    });

    describe('token ceiling', () => {
        it('splits an oversized text segment and warns', async () => {
            const long = Array.from({ length: 60 }, (_, i) => `This is sentence ${i} of a long section.`).join(' ');
            const segmenter = new ScriptedSegmenter([textSegment(long, { Title: 'Big Section', StartOffset: 100 })]);
            const result = await segmenter.Segment({ Text: long, Options: { MaxSegmentTokens: 40 } });

            expect(result.Segments.length).toBeGreaterThan(1);
            expect(result.Warnings.join(' ')).toContain('Split 1 oversized segment');
            // Metadata is preserved across the split pieces.
            expect(result.Segments.every((s) => s.Title === 'Big Section')).toBe(true);
            // Offsets are rebased onto the parent segment's start offset.
            expect(result.Segments[0].StartOffset).toBeGreaterThanOrEqual(100);
        });

        it('leaves a segment within the ceiling untouched', async () => {
            const segmenter = new ScriptedSegmenter([textSegment('short text')]);
            const result = await segmenter.Segment({ Text: 'short text', Options: { MaxSegmentTokens: 500 } });

            expect(result.Segments).toHaveLength(1);
            expect(result.Warnings.join(' ')).not.toContain('Split');
        });
    });

    describe('hierarchy', () => {
        it('remaps ParentIndex to the parent segment sequence', async () => {
            const segmenter = new ScriptedSegmenter([
                textSegment('chapter'),
                textSegment('child a', { ParentIndex: 0 }),
                textSegment('child b', { ParentIndex: 0 }),
            ]);
            const result = await segmenter.Segment({ Text: 'source' });

            expect(result.Segments[0].ParentSequence).toBeUndefined();
            expect(result.Segments[0].Depth).toBe(0);
            expect(result.Segments[1].ParentSequence).toBe(0);
            expect(result.Segments[1].Depth).toBe(1);
            expect(result.Segments[2].ParentSequence).toBe(0);
        });

        it('keeps parent links correct when the parent is split into several pieces', async () => {
            const long = Array.from({ length: 60 }, (_, i) => `Parent sentence ${i} here.`).join(' ');
            const segmenter = new ScriptedSegmenter([textSegment(long), textSegment('child', { ParentIndex: 0 })]);
            const result = await segmenter.Segment({ Text: long, Options: { MaxSegmentTokens: 40 } });

            const child = result.Segments[result.Segments.length - 1];
            expect(child.Text).toBe('child');
            // Parent resolves to the FIRST piece of the split parent.
            expect(child.ParentSequence).toBe(0);
        });

        it('does not hang on a cyclic parent reference', async () => {
            const segmenter = new ScriptedSegmenter([
                textSegment('a', { ParentIndex: 1 }),
                textSegment('b', { ParentIndex: 0 }),
            ]);
            const result = await segmenter.Segment({ Text: 'source' });
            expect(result.Success).toBe(true);
            expect(result.Segments).toHaveLength(2);
        });
    });

    describe('minimum segment size', () => {
        it('merges adjacent undersized text segments', async () => {
            const segmenter = new ScriptedSegmenter([textSegment('tiny'), textSegment('also tiny'), textSegment('third')]);
            const result = await segmenter.Segment({
                Text: 'source',
                Options: { MinSegmentTokens: 50, MaxSegmentTokens: 500 },
            });

            expect(result.Segments).toHaveLength(1);
            expect(result.Segments[0].Text).toContain('tiny');
            expect(result.Segments[0].Text).toContain('third');
        });

        it('never merges across a media boundary', async () => {
            const segmenter = new ScriptedSegmenter([
                textSegment('tiny'),
                { Modality: 'video', Media: { URL: 'clip.mp4' } },
                textSegment('other'),
            ]);
            const result = await segmenter.Segment({ Text: 'source', Options: { MinSegmentTokens: 50 } });
            expect(result.Segments).toHaveLength(3);
        });

        it('is off by default', async () => {
            const segmenter = new ScriptedSegmenter([textSegment('a'), textSegment('b')]);
            const result = await segmenter.Segment({ Text: 'source' });
            expect(result.Segments).toHaveLength(2);
        });
    });

    describe('Resolve', () => {
        it('returns null for an unknown or blank key', () => {
            expect(BaseSegmenter.Resolve('')).toBeNull();
            expect(BaseSegmenter.Resolve('   ')).toBeNull();
        });
    });
});
