import { describe, it, expect, beforeEach } from 'vitest';
import { BaseExporter } from '../base-exporter';
import type { ExportData, ExportResult } from '../types';

// Concrete implementation for testing protected methods
class TestExporter extends BaseExporter {
    async export(data: ExportData): Promise<ExportResult> {
        const sampled = this.applySampling(data);
        const columns = this.deriveColumns(sampled);
        return {
            success: true,
            rowCount: sampled.length,
            columnCount: columns.length
        };
    }

    getMimeType(): string { return 'text/plain'; }
    getFileExtension(): string { return 'txt'; }

    // Expose protected methods for testing
    public testDeriveColumns(data: ExportData) { return this.deriveColumns(data); }
    public testFormatColumnName(name: string) { return this.formatColumnName(name); }
    public testApplySampling(data: ExportData) { return this.applySampling(data); }
    public testExtractRowValues(row: ExportData[0], columns: ReturnType<typeof this.deriveColumns>) {
        return this.extractRowValues(row, columns);
    }
    public testFormatValue(value: unknown, column: { dataType?: string }) {
        return this.formatValue(value, column as Parameters<typeof this.formatValue>[1]);
    }
    public testGetFullFileName() { return this.getFullFileName(); }
}

describe('BaseExporter', () => {
    let exporter: TestExporter;

    beforeEach(() => {
        exporter = new TestExporter();
    });

    describe('deriveColumns', () => {
        it('should derive columns from object keys', () => {
            const data = [{ ID: '1', Name: 'Alice' }];
            const columns = exporter.testDeriveColumns(data);
            expect(columns).toHaveLength(2);
            expect(columns[0].name).toBe('ID');
            expect(columns[1].name).toBe('Name');
        });

        it('should return empty array for empty data', () => {
            const columns = exporter.testDeriveColumns([]);
            expect(columns).toHaveLength(0);
        });

        it('should create generic column names for array-of-arrays', () => {
            const data = [[1, 2, 3]];
            const columns = exporter.testDeriveColumns(data);
            expect(columns).toHaveLength(3);
            expect(columns[0].name).toBe('Column1');
            expect(columns[1].name).toBe('Column2');
        });

        it('should use options columns when provided', () => {
            const colExporter = new TestExporter({ columns: [{ name: 'Custom', displayName: 'Custom Col' }] });
            const data = [{ ID: '1', Name: 'Alice' }];
            const columns = colExporter.testDeriveColumns(data);
            expect(columns).toHaveLength(1);
            expect(columns[0].name).toBe('Custom');
        });
    });

    describe('formatColumnName', () => {
        it('should handle camelCase', () => {
            expect(exporter.testFormatColumnName('firstName')).toBe('First Name');
        });

        it('should handle PascalCase', () => {
            expect(exporter.testFormatColumnName('FirstName')).toBe('First Name');
        });

        it('should handle snake_case', () => {
            expect(exporter.testFormatColumnName('first_name')).toBe('First Name');
        });

        it('should handle single word', () => {
            expect(exporter.testFormatColumnName('name')).toBe('Name');
        });

        it('should handle all caps', () => {
            const result = exporter.testFormatColumnName('ID');
            expect(result).toBeTruthy();
        });

        it('should handle empty string', () => {
            expect(exporter.testFormatColumnName('')).toBe('');
        });
    });

    describe('applySampling', () => {
        const bigData = Array.from({ length: 200 }, (_, i) => ({ ID: i }));

        it('should return all data in "all" mode', () => {
            const result = exporter.testApplySampling(bigData);
            expect(result).toHaveLength(200);
        });

        it('should sample top N rows', () => {
            const topExporter = new TestExporter({ sampling: { mode: 'top', count: 10 } });
            const result = topExporter.testApplySampling(bigData);
            expect(result).toHaveLength(10);
            expect((result[0] as Record<string, number>).ID).toBe(0);
        });

        it('should sample bottom N rows', () => {
            const bottomExporter = new TestExporter({ sampling: { mode: 'bottom', count: 10 } });
            const result = bottomExporter.testApplySampling(bigData);
            expect(result).toHaveLength(10);
            expect((result[0] as Record<string, number>).ID).toBe(190);
        });

        it('should sample every Nth row', () => {
            const nthExporter = new TestExporter({ sampling: { mode: 'every-nth', interval: 10 } });
            const result = nthExporter.testApplySampling(bigData);
            expect(result).toHaveLength(20);
            expect((result[0] as Record<string, number>).ID).toBe(0);
            expect((result[1] as Record<string, number>).ID).toBe(10);
        });

        it('should sample random N rows', () => {
            const randomExporter = new TestExporter({ sampling: { mode: 'random', count: 50 } });
            const result = randomExporter.testApplySampling(bigData);
            expect(result).toHaveLength(50);
        });

        it('should return all data when random count exceeds data size', () => {
            const randomExporter = new TestExporter({ sampling: { mode: 'random', count: 500 } });
            const result = randomExporter.testApplySampling(bigData);
            expect(result).toHaveLength(200);
        });
    });

    describe('formatValue', () => {
        it('should return empty string for null', () => {
            expect(exporter.testFormatValue(null, {})).toBe('');
        });

        it('should return empty string for undefined', () => {
            expect(exporter.testFormatValue(undefined, {})).toBe('');
        });

        it('should return number as-is for number type', () => {
            expect(exporter.testFormatValue(42, { dataType: 'number' })).toBe(42);
        });

        it('should convert string to number for number type', () => {
            expect(exporter.testFormatValue('42', { dataType: 'number' })).toBe(42);
        });

        it('should return original value if not a valid number', () => {
            expect(exporter.testFormatValue('abc', { dataType: 'number' })).toBe('abc');
        });

        it('should convert to boolean for boolean type', () => {
            expect(exporter.testFormatValue(true, { dataType: 'boolean' })).toBe(true);
            expect(exporter.testFormatValue(false, { dataType: 'boolean' })).toBe(false);
        });

        it('should parse dates for date type', () => {
            const result = exporter.testFormatValue('2025-01-15', { dataType: 'date' });
            expect(result).toBeInstanceOf(Date);
        });

        it('should return Date instance as-is for date type', () => {
            const d = new Date('2025-01-15');
            const result = exporter.testFormatValue(d, { dataType: 'date' });
            expect(result).toBeInstanceOf(Date);
        });

        it('should return value as-is for default/string type', () => {
            expect(exporter.testFormatValue('hello', {})).toBe('hello');
        });
    });

    describe('extractRowValues', () => {
        it('should extract values in column order', () => {
            const row = { Name: 'Alice', ID: '1' };
            const columns = [{ name: 'ID' }, { name: 'Name' }];
            const result = exporter.testExtractRowValues(row, columns);
            expect(result[0]).toBe('1');
            expect(result[1]).toBe('Alice');
        });

        it('should return array as-is for array rows', () => {
            const row = [1, 2, 3];
            const columns = [{ name: 'A' }, { name: 'B' }];
            const result = exporter.testExtractRowValues(row, columns);
            expect(result).toEqual([1, 2, 3]);
        });
    });

    describe('getFullFileName', () => {
        it('should include the file extension', () => {
            expect(exporter.testGetFullFileName()).toBe('export.txt');
        });

        it('should use custom file name', () => {
            const namedExporter = new TestExporter({ fileName: 'my-data' });
            expect(namedExporter.testGetFullFileName()).toBe('my-data.txt');
        });
    });
});
