import { describe, expect, it } from 'vitest';
import {
    IsImageContentType,
    IsPdfContentType,
    IsSpreadsheetContentType,
    IsTextContentType,
    IsWordContentType,
    SheetsToText,
} from '../index.js';

describe('content types', () => {
    it('recognises every Office format in both generations', () => {
        // The pair that drifted when this knowledge lived in two places.
        expect(IsWordContentType('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
        expect(IsWordContentType('application/msword')).toBe(true);
        expect(IsSpreadsheetContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true);
        expect(IsSpreadsheetContentType('application/vnd.ms-excel')).toBe(true);
    });

    it('treats json and xml as text, because they decode without a parser', () => {
        expect(IsTextContentType('text/html')).toBe(true);
        expect(IsTextContentType('application/json')).toBe(true);
        expect(IsTextContentType('application/xml')).toBe(true);
        expect(IsTextContentType('application/pdf')).toBe(false);
    });

    it('separates images and PDFs from each other', () => {
        expect(IsImageContentType('image/png')).toBe(true);
        expect(IsImageContentType('application/pdf')).toBe(false);
        expect(IsPdfContentType('application/pdf')).toBe(true);
    });
});

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
