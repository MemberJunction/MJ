/**
 * The reasoning prompt for a matched set, and the reasoning text stored from it, are read by every
 * reader of the duplicate run. Field deltas and record labels must therefore leave out any field
 * that field-level security restricts for any role, as the index-time rule does for embeddings.
 */
import { describe, it, expect } from 'vitest';
import { CompositeKey, EntityInfo, FieldPermissionAccess, RunView } from '@memberjunction/core';
import { RecordComparisonEngine } from '@memberjunction/record-comparison';
import type { RecordComparisonResult } from '@memberjunction/record-comparison';
import { MatchedSetDeltaBuilder } from '../reasoning/MatchedSetDeltaBuilder';

const HR_ROLE = 'A0000000-0000-0000-0000-000000000001';
const STAFF_ROLE = 'A0000000-0000-0000-0000-000000000002';

function contacts(restricted: string[]): EntityInfo {
    const id = 'E-Contacts';
    const field = (name: string, seq: number, extra: Record<string, unknown> = {}) => ({
        ID: `F-${name}`, EntityID: id, Sequence: seq, Name: name, Entity: 'Contacts', Type: 'nvarchar', ...extra,
        EntityFieldPermissions: [HR_ROLE, STAFF_ROLE]
            .filter((role) => role === HR_ROLE || !restricted.includes(name))
            .map((RoleID) => ({ ID: `P-${name}-${RoleID}`, EntityFieldID: `F-${name}`, RoleID, ReadAccess: FieldPermissionAccess.Allow, UpdateAccess: 'No Access', CreateAccess: 'No Access' })),
    });
    return new EntityInfo({
        ID: id, Name: 'Contacts', SchemaName: 'dbo', BaseTable: 'Contact', BaseView: 'vwContacts', EnableFieldLevelSecurity: true,
        Permissions: [HR_ROLE, STAFF_ROLE].map((RoleID) => ({ EntityID: id, RoleID, CanRead: true })),
        Fields: [
            field('ID', 1, { IsPrimaryKey: true, Type: 'uniqueidentifier' }),
            field('FullName', 2, { IsNameField: true }),
            field('Email', 3),
            field('SSN', 4),
        ],
    });
}

const keyA = CompositeKey.FromID('a');
const keyB = CompositeKey.FromID('b');

const COMPARISON: RecordComparisonResult = {
    Success: true,
    EntityName: 'Contacts',
    Records: [
        { ColumnIndex: 0, Key: keyA, Label: 'Ada Lovelace', Values: {} },
        { ColumnIndex: 1, Key: keyB, Label: 'Ada King', Values: {} },
    ],
    Fields: [
        { FieldName: 'Email', DisplayName: 'Email', Category: null, Differs: true, Cells: [
            { ColumnIndex: 0, Value: 'ada@x.com', EqualsReference: true }, { ColumnIndex: 1, Value: 'ak@x.com', EqualsReference: false }] },
        { FieldName: 'SSN', DisplayName: 'SSN', Category: null, Differs: true, Cells: [
            { ColumnIndex: 0, Value: '123-45-6789', EqualsReference: true }, { ColumnIndex: 1, Value: '987-65-4321', EqualsReference: false }] },
    ],
} as RecordComparisonResult;

class StubEngine extends RecordComparisonEngine {
    public override async CompareRecordsForEntity(): Promise<RecordComparisonResult> {
        return COMPARISON;
    }
}

class TestBuilder extends MatchedSetDeltaBuilder {
    protected override CreateComparisonEngine(): RecordComparisonEngine {
        return new StubEngine();
    }
}

describe('MatchedSetDeltaBuilder: field-level security', () => {
    const builder = new TestBuilder({} as RunView);

    it('leaves a field restricted for any role out of the reasoning deltas', async () => {
        const { FieldDeltas } = await builder.Build(contacts(['SSN']), [keyA, keyB]);

        expect(FieldDeltas.map((d) => d.FieldName)).toEqual(['Email']);
        expect(JSON.stringify(FieldDeltas)).not.toContain('123-45-6789');
    });

    it('labels records by key when the name field is restricted', async () => {
        const { Labels } = await builder.Build(contacts(['FullName']), [keyA, keyB]);

        expect(Labels.get(keyA.Values())).toBe(keyA.Values());
        expect(JSON.stringify([...Labels.values()])).not.toContain('Ada');
    });

    it('keeps every field and label when nothing is restricted', async () => {
        const { FieldDeltas, Labels } = await builder.Build(contacts([]), [keyA, keyB]);

        expect(FieldDeltas.map((d) => d.FieldName)).toEqual(['Email', 'SSN']);
        expect(Labels.get(keyA.Values())).toBe('Ada Lovelace');
    });
});
