import { describe, it, expect } from 'vitest';
import { buildDefaultFormScaffold, sanitizeComponentName } from '../forms/default-form-scaffold';
import type { EntityInfo, EntityFieldInfo, IMetadataProvider } from '@memberjunction/core';

/**
 * `buildDefaultFormScaffold` is the floor the Form Builder agent (and the
 * Form Builder dashboard's "new form" path) start from. Its job is to mirror
 * the CodeGen Angular default layout for an entity. These tests pin the
 * shape contract — categories become sections, FK / enum / boolean fields
 * get the right input types, system metadata lands last and collapsed.
 */

function mkField(overrides: Partial<EntityFieldInfo & { Name: string }>): EntityFieldInfo {
    return {
        Name: 'Field',
        DisplayName: undefined,
        Description: undefined,
        Type: 'nvarchar',
        TSType: 'string',
        Sequence: 0,
        AllowsNull: true,
        IsPrimaryKey: false,
        IsVirtual: false,
        IsComputed: false,
        MaxLength: 100,
        DefaultValue: null,
        RelatedEntity: null,
        RelatedEntityFieldName: null,
        ValueListType: 'None',
        EntityFieldValues: [],
        IncludeInGeneratedForm: true,
        GeneratedFormSectionType: 'Category',
        Category: 'Identity',
        ReadOnly: false,
        ...overrides,
    } as unknown as EntityFieldInfo;
}

function mkEntity(name: string, fields: EntityFieldInfo[], extras: Partial<EntityInfo> = {}): EntityInfo {
    return {
        ID: 'aaa',
        Name: name,
        ClassName: name.replace(/[^A-Za-z0-9]/g, ''),
        DisplayName: name,
        Description: undefined,
        Fields: fields,
        NameField: fields.find(f => f.Name === 'Name') ?? null,
        ...extras,
    } as unknown as EntityInfo;
}

function mkProvider(entities: EntityInfo[]): IMetadataProvider {
    return {
        Entities: entities,
        EntityByName(name: string) {
            return entities.find(e => e.Name.toLowerCase() === name.toLowerCase());
        },
    } as unknown as IMetadataProvider;
}

