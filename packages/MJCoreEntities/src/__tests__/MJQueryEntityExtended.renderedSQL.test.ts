import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('../generated/entity_subclasses', () => ({
    MJQueryEntity: class MockQueryEntity {},
}));

const engineState: { permissions: Array<{ QueryID: string; Role: string }>; queryEntities: Array<{ QueryID: string; EntityID: string }> } = {
    permissions: [],
    queryEntities: [],
};
vi.mock('../engines/QueryEngine', () => ({
    QueryEngine: {
        get Instance() {
            return {
                GetQueryPermissions: (id: string) => engineState.permissions.filter(p => p.QueryID === id),
                get QueryEntities() { return engineState.queryEntities; },
            };
        },
    },
}));

import { EntityInfo, FieldPermissionAccess, UserInfo } from '@memberjunction/core';
import { MJQueryEntityExtended } from '../custom/MJQueryEntityExtended';

const PEOPLE_ID = 'E0000000-0000-0000-0000-0000000000B1';
const PAYROLL_ID = 'E0000000-0000-0000-0000-0000000000B2';
const HR = 'R0000000-0000-0000-0000-0000000000B1';
const STAFF = 'R0000000-0000-0000-0000-0000000000B2';

function field(entityId: string, id: string, name: string, sequence: number, roles: string[] | null): Record<string, unknown> {
    const rules = (roles ?? []).map((roleId, i) => ({
        ID: `${id}-${i}`, EntityFieldID: id, RoleID: roleId,
        ReadAccess: FieldPermissionAccess.Allow, UpdateAccess: FieldPermissionAccess.Allow, CreateAccess: FieldPermissionAccess.Allow,
    }));
    return { ID: id, EntityID: entityId, Sequence: sequence, Name: name, Type: 'nvarchar', IsPrimaryKey: name === 'ID', EntityFieldPermissions: rules };
}

function entity(id: string, name: string, view: string, readers: string[], fls: boolean, fields: Record<string, unknown>[]): EntityInfo {
    return new EntityInfo({
        ID: id, Name: name, SchemaName: '__mj', BaseTable: name, BaseView: view, EnableFieldLevelSecurity: fls,
        Permissions: readers.map(r => ({ EntityID: id, RoleID: r, CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false })),
        Fields: fields,
    });
}

const catalog = [
    entity(PEOPLE_ID, 'People', 'vwPeople', [HR, STAFF], true, [
        field(PEOPLE_ID, 'b-id', 'ID', 1, null),
        field(PEOPLE_ID, 'b-name', 'Name', 2, [HR, STAFF]),
        field(PEOPLE_ID, 'b-salary', 'Salary', 3, [HR]),
    ]),
    entity(PAYROLL_ID, 'Payroll', 'vwPayroll', [HR], false, [field(PAYROLL_ID, 'c-id', 'ID', 1, null)]),
];

function user(id: string, roleId: string): UserInfo {
    return new UserInfo(undefined, { ID: id, Name: id, Email: `${id}@example.com`, IsActive: true, UserRoles: [{ UserID: id, RoleID: roleId, Role: `Role-${roleId}` }] });
}
const hr = user('U0000000-0000-0000-0000-0000000000B1', HR);
const staff = user('U0000000-0000-0000-0000-0000000000B2', STAFF);

function query(id: string): MJQueryEntityExtended {
    const q = new MJQueryEntityExtended();
    Object.defineProperty(q, 'ID', { value: id });
    return q;
}

describe('MJQueryEntityExtended.UserCanRunRenderedSQL', () => {
    it('refuses a denied column without naming it', () => {
        const result = query('q-a').UserCanRunRenderedSQL(staff, 'SELECT ID FROM vwPeople ORDER BY Salary', catalog, 'sqlserver');
        expect(result.canRun).toBe(false);
        expect(result.deniedEntities).toEqual([]);
    });

    it('allows the same SQL for a user denied nothing', () => {
        expect(query('q-a').UserCanRunRenderedSQL(hr, 'SELECT ID FROM vwPeople ORDER BY Salary', catalog, 'sqlserver').canRun).toBe(true);
    });

    it('derives the entities read from the SQL, not from QueryEntities rows', () => {
        const result = query('q-b').UserCanRunRenderedSQL(staff, 'SELECT p.ID FROM vwPeople p JOIN [__mj].[vwPayroll] y ON y.ID = p.ID', catalog, 'sqlserver');
        expect(result).toMatchObject({ canRun: false, deniedEntities: ['Payroll'] });
    });

    it('checks a declared entity whose view the SQL does not name', () => {
        engineState.queryEntities = [{ QueryID: 'q-c', EntityID: PEOPLE_ID }];
        const result = query('q-c').UserCanRunRenderedSQL(staff, 'SELECT ID, Salary FROM someCustomView', catalog, 'sqlserver');
        engineState.queryEntities = [];
        expect(result.canRun).toBe(false);
    });

    it('lets a holder of the query role list run it whatever it reads, and refuses everyone else', () => {
        engineState.permissions = [{ QueryID: 'q-d', Role: `Role-${STAFF}` }];
        const sql = 'SELECT ID, Salary FROM vwPeople JOIN vwPayroll ON 1 = 1';
        expect(query('q-d').UserCanRunRenderedSQL(staff, sql, catalog, 'sqlserver').canRun).toBe(true);
        expect(query('q-d').UserCanRunRenderedSQL(hr, sql, catalog, 'sqlserver').canRun).toBe(false);
        engineState.permissions = [];
    });
});
