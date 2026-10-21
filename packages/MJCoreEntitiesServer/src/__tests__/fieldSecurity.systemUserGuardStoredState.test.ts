/**
 * The system-user field-access guards, judged on STORED state.
 *
 * Each guard judges one write against the state before it. Before these fixes two of its inputs
 * were caches that lag a write made a moment earlier (the system user's roles in `UserCache`, and
 * field rules on loaded metadata), and a transaction group's items were all checked before any of
 * them was written. In every scenario below each write passed on its own and the system user still
 * lost a field.
 *
 * The fakes: a database of role assignments and field rules that a committed save writes to; a
 * `UserCache` and metadata that keep showing the state from before the test's first write; and
 * generated bases that validate, then enrol in a transaction group or commit, as `BaseEntity`
 * does. Aggregation and the sweep are the real ones.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const SYSTEM_USER_ID = 'ecafccec-6a37-ef11-86d4-000d3a4e707e';
const OWNER_ID = '11111111-1111-1111-1111-111111111111';
const REGULAR_USER_ID = '22222222-2222-2222-2222-222222222222';
const ROLE_A = 'a0000000-0000-4000-8000-00000000000a';
const ROLE_B = 'b0000000-0000-4000-8000-00000000000b';
const ROLE_R = 'c0000000-0000-4000-8000-00000000000c';
const ENTITY_ID = 'e0000000-0000-4000-8000-000000000001';
const ID_FIELD_ID = 'f0000000-0000-4000-8000-000000000001';
const SALARY_FIELD_ID = 'f0000000-0000-4000-8000-000000000002';

type StoredRule = { ID: string; EntityFieldID: string; RoleID: string; ReadAccess: string; UpdateAccess: string; CreateAccess: string };
type StoredAssignment = { ID: string; UserID: string; RoleID: string; Role: string };

const { db } = vi.hoisted(() => ({
    db: {
        assignments: [] as StoredAssignment[],
        rules: [] as StoredRule[],
        cachedSystemUser: null as null | { ID: string; Name: string; UserRoles: { UserID: string; RoleID: string; Role: string }[] },
        entities: [] as unknown[],
    },
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class StoredStateRunView {
        public async RunView(params: { EntityName: string; ExtraFilter: string }) {
            const quoted = [...params.ExtraFilter.matchAll(/'([^']+)'/g)].map((m) => m[1].toLowerCase());
            const rows: object[] =
                params.EntityName === 'MJ: User Roles'
                    ? db.assignments.filter((a) => quoted.includes(a.UserID.toLowerCase()))
                    : params.ExtraFilter.startsWith('EntityFieldID')
                      ? db.rules.filter((r) => quoted.includes(r.EntityFieldID.toLowerCase()))
                      : db.rules.filter((r) => quoted.includes(r.RoleID.toLowerCase()));
            return { Success: true, Results: rows.map((r) => ({ ...r })) };
        }
    }
    return { ...actual, RunView: StoredStateRunView };
});

vi.mock('@memberjunction/generic-database-provider', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/generic-database-provider')>();
    return {
        ...actual,
        UserCache: { get Instance() { return { GetSystemUser: () => db.cachedSystemUser }; } },
    };
});

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
    type FieldState = { Name: string; Dirty: boolean; OldValue: unknown };
    type Refusable = { Validate(): { Success: boolean; Errors: { Message: string }[] }; LastRefusal: string };

    /** Validates (unless replaying), then enrols in the group or commits, as `BaseEntity.Save` does. */
    class StubBase {
        public ID = '';
        public IsSaved = false;
        public TransactionGroup: object | null = null;
        public RunViewProviderToUse = null;
        public ContextCurrentUser: unknown = { ID: OWNER_ID, Type: 'Owner', UserRoles: [] };
        public LastRefusal = '';
        public ResultHistory: { Message: string }[] = [];
        protected fields = new Map<string, FieldState>();
        public get ProviderToUse() { return { Entities: db.entities }; }
        protected get ActiveUser(): unknown { return this.ContextCurrentUser; }
        public GetFieldByName(name: string): FieldState | undefined { return this.fields.get(name); }
        public SetFieldState(name: string, dirty: boolean, oldValue: unknown): void {
            this.fields.set(name, { Name: name, Dirty: dirty, OldValue: oldValue });
        }
        public Validate() { return { Success: true, Errors: [] as { Message: string }[] }; }
        public RegisterResultHistoryEntry(result: { Message: string }): void { this.LastRefusal = result.Message; }
        public async Save(options?: { ReplayOnly?: boolean }): Promise<boolean> {
            if (!options?.ReplayOnly) {
                const v = (this as unknown as Refusable).Validate();
                if (!v.Success) {
                    this.LastRefusal = v.Errors.map((e) => e.Message).join('; ');
                    return false;
                }
            }
            if (!this.TransactionGroup) this.commit();
            return true;
        }
        public async Delete(): Promise<boolean> {
            if (!this.TransactionGroup) this.remove();
            return true;
        }
        protected commit(): void {}
        protected remove(): void {}
    }

    class StubUserRole extends StubBase {
        public UserID = '';
        public RoleID = '';
        protected commit(): void {
            db.assignments = db.assignments.filter((a) => a.ID !== this.ID);
            db.assignments.push({ ID: this.ID, UserID: this.UserID, RoleID: this.RoleID, Role: `Role-${this.RoleID}` });
        }
        protected remove(): void { db.assignments = db.assignments.filter((a) => a.ID !== this.ID); }
    }

    class StubFieldPermission extends StubBase {
        public EntityFieldID = '';
        public RoleID = '';
        public ReadAccess = 'Allow';
        public UpdateAccess = 'No Access';
        public CreateAccess = 'No Access';
        protected commit(): void {
            db.rules = db.rules.filter((r) => r.ID !== this.ID);
            db.rules.push({ ID: this.ID, EntityFieldID: this.EntityFieldID, RoleID: this.RoleID, ReadAccess: this.ReadAccess, UpdateAccess: this.UpdateAccess, CreateAccess: this.CreateAccess });
        }
        protected remove(): void { db.rules = db.rules.filter((r) => r.ID !== this.ID); }
    }

    return { ...actual, MJUserRoleEntity: StubUserRole, MJEntityFieldPermissionEntity: StubFieldPermission };
});

