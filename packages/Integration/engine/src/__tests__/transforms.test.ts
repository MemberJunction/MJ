import { describe, it, expect } from 'vitest';
import { FieldMappingEngine } from '../FieldMappingEngine.js';
import type { ExternalRecord } from '../types.js';
import type { MJCompanyIntegrationFieldMapEntity } from '@memberjunction/core-entities';
import type { TransformStep } from '../transforms.js';

/**
 * Comprehensive tests for all 9 transform types exercised through FieldMappingEngine.
 * Each transform is tested for normal cases, edge cases, and error conditions.
 */

function fieldMap(
    sourceField: string,
    destField: string,
    pipeline: TransformStep[] | null = null
): MJCompanyIntegrationFieldMapEntity {
    return {
        SourceFieldName: sourceField,
        DestinationFieldName: destField,
        TransformPipeline: pipeline ? JSON.stringify(pipeline) : null,
        IsKeyField: false,
        Status: 'Active',
        Priority: 0,
    } as unknown as MJCompanyIntegrationFieldMapEntity;
}

function record(fields: Record<string, unknown>, isDeleted = false): ExternalRecord {
    return { ExternalID: 'ext-1', ObjectType: 'TestObj', Fields: fields, IsDeleted: isDeleted };
}

const engine = new FieldMappingEngine();

