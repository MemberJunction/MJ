/**
 * @fileoverview Structure-aware text segmenter — splits on document headings.
 *
 * @module @memberjunction/ai-segmentation
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseSegmenter } from './BaseSegmenter';
import { ContentModality, RawSegment, SegmentationOptions, SegmentationParams } from './Segmentation.types';

/** Registration key for {@link StructuralTextSegmenter}. */
export const STRUCTURAL_TEXT_SEGMENTER_KEY = 'StructuralText';

/** Options specific to {@link StructuralTextSegmenter}. */
export interface StructuralTextSegmentationOptions extends SegmentationOptions {
    /**
     * Prepend the heading text to each section's body before embedding. Keeps a
     * section's topic in its own vector, which materially helps retrieval when the
     * body uses pronouns ("it", "the above"). Default: true.
     */
    IncludeHeadingInText?: boolean;
    /**
     * Heading syntax to look for. `'auto'` detects markdown vs. HTML from the
     * content (and honours `params.MimeType` when supplied). Default: `'auto'`.
     */
    HeadingSyntax?: 'auto' | 'markdown' | 'html';
}

/** A heading located within the source text. */
interface HeadingMatch {
    Level: number;
    Title: string;
    /** Offset where the heading itself begins. */
    StartOffset: number;
    /** Offset where the body following the heading begins. */
    BodyStart: number;
}

/**
 * Segments text along its own document structure (markdown `#` headings or HTML
 * `<h1>`-`<h6>`), emitting one segment per section and preserving the heading
 * hierarchy as parent/child links.
 *
 * This is the recommended default for documents, PDFs-converted-to-text, wiki
 * pages, and knowledge-base articles. Compared with splitting purely on a token
 * budget, sections are coherent units of meaning, so each vector represents one
 * topic instead of an arbitrary window that may straddle two.
 *
 * When the content has no headings it degrades gracefully to paragraph segments,
 * which is still better than fixed windows because paragraph breaks are authored
 * boundaries. In both cases {@link BaseSegmenter} enforces the token ceiling.
 */
@RegisterClass(BaseSegmenter, STRUCTURAL_TEXT_SEGMENTER_KEY)
export class StructuralTextSegmenter extends BaseSegmenter {
    public get Key(): string {
        return STRUCTURAL_TEXT_SEGMENTER_KEY;
    }

    public get SupportedModalities(): ContentModality[] {
        return ['text'];
    }

    protected SegmentCore(params: SegmentationParams<StructuralTextSegmentationOptions>): RawSegment[] {
        const text = params.Text ?? '';
        if (text.trim().length === 0) {
            return [];
        }
        const syntax = this.resolveSyntax(text, params);
        const headings = syntax === 'html' ? this.findHtmlHeadings(text) : this.findMarkdownHeadings(text);
        if (headings.length === 0) {
            return this.segmentByParagraph(text);
        }
        return this.buildSectionSegments(text, headings, params.Options);
    }

    // ─────────────────────────────────────────────
    // Heading detection
    // ─────────────────────────────────────────────

    /** Decide which heading syntax applies to this content. */
    private resolveSyntax(text: string, params: SegmentationParams<StructuralTextSegmentationOptions>): 'markdown' | 'html' {
        const configured = params.Options?.HeadingSyntax ?? 'auto';
        if (configured !== 'auto') {
            return configured;
        }
        if (params.MimeType && params.MimeType.toLowerCase().includes('html')) {
            return 'html';
        }
        return /<h[1-6][\s>]/i.test(text) ? 'html' : 'markdown';
    }

