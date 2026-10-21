/**
 * The system-user removal guard on `MJ: User Roles`, reached through an UPDATE rather than a
 * delete.
 *
 * Re-pointing an existing assignment's `UserID` or `RoleID` takes the OLD (user, role) pair apart
 * exactly as deleting the row would. If that pair is one of the system user's roles and the role
 * carries its last `Allow` on some field, the edit strips the account's access without any
 * `Deny` written and without the delete path ever running. These tests pin that the save path
 * evaluates the vacated pair, and that the role-elevation guard still composes with it.
 *
 * The generated base is the same settable stub `MJUserRoleEntityServer.test.ts` uses; the provider
 * package is stubbed so the system user and the sweep's verdict are controlled per test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const SYSTEM_USER_ID = 'ecafccec-6a37-ef11-86d4-000d3a4e707e';
const OTHER_USER_ID = '33333333-3333-3333-3333-333333333333';
const ROLE_DEVELOPER = 'deafccec-6a37-ef11-86d4-000d3a4e707e';
const ROLE_UI = 'e0afccec-6a37-ef11-86d4-000d3a4e707e';

const { state } = vi.hoisted(() => ({
    state: {
        systemUser: null as null | { ID: string; UserRoles: { RoleID: string }[] },
        /** The role whose removal would cost the system user field access. */
        loadBearingRoleID: '' as string,
    },
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: {
        get Instance() {
            return { GetSystemUser: () => state.systemUser };
        },
    },
    FindSystemUserFieldAccessViolations: (_p: unknown, _u: unknown, options: { WithoutRoleID?: string } = {}) =>
        options.WithoutRoleID?.toLowerCase() === state.loadBearingRoleID.toLowerCase()
            ? [{ EntityName: 'Employees', FieldName: 'Salary', Verb: 'read' }]
            : [],
}));

vi.mock('@memberjunction/core-entities', () => {
    type StubField = { Name: string; Dirty: boolean; OldValue: unknown };
    class StubUserRoleEntity {
        public ID = '';
        public UserID = '';
        public RoleID = '';
        public IsSaved = true;
        public ContextCurrentUser: unknown = null;
        public SuperSaveCalled = false;
        public SuperDeleteCalled = false;
        public LastRefusal = '';
        public ProviderToUse = { Entities: [] };
        protected fields = new Map<string, StubField>();

        public GetFieldByName(name: string): StubField | undefined {
            return this.fields.get(name);
        }
        public SetFieldState(name: string, dirty: boolean, oldValue: unknown): void {
            this.fields.set(name, { Name: name, Dirty: dirty, OldValue: oldValue });
        }
        protected get ActiveUser(): unknown {
            return this.ContextCurrentUser;
        }
        public Validate() {
            return { Success: true, Errors: [] as unknown[] };
        }
        public async Save(): Promise<boolean> {
            this.SuperSaveCalled = true;
            return true;
        }
        public async Delete(): Promise<boolean> {
            this.SuperDeleteCalled = true;
            return true;
        }
        public RegisterResultHistoryEntry(result: { Message: string }): void {
            this.LastRefusal = result.Message;
        }
    }
    return { MJUserRoleEntity: StubUserRoleEntity };
});

import { MJUserRoleEntityServer } from '../custom/MJUserRoleEntityServer.server.js';

type TestRow = MJUserRoleEntityServer & {
    SuperSaveCalled: boolean;
    SuperDeleteCalled: boolean;
    LastRefusal: string;
    SetFieldState(name: string, dirty: boolean, oldValue: unknown): void;
};

const OWNER = { ID: '11111111-1111-1111-1111-111111111111', Type: 'Owner', UserRoles: [] };

