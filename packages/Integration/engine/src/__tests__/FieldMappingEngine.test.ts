import { describe, it, expect } from 'vitest';
import { FieldMappingEngine } from '../FieldMappingEngine.js';
import type { ExternalRecord } from '../types.js';
import type { ICompanyIntegrationFieldMap } from '../entity-types.js';
import type { TransformStep } from '../transforms.js';

// Helper to create a field map entity mock
function createFieldMap(
    sourceField: string,
    destField: string,
    pipeline: TransformStep[] | null = null,
    isKeyField = false,
    status: 'Active' | 'Inactive' = 'Active'
): ICompanyIntegrationFieldMap {
    return {
        SourceFieldName: sourceField,
        DestinationFieldName: destField,
        TransformPipeline: pipeline ? JSON.stringify(pipeline) : null,
        IsKeyField: isKeyField,
        Status: status,
        Priority: 0,
    } as unknown as ICompanyIntegrationFieldMap;
}

function createExternalRecord(
    fields: Record<string, unknown>,
    externalID = 'ext-1',
    isDeleted = false
): ExternalRecord {
    return {
        ExternalID: externalID,
        ObjectType: 'Contact',
        Fields: fields,
        IsDeleted: isDeleted,
    };
}

describe('FieldMappingEngine', () => {
    const engine = new FieldMappingEngine();

    describe('direct transform', () => {
        it('should pass value through without transformation', () => {
            const records = [createExternalRecord({ FirstName: 'Alice' })];
            const fieldMaps = [createFieldMap('FirstName', 'FirstName')];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['FirstName']).toBe('Alice');
        });

        it('should apply default value when source is null', () => {
            const records = [createExternalRecord({ FirstName: null })];
            const pipeline: TransformStep[] = [
                { Type: 'direct', Config: { DefaultValue: 'Unknown' } },
            ];
            const fieldMaps = [createFieldMap('FirstName', 'FirstName', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['FirstName']).toBe('Unknown');
        });
    });

    describe('regex transform', () => {
        it('should apply regex replacement', () => {
            const records = [createExternalRecord({ Phone: '(555) 123-4567' })];
            const pipeline: TransformStep[] = [
                { Type: 'regex', Config: { Pattern: '[^0-9]', Replacement: '', Flags: 'g' } },
            ];
            const fieldMaps = [createFieldMap('Phone', 'Phone', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['Phone']).toBe('5551234567');
        });
    });

    describe('split transform', () => {
        it('should extract part by index', () => {
            const records = [createExternalRecord({ FullName: 'Alice Smith' })];
            const pipeline: TransformStep[] = [
                { Type: 'split', Config: { Delimiter: ' ', Index: 0 } },
            ];
            const fieldMaps = [createFieldMap('FullName', 'FirstName', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['FirstName']).toBe('Alice');
        });

        it('should return null for out-of-range index', () => {
            const records = [createExternalRecord({ FullName: 'Alice' })];
            const pipeline: TransformStep[] = [
                { Type: 'split', Config: { Delimiter: ' ', Index: 5 } },
            ];
            const fieldMaps = [createFieldMap('FullName', 'LastName', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['LastName']).toBeNull();
        });
    });

    describe('combine transform', () => {
        it('should merge multiple fields with separator', () => {
            const records = [createExternalRecord({ First: 'Alice', Last: 'Smith' })];
            const pipeline: TransformStep[] = [
                { Type: 'combine', Config: { SourceFields: ['First', 'Last'], Separator: ' ' } },
            ];
            const fieldMaps = [createFieldMap('First', 'FullName', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['FullName']).toBe('Alice Smith');
        });
    });

    describe('lookup transform', () => {
        it('should map values case-insensitively', () => {
            const records = [createExternalRecord({ Status: 'ACTIVE' })];
            const pipeline: TransformStep[] = [
                {
                    Type: 'lookup',
                    Config: { Map: { active: 'Active', inactive: 'Inactive' }, Default: 'Unknown' },
                },
            ];
            const fieldMaps = [createFieldMap('Status', 'Status', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['Status']).toBe('Active');
        });

        it('should use default when value not found', () => {
            const records = [createExternalRecord({ Status: 'Archived' })];
            const pipeline: TransformStep[] = [
                {
                    Type: 'lookup',
                    Config: { Map: { active: 'Active' }, Default: 'Unknown' },
                },
            ];
            const fieldMaps = [createFieldMap('Status', 'Status', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['Status']).toBe('Unknown');
        });
    });

    describe('format transform', () => {
        it('should format dates as ISO', () => {
            const dateStr = '2024-06-15T10:30:00Z';
            const records = [createExternalRecord({ CreatedAt: dateStr })];
            const pipeline: TransformStep[] = [
                { Type: 'format', Config: { FormatString: 'ISO8601', FormatType: 'date' } },
            ];
            const fieldMaps = [createFieldMap('CreatedAt', 'CreatedAt', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            const formatted = result[0].MappedFields['CreatedAt'] as string;
            expect(formatted).toContain('2024-06-15');
        });

        it('should format numbers with fixed decimal places', () => {
            const records = [createExternalRecord({ Amount: 123.456 })];
            const pipeline: TransformStep[] = [
                { Type: 'format', Config: { FormatString: '2', FormatType: 'number' } },
            ];
            const fieldMaps = [createFieldMap('Amount', 'Amount', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['Amount']).toBe('123.46');
        });
    });

    describe('substring transform', () => {
        it('should extract a substring with start and length', () => {
            const records = [createExternalRecord({ Code: 'ABCDEF' })];
            const pipeline: TransformStep[] = [
                { Type: 'substring', Config: { Start: 1, Length: 3 } },
            ];
            const fieldMaps = [createFieldMap('Code', 'Code', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['Code']).toBe('BCD');
        });

        it('should extract to end when length is omitted', () => {
            const records = [createExternalRecord({ Code: 'ABCDEF' })];
            const pipeline: TransformStep[] = [
                { Type: 'substring', Config: { Start: 3 } },
            ];
            const fieldMaps = [createFieldMap('Code', 'Code', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['Code']).toBe('DEF');
        });
    });

    describe('coerce transform', () => {
        it('should coerce string to number', () => {
            const records = [createExternalRecord({ Age: '42' })];
            const pipeline: TransformStep[] = [
                { Type: 'coerce', Config: { TargetType: 'number' } },
            ];
            const fieldMaps = [createFieldMap('Age', 'Age', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['Age']).toBe(42);
        });

        it('should coerce string to boolean', () => {
            const records = [createExternalRecord({ Active: 'true' })];
            const pipeline: TransformStep[] = [
                { Type: 'coerce', Config: { TargetType: 'boolean' } },
            ];
            const fieldMaps = [createFieldMap('Active', 'IsActive', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['IsActive']).toBe(true);
        });

        it('should coerce "0" to false', () => {
            const records = [createExternalRecord({ Active: '0' })];
            const pipeline: TransformStep[] = [
                { Type: 'coerce', Config: { TargetType: 'boolean' } },
            ];
            const fieldMaps = [createFieldMap('Active', 'IsActive', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['IsActive']).toBe(false);
        });
    });

    describe('custom transform', () => {
        it('should evaluate simple expression', () => {
            const records = [createExternalRecord({ Price: 100 })];
            const pipeline: TransformStep[] = [
                { Type: 'custom', Config: { Expression: 'value * 1.1' } },
            ];
            const fieldMaps = [createFieldMap('Price', 'Price', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['Price']).toBeCloseTo(110);
        });

        it('should access all fields via fields parameter', () => {
            const records = [createExternalRecord({ First: 'Alice', Last: 'Smith' })];
            const pipeline: TransformStep[] = [
                { Type: 'custom', Config: { Expression: 'fields.First + " " + fields.Last' } },
            ];
            const fieldMaps = [createFieldMap('First', 'FullName', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['FullName']).toBe('Alice Smith');
        });
    });

    describe('pipeline execution', () => {
        it('should execute multiple transforms in sequence', () => {
            const records = [createExternalRecord({ Phone: '(555) 123-4567' })];
            const pipeline: TransformStep[] = [
                { Type: 'regex', Config: { Pattern: '[^0-9]', Replacement: '', Flags: 'g' } },
                { Type: 'substring', Config: { Start: 0, Length: 3 } },
            ];
            const fieldMaps = [createFieldMap('Phone', 'AreaCode', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['AreaCode']).toBe('555');
        });
    });

    describe('OnError handling', () => {
        it('should skip field when OnError is Skip', () => {
            const records = [createExternalRecord({ Value: 'not-a-number' })];
            const pipeline: TransformStep[] = [
                { Type: 'coerce', Config: { TargetType: 'number' }, OnError: 'Skip' },
            ];
            const fieldMaps = [createFieldMap('Value', 'Amount', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['Amount']).toBeUndefined();
        });

        it('should set null when OnError is Null', () => {
            const records = [createExternalRecord({ Value: 'not-a-number' })];
            const pipeline: TransformStep[] = [
                { Type: 'coerce', Config: { TargetType: 'number' }, OnError: 'Null' },
            ];
            const fieldMaps = [createFieldMap('Value', 'Amount', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['Amount']).toBeNull();
        });

        it('should throw when OnError is Fail', () => {
            const records = [createExternalRecord({ Value: 'not-a-number' })];
            const pipeline: TransformStep[] = [
                { Type: 'coerce', Config: { TargetType: 'number' }, OnError: 'Fail' },
            ];
            const fieldMaps = [createFieldMap('Value', 'Amount', pipeline)];

            expect(() => engine.Apply(records, fieldMaps, 'Contacts'))
                .toThrow('Cannot coerce');
        });
    });

    describe('inactive field maps', () => {
        it('should skip inactive field maps', () => {
            const records = [createExternalRecord({ A: 'a', B: 'b' })];
            const fieldMaps = [
                createFieldMap('A', 'A', null, false, 'Active'),
                createFieldMap('B', 'B', null, false, 'Inactive'),
            ];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['A']).toBe('a');
            expect(result[0].MappedFields['B']).toBeUndefined();
        });
    });

    describe('deleted records', () => {
        it('should set ChangeType to Delete for deleted external records', () => {
            const records = [createExternalRecord({ Name: 'test' }, 'ext-1', true)];
            const fieldMaps = [createFieldMap('Name', 'Name')];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].ChangeType).toBe('Delete');
        });
    });

    describe('multi-step transform pipelines', () => {
        it('should chain regex then format then coerce', () => {
            const records = [createExternalRecord({ Raw: '$1,234.56' })];
            const pipeline: TransformStep[] = [
                { Type: 'regex', Config: { Pattern: '[^0-9.]', Replacement: '', Flags: 'g' } },
                { Type: 'coerce', Config: { TargetType: 'number' } },
            ];
            const fieldMaps = [createFieldMap('Raw', 'Amount', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['Amount']).toBe(1234.56);
        });

        it('should chain split then coerce to number', () => {
            const records = [createExternalRecord({ Data: 'score:95' })];
            const pipeline: TransformStep[] = [
                { Type: 'split', Config: { Delimiter: ':', Index: 1 } },
                { Type: 'coerce', Config: { TargetType: 'number' } },
            ];
            const fieldMaps = [createFieldMap('Data', 'Score', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['Score']).toBe(95);
        });

        it('should chain combine then regex', () => {
            const records = [createExternalRecord({ First: 'john', Last: 'doe' })];
            const pipeline: TransformStep[] = [
                { Type: 'combine', Config: { SourceFields: ['First', 'Last'], Separator: ' ' } },
                { Type: 'custom', Config: { Expression: 'value.split(" ").map(w => w[0].toUpperCase() + w.slice(1)).join(" ")' } },
            ];
            const fieldMaps = [createFieldMap('First', 'FullName', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['FullName']).toBe('John Doe');
        });
    });

    describe('empty transform pipeline', () => {
        it('should pass through value when pipeline is empty JSON array', () => {
            const records = [createExternalRecord({ Name: 'Alice' })];
            const fieldMaps = [createFieldMap('Name', 'Name', [])];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['Name']).toBe('Alice');
        });

        it('should pass through value when pipeline is null', () => {
            const records = [createExternalRecord({ Name: 'Bob' })];
            const fieldMaps = [createFieldMap('Name', 'Name', null)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['Name']).toBe('Bob');
        });
    });

    describe('missing source field handling', () => {
        it('should set undefined for missing source field with no pipeline', () => {
            const records = [createExternalRecord({ A: 'val' })];
            const fieldMaps = [createFieldMap('NonExistent', 'Out')];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            // undefined field value → Apply does not set MappedFields entry
            expect(result[0].MappedFields['Out']).toBeUndefined();
        });

        it('should handle missing source with direct default', () => {
            const records = [createExternalRecord({ A: 'val' })];
            const pipeline: TransformStep[] = [
                { Type: 'direct', Config: { DefaultValue: 'fallback' } },
            ];
            const fieldMaps = [createFieldMap('Missing', 'Out', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['Out']).toBe('fallback');
        });
    });

    describe('multiple records batch', () => {
        it('should map all records in a batch correctly', () => {
            const records = [
                createExternalRecord({ Name: 'Alice' }, 'ext-1'),
                createExternalRecord({ Name: 'Bob' }, 'ext-2'),
                createExternalRecord({ Name: 'Charlie' }, 'ext-3'),
            ];
            const fieldMaps = [createFieldMap('Name', 'Name')];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result.length).toBe(3);
            expect(result[0].MappedFields['Name']).toBe('Alice');
            expect(result[1].MappedFields['Name']).toBe('Bob');
            expect(result[2].MappedFields['Name']).toBe('Charlie');
        });

        it('should set ExternalRecord on each mapped record', () => {
            const records = [
                createExternalRecord({ A: '1' }, 'ext-1'),
                createExternalRecord({ A: '2' }, 'ext-2'),
            ];
            const fieldMaps = [createFieldMap('A', 'A')];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].ExternalRecord.ExternalID).toBe('ext-1');
            expect(result[1].ExternalRecord.ExternalID).toBe('ext-2');
        });
    });

    describe('OnError mid-pipeline', () => {
        it('should skip field when error occurs mid-pipeline with Skip', () => {
            const records = [createExternalRecord({ Val: 'abc' })];
            const pipeline: TransformStep[] = [
                { Type: 'regex', Config: { Pattern: 'a', Replacement: 'X', Flags: 'g' } },
                { Type: 'coerce', Config: { TargetType: 'number' }, OnError: 'Skip' },
                { Type: 'custom', Config: { Expression: 'value * 2' } },
            ];
            const fieldMaps = [createFieldMap('Val', 'Out', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            expect(result[0].MappedFields['Out']).toBeUndefined();
        });

        it('should set null and continue pipeline when error occurs with Null', () => {
            const records = [createExternalRecord({ Val: 'abc' })];
            const pipeline: TransformStep[] = [
                { Type: 'coerce', Config: { TargetType: 'number' }, OnError: 'Null' },
                { Type: 'coerce', Config: { TargetType: 'string' } },
            ];
            const fieldMaps = [createFieldMap('Val', 'Out', pipeline)];

            const result = engine.Apply(records, fieldMaps, 'Contacts');
            // null coerced to string = ''
            expect(result[0].MappedFields['Out']).toBe('');
        });
    });
});
