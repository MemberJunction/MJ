import { describe, it, expect } from 'vitest';
import {
    EntityFieldInfo,
    EntityFieldTSType,
    EntityFieldValueListType,
    EntityInfo,
    UserInfo,
} from '@memberjunction/core';
import {
    EntitySubtypeUIDriverBase,
    ResolveGeneratedSubtypeFieldSpecs,
} from '../entity-subtype-ui-driver';

interface MockFieldOptions {
    Name: string;
    DisplayNameOrName?: string;
    Sequence?: number;
    IsPrimaryKey?: boolean;
    IncludeInGeneratedForm?: boolean;
    Status?: 'Active' | 'Deprecated' | 'Disabled';
    IsVirtual?: boolean;
    RelatedEntityNameFieldMap?: string;
    IsBinaryFieldType?: boolean;
    ReadOnly?: boolean;
    ValueListTypeEnum?: EntityFieldValueListType;
    TSType?: EntityFieldTSType;
    Length?: number;
    MaxLength?: number;
    ExtendedType?: string | null;
    RelatedEntity?: string | null;
}

function makeField(opts: MockFieldOptions): EntityFieldInfo {
    return {
        Name: opts.Name,
        DisplayNameOrName: opts.DisplayNameOrName ?? opts.Name,
        Sequence: opts.Sequence ?? 1,
        IsPrimaryKey: opts.IsPrimaryKey ?? false,
        IncludeInGeneratedForm: opts.IncludeInGeneratedForm ?? true,
        Status: opts.Status ?? 'Active',
        IsVirtual: opts.IsVirtual ?? false,
        RelatedEntityNameFieldMap: opts.RelatedEntityNameFieldMap ?? '',
        IsBinaryFieldType: opts.IsBinaryFieldType ?? false,
        ReadOnly: opts.ReadOnly ?? false,
        ValueListTypeEnum: opts.ValueListTypeEnum ?? EntityFieldValueListType.None,
        TSType: opts.TSType ?? EntityFieldTSType.String,
        Length: opts.Length ?? 100,
        MaxLength: opts.MaxLength ?? 100,
        ExtendedType: opts.ExtendedType ?? null,
        RelatedEntity: opts.RelatedEntity ?? null,
    } as EntityFieldInfo;
}

function makeChildEntity(
    fields: EntityFieldInfo[],
    parentFieldNames: string[] = ['ID', 'Name', 'Status'],
    readablePredicate: (fieldName: string) => boolean = () => true,
): EntityInfo {
    const proto: EntityInfo = Object.create(EntityInfo.prototype) as EntityInfo;
    return Object.defineProperties(proto, {
        Name: { value: 'GitHub Issue Tasks', configurable: true, enumerable: true },
        Fields: { value: fields, configurable: true, enumerable: true },
        ParentEntityFieldNames: { value: new Set(parentFieldNames), configurable: true, enumerable: true },
        IsFieldReadableByUser: {
            value: (fieldName: string) => readablePredicate(fieldName),
            configurable: true,
            enumerable: true,
        },
    });
}

class ConcreteTestUIDriver extends EntitySubtypeUIDriverBase {}

