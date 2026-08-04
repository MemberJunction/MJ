import { describe, it, expect } from 'vitest';
import { StructuralTextSegmenter } from '../generic/StructuralTextSegmenter';

const segmenter = new StructuralTextSegmenter();

describe('StructuralTextSegmenter', () => {
    describe('markdown', () => {
        const doc = [
            'Intro paragraph before any heading.',
            '',
            '# Chapter One',
            'Body of chapter one.',
            '',
            '## Section 1.1',
            'Body of section one point one.',
            '',
            '## Section 1.2',
            'Body of section one point two.',
            '',
            '# Chapter Two',
            'Body of chapter two.',
        ].join('\n');

        it('emits one segment per section plus the preamble', async () => {
            const result = await segmenter.Segment({ Text: doc });
            expect(result.Success).toBe(true);
            // 1 preamble + 4 headings
            expect(result.Segments).toHaveLength(5);
            expect(result.Segments[0].Text).toContain('Intro paragraph');
            expect(result.Segments[0].Title).toBeUndefined();
        });

        it('captures heading titles in document order', async () => {
            const result = await segmenter.Segment({ Text: doc });
            expect(result.Segments.map((s) => s.Title)).toEqual([
                undefined,
                'Chapter One',
                'Section 1.1',
                'Section 1.2',
                'Chapter Two',
            ]);
        });

        it('nests sub-sections under their parent heading', async () => {
            const result = await segmenter.Segment({ Text: doc });
            const chapterOne = result.Segments.find((s) => s.Title === 'Chapter One');
            const section11 = result.Segments.find((s) => s.Title === 'Section 1.1');
            const chapterTwo = result.Segments.find((s) => s.Title === 'Chapter Two');

            expect(chapterOne?.Depth).toBe(0);
            expect(section11?.Depth).toBe(1);
            expect(section11?.ParentSequence).toBe(chapterOne?.Sequence);
            expect(chapterTwo?.ParentSequence).toBeUndefined();
        });

        it('prepends the heading to the body so each vector carries its topic', async () => {
            const result = await segmenter.Segment({ Text: doc });
            const section = result.Segments.find((s) => s.Title === 'Section 1.1');
            expect(section?.Text?.startsWith('Section 1.1')).toBe(true);
        });

        it('can be configured to omit the heading from the body', async () => {
            const result = await segmenter.Segment({ Text: doc, Options: { IncludeHeadingInText: false } });
            const section = result.Segments.find((s) => s.Title === 'Section 1.1');
            expect(section?.Text?.startsWith('Section 1.1')).toBe(false);
            expect(section?.Text).toContain('one point one');
        });

        it('reports offsets that resolve back into the source document', async () => {
            const result = await segmenter.Segment({ Text: doc });
            for (const segment of result.Segments) {
                expect(segment.StartOffset).toBeGreaterThanOrEqual(0);
                expect(segment.EndOffset).toBeLessThanOrEqual(doc.length);
                if (segment.Title) {
                    expect(doc.slice(segment.StartOffset, segment.EndOffset)).toContain(segment.Title);
                }
            }
        });
    });

    describe('html', () => {
        const html =
            '<h1>Annual Report</h1><p>Overview text.</p>' +
            '<h2>Finance</h2><p>Finance text.</p>' +
            '<h2>Membership</h2><p>Membership text.</p>';

        it('detects heading structure in HTML', async () => {
            const result = await segmenter.Segment({ Text: html, MimeType: 'text/html' });
            const titles = result.Segments.map((s) => s.Title);
            expect(titles).toContain('Annual Report');
            expect(titles).toContain('Finance');
            expect(titles).toContain('Membership');
        });

        it('nests h2 under h1', async () => {
            const result = await segmenter.Segment({ Text: html, MimeType: 'text/html' });
            const top = result.Segments.find((s) => s.Title === 'Annual Report');
            const finance = result.Segments.find((s) => s.Title === 'Finance');
            expect(finance?.ParentSequence).toBe(top?.Sequence);
        });

        it('auto-detects HTML without an explicit mime type', async () => {
            const result = await segmenter.Segment({ Text: html });
            expect(result.Segments.map((s) => s.Title)).toContain('Finance');
        });
    });

    describe('fallback', () => {
        it('splits on paragraphs when the document has no headings', async () => {
            const text = 'First paragraph here.\n\nSecond paragraph here.\n\nThird paragraph here.';
            const result = await segmenter.Segment({ Text: text });

            expect(result.Segments).toHaveLength(3);
            expect(result.Segments.every((s) => s.Title === undefined)).toBe(true);
            expect(result.Segments[1].Text).toContain('Second paragraph');
        });

        it('returns no segments for empty input', async () => {
            const result = await segmenter.Segment({ Text: '   ' });
            expect(result.Success).toBe(false);
        });

        it('handles a document that is a single paragraph', async () => {
            const result = await segmenter.Segment({ Text: 'Just one paragraph with no structure at all.' });
            expect(result.Segments).toHaveLength(1);
        });
    });

    it('declares its key and supported modality', () => {
        expect(segmenter.Key).toBe('StructuralText');
        expect(segmenter.SupportedModalities).toEqual(['text']);
    });
});
