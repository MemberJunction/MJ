import { describe, expect, it } from 'vitest';
import { EntityFieldInfo, EntityFieldTSType, EntityInfo } from '@memberjunction/core';
import { ENCRYPTED_SENTINEL } from '@memberjunction/global';
import {
    AreEntityFieldValuesDifferent,
    ClientOldValueToFieldValue,
    DatesEqualAtColumnResolution,
    DetectFieldConcurrencyConflicts,
    JsonStringsEquivalent,
    WithoutEchoedOpaqueValues,
} from '../concurrency/fieldConflictDetector.js';

function makeEntityInfoStub(fields: Partial<EntityFieldInfo>[]): EntityInfo {
    const fieldStubs = fields.map(
        (f) =>
            ({
                Name: f.Name ?? 'Field',
                CodeName: f.CodeName ?? f.Name ?? 'Field',
                Type: f.Type ?? 'nvarchar',
                SQLFullType: f.SQLFullType ?? f.Type ?? 'nvarchar(100)',
                TSType: f.TSType ?? EntityFieldTSType.String,
                AllowUpdateAPI: f.AllowUpdateAPI ?? true,
                ReadOnly: f.ReadOnly ?? false,
                IsPrimaryKey: f.IsPrimaryKey ?? false,
                IsVirtual: f.IsVirtual ?? false,
                AllowsNull: f.AllowsNull ?? true,
                DefaultValue: f.DefaultValue ?? null,
                Encrypt: f.Encrypt ?? false,
                AllowDecryptInAPI: f.AllowDecryptInAPI ?? false,
            }) as unknown as EntityFieldInfo,
    );
    return {
        Name: 'TestEntity',
        Fields: fieldStubs,
        FieldByCodeName: (key: string) => fieldStubs.find((f) => f.CodeName === key),
        FieldByName: (key: string) => fieldStubs.find((f) => f.Name === key),
    } as unknown as EntityInfo;
}

describe('fieldConflictDetector', () => {
    it('detects overlapping field conflict when caller and DB modified the same field to different values', () => {
        const entityInfo = makeEntityInfoStub([
            { Name: 'ID', IsPrimaryKey: true, ReadOnly: true },
            { Name: 'Status', TSType: EntityFieldTSType.String },
            { Name: 'Notes', TSType: EntityFieldTSType.String },
        ]);

        const result = DetectFieldConcurrencyConflicts(
            entityInfo,
            { Status: 'Draft', Notes: 'Initial' },
            { Status: 'Approved', Notes: 'Initial' },
            { Status: 'Rejected', Notes: 'Initial' },
        );

        expect(result.ConflictingFields).toEqual(['Status']);
        expect(result.Overlap).toEqual([
            {
                FieldName: 'Status',
                ClientOldValue: 'Draft',
                ClientNewValue: 'Approved',
                DBValue: 'Rejected',
            },
        ]);
    });

    it('converges without conflict when caller and DB modified DIFFERENT fields (disjoint edits)', () => {
        const entityInfo = makeEntityInfoStub([
            { Name: 'Status', TSType: EntityFieldTSType.String },
            { Name: 'Notes', TSType: EntityFieldTSType.String },
        ]);

        const result = DetectFieldConcurrencyConflicts(
            entityInfo,
            { Status: 'Draft', Notes: 'Initial' },
            { Status: 'Approved', Notes: 'Initial' },
            { Status: 'Draft', Notes: 'Concurrent note edit' },
        );

        expect(result.ConflictingFields).toEqual([]);
        expect(result.FieldsToPreserveFromDB.has('Notes')).toBe(true);
    });

    it('converges without conflict when caller and DB wrote the SAME value to the same field (idempotent write)', () => {
        const entityInfo = makeEntityInfoStub([
            { Name: 'Status', TSType: EntityFieldTSType.String },
        ]);

        const result = DetectFieldConcurrencyConflicts(
            entityInfo,
            { Status: 'Draft' },
            { Status: 'Approved' },
            { Status: 'Approved' },
        );

        expect(result.ConflictingFields).toEqual([]);
    });

    it('treats SQL Server datetime resolution (1/300s) and JSON key-order differences as equal', () => {
        const dtField = {
            Name: 'ScheduledAt',
            CodeName: 'ScheduledAt',
            Type: 'datetime',
            SQLFullType: 'datetime',
            TSType: EntityFieldTSType.Date,
        } as unknown as EntityFieldInfo;

        const d1 = new Date('2026-05-01T12:00:00.000Z');
        const d2 = new Date('2026-05-01T12:00:00.002Z'); // within 3.33ms SQL Server datetime bucket
        expect(DatesEqualAtColumnResolution(dtField, d1, d2)).toBe(true);
        expect(AreEntityFieldValuesDifferent(dtField, d1, d2)).toBe(false);

        expect(JsonStringsEquivalent('{"a":1,"b":[2,3]}', '{\n  "b": [2, 3],\n  "a": 1\n}')).toBe(true);
    });

    it('redacts encrypted field values and strips echoed opaque encrypted values', () => {
        const entityInfo = makeEntityInfoStub([
            { Name: 'SecretKey', Encrypt: true, AllowDecryptInAPI: false },
            { Name: 'ApiToken', Encrypt: true, AllowDecryptInAPI: true },
        ]);

        const stripped = WithoutEchoedOpaqueValues(
            entityInfo,
            { SecretKey: ENCRYPTED_SENTINEL, ApiToken: 'new-secret' },
            { SecretKey: ENCRYPTED_SENTINEL, ApiToken: 'old-secret' },
        );
        expect(stripped).toEqual({ ApiToken: 'new-secret' });

        const conflict = DetectFieldConcurrencyConflicts(
            entityInfo,
            { ApiToken: 'old-secret' },
            { ApiToken: 'caller-secret' },
            { ApiToken: 'db-secret' },
        );
        expect(conflict.ConflictingFields).toEqual(['ApiToken']);
        expect(conflict.Overlap[0]).toEqual({
            FieldName: 'ApiToken',
            ClientOldValue: ENCRYPTED_SENTINEL,
            ClientNewValue: ENCRYPTED_SENTINEL,
            DBValue: ENCRYPTED_SENTINEL,
        });
    });

    it('converts wire string values to typed field values via ClientOldValueToFieldValue', () => {
        const intField = { Type: 'int', TSType: EntityFieldTSType.Number, AllowsNull: true } as unknown as EntityFieldInfo;
        const boolField = { Type: 'bit', TSType: EntityFieldTSType.Boolean, AllowsNull: false } as unknown as EntityFieldInfo;
        const dateField = { Type: 'datetimeoffset', TSType: EntityFieldTSType.Date, AllowsNull: true } as unknown as EntityFieldInfo;

        expect(ClientOldValueToFieldValue(intField, '42')).toBe(42);
        expect(ClientOldValueToFieldValue(boolField, null)).toBe(false);
        expect(ClientOldValueToFieldValue(boolField, 'true')).toBe(true);
        expect((ClientOldValueToFieldValue(dateField, '1714564800000') as Date).getTime()).toBe(1714564800000);
    });
});
