// Reflect.metadata polyfill at import time.
import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { BaseEntity, EntityFieldTSType, EntityInfo, UserInfo, type EntityFieldInfo, type IMetadataProvider } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';

/**
 * Client old values arrive as strings, with dates as epoch milliseconds (the GraphQL Timestamp form).
 * Loading them as-is made an unchanged date field an Invalid Date, so it read as edited: a
 * Comments-only update to an MJ: Record Changes row was refused for "changing" ChangedAt.
 */
class Probe extends ResolverBase {
    public Convert(field: Partial<EntityFieldInfo>, raw: unknown) {
        return this.ClientOldValueToFieldValue(field as EntityFieldInfo, raw);
    }
    public MustLoad(
        entity: Record<string, unknown>,
        oldValues: boolean | Array<{ Key: string; Value: unknown }>,
        entityFields: Array<Record<string, unknown>> = []
    ) {
        // A real entity with no permission rows and a user with no roles: no row filter applies.
        // The Update RLS term itself is covered in resolverBase.fls.test.ts.
        const user = new UserInfo(null, { ID: 'u-1', Name: 'Probe', Email: 'probe@example.test', IsActive: true, UserRoles: [] });
        const resolvedOldValues = Array.isArray(oldValues)
            ? oldValues
            : oldValues
              ? [{ Key: 'Comments', Value: null }]
              : undefined;
        return this.MustLoadTruthFromDatabase(
            new EntityInfo({ EntityFields: entityFields, ...entity }),
            { OldValues___: resolvedOldValues },
            false,
            false,
            user
        );
    }
    public HasComplete(entityInfo: EntityInfo, oldValues?: Array<{ Key: string; Value: unknown }> | null): boolean {
        return this.hasCompleteOldValues(entityInfo, oldValues);
    }
    public async TestAndSet(
        entityObject: BaseEntity,
        input: { OldValues___?: Array<{ Key: string; Value: unknown }> } & Record<string, unknown>,
        contextUser: UserInfo
    ): Promise<void> {
        const clientNewValues: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(input)) {
            if (k !== 'OldValues___') {
                clientNewValues[k] = v;
            }
        }
        await this.TestAndSetClientOldValuesToDBValues(input, clientNewValues, entityObject, contextUser);
    }
}
const probe = new Probe();
const dateField = { Name: 'ChangedAt', TSType: EntityFieldTSType.Date, Type: 'datetimeoffset', AllowsNull: false, DefaultValue: 'getutcdate()' };

describe('ResolverBase.ClientOldValueToFieldValue', () => {
    it('reads an epoch-milliseconds string as the same instant', () => {
        const value = probe.Convert(dateField, '1790365634563') as Date;
        expect(value).toBeInstanceOf(Date);
        expect(value.getTime()).toBe(1790365634563);
    });

    it('reads an ISO date string too, and keeps null as null for a nullable date', () => {
        expect((probe.Convert(dateField, '2026-09-25T19:47:14.563Z') as Date).toISOString()).toBe('2026-09-25T19:47:14.563Z');
        expect(probe.Convert({ ...dateField, AllowsNull: true, DefaultValue: null }, null)).toBeNull();
    });

    it('types numbers and booleans like the field', () => {
        expect(probe.Convert({ Name: 'N', TSType: EntityFieldTSType.Number, Type: 'int' }, '42')).toBe(42);
        expect(probe.Convert({ Name: 'B', TSType: EntityFieldTSType.Boolean, Type: 'bit' }, 'false')).toBe(false);
        expect(probe.Convert({ Name: 'B', TSType: EntityFieldTSType.Boolean, Type: 'bit', AllowsNull: true }, null)).toBe(false);
        expect(probe.Convert({ Name: 'B', TSType: EntityFieldTSType.Boolean, Type: 'bit' }, '1')).toBe(true);
        expect(probe.Convert({ Name: 'M', TSType: EntityFieldTSType.Number, Type: 'money' }, '1.5')).toBe(1.5);
    });
});

function buildTagEntityFields(): Array<Record<string, unknown>> {
    const entityId = 'E0000000-0000-4000-8000-000000000001';
    return [
        { ID: 'F-1', EntityID: entityId, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, AllowsNull: false, AllowUpdateAPI: false, IsVirtual: false, Sequence: 1, Status: 'Active' },
        { ID: 'F-2', EntityID: entityId, Name: 'Name', Type: 'nvarchar', IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, Sequence: 2, Status: 'Active' },
        { ID: 'F-3', EntityID: entityId, Name: 'Display Name', Type: 'nvarchar', IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: true, IsVirtual: false, Sequence: 3, Status: 'Active' },
        { ID: 'F-4', EntityID: entityId, Name: 'Description', Type: 'nvarchar', IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: true, IsVirtual: false, Sequence: 4, Status: 'Active' },
        { ID: 'F-5', EntityID: entityId, Name: '__mj_UpdatedAt', Type: 'datetimeoffset', IsPrimaryKey: false, AllowsNull: false, AllowUpdateAPI: false, IsVirtual: false, Sequence: 5, Status: 'Active' },
        { ID: 'F-6', EntityID: entityId, Name: 'ParentName', Type: 'nvarchar', IsPrimaryKey: false, AllowsNull: true, AllowUpdateAPI: false, IsVirtual: true, Sequence: 6, Status: 'Active' },
    ];
}

