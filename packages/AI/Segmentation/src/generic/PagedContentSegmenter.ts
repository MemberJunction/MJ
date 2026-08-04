/**
 * @fileoverview Page-per-segment segmenter for paginated sources (PDF, slide decks).
 *
 * @module @memberjunction/ai-segmentation
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseSegmenter } from './BaseSegmenter';
import { ContentModality, ContentPage, RawSegment, SegmentationOptions, SegmentationParams } from './Segmentation.types';

/** Registration key for {@link PagedContentSegmenter}. */
export const PAGED_CONTENT_SEGMENTER_KEY = 'PagedContent';

/** Options specific to {@link PagedContentSegmenter}. */
export interface PagedContentSegmentationOptions extends SegmentationOptions {
    /**
     * Merge consecutive pages until the token target is reached, instead of emitting one
     * segment per page. Useful for documents with very short pages (slide decks) where a
     * single slide is too little context to retrieve on. Default: false.
     */
    MergeSmallPages?: boolean;
    /** Prefix each segment's text with a "Page N" label. Default: false. */
    IncludePageLabel?: boolean;
}

/**
 * Emits one segment per page of a paginated source, preserving `PageNumber`.
 *
 * Page boundaries are authored boundaries — an author decided where the page broke — which
 * makes them a better split point than any inferred one, and they give citation-grade
 * provenance: a retrieved chunk resolves to "page 14 of this PDF" rather than a character
 * offset nobody can act on.
 *
 * Each page may carry text, a media reference, or both. The media case is what enables
 * embedding a PDF page *as an image* with a multimodal model — preserving tables, charts,
 * and layout that text extraction flattens or loses entirely — while the extracted text
 * rides along for lexical search and agent reasoning.
 *
 * Pages are supplied by the caller via `SegmentationParams.Pages`; this segmenter does no
 * PDF parsing itself, keeping document-format dependencies out of the segmentation layer.
 */
@RegisterClass(BaseSegmenter, PAGED_CONTENT_SEGMENTER_KEY)
export class PagedContentSegmenter extends BaseSegmenter {
    public get Key(): string {
        return PAGED_CONTENT_SEGMENTER_KEY;
    }

    public get SupportedModalities(): ContentModality[] {
        return ['text', 'image', 'multimodal'];
    }

    protected SegmentCore(params: SegmentationParams<PagedContentSegmentationOptions>): RawSegment[] {
        const pages = (params.Pages ?? []).filter((p) => this.hasPageContent(p));
        if (pages.length === 0) {
            return [];
        }
        const ordered = [...pages].sort((a, b) => a.PageNumber - b.PageNumber);
        return params.Options?.MergeSmallPages
            ? this.mergePages(ordered, params)
            : ordered.map((page) => this.pageToSegment(page, params.Options));
    }

    /** True when a page carries text or media. */
    private hasPageContent(page: ContentPage): boolean {
        return (!!page.Text && page.Text.trim().length > 0) || !!page.Media;
    }

    /** One page becomes one segment. */
    private pageToSegment(page: ContentPage, options?: PagedContentSegmentationOptions): RawSegment {
        const label = options?.IncludePageLabel ? `Page ${page.PageNumber}\n` : '';
        const text = page.Text?.trim();
        return {
            Modality: this.resolveModality(page),
            Text: text ? `${label}${text}` : undefined,
            Media: page.Media,
            PageNumber: page.PageNumber,
        };
    }

    /**
     * Merge consecutive TEXT-ONLY pages up to the token target.
     *
     * A page carrying media is never merged: its media reference identifies one page, so
     * folding another page's text into it would make the segment's provenance a lie.
     */
    private mergePages(pages: ContentPage[], params: SegmentationParams<PagedContentSegmentationOptions>): RawSegment[] {
        const maxTokens = this.resolveOptions(params.Options).MaxSegmentTokens;
        const segments: RawSegment[] = [];

        for (const page of pages) {
            const candidate = this.pageToSegment(page, params.Options);
            const previous = segments[segments.length - 1];
            const mergeable =
                previous && !previous.Media && !candidate.Media &&
                this.tokensOf(previous) + this.tokensOf(candidate) <= maxTokens;

            if (mergeable) {
                previous.Text = `${previous.Text ?? ''}\n\n${candidate.Text ?? ''}`.trim();
            } else {
                segments.push(candidate);
            }
        }
        return segments;
    }

    /** Text pages are text; a page with media is an image, or multimodal when it has both. */
    private resolveModality(page: ContentPage): ContentModality {
        if (!page.Media) {
            return 'text';
        }
        return page.Text && page.Text.trim().length > 0 ? 'multimodal' : 'image';
    }
}
