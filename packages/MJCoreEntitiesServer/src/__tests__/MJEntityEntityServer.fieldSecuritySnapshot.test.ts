/**
 * Enabling field-level security snapshots per-field permission rows. The rows it skips are the
 * ones it believes already exist, so that belief has to come from the database: metadata can
 * still list rows deleted outside this process, and trusting it leaves every field with no row,
 * which denies it to everyone.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { runInTransactionSpy } = vi.hoisted(() => ({ runInTransactionSpy: vi.fn() }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogDebug: vi.fn(),
        LogError: vi.fn(),
        RunInEntityTransaction: runInTransactionSpy,
    };
});

import { BaseEntity, EntityInfo, FieldPermissionAccess } from '@memberjunction/core';
import { MJEntityEntityServer } from '../custom/MJEntityEntityServer.server';

const ENTITY_ID = 'E0000000-0000-0000-0000-000000000001';
const SALARY_FIELD_ID = 'F0000000-0000-0000-0000-000000000002';
const HR_ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
const ALLOW = FieldPermissionAccess.Allow;

/** Metadata still lists a Salary row for HR, as it does after an out-of-band delete. */
function staleEntityInfo(): EntityInfo {
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
            {
                ID: SALARY_FIELD_ID, EntityID: ENTITY_ID, Sequence: 2, Name: 'Salary', Entity: 'Employees', Type: 'money', AllowUpdateAPI: true,
                EntityFieldPermissions: [
                    { ID: 'stale-row', EntityFieldID: SALARY_FIELD_ID, RoleID: HR_ROLE_ID, ReadAccess: ALLOW, UpdateAccess: ALLOW, CreateAccess: ALLOW },
                ],
            },
        ],
    });
}

type SavedRow = { EntityFieldID: string; RoleID: string; ReadAccess: string };

function buildEntity(runViewResult: { Success: boolean; Results: Array<Record<string, unknown>>; ErrorMessage?: string }) {
    const saved: SavedRow[] = [];
    const runView = vi.fn().mockResolvedValue(runViewResult);
    const provider = {
        Entities: [staleEntityInfo()],
        GetEntityObject: vi.fn().mockImplementation(async () => {
            const row = {
                EntityFieldID: '', RoleID: '', ReadAccess: '', UpdateAccess: '', CreateAccess: '',
                NewRecord: vi.fn(),
                Save: vi.fn().mockImplementation(async () => {
                    saved.push({ EntityFieldID: row.EntityFieldID, RoleID: row.RoleID, ReadAccess: row.ReadAccess });
                    return true;
                }),
            };
            return row;
        }),
    };

    const entity = Object.create(MJEntityEntityServer.prototype) as MJEntityEntityServer;
    Object.defineProperty(entity, 'ID', { value: ENTITY_ID, configurable: true });
    Object.defineProperty(entity, 'Name', { value: 'Employees', configurable: true });
    Object.defineProperty(entity, 'EnableFieldLevelSecurity', { value: true, configurable: true });
    Object.defineProperty(entity, 'IsSaved', { value: true, configurable: true });
    Object.defineProperty(entity, 'ProviderToUse', { value: provider, configurable: true });
    Object.defineProperty(entity, 'RunViewProviderToUse', { value: { RunView: runView }, configurable: true });
    Object.defineProperty(entity, 'ContextCurrentUser', { value: { ID: 'user-1' }, configurable: true });
    entity.GetFieldByName = vi.fn().mockReturnValue({ Dirty: true }) as unknown as MJEntityEntityServer['GetFieldByName'];

    return { entity, saved, runView };
}

beforeEach(() => {
    runInTransactionSpy.mockReset();
    runInTransactionSpy.mockImplementation(async (_p: unknown, work: () => Promise<unknown>) => work());
    vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
});

describe('MJEntityEntityServer — enabling field-level security', () => {
    it('inserts the rows the database lacks even when metadata still lists them', async () => {
        const { entity, saved, runView } = buildEntity({ Success: true, Results: [] });

        expect(await entity.Save()).toBe(true);

        expect(saved).toEqual([{ EntityFieldID: SALARY_FIELD_ID, RoleID: HR_ROLE_ID.toLowerCase(), ReadAccess: ALLOW }]);
        const params = runView.mock.calls[0][0];
        expect(params.EntityName).toBe('MJ: Entity Field Permissions');
        expect(params.BypassCache).toBe(true);
        expect(params.ExtraFilter).toContain(SALARY_FIELD_ID);
    });

    it('inserts nothing when the database has the row', async () => {
        const { entity, saved } = buildEntity({
            Success: true,
            Results: [{ ID: 'stale-row', EntityFieldID: SALARY_FIELD_ID, RoleID: HR_ROLE_ID }],
        });

        expect(await entity.Save()).toBe(true);
        expect(saved).toEqual([]);
    });

    it('fails the save when the rows cannot be read', async () => {
        const { entity, saved } = buildEntity({ Success: false, Results: [], ErrorMessage: 'boom' });

        await expect(entity.Save()).rejects.toThrow(/boom/);
        expect(saved).toEqual([]);
    });
});
