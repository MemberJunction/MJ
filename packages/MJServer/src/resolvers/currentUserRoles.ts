import { LogError, UserInfo } from '@memberjunction/core';

/**
 * Guards and filter builders for CurrentUser role loading.
 * Kept out of UserResolver so the login-adjacent failure modes are unit-testable
 * without importing generated GraphQL types or the Apollo config bootstrap.
 */

/**
 * The session user's own fields, as CurrentUser returns them. The client asks for every field of
 * `UserInfo` (GraphQLDataProvider builds its query from it), so each one belongs here; anything
 * left out reaches the client as null (as IsTemplate once did, hiding the template-user banner).
 */
export function SessionUserFields(userRecord: UserInfo) {
  return {
    ID: userRecord.ID,
    Name: userRecord.Name,
    FirstName: userRecord.FirstName,
    LastName: userRecord.LastName,
    Title: userRecord.Title,
    Email: userRecord.Email,
    Type: userRecord.Type,
    IsActive: userRecord.IsActive,
    IsTemplate: userRecord.IsTemplate,
    LinkedRecordType: userRecord.LinkedRecordType,
    EmployeeID: userRecord.EmployeeID,
    LinkedEntityID: userRecord.LinkedEntityID,
    LinkedEntityRecordID: userRecord.LinkedEntityRecordID,
    __mj_CreatedAt: userRecord.__mj_CreatedAt,
    __mj_UpdatedAt: userRecord.__mj_UpdatedAt,
    FirstLast: userRecord.FirstLast,
    EmployeeFirstLast: userRecord.EmployeeFirstLast,
    EmployeeEmail: userRecord.EmployeeEmail,
    EmployeeTitle: userRecord.EmployeeTitle,
    EmployeeSupervisor: userRecord.EmployeeSupervisor,
    EmployeeSupervisorEmail: userRecord.EmployeeSupervisorEmail,
  };
}

export function RequireLoadedUser<T extends { ID?: string }>(
  user: T | null | undefined,
  email: string | undefined,
): T & { ID: string } {
  if (!user?.ID) {
    throw new Error(`CurrentUser: no user found for email '${email ?? ''}'`);
  }
  return user as T & { ID: string };
}

export function RequireContextUser<T>(user: T | null | undefined): T {
  if (!user) {
    throw new Error('CurrentUser: authenticated context user is required to load roles');
  }
  return user;
}

export function RequireRoleProvider<T>(provider: T | null | undefined): T {
  if (!provider) {
    throw new Error('CurrentUser: no data provider available to load roles');
  }
  return provider;
}

/** Quote-escape a server-resolved user id for an ExtraFilter literal. */
export function UserIdExtraFilter(userId: string): string {
  return `UserID='${userId.replace(/'/g, "''")}'`;
}

export function AssertRoleLoadSucceeded(
  result: { Success: boolean; ErrorMessage?: string | null },
  userId: string,
): void {
  if (!result.Success) {
    const message = result.ErrorMessage ?? 'unknown error';
    LogError(`CurrentUser: failed to load roles for user ${userId}: ${message}`);
    throw new Error(`CurrentUser: failed to load roles: ${message}`);
  }
}
