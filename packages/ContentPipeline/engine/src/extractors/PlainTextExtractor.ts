/**
 * @fileoverview {@link PlainTextExtractor} — the built-in last rung of the extractor cascade.
 *
 * @module @memberjunction/content-pipeline
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseContentExtractor, ExtractRequest, ExtractResult } from '@memberjunction/content-pipeline-base';

/** The registered key. */
export const PLAIN_TEXT_EXTRACTOR = 'PlainText';

/**
 * Decodes bytes as UTF-8 text.
 *
 * Declares support for everything, which is appropriate only for the fallback rung — a extractor at any
 * other rung that claimed `'*'` would shadow more specific extractors below it.
 */
@RegisterClass(BaseContentExtractor, PLAIN_TEXT_EXTRACTOR)
export class PlainTextExtractor extends BaseContentExtractor {
    public readonly Key = PLAIN_TEXT_EXTRACTOR;
    public readonly SupportedFileTypes = ['*'];

    public async Extract(request: ExtractRequest): Promise<ExtractResult> {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(request.Content);
        return { Blocks: text.length > 0 ? [{ Text: text }] : [], IsFallback: true };
    }
}
