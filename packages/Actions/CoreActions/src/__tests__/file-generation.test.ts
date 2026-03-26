/**
 * Unit tests for file generation Actions (PDF Generator, Excel Writer, PDF Extractor).
 * These tests exercise the in-process generation path only — no database or storage needed.
 */

import { describe, it, expect } from 'vitest';
import type { RunActionParams } from '@memberjunction/actions-base';
import { PDFGeneratorAction } from '../custom/files/pdf-generator.action';
import { ExcelWriterAction } from '../custom/files/excel-writer.action';
import { PDFExtractorAction } from '../custom/files/pdf-extractor.action';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeParams(pairs: Record<string, unknown>): RunActionParams {
    return {
        ContextUser: null,
        Params: Object.entries(pairs).map(([Name, Value]) => ({
            Name,
            Value,
            Type: 'Input',
        })),
    } as unknown as RunActionParams;
}

function runAction(action: { InternalRunAction: (p: RunActionParams) => Promise<unknown> }, params: RunActionParams) {
    return (action as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['InternalRunAction'](params);
}

function getOutputParam(params: RunActionParams, name: string): unknown {
    return params.Params.find(p => p.Name === name)?.Value;
}

// ── PDF Generator ─────────────────────────────────────────────────────────────

describe('PDFGeneratorAction', () => {
    it('generates a PDF from HTML and returns base64 output', async () => {
        const action = new PDFGeneratorAction();
        const params = makeParams({
            Content: '<h1>Hello MJ</h1><p>This is a test PDF.</p>',
            ContentType: 'html',
            FileName: 'test.pdf',
        });

        const result = await runAction(action, params) as { Success: boolean; ResultCode: string };

        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');

        const pdfData = getOutputParam(params, 'PDFData') as string;
        expect(pdfData).toBeTruthy();

        // Verify it's valid base64 that decodes to a PDF (starts with %PDF)
        const buffer = Buffer.from(pdfData, 'base64');
        expect(buffer.slice(0, 4).toString()).toBe('%PDF');
    }, 15_000);

    it('generates a PDF from markdown', async () => {
        const action = new PDFGeneratorAction();
        const params = makeParams({
            Content: '# Heading\n\nSome **bold** text and a list:\n- Item 1\n- Item 2',
            ContentType: 'markdown',
            FileName: 'markdown-test.pdf',
        });

        const result = await runAction(action, params) as { Success: boolean };

        expect(result.Success).toBe(true);
        const pdfData = getOutputParam(params, 'PDFData') as string;
        expect(Buffer.from(pdfData, 'base64').slice(0, 4).toString()).toBe('%PDF');
    }, 15_000);

    it('fails when content is missing', async () => {
        const action = new PDFGeneratorAction();
        const params = makeParams({ FileName: 'empty.pdf' });

        const result = await runAction(action, params) as { Success: boolean; ResultCode: string };

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('MISSING_CONTENT');
    });
});

// ── Excel Writer ──────────────────────────────────────────────────────────────

describe('ExcelWriterAction', () => {
    it('generates an Excel file and returns base64 output', async () => {
        const action = new ExcelWriterAction();
        const params = makeParams({
            Sheets: [{
                name: 'Sales',
                data: [
                    { Product: 'Widget A', Units: 100, Revenue: 1000 },
                    { Product: 'Widget B', Units: 150, Revenue: 1500 },
                ],
            }],
            FileName: 'test.xlsx',
        });

        const result = await runAction(action, params) as { Success: boolean; ResultCode: string };

        expect(result.Success).toBe(true);

        const excelData = getOutputParam(params, 'ExcelData') as string;
        expect(excelData).toBeTruthy();

        // XLSX files start with PK (ZIP magic bytes)
        const buffer = Buffer.from(excelData, 'base64');
        expect(buffer[0]).toBe(0x50); // P
        expect(buffer[1]).toBe(0x4b); // K
    }, 15_000);

    it('generates an Excel file with multiple sheets', async () => {
        const action = new ExcelWriterAction();
        const params = makeParams({
            Sheets: [
                { name: 'Q1', data: [{ Month: 'Jan', Revenue: 100 }] },
                { name: 'Q2', data: [{ Month: 'Apr', Revenue: 200 }] },
            ],
            FileName: 'multi-sheet.xlsx',
        });

        const result = await runAction(action, params) as { Success: boolean };
        expect(result.Success).toBe(true);

        const excelData = getOutputParam(params, 'ExcelData') as string;
        expect(excelData).toBeTruthy();
    }, 15_000);

    it('fails when Sheets parameter is missing', async () => {
        const action = new ExcelWriterAction();
        const params = makeParams({ FileName: 'empty.xlsx' });

        const result = await runAction(action, params) as { Success: boolean };
        expect(result.Success).toBe(false);
    });
});

// Minimal hand-crafted PDF with extractable text — no network needed
const MINIMAL_PDF_BASE64 = Buffer.from(
    '%PDF-1.4\n' +
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R' +
    '/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
    '4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 100 700 Td (Hello World) Tj ET\nendstream\nendobj\n' +
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n' +
    'xref\n0 6\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n' +
    '0000000115 00000 n\n0000000266 00000 n\n0000000360 00000 n\n' +
    'trailer<</Size 6/Root 1 0 R>>\nstartxref\n441\n%%EOF'
).toString('base64');

// ── PDF Extractor ─────────────────────────────────────────────────────────────

describe('PDFExtractorAction', () => {
    it('extracts text from a base64 PDF', async () => {
        const extractor = new PDFExtractorAction();
        const extractParams = makeParams({
            PDFData: MINIMAL_PDF_BASE64,
            ExtractType: 'text',
        });

        const result = await runAction(extractor, extractParams) as { Success: boolean };
        expect(result.Success).toBe(true);

        const extractedText = getOutputParam(extractParams, 'ExtractedText') as string;
        expect(extractedText).toBeTruthy();
        expect(extractedText).toContain('Hello World');
    }, 10_000);

    it('extracts metadata from a base64 PDF', async () => {
        const extractor = new PDFExtractorAction();
        const extractParams = makeParams({
            PDFData: MINIMAL_PDF_BASE64,
            ExtractType: 'metadata',
        });

        const result = await runAction(extractor, extractParams) as { Success: boolean };
        expect(result.Success).toBe(true);
    }, 10_000);

    it('fails when no input is provided', async () => {
        const extractor = new PDFExtractorAction();
        const params = makeParams({ ExtractType: 'text' });

        const result = await runAction(extractor, params) as { Success: boolean };
        expect(result.Success).toBe(false);
    });
});
