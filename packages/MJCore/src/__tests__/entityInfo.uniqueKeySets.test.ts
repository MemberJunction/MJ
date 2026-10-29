/**
 * #4536: unique keys as column sets. EntityField.IsUnique only marks a column that is a key on its
 * own; a composite unique key reaches EntityInfo as an EntityUniqueKeyInfo (UniqueKeySets), and
 * IsUniqueFieldSet answers "do these columns identify a row?" from the primary key and those sets.
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo, EntityUniqueKeyInfo } from '../generic/entityInfo';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { EntityMetadataRow, EntityFieldMetadataRow, EntityChildMetadataRow } from '../generic/providerBase';

const ENTITY_ID = 'E1111111-1111-1111-1111-111111111111';

function field(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { ID: `f-${name}`, EntityID: ENTITY_ID, Name: name, Type: 'nvarchar', Sequence: 1, Status: 'Active', ...extra };
}

function key(name: string, fieldNames: string, filter: string | null = null): Record<string, unknown> {
    return { ID: `k-${name}`, EntityID: ENTITY_ID, Name: name, FieldNames: fieldNames, FilterDefinition: filter };
}

/** Action Params' shape: ID primary key, (ActionID, Name) unique together, Code unique only where not null. */
function actionParams(): EntityInfo {
    return new EntityInfo({
        ID: ENTITY_ID,
        Name: 'Action Params',
        EntityFields: [
            field('ID', { IsPrimaryKey: true, IsUnique: true, Type: 'uniqueidentifier' }),
            field('ActionID', { Type: 'uniqueidentifier' }),
            field('Name'),
            field('Code'),
            field('Slug', { IsUnique: true }),
        ],
        EntityUniqueKeys: [
            key('UQ_ActionParam_Slug', 'Slug'),
            key('UQ_ActionParam_ActionID_Name', 'ActionID, Name'),
            key('UX_ActionParam_Code', 'Code', '([Code] IS NOT NULL)'),
        ],
    });
}

describe('EntityUniqueKeyInfo', () => {
    it('splits FieldNames in key order and trims them', () => {
        const k = new EntityUniqueKeyInfo(key('K', ' ActionID ,Name,'));
        expect(k.FieldNamesArray).toEqual(['ActionID', 'Name']);
    });

    it('reports a filtered key', () => {
        expect(new EntityUniqueKeyInfo(key('K', 'Code', '([Code] IS NOT NULL)')).IsFiltered).toBe(true);
        expect(new EntityUniqueKeyInfo(key('K', 'Code')).IsFiltered).toBe(false);
        expect(new EntityUniqueKeyInfo(key('K', 'Code', '  ')).IsFiltered).toBe(false);
    });
});

describe('EntityInfo.UniqueKeySets', () => {
    it('loads the key sets sorted by name', () => {
        expect(actionParams().UniqueKeySets.map(k => k.Name)).toEqual([
            'UQ_ActionParam_ActionID_Name',
            'UQ_ActionParam_Slug',
            'UX_ActionParam_Code',
        ]);
    });

    it('is empty when no key sets were loaded', () => {
        expect(new EntityInfo({ ID: ENTITY_ID, Name: 'X', EntityFields: [field('ID', { IsPrimaryKey: true })] }).UniqueKeySets).toEqual([]);
    });

    it('survives a JSON round trip (the local metadata cache)', () => {
        const restored = new EntityInfo(JSON.parse(JSON.stringify(actionParams())));
        expect(restored.UniqueKeySets.map(k => k.FieldNames)).toEqual(['ActionID, Name', 'Slug', 'Code']);
        expect(restored.UniqueKeySets[2].IsFiltered).toBe(true);
    });

    it('leaves UniqueKeys to the fields that are unique on their own', () => {
        expect(actionParams().UniqueKeys.map(f => f.Name)).toEqual(['ID', 'Slug']);
    });
});

describe('EntityInfo.IsUniqueFieldSet', () => {
    const e = actionParams();

    it('is true for the primary key and for a single-column key', () => {
        expect(e.IsUniqueFieldSet(['ID'])).toBe(true);
        expect(e.IsUniqueFieldSet(['slug'])).toBe(true);
    });

    it('is true for a composite key only when every column of it is given', () => {
        expect(e.IsUniqueFieldSet(['ActionID', 'Name'])).toBe(true);
        expect(e.IsUniqueFieldSet(['Name', 'ActionID', 'Code'])).toBe(true);
        expect(e.IsUniqueFieldSet(['ActionID'])).toBe(false);
        expect(e.IsUniqueFieldSet(['Name'])).toBe(false);
    });

    it('ignores a filtered key', () => {
        expect(e.IsUniqueFieldSet(['Code'])).toBe(false);
    });

    it('honors a field flagged IsUnique with no key set behind it (uniqueness declared on a view)', () => {
        const view = new EntityInfo({
            ID: ENTITY_ID,
            Name: 'View',
            EntityFields: [field('ID', { IsPrimaryKey: true }), field('Email', { IsUnique: true })],
        });
        expect(view.UniqueKeySets).toEqual([]);
        expect(view.IsUniqueFieldSet(['email'])).toBe(true);
    });

    it('is false for an empty list', () => {
        expect(e.IsUniqueFieldSet([])).toBe(false);
    });

    it('needs every column of a composite primary key', () => {
        const link = new EntityInfo({
            ID: ENTITY_ID,
            Name: 'Links',
            EntityFields: [field('A', { IsPrimaryKey: true }), field('B', { IsPrimaryKey: true })],
        });
        expect(link.IsUniqueFieldSet(['A'])).toBe(false);
        expect(link.IsUniqueFieldSet(['A', 'B'])).toBe(true);
    });
});

class PostProcessProvider extends TestMetadataProvider {
    public run(entities: EntityMetadataRow[], fields: EntityFieldMetadataRow[], uniqueKeys?: EntityChildMetadataRow[]): EntityInfo[] {
        return this.PostProcessEntityMetadata(entities, fields, [], [], [], [], [], [], [], [], uniqueKeys);
    }
}

describe('ProviderBase.PostProcessEntityMetadata attaches key sets to their entity', () => {
    it('groups EntityUniqueKeys rows by EntityID, whatever the UUID case', () => {
        const other = 'E2222222-2222-2222-2222-222222222222';
        const result = new PostProcessProvider().run(
            [{ ID: ENTITY_ID, Name: 'A' }, { ID: other, Name: 'B' }],
            [],
            [
                { ID: 'k1', EntityID: ENTITY_ID.toLowerCase(), Name: 'UQ_A', FieldNames: 'X,Y' },
                { ID: 'k2', EntityID: other, Name: 'UQ_B', FieldNames: 'Z' },
            ],
        );
        expect(result.find(e => e.Name === 'A')?.UniqueKeySets.map(k => k.FieldNamesArray)).toEqual([['X', 'Y']]);
        expect(result.find(e => e.Name === 'B')?.UniqueKeySets.map(k => k.Name)).toEqual(['UQ_B']);
    });

    it('leaves every entity with no key sets when the dataset has no EntityUniqueKeys item', () => {
        const result = new PostProcessProvider().run([{ ID: ENTITY_ID, Name: 'A' }], []);
        expect(result[0].UniqueKeySets).toEqual([]);
    });
});
