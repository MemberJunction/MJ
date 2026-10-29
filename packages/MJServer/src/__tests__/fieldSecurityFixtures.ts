/**
 * Shared field-security fixtures for the transport tests: an `Employees` entity whose `Salary`
 * and `Base Salary` only the HR role may read, plus users holding either role.
 *
 * Built from real `EntityInfo` / `UserInfo` objects so the denied sets come from the same
 * aggregation production uses, not from a stub.
 */
import { EntityInfo, FieldSecurityClientInputMessage, UserInfo, UserRoleInfo } from '@memberjunction/core';

export const HR_ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
export const INTERN_ROLE_ID = 'A0000000-0000-0000-0000-000000000003';
export const EMPLOYEES_ENTITY_ID = 'entity-employees';
export const EMPLOYEES_ENTITY_NAME = 'Employees';

/** The salary an HR user may read and an intern may not. Distinctive so a leak is easy to spot. */
export const SECRET_SALARY = 987654.32;

function openTo(fieldId: string, roles: string[] = [HR_ROLE_ID, INTERN_ROLE_ID]): Record<string, unknown>[] {
    return roles.map((roleId, i) => ({
        ID: `${fieldId}-open-${i}`,
        EntityFieldID: fieldId,
        RoleID: roleId,
        ReadAccess: 'Allow',
        UpdateAccess: 'Allow',
        CreateAccess: 'Allow',
    }));
}

/** Init data for the `Employees` entity. `withFls: false` switches field security off entirely. */
export function EmployeeEntityInit(withFls = true): Record<string, unknown> {
    const field = (id: string, sequence: number, name: string, type: string, extra: Record<string, unknown> = {}) => ({
        ID: id, EntityID: EMPLOYEES_ENTITY_ID, Sequence: sequence, Name: name, Entity: EMPLOYEES_ENTITY_NAME, Type: type, ...extra,
    });
    return {
        ID: EMPLOYEES_ENTITY_ID,
        Name: EMPLOYEES_ENTITY_NAME,
        SchemaName: 'dbo',
        BaseTable: 'Employee',
        BaseView: 'vwEmployees',
        IncludeInAPI: true,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        EnableFieldLevelSecurity: withFls,
        Permissions: [
            { EntityID: EMPLOYEES_ENTITY_ID, RoleID: HR_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
            { EntityID: EMPLOYEES_ENTITY_ID, RoleID: INTERN_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
        ],
        Fields: [
            field('f-id', 1, 'ID', 'uniqueidentifier', { IsPrimaryKey: true }),
            field('f-name', 2, 'Name', 'nvarchar', { EntityFieldPermissions: openTo('f-name') }),
            field('f-salary', 3, 'Salary', 'money', { EntityFieldPermissions: openTo('f-salary', [HR_ROLE_ID]) }),
            field('f-base-salary', 4, 'Base Salary', 'money', { EntityFieldPermissions: openTo('f-base-salary', [HR_ROLE_ID]) }),
            field('f-notes', 5, 'Notes', 'nvarchar', { EntityFieldPermissions: openTo('f-notes') }),
        ],
    };
}

export function EmployeeEntity(withFls = true): EntityInfo {
    return new EntityInfo(EmployeeEntityInit(withFls));
}

export function BuildUser(roleIds: string[], id = 'user-1'): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = 'Test User';
    u.Email = `${id}@test.com`;
    u.IsActive = true;
    (u as unknown as Record<string, unknown>)['_UserRoles'] =
        roleIds.map(rid => new UserRoleInfo({ UserID: id, RoleID: rid, Role: `Role-${rid}` }));
    return u;
}

export const Intern = (): UserInfo => BuildUser([INTERN_ROLE_ID], 'intern-1');
export const HRUser = (): UserInfo => BuildUser([HR_ROLE_ID], 'hr-1');

/** A full-width employee row: what a system-identity load, or a save's re-read, returns. */
export function FullWidthEmployeeRow(): Record<string, unknown> {
    return { ID: 'emp-1', Name: 'Ada', Salary: SECRET_SALARY, 'Base Salary': SECRET_SALARY, Notes: 'n' };
}

/** The refusal text for a key, identical whether the key is denied or names no field. */
export function RefusalFor(key: string): string {
    return FieldSecurityClientInputMessage(key, EMPLOYEES_ENTITY_NAME);
}

/** A metadata source the projection accepts; Record Changes resolution is never reached for Employees. */
export const NoRecordChangesMetadata = {
    Entities: [] as EntityInfo[],
    EntityByID: (): EntityInfo | undefined => undefined,
};