import { EntityInfo, FieldPermissionAccess } from '@memberjunction/core';
import { MJUserRoleEntityServer } from '../custom/MJUserRoleEntityServer.server';
import { MJEntityFieldPermissionEntityServer } from '../custom/MJEntityFieldPermissionEntityServer.server';

type Stubbed = { LastRefusal: string; ResultHistory: { Message: string }[]; TransactionGroup: object | null; SetFieldState(n: string, d: boolean, o: unknown): void };
type RoleRow = MJUserRoleEntityServer & Stubbed;
type RuleRow = MJEntityFieldPermissionEntityServer & Stubbed;

const ALLOW_READ = { ReadAccess: FieldPermissionAccess.Allow, UpdateAccess: FieldPermissionAccess.NoAccess, CreateAccess: FieldPermissionAccess.NoAccess };
const NEUTRAL = { ReadAccess: FieldPermissionAccess.NoAccess, UpdateAccess: FieldPermissionAccess.NoAccess, CreateAccess: FieldPermissionAccess.NoAccess };
const DENY_READ = { ReadAccess: FieldPermissionAccess.Deny, UpdateAccess: FieldPermissionAccess.NoAccess, CreateAccess: FieldPermissionAccess.NoAccess };

/** `Employees`, readable by roles A, B and R; `Salary` has the given rules in loaded metadata. */
function employees(metadataRules: StoredRule[], enableFieldLevelSecurity = true): EntityInfo {
    return new EntityInfo({
        ID: ENTITY_ID, Name: 'Employees', SchemaName: 'dbo', BaseTable: 'Employee', BaseView: 'vwEmployees',
        EnableFieldLevelSecurity: enableFieldLevelSecurity,
        Permissions: [ROLE_A, ROLE_B, ROLE_R].map((RoleID) => ({ EntityID: ENTITY_ID, RoleID, CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false })),
        Fields: [
            { ID: ID_FIELD_ID, EntityID: ENTITY_ID, Entity: 'Employees', Name: 'ID', Sequence: 1, Type: 'uniqueidentifier', IsPrimaryKey: true },
            { ID: SALARY_FIELD_ID, EntityID: ENTITY_ID, Entity: 'Employees', Name: 'Salary', Sequence: 2, Type: 'money', AllowUpdateAPI: true, EntityFieldPermissions: metadataRules },
        ],
    });
}

