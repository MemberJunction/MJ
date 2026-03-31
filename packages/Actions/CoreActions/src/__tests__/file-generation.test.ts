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

        const fileOutput = getOutputParam(params, 'FileOutput') as { fileData?: string; fileId?: string };
        expect(fileOutput).toBeTruthy();
        if (fileOutput.fileData) {
            const buffer = Buffer.from(fileOutput.fileData, 'base64');
            expect(buffer.slice(0, 4).toString()).toBe('%PDF');
        }
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
        const fileOutput = getOutputParam(params, 'FileOutput') as { fileData?: string };
        expect(fileOutput).toBeTruthy();
        if (fileOutput.fileData) {
            expect(Buffer.from(fileOutput.fileData, 'base64').slice(0, 4).toString()).toBe('%PDF');
        }
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

        const fileOutput = getOutputParam(params, 'FileOutput') as { fileData?: string };
        expect(fileOutput).toBeTruthy();
        if (fileOutput.fileData) {
            const buffer = Buffer.from(fileOutput.fileData, 'base64');
            expect(buffer[0]).toBe(0x50); // P
            expect(buffer[1]).toBe(0x4b); // K
        }
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

        const fileOutput = getOutputParam(params, 'FileOutput') as { fileData?: string };
        expect(fileOutput).toBeTruthy();
    }, 15_000);

    it('fails when Sheets parameter is missing', async () => {
        const action = new ExcelWriterAction();
        const params = makeParams({ FileName: 'empty.xlsx' });

        const result = await runAction(action, params) as { Success: boolean };
        expect(result.Success).toBe(false);
    });
});

// ── PDF Extractor ─────────────────────────────────────────────────────────────

describe('PDFExtractorAction', () => {
    // Generate a real PDF via PDFGeneratorAction for round-trip testing
    let generatedPdfBase64: string;

    it('extracts text from a base64 PDF', async () => {
        // First generate a real PDF
        const generator = new PDFGeneratorAction();
        const genParams = makeParams({
            Content: '<h1>Hello World</h1><p>This is a test document for extraction.</p>',
            ContentType: 'html',
            FileName: 'test.pdf',
        });
        const genResult = await runAction(generator, genParams) as { Success: boolean };
        expect(genResult.Success).toBe(true);

        const genFileOutput = getOutputParam(genParams, 'FileOutput') as { fileData?: string };
        expect(genFileOutput?.fileData).toBeTruthy();
        generatedPdfBase64 = genFileOutput.fileData!;

        // Now extract text from it
        const extractor = new PDFExtractorAction();
        const extractParams = makeParams({
            PDFData: generatedPdfBase64,
            ExtractType: 'text',
        });

        const result = await runAction(extractor, extractParams) as { Success: boolean };
        expect(result.Success).toBe(true);

        const extractedText = getOutputParam(extractParams, 'ExtractedText') as string;
        expect(extractedText).toBeTruthy();
        expect(extractedText).toContain('Hello World');
    }, 15_000);

    it('extracts metadata from a base64 PDF', async () => {
        // Use the PDF generated in the previous test, or generate a fresh one
        if (!generatedPdfBase64) {
            const generator = new PDFGeneratorAction();
            const genParams = makeParams({
                Content: '<p>Metadata test</p>',
                ContentType: 'html',
                FileName: 'meta-test.pdf',
            });
            await runAction(generator, genParams);
            const genFileOutput = getOutputParam(genParams, 'FileOutput') as { fileData?: string };
            generatedPdfBase64 = genFileOutput?.fileData || '';
        }

        const extractor = new PDFExtractorAction();
        const extractParams = makeParams({
            PDFData: generatedPdfBase64,
            ExtractType: 'metadata',
        });

        const result = await runAction(extractor, extractParams) as { Success: boolean };
        expect(result.Success).toBe(true);
    }, 15_000);

    it('fails when no input is provided', async () => {
        const extractor = new PDFExtractorAction();
        const params = makeParams({ ExtractType: 'text' });

        const result = await runAction(extractor, params) as { Success: boolean };
        expect(result.Success).toBe(false);
    });

    it('returns EXTRACTION_FAILED for invalid PDF data', async () => {
        const extractor = new PDFExtractorAction();
        const params = makeParams({
            PDFData: Buffer.from('not a real pdf').toString('base64'),
            ExtractType: 'text',
        });

        const result = await runAction(extractor, params) as { Success: boolean; ResultCode?: string };
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('EXTRACTION_FAILED');
    });
});
