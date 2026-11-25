import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { ParseSpreadsheet, SheetsToText } from '../index.js';

describe('rendering sheets as text', () => {
    it('joins cells with tabs and rows with newlines', () => {
        const text = SheetsToText([{ Name: 'Q1', Rows: [['Region', 'Revenue'], ['North', 1000]] }]);
        expect(text).toBe('Region\tRevenue\nNorth\t1000');
    });

    it('drops empty cells and omits empty rows, so a sparse sheet is not a wall of tabs', () => {
        const text = SheetsToText([{ Name: 'Q1', Rows: [['a', null, 'b'], [null, null], ['c']] }]);
        expect(text).toBe('a\tb\nc');
    });

    it('reads a formula cell as its computed result', () => {
        const text = SheetsToText([{ Name: 'Q1', Rows: [[{ formula: 'A1+B1', result: 42 }]] }]);
        expect(text).toBe('42');
    });

    it('flattens rich text into its runs', () => {
        const text = SheetsToText([{ Name: 'Q1', Rows: [[{ richText: [{ text: 'bold' }, { text: ' plain' }] }]] }]);
        expect(text).toBe('bold plain');
    });

    it('separates sheets by a blank line, and skips ones with nothing in them', () => {
        const text = SheetsToText([
            { Name: 'Q1', Rows: [['a']] },
            { Name: 'Empty', Rows: [] },
            { Name: 'Q2', Rows: [['b']] },
        ]);
        expect(text).toBe('a\n\nb');
    });
});

describe('parsing a real workbook', () => {
    // The regression this guards: under native ESM a dynamic import of CommonJS exceljs had no named
    // Workbook, so every .xlsx threw "Workbook is not a constructor" — in Get File Content too.
    it('reads every worksheet of an .xlsx, by name and in order', async () => {
        const workbook = new ExcelJS.Workbook();
        workbook.addWorksheet('Q1').addRows([['Region', 'Revenue'], ['North', 1000]]);
        workbook.addWorksheet('Q2').addRow(['South', 2000]);
        const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());

        const sheets = await ParseSpreadsheet(bytes);

        expect(sheets.map((s) => s.Name)).toEqual(['Q1', 'Q2']);
        expect(SheetsToText(sheets)).toBe('Region\tRevenue\nNorth\t1000\n\nSouth\t2000');
    });
});