describe('ResolverBase.MustLoadTruthFromDatabase & hasCompleteOldValues', () => {
    it('always loads a Record Change from the database, so client OldValues cannot pin forged audit columns', () => {
        expect(probe.MustLoad({ Name: 'MJ: Record Changes', TrackRecordChanges: false }, true)).toBe(true);
    });

    it("always loads a conversation message, so client OldValues cannot claim a message's author or role", () => {
        expect(probe.MustLoad({ Name: 'MJ: Conversation Details', TrackRecordChanges: false }, true)).toBe(true);
        expect(probe.MustLoad({ Name: ' mj: conversation details ', TrackRecordChanges: false }, true)).toBe(true);
    });

    it("always loads a conversation and an agent session, so client OldValues cannot hide a change to the anonymous ownership key (#4931)", () => {
        expect(probe.MustLoad({ Name: 'MJ: Conversations', TrackRecordChanges: false }, true)).toBe(true);
        expect(probe.MustLoad({ Name: 'MJ: AI Agent Sessions', TrackRecordChanges: false }, true)).toBe(true);
    });

    it("always loads a conversation folder, so client OldValues cannot pose as its stored owner", () => {
        expect(probe.MustLoad({ Name: 'MJ: Projects', TrackRecordChanges: false }, true)).toBe(true);
    });

    it('still trusts OldValues on other untracked entities without field security when OldValues___ covers all writable fields', () => {
        const fields = buildTagEntityFields();
        const completeOldValues = [
            { Key: 'ID', Value: '11111111-2222-3333-4444-555555555555' },
            { Key: 'Name', Value: 'Original' },
            { Key: 'Display_Name', Value: 'Original Display' },
            { Key: 'Description', Value: 'Desc' },
        ];
        expect(
            probe.MustLoad(
                { ID: 'E0000000-0000-4000-8000-000000000001', Name: 'MJ: Tags', TrackRecordChanges: false, EnableFieldLevelSecurity: false },
                completeOldValues,
                fields
            )
        ).toBe(false);
    });

    it('requires loading truth from the database when OldValues___ is a partial delta (even when TrackRecordChanges === false)', () => {
        const fields = buildTagEntityFields();
        const deltaOldValues = [
            { Key: 'ID', Value: '11111111-2222-3333-4444-555555555555' },
            { Key: 'Name', Value: 'Original' },
            // Display_Name and Description omitted because they were not dirty on the client
        ];
        expect(
            probe.MustLoad(
                { ID: 'E0000000-0000-4000-8000-000000000001', Name: 'MJ: Tags', TrackRecordChanges: false, EnableFieldLevelSecurity: false },
                deltaOldValues,
                fields
            )
        ).toBe(true);
    });

    it('requires loading truth from the database when OldValues___ is empty or undefined', () => {
        const fields = buildTagEntityFields();
        const entityMeta = { ID: 'E0000000-0000-4000-8000-000000000001', Name: 'MJ: Tags', TrackRecordChanges: false, EnableFieldLevelSecurity: false };
        expect(probe.MustLoad(entityMeta, [], fields)).toBe(true);
        expect(probe.MustLoad(entityMeta, false, fields)).toBe(true);
    });
});

