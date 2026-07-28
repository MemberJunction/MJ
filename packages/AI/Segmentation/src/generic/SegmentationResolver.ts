/**
 * @fileoverview Helpers for selecting a segmenter from configuration or content shape.
 *
 * @module @memberjunction/ai-segmentation
 */

import { LogStatus } from '@memberjunction/core';
import { BaseSegmenter } from './BaseSegmenter';
import { FIXED_WINDOW_SEGMENTER_KEY, FixedWindowSegmenter } from './FixedWindowSegmenter';
import { STRUCTURAL_TEXT_SEGMENTER_KEY } from './StructuralTextSegmenter';
import { TRANSCRIPT_SEGMENTER_KEY } from './TranscriptSegmenter';
import { PAGED_CONTENT_SEGMENTER_KEY } from './PagedContentSegmenter';
import { BaseContentCleaner } from './BaseContentCleaner';
import { HTML_CONTENT_CLEANER_KEY } from './HtmlContentCleaner';
import { PLAIN_TEXT_CONTENT_CLEANER_KEY, PlainTextContentCleaner } from './PlainTextContentCleaner';
import { SegmentationParams } from './Segmentation.types';

/**
 * Resolve a segmenter by registration key, falling back safely.
 *
 * Configuration is data, and data drifts — a `Content Type` may name a segmenter
 * that has been renamed or lives in a package this process didn't load. Rather
 * than throw mid-ingestion, an unresolvable key logs and degrades to the
 * fixed-window segmenter, which can segment anything.
 *
 * @param key - registration key from metadata; when omitted the fallback is used.
 * @param fallbackKey - key to try before the built-in last resort.
 */
export function ResolveSegmenter(key?: string, fallbackKey?: string): BaseSegmenter {
    const requested = key ? BaseSegmenter.Resolve(key) : null;
    if (requested) {
        return requested;
    }
    if (key) {
        LogStatus(`[Segmentation] Segmenter '${key}' is not registered — falling back.`);
    }
    const fallback = fallbackKey ? BaseSegmenter.Resolve(fallbackKey) : null;
    return fallback ?? BaseSegmenter.Resolve(FIXED_WINDOW_SEGMENTER_KEY) ?? new FixedWindowSegmenter();
}

/**
 * Suggest the best-fit segmenter key for a piece of content.
 *
 * The ordering encodes the quality hierarchy: a real transcript beats document
 * structure, which beats uniform windows. Callers should treat this as a default
 * that explicit configuration may override.
 */
export function SuggestSegmenterKey(params: SegmentationParams): string {
    if (params.Cues && params.Cues.length > 0) {
        return TRANSCRIPT_SEGMENTER_KEY;
    }
    if (params.Pages && params.Pages.length > 0) {
        return PAGED_CONTENT_SEGMENTER_KEY;
    }
    if (params.Text && params.Text.trim().length > 0) {
        return STRUCTURAL_TEXT_SEGMENTER_KEY;
    }
    return FIXED_WINDOW_SEGMENTER_KEY;
}

/**
 * Resolve a content cleaner by registration key, falling back safely.
 *
 * Mirrors {@link ResolveSegmenter}: an unresolvable key logs and degrades to the
 * plain-text cleaner (whitespace normalization only) rather than throwing mid-ingestion.
 */
export function ResolveContentCleaner(key?: string, fallbackKey?: string): BaseContentCleaner {
    const requested = key ? BaseContentCleaner.Resolve(key) : null;
    if (requested) {
        return requested;
    }
    if (key) {
        LogStatus(`[Segmentation] Content cleaner '${key}' is not registered — falling back.`);
    }
    const fallback = fallbackKey ? BaseContentCleaner.Resolve(fallbackKey) : null;
    return fallback ?? BaseContentCleaner.Resolve(PLAIN_TEXT_CONTENT_CLEANER_KEY) ?? new PlainTextContentCleaner();
}

/**
 * Suggest a cleaner for a piece of content based on its mime type.
 *
 * HTML is the only format that genuinely needs structural cleaning; everything else is
 * already text and only wants whitespace normalization.
 */
export function SuggestCleanerKey(mimeType?: string): string {
    const mime = (mimeType ?? '').toLowerCase();
    return mime.includes('html') || mime.includes('xml') ? HTML_CONTENT_CLEANER_KEY : PLAIN_TEXT_CONTENT_CLEANER_KEY;
}
