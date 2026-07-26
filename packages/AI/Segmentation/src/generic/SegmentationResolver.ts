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
    if (params.Text && params.Text.trim().length > 0) {
        return STRUCTURAL_TEXT_SEGMENTER_KEY;
    }
    return FIXED_WINDOW_SEGMENTER_KEY;
}
