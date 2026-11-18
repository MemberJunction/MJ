/**
 * `FieldSecuritySQLGate.FindSortViolation` — a sort item that is a column position.
 *
 * `ORDER BY 3` names a column of the select list without spelling it, and an entity-object read
 * selects every column, so a user denied a field on the sorted entity may not sort by position.
 * An item is a position when its first token, inside any opening parentheses, is a number; a
 * number elsewhere in an item (a function argument, a literal after an operator) is not.
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo, FieldPermissionAccess } from '../generic/entityInfo';
import { FieldSecuritySQLGate } from '../generic/fieldSecuritySQLGate';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';

const HR_ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
const INTERN_ROLE_ID = 'A0000000-0000-0000-0000-000000000003';
const ALLOW = FieldPermissionAccess.Allow;

function openTo(fieldId: string, roles: string[]): Record<string, unknown>[] {
    return roles.map((roleId, i) => ({
        ID: `${fieldId}-open-${i}`, EntityFieldID: fieldId, RoleID: roleId,
        ReadAccess: ALLOW, UpdateAccess: ALLOW, CreateAccess: ALLOW,
    }));
}

/** An entity with field security on: `ID`, `Name` open to both roles, and `Salary` open to `salaryRoles`. */
function entity(id: string, name: string, salaryRoles: string[]): EntityInfo {
    const field = (fieldId: string, seq: number, fieldName: string, type: string, perms?: Record<string, unknown>[]) => ({
        ID: fieldId, EntityID: id, Sequence: seq, Name: fieldName, Entity: name, Type: type, AllowsNull: true, EntityFieldPermissions: perms,
    });
    return new EntityInfo({
        ID: id, Name: name, SchemaName: 'dbo', BaseTable: name, BaseView: `vw${name}`,
        EnableFieldLevelSecurity: true,
        Permissions: [HR_ROLE_ID, INTERN_ROLE_ID].map((RoleID) => ({ EntityID: id, RoleID, CanCreate: false, CanRead: true, CanUpdate: false, CanDelete: false })),
        Fields: [
            { ...field(`${id}-id`, 1, 'ID', 'uniqueidentifier'), IsPrimaryKey: true, AllowsNull: false },
            field(`${id}-name`, 2, 'Name', 'nvarchar', openTo(`${id}-name`, [HR_ROLE_ID, INTERN_ROLE_ID])),
            field(`${id}-salary`, 3, 'Salary', 'money', openTo(`${id}-salary`, salaryRoles)),
        ],
    });
}

function buildUser(roleIds: string[], id: string): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = id;
    u.Email = `${id}@test.com`;
    u.IsActive = true;
    (u as unknown as Record<string, unknown>)['_UserRoles'] = roleIds.map((rid) => new UserRoleInfo({ UserID: id, RoleID: rid, Role: `Role-${rid}` }));
    return u;
}

/** `Salary` is HR-only here, so the intern is denied a field on Employees. */
const employees = entity('E-EMP', 'Employees', [HR_ROLE_ID]);
/** Every field is open to both roles here, so the intern is denied nothing on Projects. */
const projects = entity('E-PRJ', 'Projects', [HR_ROLE_ID, INTERN_ROLE_ID]);
const catalog = [employees, projects];
const intern = buildUser([INTERN_ROLE_ID], 'intern-1');

function sortRefusal(orderBy: string, target: EntityInfo = employees): string | null {
    const violation = FieldSecuritySQLGate.FindSortViolation(orderBy, { User: intern, Dialect: 'sqlserver', Catalog: catalog, TargetEntity: target });
    return violation ? `${violation.Kind}: ${violation.Reference}` : null;
}

describe('FindSortViolation: column positions', () => {
    it('refuses a bare position, and a position after other items', () => {
        expect(sortRefusal('3')).toBe('WholeRow: ORDER BY 3');
        expect(sortRefusal('Name, 3 DESC')).toBe('WholeRow: ORDER BY 3');
    });

    it('refuses a position inside opening parentheses', () => {
        expect(sortRefusal('(3)')).toBe('WholeRow: ORDER BY 3');
        expect(sortRefusal('((2)) DESC')).toBe('WholeRow: ORDER BY 2');
        expect(sortRefusal('Name, (3)')).toBe('WholeRow: ORDER BY 3');
    });

    it('allows a number that is a function argument after a comma inside parentheses', () => {
        expect(sortRefusal('ISNULL(Name, 0)')).toBeNull();
        expect(sortRefusal('COALESCE(Name, (0)) DESC')).toBeNull();
    });

    it('allows a number inside parentheses that is not the first token of the item', () => {
        expect(sortRefusal('LEFT(Name, 1), Name')).toBeNull();
    });

    it('refuses a position after an item that opened and closed parentheses', () => {
        expect(sortRefusal('ISNULL(Name, 0), 3')).toBe('WholeRow: ORDER BY 3');
        expect(sortRefusal('LEFT(Name, (1)), 2 DESC')).toBe('WholeRow: ORDER BY 2');
    });

    it('allows a position on an entity the user is denied nothing on, though another entity denies them a field', () => {
        expect(sortRefusal('3 DESC', projects)).toBeNull();
        expect(sortRefusal('Name, (2)', projects)).toBeNull();
    });
});
