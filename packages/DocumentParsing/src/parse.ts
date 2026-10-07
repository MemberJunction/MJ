/**
 * @fileoverview Turning document bytes into text.
 *
 * One implementation, used by the Core Actions that expose file content and by the content
 * pipeline's extractors. They were separate: the actions parsed with `pdf-parse`, `mammoth` and
 * `exceljs` inline, and anything else wanting the same text either invoked an action per document —
 * putting an action run between every file and its text — or re-wrote the parsing beside it.
 *
 * Deliberately free of MJ dependencies: parsing bytes needs no provider, no user and no metadata, so
 * anything that has bytes can use this, and it can be tested without standing up a database.
 *
 * Parsers are imported on demand. A deployment that never reads spreadsheets should not pay to load
 * a spreadsheet parser, and these libraries do real work at module scope.
 *
 * @module @memberjunction/document-parsing
 */

/** Text extracted from a document, with whatever the format could say about itself. */
export interface ParsedDocument {
    /** The text, trimmed. Empty when the document genuinely yielded none. */
    Text: string;
    /** A title the format carried in its own metadata. */
    Title?: string;
    /** How many pages, for formats that have them. */
    Pages?: number;
    /**
     * The format's own metadata dictionary, as it stored it.
     *
     * Passed through rather than normalised: a PDF's Info dictionary is whatever its producer wrote,
     * and a caller surfacing it to a user or a model wants what is actually there, not this module's
     * opinion of which keys matter.
     */
    Info?: Record<string, unknown>;
    /** The format version the parser reported. */
    Version?: string;
}

/** A document converted to HTML, with whatever the converter could not represent. */
export interface ParsedHtml {
    /** The HTML. */
    Html: string;
    /** Warnings the converter raised — an unsupported style, a dropped element. */
    Messages: readonly unknown[];
}

/** One worksheet of a spreadsheet. */
export interface ParsedSheet {
    /** The worksheet's name. */
    Name: string;
    /** Its rows, each a list of cell values in column order. */
    Rows: unknown[][];
}

/**
 * Extract the text of a PDF.
 *
 * A PDF that yields nothing is usually a scan — images in a wrapper — which is a real outcome rather
 * than a failure, so it returns empty text rather than throwing. The caller decides whether an
 * empty document is worth recording.
 */
export async function ParsePdf(bytes: Uint8Array | Buffer): Promise<ParsedDocument> {
    const { default: pdfParse } = await import('pdf-parse');
    const parsed = await pdfParse(toBuffer(bytes));
    const title = typeof parsed.info?.Title === 'string' ? parsed.info.Title.trim() : '';
    return {
        Text: parsed.text?.trim() ?? '',
        ...(title ? { Title: title } : {}),
        ...(typeof parsed.numpages === 'number' ? { Pages: parsed.numpages } : {}),
        ...(parsed.info ? { Info: parsed.info as Record<string, unknown> } : {}),
        ...(typeof parsed.version === 'string' ? { Version: parsed.version } : {}),
    };
}

/** Extract the raw text of a Word document, without its formatting. */
export async function ParseWord(bytes: Uint8Array | Buffer): Promise<ParsedDocument> {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: toBuffer(bytes) });
    return { Text: result.value?.trim() ?? '' };
}

/**
 * Convert a Word document to HTML, keeping its structure.
 *
 * Separate from {@link ParseWord} because they answer different questions: raw text is what you
 * embed or classify, HTML is what you show someone or hand to something that cares about headings
 * and lists. Collapsing them would mean one caller always throwing away work the other needed.
 */
export async function ParseWordToHtml(bytes: Uint8Array | Buffer): Promise<ParsedHtml> {
    const mammoth = await import('mammoth');
    const result = await mammoth.convertToHtml({ buffer: toBuffer(bytes) });
    // The messages carry what the converter could not represent — an unsupported style, a dropped
    // element. Returning them rather than the HTML alone is what lets a caller tell a faithful
    // conversion from a lossy one.
    return { Html: result.value ?? '', Messages: result.messages ?? [] };
}

/**
 * Read a spreadsheet as worksheets of rows.
 *
 * Structure is preserved rather than flattened here, because the two callers want different things
 * from it: the action serialises it as JSON, and the pipeline turns each sheet into its own record.
 * Flattening in here would force one of them to parse the text back apart.
 */
export async function ParseSpreadsheet(bytes: Uint8Array | Buffer): Promise<ParsedSheet[]> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(toBuffer(bytes) as never);

    const sheets: ParsedSheet[] = [];
    workbook.eachSheet((worksheet) => {
        const rows: unknown[][] = [];
        worksheet.eachRow((row) => {
            const cells: unknown[] = [];
            row.eachCell((cell) => {
                cells.push(cell.value);
            });
            rows.push(cells);
        });
        sheets.push({ Name: worksheet.name, Rows: rows });
    });
    return sheets;
}

/**
 * Render parsed sheets as tab-separated text.
 *
 * For a caller that wants text rather than structure — embedding, say. Empty cells are dropped and
 * empty rows omitted, so a sparse sheet does not become a wall of tabs that means nothing to a
 * model and costs tokens to say so.
 */
export function SheetsToText(sheets: readonly ParsedSheet[]): string {
    return sheets
        .map((sheet) =>
            sheet.Rows.map((row) => row.map(cellToText).filter((c) => c.length > 0).join('\t'))
                .filter((line) => line.length > 0)
                .join('\n'),
        )
        .filter((text) => text.length > 0)
        .join('\n\n');
}

/** One cell as text, flattening the shapes ExcelJS uses for formulas and rich text. */
function cellToText(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }
    if (typeof value === 'object') {
        const cell = value as { result?: unknown; text?: unknown; richText?: { text?: string }[] };
        // A formula cell carries its computed result; rich text carries its runs.
        if (cell.result !== undefined) {
            return cellToText(cell.result);
        }
        if (typeof cell.text === 'string') {
            return cell.text.trim();
        }
        if (Array.isArray(cell.richText)) {
            return cell.richText.map((r) => r.text ?? '').join('').trim();
        }
        if (value instanceof Date) {
            return value.toISOString();
        }
        return '';
    }
    return String(value).trim();
}

/** The parsers take a Buffer; callers hold whichever they have. */
function toBuffer(bytes: Uint8Array | Buffer): Buffer {
    return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
}