function rule(id: string, roleID: string, verbs: typeof ALLOW_READ): StoredRule {
    return { ID: id, EntityFieldID: SALARY_FIELD_ID, RoleID: roleID, ...verbs };
}

/**
 * The system user holds A and B; each allows `Salary`. Cache, metadata and database agree, and
 * the cache and metadata stay this way for the rest of the test whatever is committed.
 */
function setup(options: { enableFieldLevelSecurity?: boolean } = {}): void {
    db.assignments = [
        { ID: 'ur-a', UserID: SYSTEM_USER_ID, RoleID: ROLE_A, Role: 'A' },
        { ID: 'ur-b', UserID: SYSTEM_USER_ID, RoleID: ROLE_B, Role: 'B' },
    ];
    db.rules = [rule('r-a', ROLE_A, ALLOW_READ), rule('r-b', ROLE_B, ALLOW_READ)];
    db.cachedSystemUser = { ID: SYSTEM_USER_ID, Name: 'System', UserRoles: db.assignments.map(({ UserID, RoleID, Role }) => ({ UserID, RoleID, Role })) };
    db.entities = [employees(db.rules.map((r) => ({ ...r })), options.enableFieldLevelSecurity ?? true)];
}

function newAssignment(id: string, userID: string, roleID: string, group: object | null = null): RoleRow {
    const row = new MJUserRoleEntityServer() as RoleRow;
    Object.assign(row, { ID: id, UserID: userID, RoleID: roleID, IsSaved: false, TransactionGroup: group });
    return row;
}

function storedAssignment(id: string, group: object | null = null): RoleRow {
    const stored = db.assignments.find((a) => a.ID === id)!;
    const row = new MJUserRoleEntityServer() as RoleRow;
    Object.assign(row, { ID: id, UserID: stored.UserID, RoleID: stored.RoleID, IsSaved: true, TransactionGroup: group });
    row.SetFieldState('UserID', false, stored.UserID);
    row.SetFieldState('RoleID', false, stored.RoleID);
    return row;
}

function newRule(id: string, roleID: string, verbs: typeof ALLOW_READ, group: object | null = null): RuleRow {
    const row = new MJEntityFieldPermissionEntityServer() as RuleRow;
    Object.assign(row, { ID: id, EntityFieldID: SALARY_FIELD_ID, RoleID: roleID, ...verbs, IsSaved: false, TransactionGroup: group });
    return row;
}

function storedRule(id: string, group: object | null = null): RuleRow {
    const stored = db.rules.find((r) => r.ID === id)!;
    const row = new MJEntityFieldPermissionEntityServer() as RuleRow;
    Object.assign(row, { ...stored, IsSaved: true, TransactionGroup: group });
    for (const name of ['RoleID', 'EntityFieldID', 'ReadAccess', 'UpdateAccess', 'CreateAccess'] as const) {
        row.SetFieldState(name, false, stored[name]);
    }
    return row;
}

/**
 * The system user also holds R, which reads the entity but abstains on `Salary`, so losing A and B
 * costs it the field while it keeps entity-level read (a removal that costs entity read is denied
 * one level up and is permitted).
 */
function holdThirdNeutralRole(): void {
    db.assignments.push({ ID: 'ur-r', UserID: SYSTEM_USER_ID, RoleID: ROLE_R, Role: 'R' });
    db.rules.push(rule('r-r', ROLE_R, NEUTRAL));
    db.cachedSystemUser!.UserRoles.push({ UserID: SYSTEM_USER_ID, RoleID: ROLE_R, Role: 'R' });
    db.entities = [employees(db.rules.map((r) => ({ ...r })))];
}

function refusal(row: Stubbed): string {
    return row.LastRefusal || row.ResultHistory.at(-1)?.Message || '';
}

beforeEach(() => setup());

