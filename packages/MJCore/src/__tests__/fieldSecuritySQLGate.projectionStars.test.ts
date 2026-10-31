/**
 * `FieldSecuritySQLContext.ProjectionStarOffsets`: a `*` a structural reading of the statement has
 * shown reaches the caller only as output columns is not refused as a whole-row read (its denied
 * columns are dropped from the result instead). Every other star, and every named denied field,
 * is refused as before.
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo, FieldPermissionAccess } from '../generic/entityInfo';
import { FieldSecuritySQLGate } from '../generic/fieldSecuritySQLGate';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';

const HR = 'A0000000-0000-0000-0000-0000000000C1';
const STAFF = 'A0000000-0000-0000-0000-0000000000C2';
const ID = 'E0000000-0000-0000-0000-0000000000C1';

const people = new EntityInfo({
    ID, Name: 'People', SchemaName: 'dbo', BaseTable: 'Person', BaseView: 'vwPeople', EnableFieldLevelSecurity: true,
    Permissions: [HR, STAFF].map(RoleID => ({ EntityID: ID, RoleID, CanCreate: false, CanRead: true, CanUpdate: false, CanDelete: false })),
    Fields: [
        { ID: 'f-id', EntityID: ID, Sequence: 1, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
        { ID: 'f-salary', EntityID: ID, Sequence: 2, Name: 'Salary', Type: 'money',
          EntityFieldPermissions: [{ ID: 'p1', EntityFieldID: 'f-salary', RoleID: HR, ReadAccess: FieldPermissionAccess.Allow, UpdateAccess: FieldPermissionAccess.Allow, CreateAccess: FieldPermissionAccess.Allow }] },
    ],
});

function user(roleId: string): UserInfo {
    const u = new UserInfo();
    u.ID = `u-${roleId}`;
    u.Email = `${roleId}@test.com`;
    u.IsActive = true;
    (u as unknown as Record<string, unknown>)['_UserRoles'] = [new UserRoleInfo({ UserID: u.ID, RoleID: roleId, Role: `Role-${roleId}` })];
    return u;
}

function violation(sql: string, offsets: number[] | undefined) {
    return FieldSecuritySQLGate.FindViolation(sql, {
        User: user(STAFF), Dialect: 'sqlserver', Catalog: [people], RefuseUnknownRelations: true,
        ProjectionStarOffsets: offsets ? new Set(offsets) : undefined,
    });
}

describe('FieldSecuritySQLGate projection stars', () => {
    it('refuses a star over a restricted entity unless its offset is a projection star', () => {
        const sql = 'SELECT * FROM vwPeople';
        expect(violation(sql, undefined)?.Kind).toBe('WholeRow');
        expect(violation(sql, [sql.indexOf('*')])).toBeNull();
    });

    it('allows only the stars it is given: another star in the statement is still refused', () => {
        const sql = 'SELECT p.*, (SELECT COUNT(*) FROM vwPeople) AS N FROM vwPeople p WHERE EXISTS (SELECT * FROM vwPeople UNION SELECT * FROM vwPeople)';
        expect(violation(sql, [sql.indexOf('*')])?.Kind).toBe('WholeRow');
    });

    it('still refuses a named denied field beside a projection star', () => {
        const sql = 'SELECT * FROM vwPeople WHERE Salary > 1';
        expect(violation(sql, [sql.indexOf('*')])?.Kind).toBe('DeniedField');
    });
});
