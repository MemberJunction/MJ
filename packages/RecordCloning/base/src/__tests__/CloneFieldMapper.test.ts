import { describe, it, expect } from 'vitest';
import { MapFieldsForClone, FieldMappingFieldMeta } from '../CloneFieldMapper';

describe('CloneFieldMapper', () => {
    const mockFields: FieldMappingFieldMeta[] = [
        { Name: 'ID', IsPrimaryKey: true, Type: 'uniqueidentifier' },
        { Name: 'CreatedAt', IsPrimaryKey: false, IsCreatedAtField: true, Type: 'datetimeoffset' },
        { Name: 'UpdatedAt', IsPrimaryKey: false, IsUpdatedAtField: true, Type: 'datetimeoffset' },
        { Name: 'DeletedAt', IsPrimaryKey: false, IsSoftDeleteField: true, Type: 'datetimeoffset' },
        { Name: 'ComputedTotal', IsPrimaryKey: false, IsSPParameter: (forUpdate) => false, Type: 'decimal' },
        { Name: 'Name', IsPrimaryKey: false, IsNameField: true, Type: 'nvarchar' },
        { Name: 'Slug', IsPrimaryKey: false, IsUnique: true, Type: 'nvarchar' },
        { Name: 'Email', IsPrimaryKey: false, IsUnique: true, Type: 'nvarchar' },
        { Name: 'ParentID', IsPrimaryKey: false, RelatedEntity: 'Categories', RelatedEntityID: 'cat-entity', Type: 'uniqueidentifier' },
        { Name: 'OwnerID', IsPrimaryKey: false, RelatedEntity: 'Users', RelatedEntityID: 'user-entity', Type: 'uniqueidentifier' },
        { Name: 'OrderNumber', IsPrimaryKey: false, Type: 'nvarchar' },
        { Name: 'SecretKey', IsPrimaryKey: false, Type: 'nvarchar' },
        { Name: 'Status', IsPrimaryKey: false, Type: 'nvarchar' },
        { Name: 'ConfigJSON', IsPrimaryKey: false, Type: 'nvarchar' },
        { Name: 'ReadDeniedField', IsPrimaryKey: false, Type: 'nvarchar' },
        { Name: 'CreateDeniedField', IsPrimaryKey: false, Type: 'nvarchar' },
        { Name: 'UnchangedField', IsPrimaryKey: false, Type: 'nvarchar' },
    ];

    const sourceRecord: Record<string, unknown> = {
        ID: 'orig-pk-1',
        CreatedAt: '2026-01-01T00:00:00Z',
        UpdatedAt: '2026-01-02T00:00:00Z',
        DeletedAt: null,
        ComputedTotal: 150.0,
        Name: 'Main Project',
        Slug: 'main-project',
        Email: 'owner@example.com',
        ParentID: 'cat-old-1',
        OwnerID: 'user-old-1',
        OrderNumber: 'ORD-9999',
        SecretKey: 'top-secret',
        Status: 'Active',
        ConfigJSON: JSON.stringify({ ConversationID: 'conv-old-1', Title: 'Old Title' }),
        ReadDeniedField: 'sensitive-read',
        CreateDeniedField: 'sensitive-create',
        UnchangedField: 'Plain Value',
    };

    it('processes all §7.1 field classifications correctly', () => {
        const keyMap = {
            'cat-old-1': 'cat-new-1',
        };

        const result = MapFieldsForClone({
            EntityName: 'Project',
            Fields: mockFields,
            SourceRecord: sourceRecord,
            CurrentUserId: 'user-cloner-1',
            KeyMap: keyMap,
            FieldRules: {
                Exclude: ['SecretKey'],
                Reset: { Status: 'Draft' },
                Ownership: ['OwnerID'],
                ServerAllocated: ['OrderNumber'],
                PromptFor: ['Email'],
                JsonRemap: [
                    {
                        Field: 'ConfigJSON',
                        Preset: 'scheduled-job-configuration',
                    },
                ],
            },
            FLS: {
                DeniedReadFields: ['ReadDeniedField'],
                DeniedCreateFields: ['CreateDeniedField'],
            },
            NamingOptions: {
                Template: 'Copy of {Name}',
            },
            PromptedValues: {
                Email: 'new-owner@example.com',
            },
            RequestOverrides: {
                UnchangedField: 'Overridden Value',
            },
        });

        const vals = result.MappedValues;

        // PK & Timestamps & SoftDelete: excluded
        expect(vals.ID).toBeUndefined();
        expect(vals.CreatedAt).toBeUndefined();
        expect(vals.UpdatedAt).toBeUndefined();
        expect(vals.DeletedAt).toBeUndefined();

        // Computed / NotWritable: excluded
        expect(vals.ComputedTotal).toBeUndefined();

        // Configured Exclude: excluded
        expect(vals.SecretKey).toBeUndefined();

        // FLS Denied: excluded
        expect(vals.ReadDeniedField).toBeUndefined();
        expect(vals.CreateDeniedField).toBeUndefined();

        // Rename
        expect(vals.Name).toBe('Copy of Main Project');

        // Reset
        expect(vals.Status).toBe('Draft');

        // Ownership
        expect(vals.OwnerID).toBe('user-cloner-1');

        // ServerAllocated
        expect(vals.OrderNumber).toBeNull();

        // Remap FK
        expect(vals.ParentID).toBe('cat-new-1');

        // Remap JSON
        const parsedJson = JSON.parse(vals.ConfigJSON as string);
        expect(parsedJson.ConversationID).toBeNull();
        expect(parsedJson.Title).toBe('Old Title');

        // Prompt
        expect(vals.Email).toBe('new-owner@example.com');

        // Override
        expect(vals.UnchangedField).toBe('Overridden Value');
    });

    it('enforces that FLS denied fields can never be overridden by Request or Prompt', () => {
        const result = MapFieldsForClone({
            EntityName: 'Project',
            Fields: mockFields,
            SourceRecord: sourceRecord,
            FLS: {
                DeniedCreateFields: ['CreateDeniedField'],
                DeniedReadFields: ['ReadDeniedField'],
            },
            RequestOverrides: {
                CreateDeniedField: 'Hacked Value',
            },
            PromptedValues: {
                ReadDeniedField: 'Hacked Read Value',
            },
        });

        expect(result.MappedValues.CreateDeniedField).toBeUndefined();
        expect(result.MappedValues.ReadDeniedField).toBeUndefined();
    });

    it('never lets a request override a field the configuration resets or stamps', () => {
        const result = MapFieldsForClone({
            EntityName: 'MJ: Users',
            Fields: [
                { Name: 'Name', IsPrimaryKey: false, IsNameField: true },
                { Name: 'Type', IsPrimaryKey: false },
                { Name: 'OwnerID', IsPrimaryKey: false },
                { Name: 'Title', IsPrimaryKey: false },
            ],
            SourceRecord: { Name: 'Task 1', Type: 'Owner', OwnerID: 'someone', Title: 'Engineer' },
            CurrentUserId: 'cloner',
            FieldRules: { Reset: { Type: 'User' }, Ownership: ['OwnerID'] },
            RequestOverrides: { Type: 'Owner', OwnerID: 'someone', Title: 'Architect' },
        });

        // Copy -> Reset, and the override never lands
        expect(result.FieldChanges.filter((fc) => fc.Field === 'Type').map((c) => c.Kind)).toEqual(['Copy', 'Reset']);
        expect(result.MappedValues).toMatchObject({ Type: 'User', OwnerID: 'cloner', Title: 'Architect' });
        expect(result.IgnoredRequestValues.map((i) => i.Field)).toEqual(['Type', 'OwnerID']);
    });

    it('applies no overrides when UserEditable does not allow field edits', () => {
        const result = MapFieldsForClone({
            EntityName: 'Project',
            Fields: [{ Name: 'Title', IsPrimaryKey: false }],
            SourceRecord: { Title: 'Engineer' },
            RequestOverrides: { Title: 'Architect' },
            RequestFieldsEditable: false,
        });
        expect(result.MappedValues.Title).toBe('Engineer');
        expect(result.IgnoredRequestValues).toEqual([expect.objectContaining({ Field: 'Title', Kind: 'Override' })]);
    });

    it('accepts prompted values only for PromptFor fields', () => {
        const result = MapFieldsForClone({
            EntityName: 'MJ: Users',
            Fields: [
                { Name: 'Email', IsPrimaryKey: false },
                { Name: 'IsActive', IsPrimaryKey: false },
            ],
            SourceRecord: { Email: 'alice@example.com', IsActive: false },
            FieldRules: { PromptFor: ['Email'] },
            PromptedValues: { Email: 'bob@example.com', IsActive: true },
        });
        expect(result.MappedValues).toMatchObject({ Email: 'bob@example.com', IsActive: false });
        expect(result.IgnoredRequestValues).toEqual([expect.objectContaining({ Field: 'IsActive', Kind: 'Prompt' })]);
    });

    it('derives field values using field rules (Stage 13)', () => {
        const result = MapFieldsForClone({
            EntityName: 'MJ: Users',
            Fields: [
                { Name: 'Name', IsPrimaryKey: false, IsNameField: true },
                { Name: 'Email', IsPrimaryKey: false },
                { Name: 'Title', IsPrimaryKey: false },
            ],
            SourceRecord: {
                Name: 'alice@example.com',
                Email: 'alice@example.com',
                Title: 'Engineer',
            },
            PromptedValues: {
                Email: 'bob@example.com',
            },
            FieldRules: {
                PromptFor: ['Email'],
                Rules: {
                    Rules: [
                        {
                            TargetField: 'Name',
                            Source: { Kind: 'field', Field: 'Email' },
                        },
                    ],
                },
            },
        });

        expect(result.MappedValues.Email).toBe('bob@example.com');
        expect(result.MappedValues.Name).toBe('bob@example.com');
        const nameChange = result.FieldChanges.find((c) => c.Field === 'Name' && c.Kind === 'Rule');
        expect(nameChange).toBeDefined();
        expect(nameChange?.NewValue).toBe('bob@example.com');
    });
});
