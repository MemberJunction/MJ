import { describe, it, expect, vi } from 'vitest';
import type { BaseEntity, EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { EntityAIActionParams } from '@memberjunction/aiengine';
import {
    ENTITY_AI_ACTION_REFERENCE_KIND,
    EntityAIActionReferenceError,
    IsEntityAIActionTaskReference,
    ResolveEntityAIActionTaskReference,
    ToEntityAIActionTaskReference,
    type EntityAIActionTaskReference,
} from '../references/EntityAIActionTaskReference';

const USER = { ID: 'user-1' } as unknown as UserInfo;
const CONTACTS = { Name: 'Contacts', PrimaryKeys: [{ Name: 'ID' }] } as unknown as EntityInfo;

const REFERENCE: EntityAIActionTaskReference = {
    kind: ENTITY_AI_ACTION_REFERENCE_KIND,
    entityAIActionId: 'eaa-1',
    actionId: 'act-1',
    modelId: 'model-1',
    entityName: 'Contacts',
    recordID: 'ID|0A1B',
};

function liveRecord(recordID: string): BaseEntity {
    return { EntityInfo: CONTACTS, PrimaryKey: { ToRecordID: () => recordID } } as unknown as BaseEntity;
}

function fakeProvider(entity: EntityInfo | undefined, record: { InnerLoad: ReturnType<typeof vi.fn> }): IMetadataProvider {
    return {
        EntityByName: vi.fn(() => entity),
        GetEntityObject: vi.fn(async () => record),
    } as unknown as IMetadataProvider;
}

describe('ToEntityAIActionTaskReference', () => {
    it('replaces the live record with its entity name and canonical record id', () => {
        const params: EntityAIActionParams = {
            entityAIActionId: 'eaa-1', actionId: 'act-1', modelId: 'model-1', entityRecord: liveRecord('ID|0A1B'),
        };
        expect(ToEntityAIActionTaskReference(params)).toEqual(REFERENCE);
    });

    it('produces a value that survives a JSON round trip unchanged', () => {
        const params: EntityAIActionParams = {
            entityAIActionId: 'eaa-1', actionId: 'act-1', modelId: 'model-1', entityRecord: liveRecord('ID|0A1B'),
        };
        const reference = ToEntityAIActionTaskReference(params);
        expect(JSON.parse(JSON.stringify(reference))).toEqual(reference);
    });
});

describe('IsEntityAIActionTaskReference', () => {
    it('accepts a reference, including one read back from JSON', () => {
        expect(IsEntityAIActionTaskReference(REFERENCE)).toBe(true);
        expect(IsEntityAIActionTaskReference(JSON.parse(JSON.stringify(REFERENCE)))).toBe(true);
    });

    it('rejects other shapes', () => {
        expect(IsEntityAIActionTaskReference(null)).toBe(false);
        expect(IsEntityAIActionTaskReference([REFERENCE])).toBe(false);
        expect(IsEntityAIActionTaskReference({ ...REFERENCE, kind: 'Other' })).toBe(false);
        expect(IsEntityAIActionTaskReference({ ...REFERENCE, recordID: 7 })).toBe(false);
        expect(IsEntityAIActionTaskReference({ entityAIActionId: 'eaa-1', entityRecord: {} })).toBe(false);
    });
});

describe('ResolveEntityAIActionTaskReference', () => {
    it('loads the record by its primary key and rebuilds the params', async () => {
        const record = { InnerLoad: vi.fn(async () => true) };
        const provider = fakeProvider(CONTACTS, record);

        const params = await ResolveEntityAIActionTaskReference(REFERENCE, provider, USER);

        expect(provider.GetEntityObject).toHaveBeenCalledWith('Contacts', USER);
        const key = record.InnerLoad.mock.calls[0][0] as { KeyValuePairs: { FieldName: string; Value: string }[] };
        expect(key.KeyValuePairs.map((p) => [p.FieldName, p.Value])).toEqual([['ID', '0A1B']]);
        expect(params).toEqual({ entityAIActionId: 'eaa-1', actionId: 'act-1', modelId: 'model-1', entityRecord: record });
    });

    it('returns null when the record no longer exists', async () => {
        const provider = fakeProvider(CONTACTS, { InnerLoad: vi.fn(async () => false) });
        expect(await ResolveEntityAIActionTaskReference(REFERENCE, provider, USER)).toBeNull();
    });

    it('throws when the entity is unknown', async () => {
        const provider = fakeProvider(undefined, { InnerLoad: vi.fn(async () => true) });
        await expect(ResolveEntityAIActionTaskReference(REFERENCE, provider, USER))
            .rejects.toThrow("Entity 'Contacts' referenced by an Entity AI Action task was not found");
    });

    it('reports an unresolvable reference as EntityAIActionReferenceError, so callers do not retry it', async () => {
        const unknownEntity = fakeProvider(undefined, { InnerLoad: vi.fn(async () => true) });
        await expect(ResolveEntityAIActionTaskReference(REFERENCE, unknownEntity, USER))
            .rejects.toBeInstanceOf(EntityAIActionReferenceError);

        const badKey = fakeProvider(CONTACTS, { InnerLoad: vi.fn(async () => true) });
        await expect(ResolveEntityAIActionTaskReference({ ...REFERENCE, recordID: 'NotAKeyField|1' }, badKey, USER))
            .rejects.toBeInstanceOf(EntityAIActionReferenceError);
    });
});
