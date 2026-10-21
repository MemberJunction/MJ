/**
 * Configuration-integrity tests for `MJEntityFieldPermissionEntityServer`: the save path's
 * handling of Access spellings and of edits that MOVE a rule.
 *
 * Two classes of hole are pinned here:
 *
 * 1. **Non-canonical Access spellings.** The column's CHECK constraint runs under a
 *    case-insensitive collation, so `'deny'` and `' ALLOW'` both store. The runtime aggregation
 *    folds case, so a stored `'deny'` is enforced as a Deny — while a strict `=== 'Deny'` guard
 *    reads it as harmless. The fix normalizes on save and compares case-insensitively.
 * 2. **Re-pointing.** `RoleID` and `EntityFieldID` are both updatable. An edit that moves a rule
 *    is a delete from the target it leaves plus an insert into the one it joins, so judging only
 *    the destination lets a sequence of saves strip the system user's last `Allow` on a field
 *    without ever writing a `Deny`.
 *
 * The generated base is replaced by a stub with per-field Dirty/OldValue state, `RunView` by an
 * in-memory rule store, and the provider package by a faithful stand-in whose access-loss
 * function aggregates with the real `EntityFieldInfo.AggregateFieldRulesForUser`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const SYSTEM_USER_ID = 'ecafccec-6a37-ef11-86d4-000d3a4e707e';
const ROLE_DEVELOPER = 'deafccec-6a37-ef11-86d4-000d3a4e707e';
const ROLE_UI = 'e0afccec-6a37-ef11-86d4-000d3a4e707e';
const ROLE_CUSTOM = 'B0000000-0000-0000-0000-0000000000CC';
const SALARY_FIELD_ID = 'F0000000-0000-0000-0000-000000000001';
const BONUS_FIELD_ID = 'F0000000-0000-0000-0000-000000000002';

type StoredRule = { ID: string; EntityFieldID: string; RoleID: string; ReadAccess: string; UpdateAccess: string; CreateAccess: string };

const { state } = vi.hoisted(() => ({
    state: {
        systemUser: null as null | { ID: string; UserRoles: { RoleID: string; Role: string }[] },
        rules: [] as StoredRule[],
        entities: [] as unknown[],
    },
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockRunView {
        public async RunView(params: { ExtraFilter: string }) {
            const id = /EntityFieldID = '([^']+)'/.exec(params.ExtraFilter)?.[1] ?? '';
            const rows = state.rules.filter((r) => r.EntityFieldID.toLowerCase() === id.toLowerCase());
            return { Success: true, Results: rows.map((r) => ({ ...r })) };
        }
    }
    return { ...actual, RunView: MockRunView };
});

vi.mock('@memberjunction/generic-database-provider', async () => {
    const core = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    const holds = (roleID: string | null | undefined): boolean =>
        !!roleID && !!state.systemUser?.UserRoles.some((ur) => ur.RoleID.toLowerCase() === roleID.toLowerCase());
    return {
        UserCache: {
            get Instance() {
                return { GetSystemUser: () => state.systemUser };
            },
        },
        SystemUserHoldsRole: holds,
        SystemUserFieldAccessLossReason: (
            _entity: unknown,
            field: { Name: string } | null,
            projected: Parameters<typeof core.EntityFieldInfo.AggregateFieldRulesForUser>[0]
        ): string | null => {
            if (!field || !state.systemUser) {
                return null;
            }
            const after = core.EntityFieldInfo.AggregateFieldRulesForUser(
                projected,
                state.systemUser as unknown as Parameters<typeof core.EntityFieldInfo.AggregateFieldRulesForUser>[1]
            );
            return after.CanRead ? null : `system user would lose read on ${field.Name}`;
        },
    };
});

vi.mock('@memberjunction/core-entities', () => {
    type StubField = { Name: string; Dirty: boolean; OldValue: unknown };
    class StubFieldPermissionEntity {
        public ID = '';
        public EntityFieldID = '';
        public RoleID = '';
        public ReadAccess = 'Allow';
        public UpdateAccess = 'No Access';
        public CreateAccess = 'No Access';
        public IsSaved = true;
        public ResultHistory: { Message: string }[] = [];
        public SuperSaveCalled = false;
        public SuperDeleteCalled = false;
        public ContextCurrentUser = null;
        public RunViewProviderToUse = null;
        protected fields = new Map<string, StubField>();

        public get ProviderToUse() {
            return { Entities: state.entities };
        }
        public GetFieldByName(name: string): StubField | undefined {
            return this.fields.get(name);
        }
        public SetFieldState(name: string, dirty: boolean, oldValue: unknown): void {
            this.fields.set(name, { Name: name, Dirty: dirty, OldValue: oldValue });
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
    }
    return { MJEntityFieldPermissionEntity: StubFieldPermissionEntity };
});

import { MJEntityFieldPermissionEntityServer } from '../custom/MJEntityFieldPermissionEntityServer.server';

/** The stub's extra members, which the production type does not declare. */
type TestRow = MJEntityFieldPermissionEntityServer & {
    SuperSaveCalled: boolean;
    SuperDeleteCalled: boolean;
    ResultHistory: { Message: string }[];
    SetFieldState(name: string, dirty: boolean, oldValue: unknown): void;
};

