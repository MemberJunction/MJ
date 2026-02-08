import { describe, it, expect } from 'vitest';
import { ExportEngine } from '../export-engine';
import { CSVExporter } from '../csv-exporter';
import { JSONExporter } from '../json-exporter';
import { ExcelExporter } from '../excel-exporter';

describe('ExportEngine', () => {
    const sampleData = [
        { ID: '1', Name: 'Alice', Age: 30 },
        { ID: '2', Name: 'Bob', Age: 25 }
    ];

    describe('getSupportedFormats', () => {
        it('should return all three formats', () => {
            const formats = ExportEngine.getSupportedFormats();
            expect(formats).toEqual(['excel', 'csv', 'json']);
        });

        it('should return an array of length 3', () => {
            expect(ExportEngine.getSupportedFormats()).toHaveLength(3);
        });
    });

    describe('createExporter', () => {
        it('should create CSVExporter for csv format', () => {
            const exporter = ExportEngine.createExporter('csv');
            expect(exporter).toBeInstanceOf(CSVExporter);
        });

        it('should create JSONExporter for json format', () => {
            const exporter = ExportEngine.createExporter('json');
            expect(exporter).toBeInstanceOf(JSONExporter);
        });

        it('should create ExcelExporter for excel format', () => {
            const exporter = ExportEngine.createExporter('excel');
            expect(exporter).toBeInstanceOf(ExcelExporter);
        });

        it('should throw for unsupported format', () => {
            expect(() => {
                ExportEngine.createExporter('pdf' as Parameters<typeof ExportEngine.createExporter>[0]);
            }).toThrow('Unsupported export format');
        });
    });

    describe('export', () => {
        it('should export to CSV', async () => {
            const result = await ExportEngine.export(sampleData, { format: 'csv' });
            expect(result.success).toBe(true);
            expect(result.rowCount).toBe(2);
        });

        it('should export to JSON', async () => {
            const result = await ExportEngine.export(sampleData, { format: 'json' });
            expect(result.success).toBe(true);
            expect(result.rowCount).toBe(2);
        });

        it('should export to Excel', async () => {
            const result = await ExportEngine.export(sampleData, { format: 'excel' });
            expect(result.success).toBe(true);
            expect(result.rowCount).toBe(2);
        });

        it('should default to excel format', async () => {
            const result = await ExportEngine.export(sampleData);
            expect(result.success).toBe(true);
            expect(result.mimeType).toContain('spreadsheetml');
        });
    });

    describe('toCSV', () => {
        it('should export data as CSV', async () => {
            const result = await ExportEngine.toCSV(sampleData);
            expect(result.success).toBe(true);
            expect(result.mimeType).toContain('csv');
        });

        it('should pass options through', async () => {
            const result = await ExportEngine.toCSV(sampleData, { fileName: 'test-export' });
            expect(result.fileName).toContain('test-export');
        });
    });

    describe('toJSON', () => {
        it('should export data as JSON', async () => {
            const result = await ExportEngine.toJSON(sampleData);
            expect(result.success).toBe(true);
            expect(result.mimeType).toContain('json');
        });

        it('should produce valid JSON output', async () => {
            const result = await ExportEngine.toJSON(sampleData);
            const text = new TextDecoder().decode(result.data);
            expect(() => JSON.parse(text)).not.toThrow();
        });
    });

    describe('toExcel', () => {
        it('should export data as Excel', async () => {
            const result = await ExportEngine.toExcel(sampleData);
            expect(result.success).toBe(true);
            expect(result.mimeType).toContain('spreadsheetml');
        });

        it('should return size in bytes', async () => {
            const result = await ExportEngine.toExcel(sampleData);
            expect(result.sizeBytes).toBeGreaterThan(0);
        });
    });

    describe('toExcelMultiSheet', () => {
        it('should create multi-sheet workbook', async () => {
            const result = await ExportEngine.toExcelMultiSheet([
                { name: 'Sheet1', data: sampleData },
                { name: 'Sheet2', data: [{ X: 1 }, { X: 2 }] }
            ]);
            expect(result.success).toBe(true);
            expect(result.sheetCount).toBe(2);
        });

        it('should report per-sheet statistics', async () => {
            const result = await ExportEngine.toExcelMultiSheet([
                { name: 'Data', data: sampleData },
                { name: 'Summary', data: [{ Total: 55 }] }
            ]);
            expect(result.sheetStats).toHaveLength(2);
            expect(result.sheetStats![0].name).toBe('Data');
            expect(result.sheetStats![0].rowCount).toBe(2);
            expect(result.sheetStats![1].name).toBe('Summary');
            expect(result.sheetStats![1].rowCount).toBe(1);
        });

        it('should accept metadata options', async () => {
            const result = await ExportEngine.toExcelMultiSheet(
                [{ name: 'Sheet1', data: sampleData }],
                {
                    fileName: 'report',
                    metadata: { author: 'Test User', title: 'Test Report' }
                }
            );
            expect(result.success).toBe(true);
        });
    });

    describe('getMimeType', () => {
        it('should return CSV MIME type', () => {
            expect(ExportEngine.getMimeType('csv')).toContain('csv');
        });

        it('should return JSON MIME type', () => {
            expect(ExportEngine.getMimeType('json')).toContain('json');
        });

        it('should return Excel MIME type', () => {
            expect(ExportEngine.getMimeType('excel')).toContain('spreadsheetml');
        });
    });

    describe('getFileExtension', () => {
        it('should return csv for CSV format', () => {
            expect(ExportEngine.getFileExtension('csv')).toBe('csv');
        });

        it('should return json for JSON format', () => {
            expect(ExportEngine.getFileExtension('json')).toBe('json');
        });

        it('should return xlsx for Excel format', () => {
            expect(ExportEngine.getFileExtension('excel')).toBe('xlsx');
        });
    });

    describe('supportsMultiSheet', () => {
        it('should return true for excel', () => {
            expect(ExportEngine.supportsMultiSheet('excel')).toBe(true);
        });

        it('should return false for csv', () => {
            expect(ExportEngine.supportsMultiSheet('csv')).toBe(false);
        });

        it('should return false for json', () => {
            expect(ExportEngine.supportsMultiSheet('json')).toBe(false);
        });
    });

    describe('supportsFormulas', () => {
        it('should return true for excel', () => {
            expect(ExportEngine.supportsFormulas('excel')).toBe(true);
        });

        it('should return false for csv', () => {
            expect(ExportEngine.supportsFormulas('csv')).toBe(false);
        });
    });

    describe('supportsStyling', () => {
        it('should return true for excel', () => {
            expect(ExportEngine.supportsStyling('excel')).toBe(true);
        });

        it('should return false for json', () => {
            expect(ExportEngine.supportsStyling('json')).toBe(false);
        });
    });

    describe('getFormatCapabilities', () => {
        it('should return all true for excel', () => {
            const caps = ExportEngine.getFormatCapabilities('excel');
            expect(caps.multiSheet).toBe(true);
            expect(caps.formulas).toBe(true);
            expect(caps.styling).toBe(true);
            expect(caps.images).toBe(true);
            expect(caps.dataValidation).toBe(true);
            expect(caps.conditionalFormatting).toBe(true);
            expect(caps.protection).toBe(true);
        });

        it('should return all false for csv', () => {
            const caps = ExportEngine.getFormatCapabilities('csv');
            expect(caps.multiSheet).toBe(false);
            expect(caps.formulas).toBe(false);
            expect(caps.styling).toBe(false);
        });

        it('should return all false for json', () => {
            const caps = ExportEngine.getFormatCapabilities('json');
            expect(caps.multiSheet).toBe(false);
            expect(caps.formulas).toBe(false);
        });
    });
});
