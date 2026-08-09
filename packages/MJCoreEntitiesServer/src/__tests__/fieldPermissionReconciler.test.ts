/**
 * The transactional applier behind field-permission reconciliation.
 *
 * The delta itself is pure and tested separately; this covers how it reaches the database —
 * ordering, the transaction boundary, error propagation, and the quiet variant used by adapters
 * that reconcile as a side effect of some other save.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { runInTransactionSpy, logErrorSpy, logDebugSpy } = vi.hoisted(() => ({
    runInTransactionSpy: vi.fn(),
    logErrorSpy: vi.fn(),
    logDebugSpy: vi.fn(),
}));

vi.mock('@memberjunction/sqlserver-dataprovider', () => ({
    // The reconciler asks the cache which roles the system user holds, so those roles can be
    // excluded from the snapshot. A cold cache degrades to "exclude nothing", which is what
    // these tests exercise.
    UserCache: { Instance: { GetSystemUser: () => null } },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: logErrorSpy,
        LogDebug: logDebugSpy,
        RunInEntityTransaction: runInTransactionSpy,
    };
});

import { EntityInfo, FieldPermissionAccess } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { ReconcileFieldPermissions, ReconcileFieldPermissionsQuietly } from '../custom/fieldPermissionReconciler';

const ENTITY_ID = 'E0000000-0000-0000-0000-000000000001';
const SALARY_FIELD_ID = 'F0000000-0000-0000-0000-000000000002';
const HR_ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
const ALLOW = FieldPermissionAccess.Allow;

const USER = { ID: 'u1', Email: 'u@test.com' } as unknown as UserInfo;

/** An enabled entity with one restrictable field and one qualifying role. */
function buildEntity(existingSalaryRows: Record<string, unknown>[] = []): EntityInfo {
    return new EntityInfo({
        ID: ENTITY_ID,
        Name: 'Employees',
        SchemaName: '__mj',
        BaseTable: 'Employee',
        BaseView: 'vwEmployees',
        EnableFieldLevelSecurity: true,
        Permissions: [
            { ID: 'ep1', EntityID: ENTITY_ID, RoleID: HR_ROLE_ID, Type: 'Allow', CanRead: true, CanUpdate: true, CanCreate: true, CanDelete: true },
        ],
        Fields: [
            { ID: 'F1', EntityID: ENTITY_ID, Sequence: 1, Name: 'ID', Entity: 'Employees', Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: SALARY_FIELD_ID, EntityID: ENTITY_ID, Sequence: 2, Name: 'Salary', Entity: 'Employees', Type: 'money', EntityFieldPermissions: existingSalaryRows },
        ],
    });
}

/** Records the order of Save/Delete calls so the delete-before-insert rule can be asserted. */
function makeProvider(opts: { saveResult?: boolean; deleteResult?: boolean; loadResult?: boolean } = {}) {
    const order: string[] = [];
    const rows: Array<Record<string, unknown>> = [];

    const provider = {
        GetEntityObject: vi.fn().mockImplementation(async () => ({
            NewRecord: vi.fn(),
            Load: vi.fn().mockImplementation(async () => {
                order.push('load');
                return opts.loadResult ?? true;
            }),
            Delete: vi.fn().mockImplementation(async () => {
                order.push('delete');
                return opts.deleteResult ?? true;
            }),
            Save: vi.fn().mockImplementation(async function (this: Record<string, unknown>) {
                order.push('save');
                rows.push({ ...this });
                return opts.saveResult ?? true;
            }),
            LatestResult: { CompleteMessage: 'mock failure detail' },
            EntityFieldID: '',
            RoleID: '',
            ReadAccess: '',
            UpdateAccess: '',
            CreateAccess: '',
        })),
    } as unknown as IMetadataProvider;

    return { provider, order, rows };
}

beforeEach(() => {
    logErrorSpy.mockClear();
    logDebugSpy.mockClear();
    // Default: execute the work inline so the applier's own logic is what is under test.
    runInTransactionSpy.mockReset();
    runInTransactionSpy.mockImplementation(async (_p: unknown, work: () => Promise<unknown>) => work());
});