describe('buildDefaultFormScaffold', () => {

    it('returns null for an unknown entity', () => {
        const provider = mkProvider([]);
        expect(buildDefaultFormScaffold('Missing', provider)).toBeNull();
    });

    it('emits a form-role spec with embedded location', () => {
        const entity = mkEntity('Apps', [
            mkField({ Name: 'Name', Sequence: 1, Category: 'Identity' }),
        ]);
        const provider = mkProvider([entity]);
        const spec = buildDefaultFormScaffold('Apps', provider);
        expect(spec).not.toBeNull();
        expect(spec!.componentRole).toBe('form');
        expect(spec!.location).toBe('embedded');
        // Name must be a valid JS identifier
        expect(/^[A-Za-z_][A-Za-z0-9_]*$/.test(spec!.name)).toBe(true);
    });

    it('groups fields by Category into sections', () => {
        const entity = mkEntity('Apps', [
            mkField({ Name: 'Name', Sequence: 1, Category: 'Identity' }),
            mkField({ Name: 'Status', Sequence: 2, Category: 'Configuration' }),
            mkField({ Name: 'Description', Sequence: 3, Category: 'Identity' }),
        ]);
        const spec = buildDefaultFormScaffold('Apps', mkProvider([entity]));
        expect(spec!.code).toMatch(/title="Identity"/);
        expect(spec!.code).toMatch(/title="Configuration"/);
    });

    it('emits long-string fields as full-span fields', () => {
        const entity = mkEntity('Apps', [
            mkField({ Name: 'Description', Sequence: 1, Category: 'Identity', MaxLength: 4000 }),
        ]);
        const spec = buildDefaultFormScaffold('Apps', mkProvider([entity]));
        // Long-string fields render with span={2} to fill the row
        expect(spec!.code).toMatch(/<Field name="Description"[^/]*span=\{2\}/);
    });

    it('skips PK fields, audit fields, virtual fields', () => {
        const entity = mkEntity('Apps', [
            mkField({ Name: 'ID', Sequence: 0, IsPrimaryKey: true, Category: 'Identity' }),
            mkField({ Name: 'Name', Sequence: 1, Category: 'Identity' }),
            mkField({ Name: '__mj_CreatedAt', Sequence: 99 }),
            mkField({ Name: 'Computed', Sequence: 100, IsVirtual: true, IsComputed: true }),
        ]);
        const spec = buildDefaultFormScaffold('Apps', mkProvider([entity]));
        expect(spec!.code).not.toMatch(/<Field name="ID"/);
        expect(spec!.code).not.toMatch(/<Field name="Computed"/);
    });

    it('places System Metadata section last when audit fields are present', () => {
        const entity = mkEntity('Apps', [
            mkField({ Name: 'Name', Sequence: 1, Category: 'Identity' }),
            mkField({ Name: '__mj_CreatedAt', Sequence: 99, TSType: 'Date' as never }),
            mkField({ Name: '__mj_UpdatedAt', Sequence: 100, TSType: 'Date' as never }),
        ]);
        const spec = buildDefaultFormScaffold('Apps', mkProvider([entity]));
        // System Metadata section should appear in the code AFTER any user section
        const identityIdx = spec!.code.indexOf('title="Identity"');
        const sysmetaIdx = spec!.code.indexOf('title="System Metadata"');
        expect(identityIdx).toBeGreaterThanOrEqual(0);
        expect(sysmetaIdx).toBeGreaterThan(identityIdx);
        expect(spec!.code).toMatch(/title="System Metadata" icon="fa-solid fa-cog" defaultCollapsed/);
    });

    it('respects IncludeInGeneratedForm=false', () => {
        const entity = mkEntity('Apps', [
            mkField({ Name: 'Name', Sequence: 1, Category: 'Identity' }),
            mkField({ Name: 'Internal', Sequence: 2, Category: 'Identity', IncludeInGeneratedForm: false }),
        ]);
        const spec = buildDefaultFormScaffold('Apps', mkProvider([entity]));
        expect(spec!.code).toMatch(/<Field name="Name"/);
        expect(spec!.code).not.toMatch(/<Field name="Internal"/);
    });

    it('puts Top-section fields above the section list', () => {
        const entity = mkEntity('Apps', [
            mkField({ Name: 'Title', Sequence: 1, GeneratedFormSectionType: 'Top' as never }),
            mkField({ Name: 'Name', Sequence: 2, Category: 'Identity' }),
        ]);
        const spec = buildDefaultFormScaffold('Apps', mkProvider([entity]));
        const titleIdx = spec!.code.indexOf('<Field name="Title"');
        const sectionIdx = spec!.code.indexOf('<Section');
        expect(titleIdx).toBeGreaterThanOrEqual(0);
        expect(sectionIdx).toBeGreaterThanOrEqual(0);
        expect(titleIdx).toBeLessThan(sectionIdx);
    });

    it('renders a default section name when Category is empty', () => {
        const entity = mkEntity('Apps', [
            mkField({ Name: 'Name', Sequence: 1, Category: '' as never, GeneratedFormSectionType: 'Details' as never }),
        ]);
        const spec = buildDefaultFormScaffold('Apps', mkProvider([entity]));
        expect(spec!.code).toMatch(/title="Details"/);
    });

    it('uses the entity ClassName as the function-name root', () => {
        const entity = mkEntity('MJ: Applications', [
            mkField({ Name: 'Name', Sequence: 1, Category: 'Identity' }),
        ], { ClassName: 'MJApplications' as never });
        const spec = buildDefaultFormScaffold('MJ: Applications', mkProvider([entity]));
        expect(spec!.name).toBe('MJApplicationsForm');
    });
});

describe('sanitizeComponentName', () => {
    it('strips non-identifier characters', () => {
        expect(sanitizeComponentName('MJ: Applications Form')).toBe('MJApplicationsForm');
    });
    it('uppercases the first letter', () => {
        expect(sanitizeComponentName('myForm')).toBe('MyForm');
    });
    it('falls back when the result is empty or starts with a digit', () => {
        expect(sanitizeComponentName('')).toBe('Form_Component');
        expect(sanitizeComponentName('123Form')).toBe('Form_123Form');
    });
});