describe('ResolverBase.TestAndSetClientOldValuesToDBValues — partial delta Update', () => {
    const tagEntityInfo = new EntityInfo({
        ID: 'E0000000-0000-4000-8000-000000000001',
        Name: 'MJ: Tags',
        BaseTable: 'Tag',
        BaseView: 'vwTags',
        SchemaName: '__mj',
        Status: 'Active',
        EntityFields: buildTagEntityFields(),
    });

    function createLoadedTagEntity(errorLogSaves: Array<Record<string, unknown>> = [], failSaveWith?: string): { entity: BaseEntity; user: UserInfo } {
        const fakeProvider = {
            Entities: [tagEntityInfo],
            GetEntityObject: async () => {
                const errEntity: Record<string, unknown> = {
                    Save: async () => {
                        errorLogSaves.push({ ...errEntity });
                        return failSaveWith === undefined;
                    },
                    LatestResult: failSaveWith === undefined ? null : { CompleteMessage: failSaveWith },
                };
                return errEntity;
            },
        } as unknown as IMetadataProvider;

        const entity = new BaseEntity(tagEntityInfo, fakeProvider);
        entity.LoadFromData({
            ID: '11111111-2222-3333-4444-555555555555',
            Name: 'OriginalTag',
            'Display Name': 'Original Display',
            Description: 'Untouched DB Description',
            __mj_UpdatedAt: new Date('2026-03-01T00:00:00.000Z'),
            ParentName: 'RootTag',
        });
        const user = new UserInfo(null, { ID: 'u-1', Name: 'Probe', Email: 'probe@example.test', IsActive: true, UserRoles: [] });
        return { entity, user };
    }

    it('preserves untouched DB fields and applies only the dirty field from a partial delta', async () => {
        const errorLogSaves: Array<Record<string, unknown>> = [];
        const { entity, user } = createLoadedTagEntity(errorLogSaves);

        await probe.TestAndSet(
            entity,
            {
                ID: '11111111-2222-3333-4444-555555555555',
                Display_Name: 'Updated Display',
                OldValues___: [
                    { Key: 'ID', Value: '11111111-2222-3333-4444-555555555555' },
                    { Key: 'Display_Name', Value: 'Original Display' },
                ],
            },
            user
        );

        // Updated field is applied
        expect(entity.Get('Display Name')).toBe('Updated Display');
        // Untouched DB fields remain intact (never overwritten with null/defaults)
        expect(entity.Get('Name')).toBe('OriginalTag');
        expect(entity.Get('Description')).toBe('Untouched DB Description');
        // No concurrency conflict warning logged
        expect(errorLogSaves).toHaveLength(0);
    });

    it('detects a concurrent modification when the dirty field DB value differs from OldValues___', async () => {
        const errorLogSaves: Array<Record<string, unknown>> = [];
        const { entity, user } = createLoadedTagEntity(errorLogSaves);

        // Client thinks Display_Name was 'Stale Client Display', but DB currently has 'Original Display'
        await probe.TestAndSet(
            entity,
            {
                ID: '11111111-2222-3333-4444-555555555555',
                Display_Name: 'Client New Display',
                OldValues___: [
                    { Key: 'ID', Value: '11111111-2222-3333-4444-555555555555' },
                    { Key: 'Display_Name', Value: 'Stale Client Display' },
                ],
            },
            user
        );

        // Warning is logged to ErrorLog, and save still applies the new value
        expect(errorLogSaves).toHaveLength(1);
        expect(errorLogSaves[0].Code).toBe('SAVE_INCONSISTENCY');
        // ErrorLog.Code is NCHAR(20)
        expect(String(errorLogSaves[0].Code).length).toBeLessThanOrEqual(20);
        expect(String(errorLogSaves[0].Message)).toContain('Display_Name');
        expect(entity.Get('Display Name')).toBe('Client New Display');
        expect(entity.Get('Description')).toBe('Untouched DB Description');
    });

    it('reports the entity name and the reason when the ErrorLog save fails', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { entity, user } = createLoadedTagEntity([], 'value too long for Code');
        try {
            await probe.TestAndSet(
                entity,
                {
                    ID: '11111111-2222-3333-4444-555555555555',
                    Display_Name: 'Client New Display',
                    OldValues___: [
                        { Key: 'ID', Value: '11111111-2222-3333-4444-555555555555' },
                        { Key: 'Display_Name', Value: 'Stale Client Display' },
                    ],
                },
                user
            );
            const message = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
            expect(message).toContain('Failed to save ErrorLog record');
            expect(message).toContain('value too long for Code');
            expect(message).toContain(entity.EntityInfo.Name);
        } finally {
            errorSpy.mockRestore();
        }
    });

    it('does not false-positive when a non-overlapping field differs in the DB', async () => {
        const errorLogSaves: Array<Record<string, unknown>> = [];
        const { entity, user } = createLoadedTagEntity(errorLogSaves);

        // Suppose client sent full OldValues___ (e.g. IgnoreDirtyState: true) where Description
        // changed in DB ('Untouched DB Description' vs 'Old Desc'), while the client only changed Name
        await probe.TestAndSet(
            entity,
            {
                ID: '11111111-2222-3333-4444-555555555555',
                Name: 'RenamedTag',
                Description: 'Old Desc',
                OldValues___: [
                    { Key: 'ID', Value: '11111111-2222-3333-4444-555555555555' },
                    { Key: 'Name', Value: 'OriginalTag' },
                    { Key: 'Description', Value: 'Old Desc' },
                ],
            },
            user
        );

        // Description had a DB difference ('Untouched DB Description' !== 'Old Desc'),
        // but client was NOT changing Description ('Old Desc' === 'Old Desc'), so overlap is empty!
        expect(errorLogSaves).toHaveLength(0);
        expect(entity.Get('Name')).toBe('RenamedTag');
    });
});