describe('ResolveGeneratedSubtypeFieldSpecs', () => {
    it('excludes PK, inherited parent fields, system timestamps, non-form, inactive, binary, and virtual FK name-map fields', () => {
        const entity = makeChildEntity([
            makeField({ Name: 'ID', IsPrimaryKey: true, Sequence: 1 }),
            makeField({ Name: 'Name', Sequence: 2 }), // inherited from parent
            makeField({ Name: '__mj_CreatedAt', Sequence: 3 }),
            makeField({ Name: '__mj_UpdatedAt', Sequence: 4 }),
            makeField({ Name: 'InternalHash', IncludeInGeneratedForm: false, Sequence: 5 }),
            makeField({ Name: 'OldColumn', Status: 'Deprecated', Sequence: 6 }),
            makeField({ Name: 'DeadColumn', Status: 'Disabled', Sequence: 7 }),
            makeField({ Name: 'RepositoryID', RelatedEntity: 'GitHub Repositories', RelatedEntityNameFieldMap: 'Repository', Sequence: 8 }),
            makeField({ Name: 'Repository', IsVirtual: true, Sequence: 9 }), // virtual name target of RepositoryID
            makeField({ Name: 'ComputedSummary', IsVirtual: true, Sequence: 10 }), // non-FK virtual field stays included
            makeField({ Name: 'PayloadBlob', IsBinaryFieldType: true, Sequence: 11 }),
            makeField({ Name: 'IssueNumber', TSType: EntityFieldTSType.Number, Sequence: 12 }),
        ]);

        const specs = ResolveGeneratedSubtypeFieldSpecs(entity);
        expect(specs.map((s) => s.FieldName)).toEqual([
            'RepositoryID',
            'ComputedSummary',
            'IssueNumber',
        ]);
    });

    it('sorts rendered fields by Sequence ascending', () => {
        const entity = makeChildEntity([
            makeField({ Name: 'Milestone', Sequence: 30 }),
            makeField({ Name: 'NodeID', Sequence: 10 }),
            makeField({ Name: 'HtmlURL', Sequence: 20 }),
        ]);

        const specs = ResolveGeneratedSubtypeFieldSpecs(entity);
        expect(specs.map((s) => s.FieldName)).toEqual(['NodeID', 'HtmlURL', 'Milestone']);
    });

    it('enforces field-level read security when a user is provided', () => {
        const entity = makeChildEntity(
            [
                makeField({ Name: 'PublicLabel', Sequence: 1 }),
                makeField({ Name: 'RestrictedToken', Sequence: 2 }),
            ],
            ['ID'],
            (fieldName) => fieldName !== 'RestrictedToken',
        );
        const user = { ID: 'u-1' } as UserInfo;

        const specs = ResolveGeneratedSubtypeFieldSpecs(entity, user);
        expect(specs.map((s) => s.FieldName)).toEqual(['PublicLabel']);
    });

    it('maps control types and link types identically to Angular CodeGen', () => {
        const entity = makeChildEntity([
            makeField({ Name: 'ShortText', TSType: EntityFieldTSType.String, Length: 200, MaxLength: 200, Sequence: 1 }),
            makeField({ Name: 'MaxText', TSType: EntityFieldTSType.String, Length: -1, MaxLength: -1, Sequence: 2 }),
            makeField({ Name: 'LongText', TSType: EntityFieldTSType.String, Length: 2000, MaxLength: 2000, Sequence: 3 }),
            makeField({ Name: 'IsDraft', TSType: EntityFieldTSType.Boolean, Sequence: 4 }),
            makeField({ Name: 'MergedAt', TSType: EntityFieldTSType.Date, Sequence: 5 }),
            makeField({ Name: 'Additions', TSType: EntityFieldTSType.Number, Sequence: 6 }),
            makeField({ Name: 'StateChoice', ValueListTypeEnum: EntityFieldValueListType.List, Sequence: 7 }),
            makeField({ Name: 'CustomTag', ValueListTypeEnum: EntityFieldValueListType.ListOrUserEntry, Sequence: 8 }),
            makeField({ Name: 'PatchDiff', ExtendedType: 'Code', TSType: EntityFieldTSType.String, Length: -1, Sequence: 9 }),
            makeField({ Name: 'HtmlURL', ExtendedType: 'URL', Sequence: 10 }),
            makeField({ Name: 'AuthorEmail', ExtendedType: 'Email', Sequence: 11 }),
            makeField({ Name: 'RepositoryID', RelatedEntity: 'GitHub Repositories', Sequence: 12 }),
            makeField({ Name: 'ReadOnlyNumber', ReadOnly: true, TSType: EntityFieldTSType.Number, Sequence: 13 }),
        ]);

        const byName = new Map(ResolveGeneratedSubtypeFieldSpecs(entity).map((s) => [s.FieldName, s]));

        expect(byName.get('ShortText')).toMatchObject({ ControlType: 'textbox', LinkType: 'None' });
        expect(byName.get('MaxText')).toMatchObject({ ControlType: 'textarea', LinkType: 'None' });
        expect(byName.get('LongText')).toMatchObject({ ControlType: 'textarea', LinkType: 'None' });
        expect(byName.get('IsDraft')).toMatchObject({ ControlType: 'checkbox', LinkType: 'None' });
        expect(byName.get('MergedAt')).toMatchObject({ ControlType: 'datepicker', LinkType: 'None' });
        expect(byName.get('Additions')).toMatchObject({ ControlType: 'number', LinkType: 'None' });
        expect(byName.get('StateChoice')).toMatchObject({ ControlType: 'select', LinkType: 'None' });
        expect(byName.get('CustomTag')).toMatchObject({ ControlType: 'autocomplete', LinkType: 'None' });
        expect(byName.get('PatchDiff')).toMatchObject({ ControlType: 'code', LinkType: 'None' });
        expect(byName.get('HtmlURL')).toMatchObject({ ControlType: 'textbox', LinkType: 'URL' });
        expect(byName.get('AuthorEmail')).toMatchObject({ ControlType: 'textbox', LinkType: 'Email' });
        expect(byName.get('RepositoryID')).toMatchObject({ ControlType: 'textbox', LinkType: 'Record' });
        expect(byName.get('ReadOnlyNumber')).toMatchObject({ ControlType: 'textbox', LinkType: 'None' });
    });
});

describe('EntitySubtypeUIDriverBase default contract', () => {
    it('reports valid from Validate() and LastKnownValidation() by default', async () => {
        const driver = new ConcreteTestUIDriver();
        const syncResult = driver.LastKnownValidation();
        const asyncResult = await driver.Validate();
        expect(syncResult.Success).toBe(true);
        expect(asyncResult.Success).toBe(true);
    });
});