describe('ReconcileFieldPermissions', () => {
    it('returns without opening a transaction when the delta is empty', async () => {
        // Reconciliation is triggered from ordinary saves, so "nothing to do" is the common case
        // and a transaction opened to write zero rows is pure cost.
        const entity = buildEntity([
            { ID: 'p1', EntityFieldID: SALARY_FIELD_ID, RoleID: HR_ROLE_ID, ReadAccess: ALLOW, UpdateAccess: ALLOW, CreateAccess: ALLOW },
        ]);
        const { provider } = makeProvider();

        const result = await ReconcileFieldPermissions(entity, provider, USER);

        expect(result).toEqual({ Inserted: 0, Deleted: 0 });
        expect(runInTransactionSpy).not.toHaveBeenCalled();
        expect(provider.GetEntityObject).not.toHaveBeenCalled();
    });

    it('writes the whole delta inside one transaction', async () => {
        const { provider } = makeProvider();

        await ReconcileFieldPermissions(buildEntity(), provider, USER);

        expect(runInTransactionSpy).toHaveBeenCalledTimes(1);
    });

    it('inserts the missing row at snapshot defaults', async () => {
        const { provider, rows } = makeProvider();

        const result = await ReconcileFieldPermissions(buildEntity(), provider, USER);

        expect(result.Inserted).toBe(1);
        expect(rows[0]).toMatchObject({
            EntityFieldID: SALARY_FIELD_ID,
            RoleID: HR_ROLE_ID.toLowerCase(),
            ReadAccess: ALLOW,
            UpdateAccess: ALLOW,
            CreateAccess: ALLOW,
        });
    });

    it('DELETES BEFORE INSERTING', async () => {
        // A (field, role) pair can be both orphaned and needed. The other order collides on the
        // (EntityFieldID, RoleID) uniqueness constraint.
        const orphanRole = 'A0000000-0000-0000-0000-0000000000FF'; // holds no entity permission
        const entity = buildEntity([
            { ID: 'orphan', EntityFieldID: SALARY_FIELD_ID, RoleID: orphanRole, ReadAccess: ALLOW },
        ]);
        const { provider, order } = makeProvider();

        const result = await ReconcileFieldPermissions(entity, provider, USER);

        expect(result).toEqual({ Inserted: 1, Deleted: 1 });
        expect(order.indexOf('delete')).toBeLessThan(order.indexOf('save'));
    });

    it('skips a row that has already gone rather than failing', async () => {
        const orphanRole = 'A0000000-0000-0000-0000-0000000000FF';
        const entity = buildEntity([
            { ID: 'orphan', EntityFieldID: SALARY_FIELD_ID, RoleID: orphanRole, ReadAccess: ALLOW },
        ]);
        const { provider, order } = makeProvider({ loadResult: false }); // cascade already removed it

        const result = await ReconcileFieldPermissions(entity, provider, USER);

        expect(result.Deleted).toBe(0);
        expect(order).not.toContain('delete');
    });

    it('throws with the underlying detail when an insert fails', async () => {
        const { provider } = makeProvider({ saveResult: false });

        await expect(ReconcileFieldPermissions(buildEntity(), provider, USER)).rejects.toThrow(
            /could not add a row for 'Employees'.*mock failure detail/s
        );
    });

    it('throws with the underlying detail when a delete fails', async () => {
        const orphanRole = 'A0000000-0000-0000-0000-0000000000FF';
        const entity = buildEntity([
            { ID: 'orphan', EntityFieldID: SALARY_FIELD_ID, RoleID: orphanRole, ReadAccess: ALLOW },
        ]);
        const { provider } = makeProvider({ deleteResult: false });

        await expect(ReconcileFieldPermissions(entity, provider, USER)).rejects.toThrow(
            /could not remove row 'orphan'.*mock failure detail/s
        );
    });

    it('does nothing without an entity or a provider', async () => {
        const { provider } = makeProvider();

        expect(await ReconcileFieldPermissions(null as unknown as EntityInfo, provider, USER)).toEqual({ Inserted: 0, Deleted: 0 });
        expect(await ReconcileFieldPermissions(buildEntity(), null as unknown as IMetadataProvider, USER)).toEqual({ Inserted: 0, Deleted: 0 });
        expect(runInTransactionSpy).not.toHaveBeenCalled();
    });
});

describe('ReconcileFieldPermissionsQuietly', () => {
    it('swallows a failure into a logged error', async () => {
        // The save that triggered this has already committed, so reporting it as failed would be
        // wrong. Missing rows fail closed until the next reconciliation.
        const { provider } = makeProvider({ saveResult: false });

        const result = await ReconcileFieldPermissionsQuietly(buildEntity(), provider, USER);

        expect(result).toEqual({ Inserted: 0, Deleted: 0 });
        expect(logErrorSpy).toHaveBeenCalledTimes(1);
        expect(logErrorSpy.mock.calls[0][0]).toMatch(/Reconciliation of 'Employees' failed/);
    });

    it('returns the real result when nothing goes wrong', async () => {
        const { provider } = makeProvider();

        const result = await ReconcileFieldPermissionsQuietly(buildEntity(), provider, USER);

        expect(result).toEqual({ Inserted: 1, Deleted: 0 });
        expect(logErrorSpy).not.toHaveBeenCalled();
    });
});