describe('quick successive saves: the guards read the stored role set and rules', () => {
    it('REGRESSION: refuses a Deny on a role assigned to the system user a moment ago (cache not yet refreshed)', async () => {
        expect(await newAssignment('ur-r', SYSTEM_USER_ID, ROLE_R).Save()).toBe(true);

        const deny = newRule('r-r', ROLE_R, DENY_READ);
        expect(await deny.Save()).toBe(false);
        expect(refusal(deny)).toContain('held by the MJ system user');
        expect(db.rules.some((r) => r.ID === 'r-r')).toBe(false);
    });

    it('REGRESSION: refuses assigning the system user a role given a Deny a moment ago (metadata not yet refreshed)', async () => {
        expect(await newRule('r-r', ROLE_R, DENY_READ).Save()).toBe(true);

        const assign = newAssignment('ur-r', SYSTEM_USER_ID, ROLE_R);
        expect(await assign.Save()).toBe(false);
        expect(refusal(assign)).toContain('cannot be assigned to the MJ system user');
    });

    it('REGRESSION: refuses removing the system user\'s second role right after the first (cache still shows both)', async () => {
        holdThirdNeutralRole();
        expect(await storedAssignment('ur-a').Delete()).toBe(true);

        const second = storedAssignment('ur-b');
        expect(await second.Delete()).toBe(false);
        expect(refusal(second)).toContain('Employees.Salary');
    });

    it('REGRESSION: refuses a role removal when the other role\'s Allow was turned to No Access a moment ago (metadata still shows it)', async () => {
        const edit = storedRule('r-b');
        Object.assign(edit, NEUTRAL);
        expect(await edit.Save()).toBe(true);

        const removal = storedAssignment('ur-a');
        expect(await removal.Delete()).toBe(false);
        expect(refusal(removal)).toContain('Employees.Salary');
    });

    it('still permits removing a role whose Allow another stored role duplicates', async () => {
        expect(await storedAssignment('ur-a').Delete()).toBe(true);
    });
});

describe('transaction groups: two guarded writes that concern the system user are refused', () => {
    it('REGRESSION: one group that assigns R to the system user and adds a Deny on R', async () => {
        const group = {};
        expect(await newAssignment('ur-r', SYSTEM_USER_ID, ROLE_R, group).Save()).toBe(true);
        const deny = newRule('r-r', ROLE_R, DENY_READ, group);
        expect(await deny.Save()).toBe(false);
        expect(refusal(deny)).toContain('one at a time');
    });

    it("REGRESSION: one group that removes two of the system user's roles, each the other's only other grant", async () => {
        holdThirdNeutralRole();
        const group = {};
        expect(await storedAssignment('ur-a', group).Delete()).toBe(true);
        const second = storedAssignment('ur-b', group);
        expect(await second.Delete()).toBe(false);
        expect(refusal(second)).toContain('one at a time');
    });

    it('REGRESSION: one group that turns both Allow rows on a field to No Access', async () => {
        const group = {};
        const first = storedRule('r-a', group);
        Object.assign(first, NEUTRAL);
        expect(await first.Save()).toBe(true);
        const second = storedRule('r-b', group);
        Object.assign(second, NEUTRAL);
        expect(await second.Save()).toBe(false);
        expect(refusal(second)).toContain('one at a time');
    });

    it("permits a group of a regular user's role assignments", async () => {
        const group = {};
        expect(await newAssignment('ur-1', REGULAR_USER_ID, ROLE_A, group).Save()).toBe(true);
        expect(await newAssignment('ur-2', REGULAR_USER_ID, ROLE_B, group).Save()).toBe(true);
    });

    it('permits one guarded write about the system user in a group, checked like a save on its own', async () => {
        expect(await newAssignment('ur-r', SYSTEM_USER_ID, ROLE_R, {}).Save()).toBe(true);
    });
});

describe('the removal guard and the replay path', () => {
    it('REGRESSION: refuses removing the role that carries the only Allow while field security is switched off', async () => {
        setup({ enableFieldLevelSecurity: false });
        db.rules = [rule('r-a', ROLE_A, ALLOW_READ), rule('r-b', ROLE_B, NEUTRAL)];
        db.entities = [employees(db.rules.map((r) => ({ ...r })), false)];

        const removal = storedAssignment('ur-a');
        expect(await removal.Delete()).toBe(false);
        expect(refusal(removal)).toContain('Employees.Salary');
    });

    it("REGRESSION: an Owner's ReplayOnly save cannot assign the system user a role that carries a Deny", async () => {
        db.rules.push(rule('r-r', ROLE_R, DENY_READ));
        const assign = newAssignment('ur-r', SYSTEM_USER_ID, ROLE_R);
        expect(await assign.Save({ ReplayOnly: true })).toBe(false);
        expect(refusal(assign)).toContain('cannot be assigned to the MJ system user');
        expect(db.assignments.some((a) => a.ID === 'ur-r')).toBe(false);
    });
});
