/**
 * Field-level security and caller identity at the A2A entity operations.
 *
 * - Operations run as the authenticated caller, not as the configured service user.
 * - A caller who is denied a field cannot send it, nor a key naming no field, and both are
 *   refused with the same wording, so the refusal does not reveal which columns exist.
 * - No operation returns a value its caller is denied, even when the record or the view hands
 *   it the full row.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    EntityInfo,
    FieldPermissionAccess,
    FieldSecurityClientInputMessage,
    IMetadataProvider,
    UserInfo,
    UserRoleInfo,
} from '@memberjunction/core';

const { state } = vi.hoisted(() => ({
    state: {
        settings: {} as { userEmail?: string },
        cachedUsers: [] as UserInfo[],
        runViewCalls: [] as { params: Record<string, unknown>; user: UserInfo | undefined }[],
    },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            async RunView(params: Record<string, unknown>, user?: UserInfo) {
                state.runViewCalls.push({ params, user });
                return { Success: true, Results: [fullRow()], RowCount: 1, TotalRowCount: 1, ErrorMessage: '' };
            }
        },
    };
});

vi.mock('@memberjunction/generic-database-provider', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/generic-database-provider')>();
    return {
        ClientClauseScreen: actual.ClientClauseScreen,
        UserCache: { Instance: { get Users() { return state.cachedUsers; } } },
    };
});

vi.mock('../config.js', () => ({
    a2aServerSettings: state.settings,
}));

import { EntityOperations } from '../EntityOperations';

// ─── Fixture ──────────────────────────────────────────────────────────────

const HR_ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
const INTERN_ROLE_ID = 'A0000000-0000-0000-0000-000000000003';
const ENTITY_ID = 'B0000000-0000-0000-0000-000000000001';
const ROW_ID = '11111111-0000-0000-0000-000000000001';

function openTo(fieldId: string, roles: string[]): Record<string, string>[] {
    return roles.map((roleId, i) => ({
        ID: `${fieldId}-open-${i}`, EntityFieldID: fieldId, RoleID: roleId,
        ReadAccess: FieldPermissionAccess.Allow, UpdateAccess: FieldPermissionAccess.Allow, CreateAccess: FieldPermissionAccess.Allow,
    }));
}

/** `Employees`: `Salary` is HR-only; `Name` is open to both roles. */
function employeeEntity(): EntityInfo {
    const field = (id: string, seq: number, name: string, type: string, perms?: Record<string, string>[]) => ({
        ID: id, EntityID: ENTITY_ID, Sequence: seq, Name: name, Entity: 'Employees', Type: type,
        AllowUpdateAPI: true, AllowsNull: true, EntityFieldPermissions: perms,
    });
    return new EntityInfo({
        ID: ENTITY_ID, Name: 'Employees', ClassName: 'Employees', SchemaName: 'dbo', BaseTable: 'Employee',
        BaseView: 'vwEmployees', EnableFieldLevelSecurity: true,
        Fields: [
            { ...field('f-id', 1, 'ID', 'uniqueidentifier'), IsPrimaryKey: true, AllowsNull: false },
            field('f-name', 2, 'Name', 'nvarchar', openTo('f-name', [HR_ROLE_ID, INTERN_ROLE_ID])),
            field('f-salary', 3, 'Salary', 'money', openTo('f-salary', [HR_ROLE_ID])),
        ],
    });
}

function buildUser(roleId: string, id: string): UserInfo {
    return new UserInfo(null, {
        ID: id, Name: `User ${id}`, Email: `${id}@test.com`, IsActive: true,
        UserRoles: [new UserRoleInfo({ UserID: id, RoleID: roleId, Role: `Role-${roleId}` })],
    });
}

function fullRow(): Record<string, string | number> {
    return { ID: ROW_ID, Name: 'Ada', Salary: 250000 };
}

/** A record that holds and returns the full row whoever loaded it. */
class FakeRecord {
    public SetMany = vi.fn();
    constructor(public EntityInfo: EntityInfo) {}
    async InnerLoad() { return true; }
    async Save() { return true; }
    async GetDataObject() { return fullRow(); }
    async GetDataObjectJSON() { return JSON.stringify(fullRow()); }
}

let entity: EntityInfo;
let record: FakeRecord;
let getEntityObjectUsers: UserInfo[];
let intern: UserInfo;
let hr: UserInfo;

function provider(): IMetadataProvider {
    const fake = {
        Entities: [entity],
        EntityByID: (id: string) => (id === ENTITY_ID ? entity : undefined),
        GetEntityObject: async (_name: string, user: UserInfo) => {
            getEntityObjectUsers.push(user);
            return record;
        },
    };
    return fake as Partial<IMetadataProvider> as IMetadataProvider;
}

/** What a successful get/create/update carries as its result: the projected row, as JSON. */
function resultRow(result: { result?: string }): Record<string, unknown> {
    return JSON.parse(result.result!) as Record<string, unknown>;
}

beforeEach(() => {
    entity = employeeEntity();
    record = new FakeRecord(entity);
    getEntityObjectUsers = [];
    state.runViewCalls = [];
    intern = buildUser(INTERN_ROLE_ID, 'intern');
    hr = buildUser(HR_ROLE_ID, 'hr');
    state.cachedUsers = [hr, intern];
    delete state.settings.userEmail;
});

// ─── Identity ─────────────────────────────────────────────────────────────