function field(id: string, name: string) {
    return {
        ID: id,
        Name: name,
        Entity: 'Employees',
        ReadOnly: false,
        IsUnrestrictableField: false,
        IsOnUnrestrictableEntity: false,
    };
}

function setup(): void {
    state.systemUser = {
        ID: SYSTEM_USER_ID,
        UserRoles: [
            { RoleID: ROLE_DEVELOPER, Role: 'Developer' },
            { RoleID: ROLE_UI, Role: 'UI' },
        ],
    };
    state.entities = [
        {
            Name: 'Employees',
            Permissions: [{ RoleID: ROLE_DEVELOPER }, { RoleID: ROLE_UI }, { RoleID: ROLE_CUSTOM }],
            Fields: [field(SALARY_FIELD_ID, 'Salary'), field(BONUS_FIELD_ID, 'Bonus')],
        },
    ];
    // The system user's ONLY Allow on Salary is the Developer row; UI is neutral.
    state.rules = [
        { ID: 'r-dev-salary', EntityFieldID: SALARY_FIELD_ID, RoleID: ROLE_DEVELOPER, ReadAccess: 'Allow', UpdateAccess: 'No Access', CreateAccess: 'No Access' },
        { ID: 'r-ui-salary', EntityFieldID: SALARY_FIELD_ID, RoleID: ROLE_UI, ReadAccess: 'No Access', UpdateAccess: 'No Access', CreateAccess: 'No Access' },
        { ID: 'r-dev-bonus', EntityFieldID: BONUS_FIELD_ID, RoleID: ROLE_DEVELOPER, ReadAccess: 'Allow', UpdateAccess: 'No Access', CreateAccess: 'No Access' },
    ];
}

/** A loaded row mirroring a stored rule, with no pending edits. */
function loadedRow(ruleID: string): TestRow {
    const stored = state.rules.find((r) => r.ID === ruleID)!;
    const row = new MJEntityFieldPermissionEntityServer() as TestRow;
    Object.assign(row, { ...stored });
    for (const name of ['RoleID', 'EntityFieldID', 'ReadAccess', 'UpdateAccess', 'CreateAccess'] as const) {
        row.SetFieldState(name, false, stored[name]);
    }
    return row;
}

/** Edits one column of a loaded row, recording the stored value as its OldValue. */
function edit(row: TestRow, name: 'RoleID' | 'EntityFieldID', value: string): void {
    const old = row[name];
    Object.assign(row, { [name]: value });
    row.SetFieldState(name, true, old);
}

beforeEach(setup);

