/**
 * @fileoverview Turns document bytes into text, for the Core Actions and the content pipeline.
 * Free of MJ dependencies, so it needs no provider or database.
 *
 * @module @memberjunction/document-parsing
 */

import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';

/** Text extracted from a document, with whatever the format could say about itself. */
export interface ParsedDocument {
    /** The text, trimmed. Empty when the document genuinely yielded none. */
    Text: string;
    /** A title the format carried in its own metadata. */
    Title?: string;
    /** How many pages, for formats that have them. */
    Pages?: number;
    /** The format's own metadata dictionary, passed through as stored. */
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

/** Extract the text of a PDF. A scanned PDF returns empty text rather than throwing. */
export async function ParsePdf(bytes: Uint8Array | Buffer): Promise<ParsedDocument> {
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
    const result = await mammoth.extractRawText({ buffer: toBuffer(bytes) });
    return { Text: result.value?.trim() ?? '' };
}

/** Convert a Word document to HTML, keeping its structure. */
export async function ParseWordToHtml(bytes: Uint8Array | Buffer): Promise<ParsedHtml> {
    const result = await mammoth.convertToHtml({ buffer: toBuffer(bytes) });
    return { Html: result.value ?? '', Messages: result.messages ?? [] };
}

/** Read a spreadsheet as worksheets of rows. Use {@link SheetsToText} for flat text. */
export async function ParseSpreadsheet(bytes: Uint8Array | Buffer): Promise<ParsedSheet[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(toBuffer(bytes) as unknown as ExcelJS.Buffer);

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

/** Render parsed sheets as tab-separated text, dropping empty cells and rows. */
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

/**
 * The bytes as a Buffer that owns its memory. Not `Buffer.from(bytes)`: pdf.js reads the whole
 * underlying ArrayBuffer, so a slice of Node's shared pool fails with "bad XRef entry".
 */
function toBuffer(bytes: Uint8Array | Buffer): Buffer {
    if (Buffer.isBuffer(bytes) && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
        return bytes;
    }
    const owned = new Uint8Array(bytes.byteLength);
    owned.set(bytes);
    return Buffer.from(owned.buffer);
}
