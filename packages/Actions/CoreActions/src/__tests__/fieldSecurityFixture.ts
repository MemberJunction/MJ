/**
 * Shared field-level-security fixture for action tests: a real `BaseEntity` over an `Employees`
 * entity whose `Salary` only HR may read, an intern who is denied it, and an HR user who is not.
 *
 * Entities are REAL `BaseEntity` instances from `@memberjunction/core`, so the tests exercise the
 * actual hydration narrowing rather than a mock of it.
 */
import { BaseEntity, EntityInfo, FieldPermissionAccess, IEntityDataProvider, UserInfo, UserRoleInfo } from '@memberjunction/core';

export const HR_ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
export const INTERN_ROLE_ID = 'A0000000-0000-0000-0000-000000000003';
export const EMPLOYEE_ENTITY_ID = 'entity-employees-actions';
export const EMPLOYEE_ROW_ID = '11111111-0000-0000-0000-000000000001';
/** The denied value. Tests assert this string never appears in anything the action outputs. */
export const SALARY = 250000;

function fieldPermissions(fieldId: string, roles: string[]): Record<string, unknown>[] {
    return roles.map((roleId, i) => ({
        ID: `${fieldId}-perm-${i}`, EntityFieldID: fieldId, RoleID: roleId,
        ReadAccess: FieldPermissionAccess.Allow, UpdateAccess: FieldPermissionAccess.Allow, CreateAccess: FieldPermissionAccess.Allow,
    }));
}

/** `Employees` with field-level security on: `Salary` is HR-only, `Name` and `Notes` are open to both roles. */
export function EmployeeEntityInfo(): EntityInfo {
    const both = [HR_ROLE_ID, INTERN_ROLE_ID];
    const field = (id: string, seq: number, name: string, type: string, roles: string[]) => ({
        ID: id, EntityID: EMPLOYEE_ENTITY_ID, Sequence: seq, Name: name, Entity: 'Employees', Type: type,
        AllowUpdateAPI: true, AllowsNull: true, EntityFieldPermissions: fieldPermissions(id, roles),
    });
    return new EntityInfo({
        ID: EMPLOYEE_ENTITY_ID, Name: 'Employees', SchemaName: 'dbo', BaseTable: 'Employee', BaseView: 'vwEmployees',
        IncludeInAPI: true, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true,
        EnableFieldLevelSecurity: true,
        Permissions: both.map((RoleID) => ({ EntityID: EMPLOYEE_ENTITY_ID, RoleID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true })),
        Fields: [
            { ...field('f-id', 1, 'ID', 'uniqueidentifier', both), IsPrimaryKey: true, AllowsNull: false },
            field('f-name', 2, 'Name', 'nvarchar', both),
            field('f-salary', 3, 'Salary', 'money', [HR_ROLE_ID]),
            field('f-notes', 4, 'Notes', 'nvarchar', both),
        ],
    });
}

export function BuildUser(roleIds: string[], id: string): UserInfo {
    const user = new UserInfo();
    user.ID = id;
    user.Name = `User ${id}`;
    user.Email = `${id}@test.com`;
    user.IsActive = true;
    (user as unknown as Record<string, unknown>)['_UserRoles'] =
        roleIds.map((RoleID) => new UserRoleInfo({ UserID: id, RoleID, Role: `Role-${RoleID}` }));
    return user;
}

/** The stored row, full width, as a database (or a system-user cache) holds it. */
export function FullEmployeeRow(): Record<string, unknown> {
    return { ID: EMPLOYEE_ROW_ID, Name: 'Ada', Salary: SALARY, Notes: 'n' };
}

export class EmployeeEntity extends BaseEntity {
    public override CheckPermissions(): boolean {
        return true;
    }
}

/**
 * An `Employees` object for `user` (none = a system-identity object), built from a FULL-width row
 * the way RunView `entity_object` builds its results: `GetEntityObject(name, user)` then `LoadFromData`.
 */
export async function LoadEmployeeFor(entityInfo: EntityInfo, user: UserInfo | null, provider?: IEntityDataProvider): Promise<EmployeeEntity> {
    const entity = new EmployeeEntity(entityInfo, provider ?? null);
    if (user) {
        entity.ContextCurrentUser = user;
    }
    await entity.LoadFromData(FullEmployeeRow());
    return entity;
}
