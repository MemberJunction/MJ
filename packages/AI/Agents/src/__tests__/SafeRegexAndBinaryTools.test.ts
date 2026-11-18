import { describe, it, expect, afterEach, vi } from 'vitest';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import { DocxToolLibrary } from '../artifact-tools/DocxToolLibrary';
import { ExcelToolLibrary } from '../artifact-tools/ExcelToolLibrary';
import { JSONToolLibrary } from '../artifact-tools/JSONToolLibrary';
import { CSVToolLibrary } from '../artifact-tools/CSVToolLibrary';
import { PDFToolLibrary } from '../artifact-tools/PDFToolLibrary';
import { GenericBinaryToolLibrary } from '../artifact-tools/GenericBinaryToolLibrary';
import { DataSnapshotToolLibrary } from '../artifact-tools/DataSnapshotToolLibrary';

async function buildTinyXlsxBase64(rows: Array<Array<string | number>>): Promise<string> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    for (const r of rows) {
        ws.addRow(r);
    }
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf).toString('base64');
}

describe('P0-18 Safe Regex, Binary Decoding, PDF Edge Cases & Large DataSnapshot Safety', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('rejects ReDoS patterns and executes safe regex matching without /g lastIndex drift across Docx, Excel, JSON, CSV', async () => {
        const redos = '(a+)+$';
        const docxLib = new DocxToolLibrary();
        const excelLib = new ExcelToolLibrary();
        const jsonLib = new JSONToolLibrary();
        const csvLib = new CSVToolLibrary();

        const rawDocxBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xaa, 0xbb, 0xcc, 0xdd]);
        const docxBase64 = rawDocxBytes.toString('base64');
        vi.spyOn(mammoth, 'extractRawText').mockResolvedValue({
            value: 'Revenue target 2026\nRevenue target 2027',
            messages: [],
        });

        const xlsxBase64 = await buildTinyXlsxBase64([
            ['Label', 'Amount'],
            ['Price (USD)', 100],
            ['Margin 2026', 25],
            ['Margin 2027', 30],
        ]);
        const jsonContent = JSON.stringify([
            { name: 'Item-1', note: 'Alpha 100' },
            { name: 'Item-2', note: 'Alpha 200' },
        ]);
        const csvContent = 'Name,Note\nRow1,Beta 10\nRow2,Beta 20\n';

        // ReDoS pattern fails cleanly on all 4 libraries
        const docxRedos = await docxLib.InvokeTool('search_text', { pattern: redos }, docxBase64);
        expect(docxRedos.success).toBe(false);
        const excelRedos = await excelLib.InvokeTool('search_cells', { query: redos, isRegex: true }, xlsxBase64);
        expect(excelRedos.success).toBe(false);
        const jsonRedos = await jsonLib.InvokeTool('json_search', { pattern: redos, isRegex: true }, jsonContent);
        expect(jsonRedos.success).toBe(false);
        const csvRedos = await csvLib.InvokeTool('search', { pattern: redos }, csvContent);
        expect(csvRedos.success).toBe(false);

        // Stateful /g flag must NOT skip alternating lines/rows (g/y stripped internally)
        const docxMatches = await docxLib.InvokeTool('search_text', { pattern: 'Revenue.*\\d{4}' }, docxBase64);
        expect(docxMatches.success).toBe(true);
        expect((docxMatches.data as { matches: object[] }).matches.length).toBe(2);

        const csvMatches = await csvLib.InvokeTool(
            'search',
            { pattern: 'Beta', flags: 'g' },
            csvContent,
        );
        expect(csvMatches.success).toBe(true);
        expect((csvMatches.data as { matches?: object[] }).matches?.length ?? (csvMatches.data as object[]).length).toBe(2);

        const jsonMatches = await jsonLib.InvokeTool(
            'json_search',
            { key: 'note', pattern: 'Alpha' },
            jsonContent,
        );
        expect(jsonMatches.success).toBe(true);
        expect((jsonMatches.data as object[]).length).toBe(2);

        // Excel search_cells defaults to literal match (unescaped parens match cleanly!)
        const literalParens = await excelLib.InvokeTool('search_cells', { query: 'Price (USD)' }, xlsxBase64);
        expect(literalParens.success).toBe(true);
        expect((literalParens.data as { matches: object[] }).matches.length).toBe(1);
    });

    it('blocks prototype pollution keys (__proto__, constructor, prototype) in JSONToolLibrary.json_path', async () => {
        const jsonLib = new JSONToolLibrary();
        const content = JSON.stringify({ safe: { nested: 42 } });

        for (const path of ['__proto__.polluted', 'safe.constructor.prototype', 'prototype']) {
            const res = await jsonLib.InvokeTool('json_path', { path }, content);
            expect(res.success).toBe(false);
        }
    });

    it('decodes base64 binary strings into exact raw bytes in DocxToolLibrary and GenericBinaryToolLibrary', async () => {
        const docxLib = new DocxToolLibrary();
        const binLib = new GenericBinaryToolLibrary();

        const rawDocxBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x80, 0xff, 0x00, 0x42]);
        let capturedBuf: Buffer | undefined;
        vi.spyOn(mammoth, 'extractRawText').mockImplementation(async (input: { buffer?: Buffer }) => {
            capturedBuf = input.buffer;
            return { value: 'Hello Base64 Word Doc', messages: [] };
        });
        const fromBase64Str = await docxLib.InvokeTool('get_text', {}, rawDocxBytes.toString('base64'));
        expect(fromBase64Str.success).toBe(true);
        expect(capturedBuf).toBeDefined();
        expect(Buffer.compare(capturedBuf!, rawDocxBytes)).toBe(0);
        expect((fromBase64Str.data as { text: string }).text).toContain('Hello Base64 Word Doc');

        const rawBytes = Buffer.from([0x01, 0x02, 0xfe, 0xff, 0x42]);
        const binFromB64 = await binLib.InvokeTool('get_metadata', {}, rawBytes.toString('base64'));
        const binFromBuf = await binLib.InvokeTool('get_metadata', {}, rawBytes);
        expect(binFromB64.success).toBe(true);
        expect(binFromBuf.success).toBe(true);
        expect(binFromB64.data).toEqual(binFromBuf.data);
    });

    it('handles invalid or 0-page PDF inputs without crashing in PDFToolLibrary', async () => {
        const pdfLib = new PDFToolLibrary();
        const emptyPdfRes = await pdfLib.InvokeTool('get_page_count', {}, Buffer.from('not-a-pdf').toString('base64'));
        expect(emptyPdfRes.success).toBe(false);
        expect(emptyPdfRes.errorMessage).toBeTruthy();
    });

    it('computes numeric statistics over >105k rows without call-stack overflow and skips nulls in DataSnapshotToolLibrary', async () => {
        const snapLib = new DataSnapshotToolLibrary();
        const rows: Array<{ id: number; amount: number | null }> = [];
        for (let i = 1; i <= 105_000; i++) {
            rows.push({ id: i, amount: i % 10 === 0 ? null : i });
        }
        const snapshot = JSON.stringify({
            tables: [
                {
                    name: 'BigTable',
                    rows,
                },
            ],
        });

        const minRes = await snapLib.InvokeTool(
            'aggregate',
            { table: 'BigTable', field: 'amount', operation: 'min' },
            snapshot,
        );
        const maxRes = await snapLib.InvokeTool(
            'aggregate',
            { table: 'BigTable', field: 'amount', operation: 'max' },
            snapshot,
        );
        const avgRes = await snapLib.InvokeTool(
            'aggregate',
            { table: 'BigTable', field: 'amount', operation: 'avg' },
            snapshot,
        );
        expect(minRes.success).toBe(true);
        expect(maxRes.success).toBe(true);
        expect(avgRes.success).toBe(true);
        expect((minRes.data as { value: number }).value).toBe(1);
        expect((maxRes.data as { value: number }).value).toBe(104_999);
        expect((avgRes.data as { value: number }).value).toBeGreaterThan(50_000);
    });
});