describe('Access spellings', () => {
    it('refuses a lowercase "deny" aimed at a role the system user holds, exactly as it refuses "Deny"', () => {
        const rule = { ReadAccess: 'deny', UpdateAccess: 'No Access', CreateAccess: 'No Access' } as unknown as Parameters<
            typeof MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason
        >[1];
        expect(MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason(ROLE_DEVELOPER, rule)).toBeTruthy();
    });

    it('treats " no access " on a read-only field as No Access, not as an offending write verb', () => {
        const readOnly = { ...field(SALARY_FIELD_ID, 'Salary'), ReadOnly: true };
        const rule = { ReadAccess: 'Allow', UpdateAccess: 'no access', CreateAccess: ' NO ACCESS ' } as unknown as Parameters<
            typeof MJEntityFieldPermissionEntityServer.WriteVerbRejectionReason
        >[1];
        expect(
            MJEntityFieldPermissionEntityServer.WriteVerbRejectionReason(
                readOnly as unknown as Parameters<typeof MJEntityFieldPermissionEntityServer.WriteVerbRejectionReason>[0],
                rule
            )
        ).toBeNull();
    });

    it('normalizes non-canonical spellings to the canonical value-list values on save', async () => {
        const row = new MJEntityFieldPermissionEntityServer() as TestRow;
        row.IsSaved = false;
        Object.assign(row, {
            EntityFieldID: SALARY_FIELD_ID,
            RoleID: ROLE_CUSTOM,
            ReadAccess: 'deny',
            UpdateAccess: 'ALLOW',
            CreateAccess: ' no access ',
        });

        expect(await row.Save()).toBe(true);
        expect(row.ReadAccess).toBe('Deny');
        expect(row.UpdateAccess).toBe('Allow');
        expect(row.CreateAccess).toBe('No Access');
    });

    it('leaves an unrecognized value alone so value-list validation reports it', async () => {
        const row = new MJEntityFieldPermissionEntityServer() as TestRow;
        row.IsSaved = false;
        Object.assign(row, { EntityFieldID: SALARY_FIELD_ID, RoleID: ROLE_CUSTOM, ReadAccess: 'Maybe' });
        await row.Save();
        expect(row.ReadAccess).toBe('Maybe');
    });
});

describe('re-pointing a rule is judged against the target it leaves', () => {
    it('REFUSES moving the system user\'s last Allow to a role it does not hold (RoleID re-point)', async () => {
        const row = loadedRow('r-dev-salary');
        edit(row, 'RoleID', ROLE_CUSTOM);

        expect(await row.Save()).toBe(false);
        expect(row.SuperSaveCalled).toBe(false);
        expect(row.ResultHistory.at(-1)?.Message).toContain('Salary');
    });

    it('REFUSES moving the system user\'s last Allow to a different field (EntityFieldID re-point)', async () => {
        const row = loadedRow('r-dev-salary');
        edit(row, 'EntityFieldID', BONUS_FIELD_ID);
        // Bonus already has a Developer row in the store; drop it so the move is unique-legal.
        state.rules = state.rules.filter((r) => r.ID !== 'r-dev-bonus');

        expect(await row.Save()).toBe(false);
        expect(row.SuperSaveCalled).toBe(false);
        expect(row.ResultHistory.at(-1)?.Message).toContain('Salary');
    });

    it('ALLOWS a re-point when another role the system user holds keeps an Allow on the vacated field', async () => {
        state.rules.find((r) => r.ID === 'r-ui-salary')!.ReadAccess = 'Allow';
        const row = loadedRow('r-dev-salary');
        edit(row, 'RoleID', ROLE_CUSTOM);

        expect(await row.Save()).toBe(true);
        expect(row.SuperSaveCalled).toBe(true);
    });

    it('ALLOWS moving an Allow between two roles the system user holds on the same field', async () => {
        state.rules = state.rules.filter((r) => r.ID !== 'r-ui-salary');
        const row = loadedRow('r-dev-salary');
        edit(row, 'RoleID', ROLE_UI);

        expect(await row.Save()).toBe(true);
    });

    it('ALLOWS re-pointing a rule that never involved a system-user role', async () => {
        state.rules.push({ ID: 'r-custom', EntityFieldID: SALARY_FIELD_ID, RoleID: ROLE_CUSTOM, ReadAccess: 'Deny', UpdateAccess: 'No Access', CreateAccess: 'No Access' });
        const row = loadedRow('r-custom');
        edit(row, 'EntityFieldID', BONUS_FIELD_ID);

        expect(await row.Save()).toBe(true);
    });

    it('REFUSES (fails closed) a re-point whose prior binding cannot be established', async () => {
        const row = loadedRow('r-dev-salary');
        Object.assign(row, { RoleID: ROLE_CUSTOM });
        row.SetFieldState('RoleID', true, null);

        expect(await row.Save()).toBe(false);
        expect(row.SuperSaveCalled).toBe(false);
    });

    it('still refuses deleting the last Allow, and still permits an ordinary edit that keeps it', async () => {
        const deleting = loadedRow('r-dev-salary');
        expect(await deleting.Delete()).toBe(false);
        expect(deleting.SuperDeleteCalled).toBe(false);

        const editing = loadedRow('r-dev-salary');
        Object.assign(editing, { UpdateAccess: 'No Access' });
        expect(await editing.Save()).toBe(true);
    });
});
