import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('@memberjunction/core', () => {
    class MockMetadata {
        Entities: unknown[] = [];
    }
    return { Metadata: MockMetadata, EntityFieldInfo: class {}, EntityInfo: class {} };
});

// ── Import under test (pure functions, no Angular deps needed) ────────

import {
    GenerateCardTemplate,
    GenerateCardTemplateFromMetadata,
    CombineTitleFields,
    FormatKeyAsLabel,
} from '../lib/entity-card.types';
import type { CardTemplate, CardDisplayField } from '../lib/entity-card.types';

// ── Helpers to build mock EntityInfo/EntityFieldInfo ───────────────────

interface MockField {
    Name: string;
    IsNameField?: boolean;
    IsPrimaryKey?: boolean;
    Sequence?: number;
    TSType?: string;
    Type?: string;
    DefaultInView?: boolean;
    DisplayNameOrName?: string;
    RelatedEntityID?: string | null;
}

function makeField(overrides: Partial<MockField> & { Name: string }): MockField {
    return {
        IsNameField: false,
        IsPrimaryKey: false,
        Sequence: 9999,
        TSType: 'string',
        Type: 'nvarchar',
        DefaultInView: false,
        DisplayNameOrName: overrides.Name,
        RelatedEntityID: null,
        ...overrides,
    };
}

interface MockEntity {
    Name: string;
    NameField: MockField | null;
    Fields: MockField[];
    Icon?: string;
}

