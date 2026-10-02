/**
 * @fileoverview {@link PlainTextReader} — the built-in last rung of the reader cascade.
 *
 * @module @memberjunction/content-pipeline
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseContentReader, ReadRequest, ReadResult } from '@memberjunction/content-pipeline-base';

/** The registered key. */
export const PLAIN_TEXT_READER = 'PlainText';

/**
 * Decodes bytes as UTF-8 text.
 *
 * Declares support for everything, which is appropriate only for the fallback rung — a reader at any
 * other rung that claimed `'*'` would shadow more specific readers below it.
 */
@RegisterClass(BaseContentReader, PLAIN_TEXT_READER)
export class PlainTextReader extends BaseContentReader {
    public readonly Key = PLAIN_TEXT_READER;
    public readonly SupportedFileTypes = ['*'];

    public async Read(request: ReadRequest): Promise<ReadResult> {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(request.Content);
        return { Blocks: text.length > 0 ? [{ Text: text }] : [], IsFallback: true };
    }
}
