/**
 * @fileoverview Pass-through cleaner for content that is already plain text.
 *
 * @module @memberjunction/ai-segmentation
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseContentCleaner, ContentCleaningParams } from './BaseContentCleaner';

/** Registration key for {@link PlainTextContentCleaner}. */
export const PLAIN_TEXT_CONTENT_CLEANER_KEY = 'PlainText';

/**
 * Applies only the shared cleaning rules — whitespace normalization and optional
 * truncation — leaving the text otherwise untouched.
 *
 * This is the safe default for sources that are already plain text (transcripts, extracted
 * PDF/DOCX text, markdown). It still earns its place in the pipeline: extracted text is
 * routinely full of ragged spacing and stray blank lines from the extractor, and those
 * confuse the paragraph-boundary detection that segmenters rely on.
 */
@RegisterClass(BaseContentCleaner, PLAIN_TEXT_CONTENT_CLEANER_KEY)
export class PlainTextContentCleaner extends BaseContentCleaner {
    public get Key(): string {
        return PLAIN_TEXT_CONTENT_CLEANER_KEY;
    }

    protected CleanCore(params: ContentCleaningParams): string {
        return params.Content;
    }
}
