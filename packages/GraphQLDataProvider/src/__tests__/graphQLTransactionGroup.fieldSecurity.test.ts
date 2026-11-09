import { describe, it, expect, vi } from 'vitest';
import { EntityInfo, UserInfo, UserRoleInfo } from '@memberjunction/core';

vi.mock('../graphQLDataProvider', () => ({
    GraphQLDataProvider: vi.fn(),
}));

import { GraphQLTransactionGroup } from '../graphQLTransactionGroup';

/**
 * A transaction-group item never carries a field its user may not read.
 *
 * The server refuses a restricted caller's payload when it names such a field, because a client
 * that was never sent a value cannot have a legitimate one to save. A loaded record already omits
 * those fields (they are not loaded), but a NEW record holds every field with its default, so its
 * create payload named them all, and a restricted user's ordinary transaction-group create would
 * be refused. The payload builder therefore leaves the caller's denied fields out itself.
 */
const HR = 'A0000000-0000-0000-0000-000000000001';
const INTERN = 'A0000000-0000-0000-0000-000000000003';

function employees(): EntityInfo {
    const allow = (fieldId: string, roles: string[]) => roles.map((RoleID, i) => ({
        ID: `${fieldId}-${i}`, EntityFieldID: fieldId, RoleID, ReadAccess: 'Allow', UpdateAccess: 'Allow', CreateAccess: 'Allow',
    }));
    const field = (ID: string, Sequence: number, Name: string, extra: Record<string, unknown> = {}) => ({
        ID, EntityID: 'e', Sequence, Name, Entity: 'Employees', Type: 'nvarchar', ...extra,
    });
    return new EntityInfo({
        ID: 'e', Name: 'Employees', SchemaName: 'dbo', BaseTable: 'Employee', BaseView: 'vwEmployees',
        EnableFieldLevelSecurity: true,
        Fields: [
            field('f-id', 1, 'ID', { IsPrimaryKey: true, Type: 'uniqueidentifier' }),
            field('f-name', 2, 'Name', { EntityFieldPermissions: allow('f-name', [HR, INTERN]) }),
            field('f-salary', 3, 'Salary', { EntityFieldPermissions: allow('f-salary', [HR]) }),
        ],
    });
}

function user(roleId: string): UserInfo {
    const u = new UserInfo();
    u.ID = `u-${roleId}`;
    (u as unknown as Record<string, unknown>)['_UserRoles'] = [new UserRoleInfo({ UserID: u.ID, RoleID: roleId })];
    return u;
}

/** A new record as the client holds it: every field present, the salary at its default. */
function newRecord(entityInfo: EntityInfo) {
    const values: Record<string, unknown> = { ID: 'emp-1', Name: 'Ada', Salary: null };
    return {
        EntityInfo: entityInfo,
        Fields: entityInfo.Fields.map(f => ({ Name: f.Name, IsPrimaryKey: f.IsPrimaryKey, ReadOnly: false, NotLoaded: false, Dirty: true })),
        GetDataObjectJSON: async (params?: { excludeFields?: string[] }) => {
            const out = { ...values };
            for (const name of params?.excludeFields ?? []) delete out[name];
            return JSON.stringify(out);
        },
        RegisterResultHistoryEntry: vi.fn(),
    };
}

async function sentPayload(roleId: string, record: object = newRecord(employees()), operation = 'Create'): Promise<Record<string, unknown>> {
    const executeGQL = vi.fn().mockResolvedValue({ ExecuteTransactionGroup: { Success: true, ErrorMessages: [], ResultsJSON: ['{}'] } });
    const provider = {
        ExecuteGQL: executeGQL,
        CurrentUser: user(roleId),
        IsFieldDirtyOnChain: (_entity: unknown, field: { Dirty: boolean }) => field.Dirty,
        ClearISAParentPreSaveSnapshots: () => {},
    };
    const group = new GraphQLTransactionGroup(provider as never);
    (group as unknown as { _pendingTransactions: unknown[] })._pendingTransactions.push(
        { BaseEntity: record, OperationType: operation },
    );
    await (group as unknown as { HandleSubmit(): Promise<unknown> }).HandleSubmit();
    const vars = executeGQL.mock.calls[0][1] as { group: { Items: Array<{ EntityObjectJSON: string }> } };
    return JSON.parse(vars.group.Items[0].EntityObjectJSON);
}

describe('GraphQLTransactionGroup: payloads omit the fields their user may not read', () => {
    it('REGRESSION: a restricted user\'s create does not name the denied field', async () => {
        const payload = await sentPayload(INTERN);
        expect(payload).toEqual({ ID: 'emp-1', Name: 'Ada' });
    });

    it('a user who may read the field still sends it', async () => {
        const payload = await sentPayload(HR);
        expect(payload).toEqual({ ID: 'emp-1', Name: 'Ada', Salary: null });
    });

    it('with nothing to leave out, a create or delete is serialized without reading the field objects', async () => {
        for (const operation of ['Create', 'Delete']) {
            const record = newRecord(employees());
            let fieldReads = 0;
            const fields = record.Fields;
            Object.defineProperty(record, 'Fields', { get: () => { fieldReads++; return fields; } });
            const payload = await sentPayload(HR, record, operation);
            expect(payload).toEqual({ ID: 'emp-1', Name: 'Ada', Salary: null });
            expect(fieldReads).toBe(0); // reading Fields builds every field object of a raw-mode record
        }
    });
});
