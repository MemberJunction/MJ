import { describe, expect, it } from 'vitest';
import {
    IsDocumentContentType,
    IsImageContentType,
    IsPdfContentType,
    IsSpreadsheetContentType,
    IsTextContentType,
    IsWordContentType,
} from '../ContentTypes.js';

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

describe('IsDocumentContentType', () => {
    it('knows the document files a browser downloads rather than renders', () => {
        for (const type of ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint', 'application/vnd.oasis.opendocument.text', 'image/png', 'video/mp4', 'text/csv; charset=utf-8']) {
            expect(IsDocumentContentType(type)).toBe(true);
        }
    });

    it('does not count a type servers also send for pages, or none at all', () => {
        for (const type of ['text/html', 'application/octet-stream', 'text/plain', 'application/json', '', undefined]) {
            expect(IsDocumentContentType(type)).toBe(false);
        }
    });
});
