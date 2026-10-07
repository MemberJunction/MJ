/**
 * @fileoverview Extractors for the document formats a corpus is actually made of.
 *
 * Without these the framework could discover a PDF, keep it, and then have nothing to read it with —
 * which would make it strictly worse than the autotagger it replaces.
 *
 * The parsing itself is `@memberjunction/document-parsing`, which is also what the Core Actions
 * call — one implementation, two callers. Not the actions themselves: an action is a per-invocation
 * unit with its own params, result and run record, so calling one per content item would put an
 * action run between every document and its text.
 *
 * Each is a thin adapter: decode, hand to the library, return one block. Where a document has
 * natural internal divisions that deserve to be separate records — a spreadsheet's worksheets — it
 * returns several, and the framework's existing splitting behaviour does the rest.
 *
 * @module @memberjunction/content-pipeline
 */

import { RegisterClass } from '@memberjunction/global';
import { ParsePdf, ParseSpreadsheet, ParseWord, SheetsToText } from '@memberjunction/document-parsing';
import {
    BaseContentExtractor,
    ContentBlock,
    ExtractRequest,
    ExtractResult,
} from '@memberjunction/content-pipeline-base';

/** The registered keys. */
export const PDF_EXTRACTOR = 'Pdf';
export const WORD_EXTRACTOR = 'Word';
export const SPREADSHEET_EXTRACTOR = 'Spreadsheet';

/** Reads text out of a PDF. */
@RegisterClass(BaseContentExtractor, PDF_EXTRACTOR)
export class PdfExtractor extends BaseContentExtractor {
    public readonly Key = PDF_EXTRACTOR;
    public readonly SupportedFileTypes = ['pdf'];

    public async Extract(request: ExtractRequest): Promise<ExtractResult> {
        const parsed = await ParsePdf(request.Content);
        if (parsed.Text.length === 0) {
            // A scanned PDF is images in a wrapper. Reporting no blocks is the truth; an empty block
            // would read downstream as a successful extraction of a document that says nothing.
            return { Blocks: [] };
        }
        return { Blocks: [{ Text: parsed.Text, ...(parsed.Title ? { Title: parsed.Title } : {}) }] };
    }
}

/** Reads text out of a Word document. */
@RegisterClass(BaseContentExtractor, WORD_EXTRACTOR)
export class WordExtractor extends BaseContentExtractor {
    public readonly Key = WORD_EXTRACTOR;
    public readonly SupportedFileTypes = ['docx', 'doc'];

    public async Extract(request: ExtractRequest): Promise<ExtractResult> {
        const parsed = await ParseWord(request.Content);
        return { Blocks: parsed.Text.length > 0 ? [{ Text: parsed.Text }] : [] };
    }
}

/**
 * Reads a spreadsheet, one block per worksheet.
 *
 * Several blocks rather than one: worksheets are usually separate subjects, and concatenating them
 * produces a document whose chunks straddle unrelated material. The framework already turns several
 * blocks into several records, so this needs no special case of its own.
 */
@RegisterClass(BaseContentExtractor, SPREADSHEET_EXTRACTOR)
export class SpreadsheetExtractor extends BaseContentExtractor {
    public readonly Key = SPREADSHEET_EXTRACTOR;
    public readonly SupportedFileTypes = ['xlsx', 'xlsm', 'csv'];

    public async Extract(request: ExtractRequest): Promise<ExtractResult> {
        const blocks: ContentBlock[] = [];
        for (const sheet of await ParseSpreadsheet(request.Content)) {
            if (request.Signal.aborted) {
                break;
            }
            const text = SheetsToText([sheet]);
            if (text.length === 0) {
                continue;
            }
            blocks.push({
                Text: text,
                // The sheet name as the key, so a re-extraction matches each sheet to the record it
                // produced last time rather than creating a new one.
                Key: sheet.Name,
                Title: sheet.Name,
            });
        }
        return { Blocks: blocks };
    }
}
