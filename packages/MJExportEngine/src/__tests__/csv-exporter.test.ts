import { describe, it, expect, beforeEach } from 'vitest';
import { CSVExporter } from '../csv-exporter';

describe('CSVExporter', () => {
    let exporter: CSVExporter;

    beforeEach(() => {
        exporter = new CSVExporter();
    });

    describe('getMimeType', () => {
        it('should return text/csv with charset', () => {
            expect(exporter.getMimeType()).toBe('text/csv;charset=utf-8');
        });
    });

    describe('getFileExtension', () => {
        it('should return csv', () => {
            expect(exporter.getFileExtension()).toBe('csv');
        });
    });

    describe('export', () => {
        it('should export simple object data to CSV', async () => {
            const data = [
                { ID: '1', Name: 'Alice' },
                { ID: '2', Name: 'Bob' }
            ];
            const result = await exporter.export(data);
            expect(result.success).toBe(true);
            expect(result.rowCount).toBe(2);
            expect(result.columnCount).toBe(2);
            expect(result.data).toBeDefined();
        });

        it('should include headers by default', async () => {
            const data = [{ Col1: 'value1' }];
            const result = await exporter.export(data);
            expect(result.success).toBe(true);
            // Decode the buffer to check content
            const text = new TextDecoder().decode(result.data);
            expect(text).toContain('Col1');
            expect(text).toContain('value1');
        });

        it('should return proper mime type and file name in result', async () => {
            const data = [{ A: '1' }];
            const result = await exporter.export(data);
            expect(result.mimeType).toBe('text/csv;charset=utf-8');
            expect(result.fileName).toContain('.csv');
        });

        it('should handle empty data array', async () => {
            const result = await exporter.export([]);
            expect(result.success).toBe(false);
            expect(result.error).toContain('No columns');
        });

        describe('spreadsheet formula injection', () => {
            async function exportCell(value: unknown): Promise<string> {
                const result = await exporter.export([{ Cell: value }]);
                const [, cell] = new TextDecoder().decode(result.data).split('\r\n');
                return cell;
            }

            it.each([
                ['=HYPERLINK("http://evil.example","x")', `"'=HYPERLINK(""http://evil.example"",""x"")"`],
                ['+SUM(A1:A9)', "'+SUM(A1:A9)"],
                ['-2+3+cmd|x', "'-2+3+cmd|x"],
                ['@SUM(A1)', "'@SUM(A1)"],
                ['\t=1+1', "'\t=1+1"],
            ])('prefixes the text cell %j with a quote so it is not run as a formula', async (value, expected) => {
                expect(await exportCell(value)).toBe(expected);
            });

            it.each([
                [-12.5, '-12.5'],
                ['-12.50', '-12.50'],
                ['+15551212', '+15551212'],
                ['-1e5', '-1e5'],
                ['Alice', 'Alice'],
                ['a=b', 'a=b'],
            ])('leaves %j as it is', async (value, expected) => {
                expect(await exportCell(value)).toBe(expected);
            });
        });

        it('should handle values with commas', async () => {
            const data = [{ Description: 'Hello, World' }];
            const result = await exporter.export(data);
            const text = new TextDecoder().decode(result.data);
            // Should be quoted since it contains a comma
            expect(text).toContain('"Hello, World"');
        });

        it('should handle values with double quotes', async () => {
            const data = [{ Text: 'She said "hello"' }];
            const result = await exporter.export(data);
            const text = new TextDecoder().decode(result.data);
            // Quotes should be doubled
            expect(text).toContain('""hello""');
        });

        it('should handle values with newlines', async () => {
            const data = [{ Notes: 'Line 1\nLine 2' }];
            const result = await exporter.export(data);
            const text = new TextDecoder().decode(result.data);
            expect(text).toContain('"Line 1\nLine 2"');
        });

        it('should handle null and undefined values', async () => {
            const data = [{ A: null, B: undefined }];
            const result = await exporter.export(data);
            expect(result.success).toBe(true);
        });

        it('should handle boolean values', async () => {
            const data = [{ Active: true, Deleted: false }];
            const result = await exporter.export(data);
            const text = new TextDecoder().decode(result.data);
            expect(text).toContain('TRUE');
            expect(text).toContain('FALSE');
        });

        it('should handle Date values', async () => {
            const testDate = new Date('2025-01-15T12:00:00Z');
            const data = [{ CreatedAt: testDate }];
            const result = await exporter.export(data);
            const text = new TextDecoder().decode(result.data);
            expect(text).toContain('2025');
        });

        it('should handle large datasets efficiently', async () => {
            const data = Array.from({ length: 1000 }, (_, i) => ({
                ID: String(i),
                Name: `Row ${i}`,
                Value: String(Math.random())
            }));
            const result = await exporter.export(data);
            expect(result.success).toBe(true);
            expect(result.rowCount).toBe(1000);
        });

        it('should handle array-of-arrays data', async () => {
            const data = [
                [1, 'Alice', true],
                [2, 'Bob', false]
            ];
            const result = await exporter.export(data);
            expect(result.success).toBe(true);
            expect(result.rowCount).toBe(2);
        });

        it('should derive column names from object keys', async () => {
            const data = [{ firstName: 'John', lastName: 'Doe' }];
            const result = await exporter.export(data);
            const text = new TextDecoder().decode(result.data);
            // formatColumnName converts camelCase to "First Name"
            expect(text).toContain('First Name');
            expect(text).toContain('Last Name');
        });
    });

    describe('custom delimiter', () => {
        it('should use semicolon as delimiter', async () => {
            const semicolonExporter = new CSVExporter({ delimiter: ';' });
            const data = [{ A: '1', B: '2' }];
            const result = await semicolonExporter.export(data);
            const text = new TextDecoder().decode(result.data);
            expect(text).toContain(';');
        });

        it('should use tab as delimiter', async () => {
            const tabExporter = new CSVExporter({ delimiter: '\t' });
            const data = [{ A: '1', B: '2' }];
            const result = await tabExporter.export(data);
            const text = new TextDecoder().decode(result.data);
            expect(text).toContain('\t');
        });
    });
});