describe('A2A entity operations: identity', () => {
    it('run as the authenticated caller, not as the configured service user', async () => {
        state.settings.userEmail = hr.Email;
        const ops = new EntityOperations(provider(), intern);
        await ops.GetEntity('Employees', { ID: ROW_ID });
        await ops.QueryEntity('Employees', {});
        expect(getEntityObjectUsers).toEqual([intern]);
        expect(state.runViewCalls[0].user).toBe(intern);
    });

    it('fall back to the configured service user only when there is no caller', async () => {
        state.settings.userEmail = hr.Email;
        await new EntityOperations(provider()).GetEntity('Employees', { ID: ROW_ID });
        expect(getEntityObjectUsers).toEqual([hr]);
    });
});

// ─── Input gate ───────────────────────────────────────────────────────────

describe('A2A entity operations: client input from a restricted caller', () => {
    for (const operation of ['create', 'update'] as const) {
        it(`${operation} refuses a denied key and an unknown key with the same wording, and never applies either`, async () => {
            const ops = new EntityOperations(provider(), intern);
            const denied = await ops.ProcessOperation(operation, 'Employees', { ID: ROW_ID, Name: 'x', Salary: 1 });
            const unknown = await ops.ProcessOperation(operation, 'Employees', { ID: ROW_ID, Name: 'x', Bogus: 1 });

            expect(denied.success).toBe(false);
            expect(unknown.success).toBe(false);
            expect(denied.errorMessage).toBe(FieldSecurityClientInputMessage('Salary', 'Employees'));
            expect(unknown.errorMessage).toBe(FieldSecurityClientInputMessage('Bogus', 'Employees'));
            expect(record.SetMany).not.toHaveBeenCalled();
        });
    }

    it('update accepts the primary key it needs to find the record', async () => {
        const result = await new EntityOperations(provider(), intern).UpdateEntity('Employees', { ID: ROW_ID, Name: 'x' });
        expect(result.success).toBe(true);
        expect(record.SetMany).toHaveBeenCalledWith({ Name: 'x' }, true);
    });

    it('a caller who is denied nothing may still send every field', async () => {
        const result = await new EntityOperations(provider(), hr).CreateEntity('Employees', { Name: 'x', Salary: 1 });
        expect(result.success).toBe(true);
        expect(record.SetMany).toHaveBeenCalledWith({ Name: 'x', Salary: 1 }, true);
    });
});

// ─── Output projection ────────────────────────────────────────────────────

describe('A2A entity operations: values returned to a restricted caller', () => {
    it('get, create and update return no denied value even when the record holds it', async () => {
        const ops = new EntityOperations(provider(), intern);
        const results = [
            await ops.GetEntity('Employees', { ID: ROW_ID }),
            await ops.CreateEntity('Employees', { Name: 'Ada' }),
            await ops.UpdateEntity('Employees', { ID: ROW_ID, Name: 'Ada' }),
        ];
        for (const result of results) {
            expect(result.success).toBe(true);
            expect(resultRow(result)).toEqual({ ID: ROW_ID, Name: 'Ada' });
        }
    });

    it('query asks for plain rows and returns no denied value even when the view does', async () => {
        const result = await new EntityOperations(provider(), intern).QueryEntity('Employees', {});
        expect(state.runViewCalls[0].params.ResultType).toBe('simple');
        expect((result.result as { Results: Record<string, unknown>[] }).Results).toEqual([{ ID: ROW_ID, Name: 'Ada' }]);
    });

    it('an unrestricted caller still receives every value', async () => {
        const result = await new EntityOperations(provider(), hr).GetEntity('Employees', { ID: ROW_ID });
        expect(resultRow(result)).toEqual(fullRow());
    });
});

// ─── Clause screen ────────────────────────────────────────────────────────

describe('A2A QueryEntity: caller-supplied filter and sort are screened like GraphQL and REST', () => {
    const rowComparisons = [
        "EXISTS (SELECT * FROM vwEmployees x WHERE x.ID = vwEmployees.ID INTERSECT SELECT x2.ID, x2.Name, n.v FROM vwEmployees x2 CROSS JOIN (VALUES (100000),(200000)) n(v))",
        "EXISTS (SELECT * FROM vwEmployees WHERE ID='k' EXCEPT SELECT ID, Name, 1 FROM vwEmployees)",
        "EXISTS (SELECT * FROM vwEmployees WHERE ID='k' UNION ALL SELECT 1,2,3)",
        "NOT EXISTS (SELECT * FROM vwEmployees WHERE ID='k' EXCEPT SELECT 'k','Bob',1)",
    ];

    for (const extraFilter of rowComparisons) {
        it(`refuses a whole-row set-operation comparison before running the view: ${extraFilter.slice(0, 60)}…`, async () => {
            const result = await new EntityOperations(provider(), intern).QueryEntity('Employees', { extraFilter });
            expect(result.success).toBe(false);
            expect(result.errorMessage).toMatch(/ExtraFilter/);
            expect(state.runViewCalls).toHaveLength(0);
        });
    }

    it('refuses a sort that reads the base view through a subquery', async () => {
        const orderBy = '(SELECT TOP 1 x.Salary FROM vwEmployees x WHERE x.ID = vwEmployees.ID)';
        const result = await new EntityOperations(provider(), intern).QueryEntity('Employees', { orderBy });
        expect(result.success).toBe(false);
        expect(result.errorMessage).toMatch(/OrderBy/);
        expect(state.runViewCalls).toHaveLength(0);
    });

    it('passes a plain filter and sort through to the view', async () => {
        const result = await new EntityOperations(provider(), intern).QueryEntity('Employees', { extraFilter: "Name = 'Ada'", orderBy: 'Name DESC' });
        expect(result.success).toBe(true);
        expect(state.runViewCalls[0].params.ExtraFilter).toBe("Name = 'Ada'");
        expect(state.runViewCalls[0].params.OrderBy).toBe('Name DESC');
    });
});
