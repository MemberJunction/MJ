import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('../generated/entity_subclasses', () => ({
    MJQueryEntity: class MockQueryEntity {
        /** The extended class declares its child collections at construction; none is used here. */
        protected DeclareRelatedRecords(): { Items: never[] } {
            return { Items: [] };
        }
    },
}));

type FieldRow = { QueryID: string; Name: string; SourceEntityID: string | null; SourceFieldName: string | null };
const engineState: { permissions: Array<{ QueryID: string; Role: string }>; queryEntities: Array<{ QueryID: string; EntityID: string }>; fields: FieldRow[] } = {
    permissions: [],
    queryEntities: [],
    fields: [],
};
vi.mock('../engines/QueryEngine', () => ({
    QueryEngine: {
        get Instance() {
            return {
                GetQueryPermissions: (id: string) => engineState.permissions.filter(p => p.QueryID === id),
                GetQueryFields: (id: string) => engineState.fields.filter(f => f.QueryID === id),
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
/** Reads People, Salary included, but not Payroll: denied no field anywhere. */
const CLERK = 'R0000000-0000-0000-0000-0000000000B3';

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
    entity(PEOPLE_ID, 'People', 'vwPeople', [HR, STAFF, CLERK], true, [
        field(PEOPLE_ID, 'b-id', 'ID', 1, null),
        field(PEOPLE_ID, 'b-name', 'Name', 2, [HR, STAFF, CLERK]),
        field(PEOPLE_ID, 'b-salary', 'Salary', 3, [HR, CLERK]),
    ]),
    entity(PAYROLL_ID, 'Payroll', 'vwPayroll', [HR], false, [field(PAYROLL_ID, 'c-id', 'ID', 1, null)]),
];

function user(id: string, roleId: string): UserInfo {
    return new UserInfo(undefined, { ID: id, Name: id, Email: `${id}@example.com`, IsActive: true, UserRoles: [{ UserID: id, RoleID: roleId, Role: `Role-${roleId}` }] });
}
const hr = user('U0000000-0000-0000-0000-0000000000B1', HR);
const staff = user('U0000000-0000-0000-0000-0000000000B2', STAFF);
const clerk = user('U0000000-0000-0000-0000-0000000000B3', CLERK);

/**
 * A zero-arg alias: `vi.mock` swaps the generated base class at runtime, but the typecheck pass
 * still sees the real constructor's required arguments.
 */
const QueryCtor = MJQueryEntityExtended as unknown as new () => MJQueryEntityExtended;

function query(id: string): MJQueryEntityExtended {
    const q = new QueryCtor();
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

    it('refuses, for a user carrying a field denial, a relation the catalog does not know', () => {
        for (const sql of [
            'SELECT Salary FROM __mj.vwPeopleSummary',
            'SELECT * FROM __mj.vwPeopleSummary',
            'SELECT p.Name FROM __mj.fnPeople(1) p',
            'SELECT t.Name FROM #people t',
            'SELECT p.Name FROM OtherDb.__mj.vwPeople p',
        ]) {
            const result = query('q-e').UserCanRunRenderedSQL(staff, sql, catalog, 'sqlserver');
            expect(result, sql).toMatchObject({ canRun: false, deniedEntities: [] });
            expect(result.fieldSecurityViolation?.Kind, sql).toBe('UnknownRelation');
        }
    });

    it('allows such a relation for a user denied no field, and for a holder of the role list', () => {
        expect(query('q-e').UserCanRunRenderedSQL(hr, 'SELECT Salary FROM __mj.vwPeopleSummary', catalog, 'sqlserver').canRun).toBe(true);
        engineState.permissions = [{ QueryID: 'q-f', Role: `Role-${STAFF}` }];
        expect(query('q-f').UserCanRunRenderedSQL(staff, 'SELECT Salary FROM __mj.vwPeopleSummary', catalog, 'sqlserver').canRun).toBe(true);
        engineState.permissions = [];
    });

    it('allows a CTE and the entity views for a user carrying a field denial', () => {
        const sql = 'WITH p AS (SELECT ID, Name FROM __mj.vwPeople) SELECT p.Name FROM p';
        expect(query('q-g').UserCanRunRenderedSQL(staff, sql, catalog, 'sqlserver').canRun).toBe(true);
    });

    it('derives the entities a parenthesized join or FROM ONLY reads', () => {
        const joined = 'SELECT y.ID FROM (__mj.vwPayroll y CROSS JOIN __mj.vwPeople q)';
        expect(query('q-h').UserCanRunRenderedSQL(clerk, joined, catalog, 'sqlserver')).toMatchObject({ canRun: false, deniedEntities: ['Payroll'] });
        const only = 'SELECT y."ID" FROM ONLY __mj."vwPayroll" y';
        expect(query('q-h').UserCanRunRenderedSQL(clerk, only, catalog, 'postgresql')).toMatchObject({ canRun: false, deniedEntities: ['Payroll'] });
    });

    it('refuses SQL it cannot read for a user who cannot read some entity, and allows it for one who reads every entity', () => {
        const unreadable = "SELECT ID FROM vwPayroll WHERE Name = 'unterminated";
        expect(query('q-i').UserCanRunRenderedSQL(clerk, unreadable, catalog, 'sqlserver').canRun).toBe(false);
        expect(query('q-i').UserCanRunRenderedSQL(hr, unreadable, catalog, 'sqlserver').canRun).toBe(true);
    });

    it('runs a projection star for a restricted user and says the denied columns must be dropped', () => {
        const sql = 'SELECT * FROM __mj.vwPeople';
        const stars = { ProjectionStarOffsets: new Set([sql.indexOf('*')]) };
        expect(query('q-j').UserCanRunRenderedSQL(staff, sql, catalog, 'sqlserver').canRun).toBe(false);
        expect(query('q-j').UserCanRunRenderedSQL(staff, sql, catalog, 'sqlserver', stars)).toEqual({ canRun: true, deniedEntities: [], needsColumnFiltering: true });
        expect(query('q-j').UserCanRunRenderedSQL(hr, sql, catalog, 'sqlserver', stars)).toEqual({ canRun: true, deniedEntities: [], needsColumnFiltering: false });
    });

    it('skips field-level security for a role-listed query, projection stars or not (definer\'s rights)', () => {
        engineState.permissions = [{ QueryID: 'q-k', Role: `Role-${STAFF}` }];
        const sql = 'SELECT * FROM __mj.vwPeople';
        const result = query('q-k').UserCanRunRenderedSQL(staff, sql, catalog, 'sqlserver', { ProjectionStarOffsets: new Set([sql.indexOf('*')]) });
        expect(result).toEqual({ canRun: true, deniedEntities: [] });
        engineState.permissions = [];
    });
});

describe('MJQueryEntityExtended.QueryFieldsVisibleTo', () => {
    const fieldsOf = (id: string): FieldRow[] => [
        { QueryID: id, Name: 'ID', SourceEntityID: PEOPLE_ID, SourceFieldName: 'ID' },
        { QueryID: id, Name: 'Salary', SourceEntityID: PEOPLE_ID, SourceFieldName: 'Salary' },
        { QueryID: id, Name: 'Total', SourceEntityID: null, SourceFieldName: null },
        { QueryID: id, Name: 'PayrollID', SourceEntityID: PAYROLL_ID, SourceFieldName: 'ID' },
    ];
    const names = (q: MJQueryEntityExtended, u: UserInfo | null) => q.QueryFieldsVisibleTo(u, catalog).map(f => f.Name);

    it('leaves out a field whose source field the user may not read, and one from an entity the user may not read', () => {
        engineState.fields = fieldsOf('q-v1');
        expect(names(query('q-v1'), staff)).toEqual(['ID', 'Total']);
        engineState.fields = [];
    });

    it('keeps every field for a user denied nothing', () => {
        engineState.fields = fieldsOf('q-v2');
        expect(names(query('q-v2'), hr)).toEqual(['ID', 'Salary', 'Total', 'PayrollID']);
        engineState.fields = [];
    });

    it('keeps every field of a query with Query Permissions (definer\'s rights) and with no user', () => {
        engineState.fields = fieldsOf('q-v3');
        engineState.permissions = [{ QueryID: 'q-v3', Role: `Role-${STAFF}` }];
        expect(names(query('q-v3'), staff)).toHaveLength(4);
        engineState.permissions = [];
        expect(names(query('q-v3'), null)).toHaveLength(4);
        engineState.fields = [];
    });
});