describe('transforms', () => {
    // ===== DirectTransform =====
    describe('DirectTransform', () => {
        it('should pass value through unchanged', () => {
            const result = engine.Apply(
                [record({ Name: 'Alice' })],
                [fieldMap('Name', 'Name')],
                'Entity'
            );
            expect(result[0].MappedFields['Name']).toBe('Alice');
        });

        it('should apply DefaultValue when source is null', () => {
            const pipeline: TransformStep[] = [
                { Type: 'direct', Config: { DefaultValue: 'N/A' } },
            ];
            const result = engine.Apply(
                [record({ Name: null })],
                [fieldMap('Name', 'Name', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Name']).toBe('N/A');
        });

        it('should apply DefaultValue when source is undefined', () => {
            const pipeline: TransformStep[] = [
                { Type: 'direct', Config: { DefaultValue: 0 } },
            ];
            const result = engine.Apply(
                [record({})],
                [fieldMap('Missing', 'Val', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Val']).toBe(0);
        });

        it('should NOT apply DefaultValue when source is empty string', () => {
            const pipeline: TransformStep[] = [
                { Type: 'direct', Config: { DefaultValue: 'fallback' } },
            ];
            const result = engine.Apply(
                [record({ Name: '' })],
                [fieldMap('Name', 'Name', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Name']).toBe('');
        });

        it('should pass through zero without applying DefaultValue', () => {
            const pipeline: TransformStep[] = [
                { Type: 'direct', Config: { DefaultValue: 99 } },
            ];
            const result = engine.Apply(
                [record({ Count: 0 })],
                [fieldMap('Count', 'Count', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Count']).toBe(0);
        });

        it('should pass through false without applying DefaultValue', () => {
            const pipeline: TransformStep[] = [
                { Type: 'direct', Config: { DefaultValue: true } },
            ];
            const result = engine.Apply(
                [record({ Active: false })],
                [fieldMap('Active', 'Active', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Active']).toBe(false);
        });
    });

    // ===== RegexTransform =====
    describe('RegexTransform', () => {
        it('should apply match/replace', () => {
            const pipeline: TransformStep[] = [
                { Type: 'regex', Config: { Pattern: 'hello', Replacement: 'world' } },
            ];
            const result = engine.Apply(
                [record({ Text: 'say hello' })],
                [fieldMap('Text', 'Text', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Text']).toBe('say world');
        });

        it('should support capture groups', () => {
            const pipeline: TransformStep[] = [
                { Type: 'regex', Config: { Pattern: '(\\w+)@(\\w+)', Replacement: '$1 at $2' } },
            ];
            const result = engine.Apply(
                [record({ Email: 'user@domain' })],
                [fieldMap('Email', 'Email', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Email']).toBe('user at domain');
        });

        it('should support global flag for multiple replacements', () => {
            const pipeline: TransformStep[] = [
                { Type: 'regex', Config: { Pattern: '[aeiou]', Replacement: '*', Flags: 'gi' } },
            ];
            const result = engine.Apply(
                [record({ Text: 'Hello World' })],
                [fieldMap('Text', 'Text', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Text']).toBe('H*ll* W*rld');
        });

        it('should handle invalid regex with Fail OnError', () => {
            const pipeline: TransformStep[] = [
                { Type: 'regex', Config: { Pattern: '[invalid', Replacement: '' }, OnError: 'Fail' },
            ];
            expect(() =>
                engine.Apply(
                    [record({ Text: 'test' })],
                    [fieldMap('Text', 'Text', pipeline)],
                    'Entity'
                )
            ).toThrow();
        });

        it('should handle null value by converting to empty string', () => {
            const pipeline: TransformStep[] = [
                { Type: 'regex', Config: { Pattern: '^$', Replacement: 'was-empty' } },
            ];
            const result = engine.Apply(
                [record({ Text: null })],
                [fieldMap('Text', 'Text', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Text']).toBe('was-empty');
        });

        it('should replace only first match without global flag', () => {
            const pipeline: TransformStep[] = [
                { Type: 'regex', Config: { Pattern: 'a', Replacement: 'X' } },
            ];
            const result = engine.Apply(
                [record({ Text: 'banana' })],
                [fieldMap('Text', 'Text', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Text']).toBe('bXnana');
        });
    });

    // ===== SplitTransform =====
    describe('SplitTransform', () => {
        it('should split on space and extract first part', () => {
            const pipeline: TransformStep[] = [
                { Type: 'split', Config: { Delimiter: ' ', Index: 0 } },
            ];
            const result = engine.Apply(
                [record({ Full: 'Alice Smith' })],
                [fieldMap('Full', 'First', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['First']).toBe('Alice');
        });

        it('should extract last part', () => {
            const pipeline: TransformStep[] = [
                { Type: 'split', Config: { Delimiter: ' ', Index: 1 } },
            ];
            const result = engine.Apply(
                [record({ Full: 'Alice Smith' })],
                [fieldMap('Full', 'Last', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Last']).toBe('Smith');
        });

        it('should return null for out-of-bounds index', () => {
            const pipeline: TransformStep[] = [
                { Type: 'split', Config: { Delimiter: ',', Index: 5 } },
            ];
            const result = engine.Apply(
                [record({ Val: 'a,b' })],
                [fieldMap('Val', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBeNull();
        });

        it('should handle empty string input', () => {
            const pipeline: TransformStep[] = [
                { Type: 'split', Config: { Delimiter: ',', Index: 0 } },
            ];
            const result = engine.Apply(
                [record({ Val: '' })],
                [fieldMap('Val', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBe('');
        });

        it('should split on multi-char delimiter', () => {
            const pipeline: TransformStep[] = [
                { Type: 'split', Config: { Delimiter: '::', Index: 1 } },
            ];
            const result = engine.Apply(
                [record({ Path: 'module::class::method' })],
                [fieldMap('Path', 'Class', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Class']).toBe('class');
        });
    });

    // ===== CombineTransform =====
    describe('CombineTransform', () => {
        it('should combine multiple fields with space separator', () => {
            const pipeline: TransformStep[] = [
                { Type: 'combine', Config: { SourceFields: ['First', 'Last'], Separator: ' ' } },
            ];
            const result = engine.Apply(
                [record({ First: 'Alice', Last: 'Smith' })],
                [fieldMap('First', 'Full', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Full']).toBe('Alice Smith');
        });

        it('should combine with custom separator', () => {
            const pipeline: TransformStep[] = [
                { Type: 'combine', Config: { SourceFields: ['City', 'State', 'Zip'], Separator: ', ' } },
            ];
            const result = engine.Apply(
                [record({ City: 'Portland', State: 'OR', Zip: '97201' })],
                [fieldMap('City', 'Address', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Address']).toBe('Portland, OR, 97201');
        });

        it('should handle missing fields by converting to empty string', () => {
            const pipeline: TransformStep[] = [
                { Type: 'combine', Config: { SourceFields: ['First', 'Middle', 'Last'], Separator: ' ' } },
            ];
            const result = engine.Apply(
                [record({ First: 'Alice', Last: 'Smith' })],
                [fieldMap('First', 'Full', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Full']).toBe('Alice  Smith');
        });

        it('should handle single field', () => {
            const pipeline: TransformStep[] = [
                { Type: 'combine', Config: { SourceFields: ['Name'], Separator: '-' } },
            ];
            const result = engine.Apply(
                [record({ Name: 'Solo' })],
                [fieldMap('Name', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBe('Solo');
        });

        it('should combine with empty separator', () => {
            const pipeline: TransformStep[] = [
                { Type: 'combine', Config: { SourceFields: ['A', 'B', 'C'], Separator: '' } },
            ];
            const result = engine.Apply(
                [record({ A: 'X', B: 'Y', C: 'Z' })],
                [fieldMap('A', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBe('XYZ');
        });
    });

    // ===== LookupTransform =====
    describe('LookupTransform', () => {
        it('should perform successful lookup', () => {
            const pipeline: TransformStep[] = [
                { Type: 'lookup', Config: { Map: { lead: 'Lead', customer: 'Customer' }, Default: 'Other' } },
            ];
            const result = engine.Apply(
                [record({ Status: 'lead' })],
                [fieldMap('Status', 'Status', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Status']).toBe('Lead');
        });

        it('should match case-insensitively', () => {
            const pipeline: TransformStep[] = [
                { Type: 'lookup', Config: { Map: { active: 'Active' } } },
            ];
            const result = engine.Apply(
                [record({ Status: 'ACTIVE' })],
                [fieldMap('Status', 'Status', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Status']).toBe('Active');
        });

        it('should return default for missing lookup value', () => {
            const pipeline: TransformStep[] = [
                { Type: 'lookup', Config: { Map: { a: 1 }, Default: 'fallback' } },
            ];
            const result = engine.Apply(
                [record({ Val: 'z' })],
                [fieldMap('Val', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBe('fallback');
        });

        it('should return null when no default and value not found', () => {
            const pipeline: TransformStep[] = [
                { Type: 'lookup', Config: { Map: { a: 1 } } },
            ];
            const result = engine.Apply(
                [record({ Val: 'z' })],
                [fieldMap('Val', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBeNull();
        });

        it('should handle null input by looking up empty string', () => {
            const pipeline: TransformStep[] = [
                { Type: 'lookup', Config: { Map: { '': 'Empty' }, Default: 'NonEmpty' } },
            ];
            const result = engine.Apply(
                [record({ Val: null })],
                [fieldMap('Val', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBe('Empty');
        });
    });

    // ===== FormatTransform =====
    describe('FormatTransform', () => {
        it('should format date as ISO8601', () => {
            const pipeline: TransformStep[] = [
                { Type: 'format', Config: { FormatString: 'ISO8601', FormatType: 'date' } },
            ];
            const result = engine.Apply(
                [record({ Date: '2024-06-15T10:30:00Z' })],
                [fieldMap('Date', 'Date', pipeline)],
                'Entity'
            );
            const formatted = result[0].MappedFields['Date'] as string;
            expect(formatted).toContain('2024-06-15');
            expect(formatted).toContain('T');
        });

        it('should format date with "iso" (lowercase)', () => {
            const pipeline: TransformStep[] = [
                { Type: 'format', Config: { FormatString: 'iso', FormatType: 'date' } },
            ];
            const result = engine.Apply(
                [record({ Date: '2024-01-01' })],
                [fieldMap('Date', 'Date', pipeline)],
                'Entity'
            );
            const formatted = result[0].MappedFields['Date'] as string;
            expect(formatted).toContain('2024');
        });

        it('should format number with fixed decimal places', () => {
            const pipeline: TransformStep[] = [
                { Type: 'format', Config: { FormatString: '2', FormatType: 'number' } },
            ];
            const result = engine.Apply(
                [record({ Amount: 99.1 })],
                [fieldMap('Amount', 'Amount', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Amount']).toBe('99.10');
        });

        it('should format number with zero decimal places', () => {
            const pipeline: TransformStep[] = [
                { Type: 'format', Config: { FormatString: '0', FormatType: 'number' } },
            ];
            const result = engine.Apply(
                [record({ Amount: 99.7 })],
                [fieldMap('Amount', 'Amount', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Amount']).toBe('100');
        });

        it('should format string type by converting to string', () => {
            const pipeline: TransformStep[] = [
                { Type: 'format', Config: { FormatString: '', FormatType: 'string' } },
            ];
            const result = engine.Apply(
                [record({ Num: 42 })],
                [fieldMap('Num', 'Str', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Str']).toBe('42');
        });

        it('should format Date object as ISO8601', () => {
            const pipeline: TransformStep[] = [
                { Type: 'format', Config: { FormatString: 'ISO8601', FormatType: 'date' } },
            ];
            const dateObj = new Date('2024-03-15T12:00:00Z');
            const result = engine.Apply(
                [record({ Date: dateObj })],
                [fieldMap('Date', 'Date', pipeline)],
                'Entity'
            );
            const formatted = result[0].MappedFields['Date'] as string;
            expect(formatted).toBe(dateObj.toISOString());
        });
    });

    // ===== SubstringTransform =====
    describe('SubstringTransform', () => {
        it('should extract with start and length', () => {
            const pipeline: TransformStep[] = [
                { Type: 'substring', Config: { Start: 0, Length: 3 } },
            ];
            const result = engine.Apply(
                [record({ Code: 'ABCDEF' })],
                [fieldMap('Code', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBe('ABC');
        });

        it('should extract to end when length omitted', () => {
            const pipeline: TransformStep[] = [
                { Type: 'substring', Config: { Start: 4 } },
            ];
            const result = engine.Apply(
                [record({ Code: 'ABCDEF' })],
                [fieldMap('Code', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBe('EF');
        });

        it('should return empty for out-of-bounds start', () => {
            const pipeline: TransformStep[] = [
                { Type: 'substring', Config: { Start: 100, Length: 5 } },
            ];
            const result = engine.Apply(
                [record({ Code: 'ABC' })],
                [fieldMap('Code', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBe('');
        });

        it('should handle null value by converting to empty string', () => {
            const pipeline: TransformStep[] = [
                { Type: 'substring', Config: { Start: 0, Length: 5 } },
            ];
            const result = engine.Apply(
                [record({ Code: null })],
                [fieldMap('Code', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBe('');
        });

        it('should clamp length to available chars', () => {
            const pipeline: TransformStep[] = [
                { Type: 'substring', Config: { Start: 2, Length: 100 } },
            ];
            const result = engine.Apply(
                [record({ Code: 'ABCD' })],
                [fieldMap('Code', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBe('CD');
        });
    });

    // ===== CoerceTransform =====
    describe('CoerceTransform', () => {
        it('should coerce string to number', () => {
            const pipeline: TransformStep[] = [
                { Type: 'coerce', Config: { TargetType: 'number' } },
            ];
            const result = engine.Apply(
                [record({ Val: '42.5' })],
                [fieldMap('Val', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBe(42.5);
        });

        it('should throw on invalid number coercion', () => {
            const pipeline: TransformStep[] = [
                { Type: 'coerce', Config: { TargetType: 'number' }, OnError: 'Fail' },
            ];
            expect(() =>
                engine.Apply(
                    [record({ Val: 'abc' })],
                    [fieldMap('Val', 'Out', pipeline)],
                    'Entity'
                )
            ).toThrow('Cannot coerce');
        });

        it('should coerce "true" to true', () => {
            const pipeline: TransformStep[] = [
                { Type: 'coerce', Config: { TargetType: 'boolean' } },
            ];
            const result = engine.Apply(
                [record({ Val: 'true' })],
                [fieldMap('Val', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBe(true);
        });

        it('should coerce "yes" to true', () => {
            const pipeline: TransformStep[] = [
                { Type: 'coerce', Config: { TargetType: 'boolean' } },
            ];
            const result = engine.Apply(
                [record({ Val: 'yes' })],
                [fieldMap('Val', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBe(true);
        });

        it('should coerce "1" to true', () => {
            const pipeline: TransformStep[] = [
                { Type: 'coerce', Config: { TargetType: 'boolean' } },
            ];
            const result = engine.Apply(
                [record({ Val: '1' })],
                [fieldMap('Val', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBe(true);
        });

        it('should coerce "no" to false', () => {
            const pipeline: TransformStep[] = [
                { Type: 'coerce', Config: { TargetType: 'boolean' } },
            ];
            const result = engine.Apply(
                [record({ Val: 'no' })],
                [fieldMap('Val', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBe(false);
        });

        it('should coerce boolean true directly', () => {
            const pipeline: TransformStep[] = [
                { Type: 'coerce', Config: { TargetType: 'boolean' } },
            ];
            const result = engine.Apply(
                [record({ Val: true })],
                [fieldMap('Val', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBe(true);
        });

        it('should coerce number 0 to false', () => {
            const pipeline: TransformStep[] = [
                { Type: 'coerce', Config: { TargetType: 'boolean' } },
            ];
            const result = engine.Apply(
                [record({ Val: 0 })],
                [fieldMap('Val', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBe(false);
        });

        it('should coerce string to date', () => {
            const pipeline: TransformStep[] = [
                { Type: 'coerce', Config: { TargetType: 'date' } },
            ];
            const result = engine.Apply(
                [record({ Val: '2024-06-15' })],
                [fieldMap('Val', 'Out', pipeline)],
                'Entity'
            );
            const dateResult = result[0].MappedFields['Out'] as Date;
            expect(dateResult).toBeInstanceOf(Date);
            expect(dateResult.getFullYear()).toBe(2024);
        });

        it('should coerce number to string', () => {
            const pipeline: TransformStep[] = [
                { Type: 'coerce', Config: { TargetType: 'string' } },
            ];
            const result = engine.Apply(
                [record({ Val: 42 })],
                [fieldMap('Val', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBe('42');
        });

        it('should coerce null to empty string', () => {
            const pipeline: TransformStep[] = [
                { Type: 'coerce', Config: { TargetType: 'string' } },
            ];
            const result = engine.Apply(
                [record({ Val: null })],
                [fieldMap('Val', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBe('');
        });
    });

    // ===== CustomTransform =====
    describe('CustomTransform', () => {
        it('should evaluate arithmetic expression', () => {
            const pipeline: TransformStep[] = [
                { Type: 'custom', Config: { Expression: 'value * 2 + 10' } },
            ];
            const result = engine.Apply(
                [record({ Val: 5 })],
                [fieldMap('Val', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBe(20);
        });

        it('should access other fields via "fields" object', () => {
            const pipeline: TransformStep[] = [
                { Type: 'custom', Config: { Expression: 'fields.A + fields.B' } },
            ];
            const result = engine.Apply(
                [record({ A: 10, B: 20 })],
                [fieldMap('A', 'Sum', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Sum']).toBe(30);
        });

        it('should handle string operations', () => {
            const pipeline: TransformStep[] = [
                { Type: 'custom', Config: { Expression: 'String(value).toUpperCase()' } },
            ];
            const result = engine.Apply(
                [record({ Name: 'alice' })],
                [fieldMap('Name', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBe('ALICE');
        });

        it('should throw on invalid expression with Fail OnError', () => {
            const pipeline: TransformStep[] = [
                { Type: 'custom', Config: { Expression: 'nonexistent.method()' }, OnError: 'Fail' },
            ];
            expect(() =>
                engine.Apply(
                    [record({ Val: 1 })],
                    [fieldMap('Val', 'Out', pipeline)],
                    'Entity'
                )
            ).toThrow('Custom transform expression failed');
        });

        it('should set null on invalid expression with Null OnError', () => {
            const pipeline: TransformStep[] = [
                { Type: 'custom', Config: { Expression: 'nonexistent.method()' }, OnError: 'Null' },
            ];
            const result = engine.Apply(
                [record({ Val: 1 })],
                [fieldMap('Val', 'Out', pipeline)],
                'Entity'
            );
            expect(result[0].MappedFields['Out']).toBeNull();
        });

        it('should evaluate ternary expressions', () => {
            const pipeline: TransformStep[] = [
                { Type: 'custom', Config: { Expression: 'value > 50 ? "high" : "low"' } },
            ];
            const resultLow = engine.Apply(
                [record({ Score: 30 })],
                [fieldMap('Score', 'Level', pipeline)],
                'Entity'
            );
            expect(resultLow[0].MappedFields['Level']).toBe('low');

            const resultHigh = engine.Apply(
                [record({ Score: 80 })],
                [fieldMap('Score', 'Level', pipeline)],
                'Entity'
            );
            expect(resultHigh[0].MappedFields['Level']).toBe('high');
        });
    });
});