function makeEntity(name: string, fields: MockField[], nameField?: MockField | null): MockEntity {
    return {
        Name: name,
        NameField: nameField === undefined
            ? (fields.find(f => f.IsNameField) ?? null)
            : nameField,
        Fields: fields,
    };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('FormatKeyAsLabel', () => {
    it('should split PascalCase into separate words', () => {
        expect(FormatKeyAsLabel('FirstName')).toBe('First Name');
    });

    it('should split camelCase into separate words with capitalized first letter', () => {
        expect(FormatKeyAsLabel('contentTypeID')).toBe('Content Type ID');
    });

    it('should handle single word', () => {
        expect(FormatKeyAsLabel('Name')).toBe('Name');
    });

    it('should handle all-uppercase abbreviation at end', () => {
        expect(FormatKeyAsLabel('RecordID')).toBe('Record ID');
    });

    it('should handle consecutive uppercase followed by lowercase', () => {
        expect(FormatKeyAsLabel('HTMLContent')).toBe('HTML Content');
    });

    it('should capitalize the first character if lowercase', () => {
        expect(FormatKeyAsLabel('email')).toBe('Email');
    });

    it('should handle empty string', () => {
        expect(FormatKeyAsLabel('')).toBe('');
    });

    it('should handle single character', () => {
        expect(FormatKeyAsLabel('x')).toBe('X');
    });
});

describe('CombineTitleFields', () => {
    it('should combine multiple field values with a space', () => {
        const record = { FirstName: 'Elizabeth', LastName: 'Rodriguez' };
        expect(CombineTitleFields(record, ['FirstName', 'LastName'])).toBe('Elizabeth Rodriguez');
    });

    it('should return "Unknown" when all fields are null', () => {
        const record = { FirstName: null, LastName: null };
        expect(CombineTitleFields(record, ['FirstName', 'LastName'])).toBe('Unknown');
    });

    it('should return "Unknown" when all fields are empty strings', () => {
        const record = { FirstName: '', LastName: '   ' };
        expect(CombineTitleFields(record, ['FirstName', 'LastName'])).toBe('Unknown');
    });

    it('should skip missing fields and combine remaining', () => {
        const record = { FirstName: 'Sarah' };
        expect(CombineTitleFields(record, ['FirstName', 'LastName'])).toBe('Sarah');
    });

    it('should handle single field', () => {
        const record = { Name: 'Acme Corp' };
        expect(CombineTitleFields(record, ['Name'])).toBe('Acme Corp');
    });

    it('should convert non-string values to strings', () => {
        const record = { Code: 42 };
        expect(CombineTitleFields(record, ['Code'])).toBe('42');
    });

    it('should return "Unknown" for empty titleFields array', () => {
        const record = { Name: 'Test' };
        expect(CombineTitleFields(record, [])).toBe('Unknown');
    });

    it('should handle undefined field values', () => {
        const record: Record<string, unknown> = { FirstName: undefined, LastName: 'Smith' };
        expect(CombineTitleFields(record, ['FirstName', 'LastName'])).toBe('Smith');
    });
});

describe('GenerateCardTemplate', () => {
    describe('FindTitleFields', () => {
        it('should use multiple IsNameField fields sorted by Sequence for a person entity', () => {
            const entity = makeEntity('Contacts', [
                makeField({ Name: 'ID', IsPrimaryKey: true, Sequence: 0 }),
                makeField({ Name: 'FirstName', IsNameField: true, Sequence: 1 }),
                makeField({ Name: 'LastName', IsNameField: true, Sequence: 2 }),
                makeField({ Name: 'Email', Sequence: 3 }),
            ]);

            const template = GenerateCardTemplate(entity as unknown as import('@memberjunction/core').EntityInfo);
            expect(template.TitleFields).toEqual(['FirstName', 'LastName']);
        });

        it('should use single IsNameField for simple Name entity', () => {
            const entity = makeEntity('Companies', [
                makeField({ Name: 'ID', IsPrimaryKey: true, Sequence: 0 }),
                makeField({ Name: 'Name', IsNameField: true, Sequence: 1 }),
                makeField({ Name: 'Industry', Sequence: 2 }),
            ]);

            const template = GenerateCardTemplate(entity as unknown as import('@memberjunction/core').EntityInfo);
            expect(template.TitleFields).toEqual(['Name']);
        });

        it('should fall back to entity.NameField when no IsNameField exists', () => {
            const nameField = makeField({ Name: 'DisplayName', Sequence: 1 });
            const entity = makeEntity('Items', [
                makeField({ Name: 'ID', IsPrimaryKey: true, Sequence: 0 }),
                nameField,
                makeField({ Name: 'Description', Sequence: 2 }),
            ], nameField);

            const template = GenerateCardTemplate(entity as unknown as import('@memberjunction/core').EntityInfo);
            expect(template.TitleFields).toEqual(['DisplayName']);
        });

        it('should fall back to heuristic "Name" field', () => {
            const entity = makeEntity('Things', [
                makeField({ Name: 'ID', IsPrimaryKey: true, Sequence: 0 }),
                makeField({ Name: 'Name', Sequence: 1 }),
                makeField({ Name: 'Value', TSType: 'number', Sequence: 2 }),
            ], null);

            const template = GenerateCardTemplate(entity as unknown as import('@memberjunction/core').EntityInfo);
            expect(template.TitleFields).toEqual(['Name']);
        });

        it('should fall back to field ending in "Name"', () => {
            const entity = makeEntity('Products', [
                makeField({ Name: 'ID', IsPrimaryKey: true, Sequence: 0 }),
                makeField({ Name: 'ProductName', Sequence: 1 }),
                makeField({ Name: 'Price', TSType: 'number', Sequence: 2 }),
            ], null);

            const template = GenerateCardTemplate(entity as unknown as import('@memberjunction/core').EntityInfo);
            expect(template.TitleFields).toEqual(['ProductName']);
        });

        it('should fall back to first string field when no name patterns match', () => {
            const entity = makeEntity('Metrics', [
                makeField({ Name: 'ID', IsPrimaryKey: true, Sequence: 0 }),
                makeField({ Name: 'Label', Sequence: 1 }),
                makeField({ Name: 'Score', TSType: 'number', Sequence: 2 }),
            ], null);

            const template = GenerateCardTemplate(entity as unknown as import('@memberjunction/core').EntityInfo);
            expect(template.TitleFields).toEqual(['Label']);
        });

        it('should return empty TitleFields when no string fields exist', () => {
            const entity = makeEntity('Counters', [
                makeField({ Name: 'ID', IsPrimaryKey: true, Sequence: 0, TSType: 'string' }),
                makeField({ Name: 'Count', TSType: 'number', Sequence: 1 }),
                makeField({ Name: 'Active', TSType: 'boolean', Sequence: 2 }),
            ], null);

            const template = GenerateCardTemplate(entity as unknown as import('@memberjunction/core').EntityInfo);
            // ID is primary key so skipped; Count is number, Active is boolean
            expect(template.TitleFields).toEqual([]);
        });
    });

    describe('FindDisplayFields', () => {
        it('should prefer DefaultInView fields sorted by Sequence', () => {
            const entity = makeEntity('Orders', [
                makeField({ Name: 'ID', IsPrimaryKey: true, Sequence: 0 }),
                makeField({ Name: 'Name', IsNameField: true, Sequence: 1 }),
                makeField({ Name: 'Status', DefaultInView: true, Sequence: 2 }),
                makeField({ Name: 'Total', TSType: 'number', DefaultInView: true, Sequence: 3 }),
                makeField({ Name: 'Notes', Sequence: 10 }),
            ]);

            const template = GenerateCardTemplate(entity as unknown as import('@memberjunction/core').EntityInfo);
            const fieldNames = template.DisplayFields.map(f => f.Name);
            expect(fieldNames).toContain('Status');
            expect(fieldNames).toContain('Total');
        });

        it('should fall back to metric keyword fields when few DefaultInView', () => {
            const entity = makeEntity('Invoices', [
                makeField({ Name: 'ID', IsPrimaryKey: true, Sequence: 0 }),
                makeField({ Name: 'Name', IsNameField: true, Sequence: 1 }),
                makeField({ Name: 'Amount', TSType: 'number', Sequence: 2 }),
                makeField({ Name: 'TotalCost', TSType: 'number', Sequence: 3 }),
                makeField({ Name: 'Notes', Sequence: 4 }),
            ]);

            const template = GenerateCardTemplate(entity as unknown as import('@memberjunction/core').EntityInfo);
            const fieldNames = template.DisplayFields.map(f => f.Name);
            expect(fieldNames).toContain('Amount');
            expect(fieldNames).toContain('TotalCost');
        });

        it('should fall back to first N non-excluded fields by sequence', () => {
            const entity = makeEntity('Simple', [
                makeField({ Name: 'ID', IsPrimaryKey: true, Sequence: 0 }),
                makeField({ Name: 'Name', IsNameField: true, Sequence: 1 }),
                makeField({ Name: 'Alpha', Sequence: 2 }),
                makeField({ Name: 'Beta', Sequence: 3 }),
                makeField({ Name: 'Gamma', Sequence: 4 }),
                makeField({ Name: 'Delta', Sequence: 5 }),
                makeField({ Name: 'Epsilon', Sequence: 6 }),
            ]);

            const template = GenerateCardTemplate(entity as unknown as import('@memberjunction/core').EntityInfo, 4);
            expect(template.DisplayFields.length).toBeLessThanOrEqual(4);
        });

        it('should exclude PK, FK, and internal fields from display', () => {
            const entity = makeEntity('Records', [
                makeField({ Name: 'ID', IsPrimaryKey: true, Sequence: 0 }),
                makeField({ Name: 'Name', IsNameField: true, Sequence: 1 }),
                makeField({ Name: '__mj_CreatedAt', Sequence: 2 }),
                makeField({ Name: 'CategoryID', Sequence: 3, RelatedEntityID: 'some-id' }),
                makeField({ Name: 'Description', Sequence: 4 }),
            ]);

            const template = GenerateCardTemplate(entity as unknown as import('@memberjunction/core').EntityInfo);
            const fieldNames = template.DisplayFields.map(f => f.Name);
            expect(fieldNames).not.toContain('ID');
            expect(fieldNames).not.toContain('__mj_CreatedAt');
            expect(fieldNames).not.toContain('CategoryID');
            expect(fieldNames).toContain('Description');
        });

        it('should respect maxDisplayFields parameter', () => {
            const entity = makeEntity('Big', [
                makeField({ Name: 'ID', IsPrimaryKey: true, Sequence: 0 }),
                makeField({ Name: 'Name', IsNameField: true, Sequence: 1 }),
                makeField({ Name: 'A', DefaultInView: true, Sequence: 2 }),
                makeField({ Name: 'B', DefaultInView: true, Sequence: 3 }),
                makeField({ Name: 'C', DefaultInView: true, Sequence: 4 }),
                makeField({ Name: 'D', DefaultInView: true, Sequence: 5 }),
                makeField({ Name: 'E', DefaultInView: true, Sequence: 6 }),
            ]);

            const template = GenerateCardTemplate(entity as unknown as import('@memberjunction/core').EntityInfo, 2);
            expect(template.DisplayFields.length).toBeLessThanOrEqual(2);
        });
    });

    describe('keyword detection (subtitle, description, thumbnail, badge)', () => {
        it('should detect Status as subtitle', () => {
            const entity = makeEntity('Tasks', [
                makeField({ Name: 'ID', IsPrimaryKey: true, Sequence: 0 }),
                makeField({ Name: 'Name', IsNameField: true, Sequence: 1 }),
                makeField({ Name: 'Status', Sequence: 2 }),
                makeField({ Name: 'Description', Sequence: 3 }),
            ]);

            const template = GenerateCardTemplate(entity as unknown as import('@memberjunction/core').EntityInfo);
            expect(template.SubtitleField).toBe('Status');
        });

        it('should detect Description as description field', () => {
            const entity = makeEntity('Articles', [
                makeField({ Name: 'ID', IsPrimaryKey: true, Sequence: 0 }),
                makeField({ Name: 'Title', IsNameField: true, Sequence: 1 }),
                makeField({ Name: 'Description', Sequence: 2 }),
            ]);

            const template = GenerateCardTemplate(entity as unknown as import('@memberjunction/core').EntityInfo);
            expect(template.DescriptionField).toBe('Description');
        });

        it('should detect image-related fields as thumbnail', () => {
            const entity = makeEntity('Users', [
                makeField({ Name: 'ID', IsPrimaryKey: true, Sequence: 0 }),
                makeField({ Name: 'Name', IsNameField: true, Sequence: 1 }),
                makeField({ Name: 'AvatarURL', Sequence: 2 }),
                makeField({ Name: 'PhotoURL', Sequence: 3 }),
            ]);

            const template = GenerateCardTemplate(entity as unknown as import('@memberjunction/core').EntityInfo);
            expect(template.ThumbnailFields).toContain('AvatarURL');
            expect(template.ThumbnailFields).toContain('PhotoURL');
        });

        it('should detect Priority as badge field', () => {
            const entity = makeEntity('Issues', [
                makeField({ Name: 'ID', IsPrimaryKey: true, Sequence: 0 }),
                makeField({ Name: 'Title', IsNameField: true, Sequence: 1 }),
                makeField({ Name: 'Priority', Sequence: 2 }),
            ]);

            const template = GenerateCardTemplate(entity as unknown as import('@memberjunction/core').EntityInfo);
            expect(template.BadgeField).toBe('Priority');
        });

        it('should return null for subtitle when no keyword matches', () => {
            const entity = makeEntity('Data', [
                makeField({ Name: 'ID', IsPrimaryKey: true, Sequence: 0 }),
                makeField({ Name: 'Name', IsNameField: true, Sequence: 1 }),
                makeField({ Name: 'Value', TSType: 'number', Sequence: 2 }),
            ]);

            const template = GenerateCardTemplate(entity as unknown as import('@memberjunction/core').EntityInfo);
            expect(template.SubtitleField).toBeNull();
        });
    });

    describe('FieldLabels map', () => {
        it('should contain labels for all entity fields', () => {
            const entity = makeEntity('Items', [
                makeField({ Name: 'ID', IsPrimaryKey: true, Sequence: 0, DisplayNameOrName: 'ID' }),
                makeField({ Name: 'ProductName', IsNameField: true, Sequence: 1, DisplayNameOrName: 'Product Name' }),
                makeField({ Name: 'Price', TSType: 'number', Sequence: 2, DisplayNameOrName: 'Price' }),
            ]);

            const template = GenerateCardTemplate(entity as unknown as import('@memberjunction/core').EntityInfo);
            expect(template.FieldLabels['ProductName']).toBe('Product Name');
            expect(template.FieldLabels['Price']).toBe('Price');
            expect(template.FieldLabels['ID']).toBe('ID');
        });
    });
});

describe('GenerateCardTemplateFromMetadata', () => {
    it('should generate a fallback template when entity metadata is not found', () => {
        const keys = ['Name', 'Email', 'Phone', 'Status', 'Entity', 'RecordID'];
        const template = GenerateCardTemplateFromMetadata('NonExistentEntity', keys);

        expect(template.TitleFields).toContain('Name');
        // Internal keys like Entity, RecordID should be excluded from display
        const displayNames = template.DisplayFields.map(f => f.Name);
        expect(displayNames).not.toContain('Entity');
        expect(displayNames).not.toContain('RecordID');
    });

    it('should prefer "Name" key as title in fallback mode', () => {
        const keys = ['Email', 'Name', 'Status'];
        const template = GenerateCardTemplateFromMetadata('Unknown', keys);
        expect(template.TitleFields).toEqual(['Name']);
    });

    it('should use field ending with "Name" when no exact "Name" key', () => {
        const keys = ['Email', 'CompanyName', 'Status'];
        const template = GenerateCardTemplateFromMetadata('Unknown', keys);
        expect(template.TitleFields).toEqual(['CompanyName']);
    });

    it('should use "Title" key as fallback title', () => {
        const keys = ['Title', 'Email', 'Status'];
        const template = GenerateCardTemplateFromMetadata('Unknown', keys);
        expect(template.TitleFields).toEqual(['Title']);
    });

    it('should use first usable key when no name/title keys exist', () => {
        const keys = ['Email', 'Phone', 'Status'];
        const template = GenerateCardTemplateFromMetadata('Unknown', keys);
        expect(template.TitleFields).toHaveLength(1);
        expect(template.TitleFields[0]).toBe('Email');
    });

    it('should limit display fields to maxDisplayFields', () => {
        const keys = ['Name', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
        const template = GenerateCardTemplateFromMetadata('Unknown', keys, 3);
        expect(template.DisplayFields.length).toBeLessThanOrEqual(3);
    });

    it('should generate FieldLabels for all keys using FormatKeyAsLabel', () => {
        const keys = ['FirstName', 'LastName'];
        const template = GenerateCardTemplateFromMetadata('Unknown', keys);
        expect(template.FieldLabels['FirstName']).toBe('First Name');
        expect(template.FieldLabels['LastName']).toBe('Last Name');
    });

    it('should exclude internal keys like ID and __mj_ from display', () => {
        const keys = ['ID', '__mj_CreatedAt', 'Name', 'Status'];
        const template = GenerateCardTemplateFromMetadata('Unknown', keys);
        const displayNames = template.DisplayFields.map(f => f.Name);
        expect(displayNames).not.toContain('ID');
        expect(displayNames).not.toContain('__mj_CreatedAt');
    });

    it('should return empty TitleFields when no usable keys exist', () => {
        const keys = ['Entity', 'EntityIcon', 'RecordID', 'TemplateID', 'ID'];
        const template = GenerateCardTemplateFromMetadata('Unknown', keys);
        // All keys are internal, so usable is empty
        expect(template.TitleFields).toEqual([]);
    });

    it('should set all display field types to "text" in fallback mode', () => {
        const keys = ['Name', 'Email', 'Count'];
        const template = GenerateCardTemplateFromMetadata('Unknown', keys);
        for (const field of template.DisplayFields) {
            expect(field.Type).toBe('text');
        }
    });
});

describe('CardDisplayField type detection', () => {
    it('should detect number type for numeric TSType fields', () => {
        const entity = makeEntity('Metrics', [
            makeField({ Name: 'ID', IsPrimaryKey: true, Sequence: 0 }),
            makeField({ Name: 'Name', IsNameField: true, Sequence: 1 }),
            makeField({ Name: 'Score', TSType: 'number', Sequence: 2, DefaultInView: true }),
        ]);

        const template = GenerateCardTemplate(entity as unknown as import('@memberjunction/core').EntityInfo);
        const scoreField = template.DisplayFields.find(f => f.Name === 'Score');
        expect(scoreField?.Type).toBe('number');
    });

    it('should detect boolean type for bit fields', () => {
        const entity = makeEntity('Flags', [
            makeField({ Name: 'ID', IsPrimaryKey: true, Sequence: 0 }),
            makeField({ Name: 'Name', IsNameField: true, Sequence: 1 }),
            makeField({ Name: 'IsActive', TSType: 'boolean', Sequence: 2, DefaultInView: true }),
        ]);

        const template = GenerateCardTemplate(entity as unknown as import('@memberjunction/core').EntityInfo);
        const boolField = template.DisplayFields.find(f => f.Name === 'IsActive');
        expect(boolField?.Type).toBe('boolean');
    });

    it('should detect date type for date fields', () => {
        const entity = makeEntity('Events', [
            makeField({ Name: 'ID', IsPrimaryKey: true, Sequence: 0 }),
            makeField({ Name: 'Name', IsNameField: true, Sequence: 1 }),
            makeField({ Name: 'StartDate', TSType: 'Date', Type: 'datetime', Sequence: 2, DefaultInView: true }),
        ]);

        const template = GenerateCardTemplate(entity as unknown as import('@memberjunction/core').EntityInfo);
        const dateField = template.DisplayFields.find(f => f.Name === 'StartDate');
        expect(dateField?.Type).toBe('date');
    });
});
