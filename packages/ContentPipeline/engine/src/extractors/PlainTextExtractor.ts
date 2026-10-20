/**
 * @fileoverview {@link PlainTextExtractor} — UTF-8 decoding, for a file type metadata routes to it.
 * Formats no rung names get Extract's own sanity-checked plain-text read instead.
 *
 * @module @memberjunction/content-pipeline
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseContentExtractor, ExtractRequest, ExtractResult } from '@memberjunction/content-pipeline-base';

/** The registered key. */
export const PLAIN_TEXT_EXTRACTOR = 'PlainText';

/** Decodes bytes as UTF-8 text. Claims every file type, so it reads whatever it is named for. */
@RegisterClass(BaseContentExtractor, PLAIN_TEXT_EXTRACTOR)
export class PlainTextExtractor extends BaseContentExtractor {
    public readonly Key = PLAIN_TEXT_EXTRACTOR;
    public readonly SupportedFileTypes = ['*'];

    public async Extract(request: ExtractRequest): Promise<ExtractResult> {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(request.Content);
        return { Blocks: text.length > 0 ? [{ Text: text }] : [], IsFallback: true };
    }
}
