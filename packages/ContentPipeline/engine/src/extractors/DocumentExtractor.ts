/**
 * @fileoverview PDF, Word and spreadsheet extractors: thin adapters over `@memberjunction/document-parsing`.
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
            // A scanned PDF has no text; an empty block would read as a successful extraction.
            return { Blocks: [] };
        }
        return { Blocks: [{ Text: parsed.Text, ...(parsed.Title ? { Title: parsed.Title } : {}) }] };
    }
}

/** Reads text out of a Word document. `.docx` only: mammoth cannot read the binary `.doc` format. */
@RegisterClass(BaseContentExtractor, WORD_EXTRACTOR)
export class WordExtractor extends BaseContentExtractor {
    public readonly Key = WORD_EXTRACTOR;
    public readonly SupportedFileTypes = ['docx'];

    public async Extract(request: ExtractRequest): Promise<ExtractResult> {
        const parsed = await ParseWord(request.Content);
        return { Blocks: parsed.Text.length > 0 ? [{ Text: parsed.Text }] : [] };
    }
}

/** Reads a spreadsheet, one block per worksheet, since sheets are usually separate subjects. */
@RegisterClass(BaseContentExtractor, SPREADSHEET_EXTRACTOR)
export class SpreadsheetExtractor extends BaseContentExtractor {
    public readonly Key = SPREADSHEET_EXTRACTOR;
    // Not csv: ExcelJS's .xlsx reader rejects a CSV as "not a zip".
    public readonly SupportedFileTypes = ['xlsx', 'xlsm'];

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
                // Sheet name as key, so a re-extraction matches each sheet to its existing record.
                Key: sheet.Name,
                Title: sheet.Name,
            });
        }
        return { Blocks: blocks };
    }
}
