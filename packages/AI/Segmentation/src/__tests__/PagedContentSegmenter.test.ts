import { describe, it, expect } from 'vitest';
import { PagedContentSegmenter } from '../generic/PagedContentSegmenter';
import { ContentPage } from '../generic/Segmentation.types';

const segmenter = new PagedContentSegmenter();

const textPages = (count: number, body = 'Page body text.'): ContentPage[] =>
    Array.from({ length: count }, (_, i) => ({ PageNumber: i + 1, Text: `${body} (${i + 1})` }));

describe('PagedContentSegmenter', () => {
    it('declares its key and modalities', () => {
        expect(segmenter.Key).toBe('PagedContent');
        expect(segmenter.SupportedModalities).toContain('multimodal');
    });

    it('emits one segment per page, carrying the page number', async () => {
        const result = await segmenter.Segment({ Pages: textPages(3), Text: 'ignored' });
        expect(result.Segments).toHaveLength(3);
        expect(result.Segments.map((s) => s.PageNumber)).toEqual([1, 2, 3]);
    });

    it('orders pages even when supplied out of order', async () => {
        const pages: ContentPage[] = [
            { PageNumber: 3, Text: 'third' },
            { PageNumber: 1, Text: 'first' },
            { PageNumber: 2, Text: 'second' },
        ];
        const result = await segmenter.Segment({ Pages: pages });
        expect(result.Segments.map((s) => s.PageNumber)).toEqual([1, 2, 3]);
        expect(result.Segments[0].Text).toContain('first');
    });

    it('skips pages with neither text nor media', async () => {
        const pages: ContentPage[] = [
            { PageNumber: 1, Text: 'real content' },
            { PageNumber: 2, Text: '   ' },
            { PageNumber: 3 },
        ];
        const result = await segmenter.Segment({ Pages: pages });
        expect(result.Segments).toHaveLength(1);
    });

    it('returns nothing when there are no usable pages', async () => {
        const result = await segmenter.Segment({ Pages: [], Text: 'x' });
        expect(result.Success).toBe(true);
        expect(result.Segments).toEqual([]);
    });

    describe('modality', () => {
        it('marks a text-only page as text', async () => {
            const result = await segmenter.Segment({ Pages: [{ PageNumber: 1, Text: 'words' }] });
            expect(result.Segments[0].Modality).toBe('text');
        });

        it('marks a media-only page as image', async () => {
            const result = await segmenter.Segment({
                Pages: [{ PageNumber: 1, Media: { URL: 'p1.png', MimeType: 'image/png' } }],
            });
            expect(result.Segments[0].Modality).toBe('image');
        });

        it('marks a page with both text and media as multimodal', async () => {
            const result = await segmenter.Segment({
                Pages: [{ PageNumber: 1, Text: 'caption', Media: { URL: 'p1.png' } }],
            });
            expect(result.Segments[0].Modality).toBe('multimodal');
            expect(result.Segments[0].Media?.URL).toBe('p1.png');
        });
    });

    describe('options', () => {
        it('can label pages in the embedded text', async () => {
            const result = await segmenter.Segment({
                Pages: textPages(1),
                Options: { IncludePageLabel: true },
            });
            expect(result.Segments[0].Text?.startsWith('Page 1')).toBe(true);
        });

        it('merges small consecutive text pages when asked', async () => {
            const result = await segmenter.Segment({
                Pages: textPages(6, 'tiny'),
                Options: { MergeSmallPages: true, MaxSegmentTokens: 500 },
            });
            expect(result.Segments.length).toBeLessThan(6);
        });

        it('never merges across a page carrying media', async () => {
            const pages: ContentPage[] = [
                { PageNumber: 1, Text: 'a' },
                { PageNumber: 2, Text: 'b', Media: { URL: 'p2.png' } },
                { PageNumber: 3, Text: 'c' },
            ];
            const result = await segmenter.Segment({
                Pages: pages,
                Options: { MergeSmallPages: true, MaxSegmentTokens: 500 },
            });
            // The media page must remain its own segment so its provenance stays true.
            const mediaSegments = result.Segments.filter((s) => s.Media);
            expect(mediaSegments).toHaveLength(1);
            expect(mediaSegments[0].PageNumber).toBe(2);
        });
    });
});