/** The system user's existing Developer assignment, about to be edited. */
function systemUserDeveloperRow(): TestRow {
    const row = new MJUserRoleEntityServer() as TestRow;
    row.IsSaved = true;
    row.ID = '99999999-9999-9999-9999-999999999999';
    row.UserID = SYSTEM_USER_ID;
    row.RoleID = ROLE_DEVELOPER;
    row.SetFieldState('UserID', false, SYSTEM_USER_ID);
    row.SetFieldState('RoleID', false, ROLE_DEVELOPER);
    row.ContextCurrentUser = OWNER;
    return row;
}

function edit(row: TestRow, name: 'UserID' | 'RoleID', value: string | null, oldValue?: unknown): void {
    const old = oldValue === undefined ? row[name] : oldValue;
    Object.assign(row, { [name]: value });
    row.SetFieldState(name, true, old);
}

beforeEach(() => {
    state.systemUser = { ID: SYSTEM_USER_ID, UserRoles: [{ RoleID: ROLE_DEVELOPER }, { RoleID: ROLE_UI }] };
    state.loadBearingRoleID = ROLE_DEVELOPER;
});

describe('MJUserRoleEntityServer — re-pointing a system-user assignment', () => {
    it('REFUSES moving the system user\'s load-bearing assignment to another user (UserID re-point)', async () => {
        const row = systemUserDeveloperRow();
        edit(row, 'UserID', OTHER_USER_ID);

        expect(await row.Save()).toBe(false);
        expect(row.SuperSaveCalled).toBe(false);
        expect(row.LastRefusal).toContain('Employees.Salary');
    });

    it('REFUSES swapping the load-bearing role for a different one (RoleID re-point)', async () => {
        const row = systemUserDeveloperRow();
        edit(row, 'RoleID', ROLE_UI);

        expect(await row.Save()).toBe(false);
        expect(row.SuperSaveCalled).toBe(false);
    });

    it('refuses an Owner too — the system-user guard has no Owner exemption', async () => {
        const row = systemUserDeveloperRow();
        row.ContextCurrentUser = OWNER;
        edit(row, 'UserID', OTHER_USER_ID);
        expect(await row.Save()).toBe(false);
    });

    it('REFUSES (fails closed) a re-point whose prior value cannot be established', async () => {
        const row = systemUserDeveloperRow();
        edit(row, 'UserID', OTHER_USER_ID, null);
        expect(await row.Save()).toBe(false);
        expect(row.SuperSaveCalled).toBe(false);
    });

    it('ALLOWS re-pointing a system-user assignment whose role is not load-bearing', async () => {
        state.loadBearingRoleID = ROLE_UI;
        const row = systemUserDeveloperRow();
        edit(row, 'UserID', OTHER_USER_ID);

        expect(await row.Save()).toBe(true);
        expect(row.SuperSaveCalled).toBe(true);
    });

    it('ALLOWS re-pointing an assignment that never belonged to the system user', async () => {
        const row = systemUserDeveloperRow();
        row.UserID = OTHER_USER_ID;
        row.SetFieldState('UserID', false, OTHER_USER_ID);
        edit(row, 'RoleID', ROLE_UI);

        expect(await row.Save()).toBe(true);
    });

    it('ALLOWS an update that re-points nothing', async () => {
        const row = systemUserDeveloperRow();
        expect(await row.Save()).toBe(true);
    });

    it('keeps the role-elevation guard: a non-Owner ReplayOnly save is still refused first', async () => {
        const row = systemUserDeveloperRow();
        row.ContextCurrentUser = { ID: 'x', Type: 'User', UserRoles: [{ RoleID: ROLE_DEVELOPER }] };
        state.loadBearingRoleID = ROLE_UI; // the system-user guard would pass
        expect(await row.Save({ ReplayOnly: true })).toBe(false);
        expect(row.LastRefusal).toContain('ReplayOnly');
    });

    it('still refuses DELETING the load-bearing assignment', async () => {
        const row = systemUserDeveloperRow();
        expect(await row.Delete()).toBe(false);
        expect(row.SuperDeleteCalled).toBe(false);
    });
});