    /** Locate ATX-style markdown headings (`#` through `######`). */
    private findMarkdownHeadings(text: string): HeadingMatch[] {
        const regex = /^(#{1,6})[ \t]+(.+?)[ \t]*$/gm;
        const matches: HeadingMatch[] = [];
        let match = regex.exec(text);
        while (match !== null) {
            matches.push({
                Level: match[1].length,
                Title: match[2].trim(),
                StartOffset: match.index,
                BodyStart: match.index + match[0].length,
            });
            match = regex.exec(text);
        }
        return matches;
    }

    /** Locate HTML `<h1>`-`<h6>` headings. */
    private findHtmlHeadings(text: string): HeadingMatch[] {
        const regex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
        const matches: HeadingMatch[] = [];
        let match = regex.exec(text);
        while (match !== null) {
            matches.push({
                Level: Number(match[1]),
                Title: this.stripTags(match[2]).trim(),
                StartOffset: match.index,
                BodyStart: match.index + match[0].length,
            });
            match = regex.exec(text);
        }
        return matches;
    }

    /** Remove inline tags from a heading's inner HTML. */
    private stripTags(html: string): string {
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    }

    // ─────────────────────────────────────────────
    // Segment construction
    // ─────────────────────────────────────────────

    /** Build one segment per heading section, plus any preamble, with parent links. */
    private buildSectionSegments(
        text: string,
        headings: HeadingMatch[],
        options?: StructuralTextSegmentationOptions,
    ): RawSegment[] {
        const segments: RawSegment[] = [];
        const segmentIndexByHeading = new Map<number, number>();

        const preamble = this.buildPreamble(text, headings[0].StartOffset);
        if (preamble) {
            segments.push(preamble);
        }

        headings.forEach((heading, index) => {
            const end = index + 1 < headings.length ? headings[index + 1].StartOffset : text.length;
            const parentHeading = this.findParentHeading(headings, index);
            segments.push({
                Modality: 'text',
                Title: heading.Title,
                Text: this.buildSectionText(text, heading, end, options),
                StartOffset: heading.StartOffset,
                EndOffset: end,
                ParentIndex: parentHeading === undefined ? undefined : segmentIndexByHeading.get(parentHeading),
            });
            segmentIndexByHeading.set(index, segments.length - 1);
        });
        return segments;
    }

    /** Text preceding the first heading, if any. */
    private buildPreamble(text: string, firstHeadingOffset: number): RawSegment | null {
        const body = text.slice(0, firstHeadingOffset).trim();
        if (body.length === 0) {
            return null;
        }
        return { Modality: 'text', Text: body, StartOffset: 0, EndOffset: firstHeadingOffset };
    }

    /** Section body, optionally prefixed with its heading for self-contained context. */
    private buildSectionText(
        text: string,
        heading: HeadingMatch,
        end: number,
        options?: StructuralTextSegmentationOptions,
    ): string {
        const body = text.slice(heading.BodyStart, end).trim();
        const includeHeading = options?.IncludeHeadingInText ?? true;
        if (!includeHeading) {
            return body;
        }
        return body.length > 0 ? `${heading.Title}\n${body}` : heading.Title;
    }

    /** Nearest preceding heading with a lower level number (i.e. the enclosing section). */
    private findParentHeading(headings: HeadingMatch[], index: number): number | undefined {
        for (let i = index - 1; i >= 0; i--) {
            if (headings[i].Level < headings[index].Level) {
                return i;
            }
        }
        return undefined;
    }

    /** Fallback for unstructured text: one segment per paragraph, offsets preserved. */
    private segmentByParagraph(text: string): RawSegment[] {
        const segments: RawSegment[] = [];
        const regex = /\n\s*\n/g;
        let cursor = 0;
        let match = regex.exec(text);
        while (match !== null) {
            this.pushParagraph(segments, text, cursor, match.index);
            cursor = match.index + match[0].length;
            match = regex.exec(text);
        }
        this.pushParagraph(segments, text, cursor, text.length);
        return segments;
    }

    /** Append a paragraph segment when the slice has content. */
    private pushParagraph(segments: RawSegment[], text: string, start: number, end: number): void {
        const body = text.slice(start, end).trim();
        if (body.length > 0) {
            segments.push({ Modality: 'text', Text: body, StartOffset: start, EndOffset: end });
        }
    }
}
